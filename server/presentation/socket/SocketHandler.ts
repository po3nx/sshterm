import { Server, Socket } from 'socket.io';
import { metrics } from '../../infrastructure/metrics/Metrics';
import { auditLogger } from '../../infrastructure/logging/AuditLogger';
import { Credentials, SSHConfig, TerminalSize } from '../../domain/models';
import { SSHConnectionService } from '../../infrastructure/ssh/SSHConnectionService';
import { TerminalService } from '../../application/services/TerminalService';
import { AuthenticationService } from '../../application/services/AuthenticationService';

export interface SocketSession {
  sessionId?: string;
  sshConnectionId?: string;
  username?: string;
  subscribeToMetrics?: boolean;
}

export class SocketHandler {
  private sessionData = new Map<string, SocketSession>();
  private metricsTimer: NodeJS.Timeout | null = null;

  constructor(
    private io: Server,
    private sshConnectionService: SSHConnectionService,
    private terminalService: TerminalService,
    private authService: AuthenticationService,
    private throttleService: import('../../application/services/LoginThrottleService').LoginThrottleService
  ) {
    this.setupSocketHandlers();
    this.startMetricsBroadcast();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      // Initialize session data
      this.sessionData.set(socket.id, {});
      
      // Update connected clients gauge
      try { metrics.socketConnectedClients.set(this.io.sockets.sockets.size); } catch {}

      this.setupLoginHandler(socket);
      this.setupInputHandler(socket);
      this.setupResizeHandler(socket);
      this.setupMetricsHandler(socket);
      this.setupDisconnectHandler(socket);
    });
  }

  private setupLoginHandler(socket: Socket): void {
    // Accept host/port overrides from client while preserving env defaults
    socket.on('login', async ({ username, password, host, port, clientIp }: { username: string; password: string; host?: string; port?: number; clientIp?: string }) => {
      try {
        console.log(`Login attempt from ${socket.id}: ${username}`);

        // Determine effective host for throttle key
        const effectiveHost = (host && host.trim()) || process.env.SSH_HOST || '';
        
        // IP Detection Strategy:
        // 1. Use client-provided IP if it's a valid public IP (most reliable for audit logging)
        // 2. Fall back to simple socket address (may be localhost/proxy but at least consistent)
        let clientIpAddress: string;
        if (clientIp && this.isValidPublicIP(clientIp)) {
          clientIpAddress = clientIp;
          console.log(`Using client-provided public IP for ${username}: ${clientIpAddress}`);
        } else {
          // Use simple fallback - don't try complex header parsing that often fails
          clientIpAddress = this.throttleService.getFallbackIp(socket);
          console.log(`Using fallback IP for ${username}: ${clientIpAddress} (client IP was: ${clientIp || 'not provided'})`);
        }

        // Throttle: block if too many failures for this IP+host
        if (effectiveHost) {
          const { blocked, retryAfterMs } = this.throttleService.isBlocked(clientIpAddress, effectiveHost);
          if (blocked) {
            const waitText = this.throttleService.formatRetryAfter(retryAfterMs);
            socket.emit('loginResult', { success: false, message: `Too many failed attempts. Try again in ${waitText}.` });
            return;
          }
        }

        if (!username || !password) {
          socket.emit('loginResult', { 
            success: false, 
            message: 'Username and password are required' 
          });
          return;
        }

        // Authenticate user
        const credentials = new Credentials(username, password);
        // Track attempt
        try { metrics.sshLoginAttempts.inc({ result: 'attempt' }); } catch {}

        const authResult = await this.authService.authenticate(credentials);

        if (!authResult.success) {
          socket.emit('loginResult', { 
            success: false, 
            message: authResult.message || 'Authentication failed' 
          });
          try { metrics.sshLoginAttempts.inc({ result: 'failure' }); } catch {}

          // Register failure for throttle
          const effectiveHost = (host && host.trim()) || process.env.SSH_HOST;
          if (effectiveHost) {
            this.throttleService.registerFailure(clientIpAddress, effectiveHost);

            // Secure audit log (no plaintext password)
            const ua = (socket.handshake.headers['user-agent'] || '') as string;
            await auditLogger.logAuthFailure({
              ip: clientIpAddress,
              host: effectiveHost,
              username,
              password: password, // will be redacted / HMACed internally
              reason: 'auth_failed',
              userAgent: ua,
              socketId: socket.id,
            });
          }

          return;
        }

        // Get SSH configuration: prefer client-supplied values, fall back to env
        const sshHost = (host && host.trim().length > 0) ? host : process.env.SSH_HOST;
        const sshPort = (typeof port === 'number' && Number.isFinite(port)) ? port : parseInt(process.env.SSH_PORT || '22', 10);

        if (!sshHost) {
          socket.emit('loginResult', { 
            success: false, 
            message: 'SSH host not configured' 
          });
          return;
        }

        const sshConfig = new SSHConfig(sshHost, sshPort);

        try {
          // Create SSH connection
          const sshConnection = await this.sshConnectionService.createConnection(credentials, sshConfig);

          // On success, metrics and throttle reset
          try { metrics.sshLoginAttempts.inc({ result: 'success' }); } catch {}
          this.throttleService.registerSuccess(clientIpAddress, sshConfig.host);
          try { metrics.sshActiveConnections.set(this.terminalService.getActiveConnectionsCount()); } catch {}

          // Update session data
          const session = this.sessionData.get(socket.id) || {};
          session.sessionId = authResult.user?.sessionId;
          session.sshConnectionId = sshConnection.id;
          session.username = username;
          this.sessionData.set(socket.id, session);

          // Setup SSH event handlers
          this.setupSSHEventHandlers(socket, sshConnection.id);

          socket.emit('loginResult', { success: true });
          console.log(`SSH connection established for ${socket.id}: ${sshConnection.id}`);

        } catch (sshError) {
          console.error(`SSH connection failed for ${socket.id}:`, sshError);
          socket.emit('loginResult', { 
            success: false, 
            message: sshError instanceof Error ? sshError.message : 'SSH connection failed' 
          });

          try { metrics.sshConnectionFailuresTotal.inc(); } catch {}

          // Register failure for throttle
          this.throttleService.registerFailure(clientIpAddress, sshConfig.host);

          // Secure audit log (no plaintext password)
          const ua = (socket.handshake.headers['user-agent'] || '') as string;
          await auditLogger.logAuthFailure({
            ip: clientIpAddress,
            host: sshConfig.host,
            username,
            password: password, // will be redacted / HMACed internally
            reason: 'ssh_connect_failed',
            userAgent: ua,
            socketId: socket.id,
          });
        }

      } catch (error) {
        console.error(`Login error for ${socket.id}:`, error);
        socket.emit('loginResult', { 
          success: false, 
          message: 'Authentication error' 
        });
      }
    });
  }

  private setupInputHandler(socket: Socket): void {
    socket.on('input', async (data: string) => {
      const session = this.sessionData.get(socket.id);
      if (!session?.sshConnectionId) {
        socket.emit('error', 'No active SSH connection');
        return;
      }

      try {
        await this.terminalService.handleInput(session.sshConnectionId, data);
      } catch (error) {
        console.error(`Input error for ${socket.id}:`, error);
        socket.emit('error', error instanceof Error ? error.message : 'Input error');
      }
    });
  }

  private setupResizeHandler(socket: Socket): void {
    socket.on('resize', async ({ cols, rows }: { cols: number; rows: number }) => {
      const session = this.sessionData.get(socket.id);
      if (!session?.sshConnectionId) {
        return;
      }

      try {
        const terminalSize = new TerminalSize(cols, rows);
        await this.terminalService.handleResize(session.sshConnectionId, terminalSize);
        console.log(`Terminal resized for ${socket.id}: ${cols}x${rows}`);
      } catch (error) {
        console.error(`Resize error for ${socket.id}:`, error);
        socket.emit('error', error instanceof Error ? error.message : 'Resize error');
      }
    });
  }

  private setupMetricsHandler(socket: Socket): void {
    // Handle metrics subscription
    socket.on('subscribe_metrics', () => {
      const session = this.sessionData.get(socket.id);
      if (session) {
        session.subscribeToMetrics = true;
        console.log(`Client ${socket.id} subscribed to metrics`);
        
        // Send initial metrics snapshot
        this.sendMetricsToClient(socket);
      }
    });

    // Handle metrics unsubscription
    socket.on('unsubscribe_metrics', () => {
      const session = this.sessionData.get(socket.id);
      if (session) {
        session.subscribeToMetrics = false;
        console.log(`Client ${socket.id} unsubscribed from metrics`);
      }
    });
  }

  private async sendMetricsToClient(socket: Socket): Promise<void> {
    try {
      // Only send metrics if enabled and client is subscribed
      const session = this.sessionData.get(socket.id);
      if (!session?.subscribeToMetrics) return;

      const METRICS_ENABLED = (process.env.METRICS_ENABLED === '1' || process.env.METRICS_ENABLED === 'true');
      if (!METRICS_ENABLED) {
        socket.emit('metrics_data', { error: 'Metrics disabled' });
        return;
      }

      const snapshot = await metrics.snapshot();
      socket.emit('metrics_data', snapshot);
    } catch (error) {
      socket.emit('metrics_data', { error: 'Failed to collect metrics' });
    }
  }

  private setupDisconnectHandler(socket: Socket): void {
    socket.on('disconnect', async () => {
      console.log(`Client disconnected: ${socket.id}`);
      
      const session = this.sessionData.get(socket.id);
      if (session?.sshConnectionId) {
        try {
          await this.terminalService.closeConnection(session.sshConnectionId);
          console.log(`SSH connection closed for ${socket.id}: ${session.sshConnectionId}`);
        } catch (error) {
          console.error(`Error closing SSH connection for ${socket.id}:`, error);
        }
      }

      if (session?.sessionId) {
        await this.authService.invalidateSession(session.sessionId);
      }

      this.sessionData.delete(socket.id);

      // Update gauges after disconnect/cleanup
      try {
        metrics.socketConnectedClients.set(this.io.sockets.sockets.size);
        metrics.sshActiveConnections.set(this.terminalService.getActiveConnectionsCount());
      } catch {}
    });
  }

  private setupSSHEventHandlers(socket: Socket, connectionId: string): void {
    const connection = this.sshConnectionService.getConnection(connectionId);
    if (!connection) {
      console.error(`SSH connection not found: ${connectionId}`);
      return;
    }

    // Forward SSH output to client
    const handleOutput = (data: string) => {
      socket.emit('output', data);
    };

    const handleDisconnect = () => {
      console.log(`SSH connection disconnected: ${connectionId}`);
      // Do not emit the reserved 'disconnect' event manually.
      // Optionally inform client via a normal channel, then close the socket.
      socket.emit('error', 'SSH session closed');
      socket.disconnect(true);
    };

    const handleError = (error: Error) => {
      console.error(`SSH connection error: ${connectionId}`, error);
      socket.emit('error', error.message);
      socket.disconnect(true);
    };

    connection.on('output', handleOutput);
    connection.on('disconnect', handleDisconnect);
    connection.on('error', handleError);

    // Cleanup handlers when socket disconnects
    socket.on('disconnect', () => {
      connection.removeListener('output', handleOutput);
      connection.removeListener('disconnect', handleDisconnect);
      connection.removeListener('error', handleError);
    });
  }

  private startMetricsBroadcast(): void {
    const METRICS_ENABLED = (process.env.METRICS_ENABLED === '1' || process.env.METRICS_ENABLED === 'true');
    if (!METRICS_ENABLED) return;

    // Broadcast metrics every 10 seconds to subscribed clients
    this.metricsTimer = setInterval(async () => {
      await this.broadcastMetrics();
    }, 10000);
  }

  private async broadcastMetrics(): Promise<void> {
    try {
      // Get all subscribed clients
      const subscribedClients = Array.from(this.sessionData.entries())
        .filter(([_, session]) => session.subscribeToMetrics)
        .map(([socketId]) => socketId);

      if (subscribedClients.length === 0) return;

      const snapshot = await metrics.snapshot();
      
      // Send to all subscribed clients
      subscribedClients.forEach(socketId => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('metrics_data', snapshot);
        }
      });
    } catch (error) {
      console.warn('Failed to broadcast metrics:', error);
    }
  }

  public stopMetricsBroadcast(): void {
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
  }

  public getStats() {
    const subscribedToMetrics = Array.from(this.sessionData.values())
      .filter(session => session.subscribeToMetrics).length;
    
    return {
      connectedClients: this.io.sockets.sockets.size,
      activeSessions: this.sessionData.size,
      activeSSHConnections: this.terminalService.getActiveConnectionsCount(),
      activeAuthSessions: this.authService.getActiveSessionsCount(),
      metricsSubscribers: subscribedToMetrics
    };
  }

  private isValidPublicIP(ip: string): boolean {
    // IPv4 pattern check
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Pattern.test(ip)) {
      const parts = ip.split('.');
      const isValidFormat = parts.every(part => {
        const num = parseInt(part, 10);
        return num >= 0 && num <= 255;
      });
      
      if (!isValidFormat) return false;
      
      // Filter out private IPs
      if (ip.startsWith('10.') || 
          ip.startsWith('127.') || 
          ip.startsWith('192.168.') || 
          ip.startsWith('169.254.')) {
        return false;
      }
      
      // Check 172.16.0.0 - 172.31.255.255
      if (ip.startsWith('172.')) {
        const secondOctet = parseInt(parts[1], 10);
        if (secondOctet >= 16 && secondOctet <= 31) {
          return false;
        }
      }
      
      return true;
    }

    // IPv6 pattern check (simplified)
    const ipv6Pattern = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
    if (ipv6Pattern.test(ip)) {
      // Filter out loopback and private IPv6
      if (ip === '::1' || ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) {
        return false;
      }
      return true;
    }

    return false;
  }
}
