import { Server, Socket } from 'socket.io';
import { Credentials, SSHConfig, TerminalSize } from '../../domain/models';
import { SSHConnectionService } from '../../infrastructure/ssh/SSHConnectionService';
import { TerminalService } from '../../application/services/TerminalService';
import { AuthenticationService } from '../../application/services/AuthenticationService';

export interface SocketSession {
  sessionId?: string;
  sshConnectionId?: string;
  username?: string;
}

export class SocketHandler {
  private sessionData = new Map<string, SocketSession>();

  constructor(
    private io: Server,
    private sshConnectionService: SSHConnectionService,
    private terminalService: TerminalService,
    private authService: AuthenticationService,
    private throttleService: import('../../application/services/LoginThrottleService').LoginThrottleService
  ) {
    this.setupSocketHandlers();
  }

  private setupSocketHandlers(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      // Initialize session data
      this.sessionData.set(socket.id, {});

      this.setupLoginHandler(socket);
      this.setupInputHandler(socket);
      this.setupResizeHandler(socket);
      this.setupDisconnectHandler(socket);
    });
  }

  private setupLoginHandler(socket: Socket): void {
    // Accept host/port overrides from client while preserving env defaults
    socket.on('login', async ({ username, password, host, port }: { username: string; password: string; host?: string; port?: number }) => {
      try {
        console.log(`Login attempt from ${socket.id}: ${username}`);

        // Determine effective host for throttle key
        const effectiveHost = (host && host.trim()) || process.env.SSH_HOST || '';
        const clientIp = this.throttleService.getClientIp(socket);

        // Throttle: block if too many failures for this IP+host
        if (effectiveHost) {
          const { blocked, retryAfterMs } = this.throttleService.isBlocked(clientIp, effectiveHost);
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
        const authResult = await this.authService.authenticate(credentials);

        if (!authResult.success) {
          socket.emit('loginResult', { 
            success: false, 
            message: authResult.message || 'Authentication failed' 
          });

          // Register failure for throttle
          if ((host && host.trim()) || process.env.SSH_HOST) {
            const h = (host && host.trim()) || process.env.SSH_HOST!;
            const ip = this.throttleService.getClientIp(socket);
            this.throttleService.registerFailure(ip, h);
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

          // On success, clear throttle state for this IP+host
          const ip = this.throttleService.getClientIp(socket);
          this.throttleService.registerSuccess(ip, sshConfig.host);

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

          // Register failure for throttle
          const ip = this.throttleService.getClientIp(socket);
          this.throttleService.registerFailure(ip, sshConfig.host);
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

  public getStats() {
    return {
      connectedClients: this.io.sockets.sockets.size,
      activeSessions: this.sessionData.size,
      activeSSHConnections: this.terminalService.getActiveConnectionsCount(),
      activeAuthSessions: this.authService.getActiveSessionsCount()
    };
  }
}
