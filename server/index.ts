import { config } from 'dotenv';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { join } from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import { metrics } from './infrastructure/metrics/Metrics';

// Import services
import { SSHConnectionService } from './infrastructure/ssh/SSHConnectionService';
import { TerminalService } from './application/services/TerminalService';
import { AuthenticationService } from './application/services/AuthenticationService';
import { SocketHandler } from './presentation/socket/SocketHandler';
import { LoginThrottleService } from './application/services/LoginThrottleService';

// Load environment variables
config();

// Create Express app
const app = express();
const server = createServer(app);

// Configure Socket.IO with CORS
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  }
}));

// CORS configuration (supports comma-separated CLIENT_URL list)
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true); // Allow non-browser clients or same-origin
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Metrics middleware (disabled by default)
const METRICS_ENABLED = (process.env.METRICS_ENABLED === '1' || process.env.METRICS_ENABLED === 'true');
if (METRICS_ENABLED) {
  app.use(metrics.httpMetricsMiddleware());
}

// Serve static files in production, but only if the client build exists
if (process.env.NODE_ENV === 'production') {
  // Try typical build locations depending on runtime (built vs ts-node/tsx)
  const candidates = [
    join(__dirname, '../client'),          // when running from dist/server
    join(__dirname, '../../dist/client'),  // when running server from source with built client
    join(process.cwd(), 'dist/client'),    // fallback to CWD
  ];

  const clientPath = candidates.find(p => fs.existsSync(join(p, 'index.html')));

  if (clientPath) {
    app.use(express.static(clientPath));

    // Serve index.html for non-API routes only (exclude /api, /metrics, /socket.io)
    app.get(/^(?!\/(api|metrics|socket\.io)(\/|$)).*/, (req, res) => {
      res.sendFile(join(clientPath, 'index.html'));
    });

    console.log(`🗂  Serving client from: ${clientPath}`);
  } else {
    console.warn('⚠️  Client build not found. Skipping static file serving.');
    console.warn('    Expected index.html in one of:');
    candidates.forEach(p => console.warn(`     - ${p}`));
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API status endpoint
app.get('/api/status', (req, res) => {
  const stats = socketHandler.getStats();
  res.json({
    ...stats,
    serverVersion: '1.0.0',
    nodeVersion: process.version,
    environment: process.env.NODE_ENV || 'development'
  });
});

// Metrics endpoint (optional bearer token auth)
if (METRICS_ENABLED) {
  app.get('/metrics', async (req, res) => {
    const token = process.env.METRICS_TOKEN;
    if (token) {
      const auth = req.headers['authorization'];
      if (!auth || !auth.startsWith('Bearer ') || auth.substring(7) !== token) {
        return res.status(401).send('Unauthorized');
      }
    }
    res.set('Content-Type', metrics.registry.contentType);
    res.send(await metrics.registry.metrics());
  });
}

// Lightweight JSON metrics for client-side visualization
if (METRICS_ENABLED) {
  app.get('/api/metrics-json', async (req, res) => {
    try {
      const snapshot = await metrics.snapshot();
      res.json(snapshot);
    } catch (e) {
      res.status(500).json({ error: 'Failed to collect metrics' });
    }
  });
}

// API config endpoint for client defaults
app.get('/api/config', (req, res) => {
  res.json({
    defaultSSHHost: process.env.SSH_HOST || null,
    defaultSSHPort: parseInt(process.env.SSH_PORT || '22', 10),
  });
});

// API endpoint to help detect client IP
app.get('/api/client-ip', (req, res) => {
  // Get IP from various possible headers
  const ip = 
    (req.headers['cf-connecting-ip'] as string) ||
    (req.headers['x-real-ip'] as string) ||
    (req.headers['x-forwarded-for']?.toString().split(',')[0].trim()) ||
    req.socket.remoteAddress ||
    '';

  // Clean up the IP
  let cleanIp = ip;
  
  // Remove IPv6 prefix if present
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.substring(7);
  }
  
  // Remove port if present (for IPv4)
  const portIndex = cleanIp.lastIndexOf(':');
  if (portIndex > 0 && !cleanIp.includes('[')) {
    const colonCount = (cleanIp.match(/:/g) || []).length;
    if (colonCount === 1) {
      cleanIp = cleanIp.substring(0, portIndex);
    }
  }

  console.log(`Client IP detection via /api/client-ip: ${cleanIp} (raw: ${ip})`);
  
  res.json({ ip: cleanIp });
});

// Environment validation: SSH_HOST is now optional (can be set by client form)
if (!process.env.SSH_HOST) {
  console.warn('⚠️  No SSH_HOST in environment. Clients must provide SSH host via the login form.');
}

// Initialize services (Dependency Injection)
console.log('🔧 Initializing services...');

const sshConnectionService = new SSHConnectionService();
const terminalService = new TerminalService(sshConnectionService);
const authenticationService = new AuthenticationService();
const loginThrottleService = new LoginThrottleService();

// Start session cleanup for authentication service
const cleanupTimer = authenticationService.startSessionCleanup();

// Initialize Socket.IO handler
const socketHandler = new SocketHandler(
  io,
  sshConnectionService,
  terminalService,
  authenticationService,
  loginThrottleService
);

// Error handling middleware
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Express error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Graceful shutdown handling
const gracefulShutdown = async (signal: string) => {
  console.log(`\n📡 Received ${signal}, shutting down gracefully...`);
  
  try {
    // Stop accepting new connections
    server.close(async () => {
      console.log('🔌 HTTP server closed');
      
      try {
        // Clean up resources
        clearInterval(cleanupTimer);
        socketHandler.stopMetricsBroadcast();
        await terminalService.closeAllConnections();
        console.log('🧹 Cleaned up resources');
        
        console.log('👋 Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    });
    
    // Force close after 30 seconds
    setTimeout(() => {
      console.log('⚠️  Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
    
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
  console.log('🚀 Server Information:');
  console.log(`   - HTTP Server: http://${HOST}:${PORT}`);
  console.log(`   - WebSocket Server: ws://${HOST}:${PORT}`);
  console.log(`   - SSH Host: ${process.env.SSH_HOST}:${process.env.SSH_PORT || 22}`);
  console.log(`   - Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   - Client URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
  console.log('📡 WebSocket server ready for connections');
  console.log('✅ Server is ready!');
});

// Export for testing
export { app, server, io };
