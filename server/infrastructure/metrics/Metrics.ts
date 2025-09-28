import client, { Counter, Gauge, Histogram, Registry } from 'prom-client';
import type express from 'express';

class Metrics {
  public readonly registry: Registry;
  public readonly httpRequestsTotal: Counter<string>;
  public readonly httpRequestDurationSeconds: Histogram<string>;
  public readonly socketConnectedClients: Gauge<string>;
  public readonly sshActiveConnections: Gauge<string>;
  public readonly sshConnectionFailuresTotal: Counter<string>;
  public readonly sshLoginAttempts: Counter<string>;

  constructor() {
    this.registry = new client.Registry();
    client.collectDefaultMetrics({ register: this.registry });

    this.httpRequestsTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry]
    });

    this.httpRequestDurationSeconds = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
      registers: [this.registry]
    });

    this.socketConnectedClients = new client.Gauge({
      name: 'socket_connected_clients',
      help: 'Current number of connected Socket.IO clients',
      registers: [this.registry]
    });

    this.sshActiveConnections = new client.Gauge({
      name: 'ssh_active_connections',
      help: 'Current number of active SSH connections',
      registers: [this.registry]
    });

    this.sshConnectionFailuresTotal = new client.Counter({
      name: 'ssh_connection_failures_total',
      help: 'Total number of SSH connection failures',
      registers: [this.registry]
    });

    this.sshLoginAttempts = new client.Counter({
      name: 'ssh_login_attempts_total',
      help: 'Total number of SSH login attempts',
      labelNames: ['result'], // success|failure
      registers: [this.registry]
    });
  }

  public httpMetricsMiddleware(): express.RequestHandler {
    return (req, res, next) => {
      const startHr = process.hrtime.bigint();
      // Capture path as route label. For accuracy you can map to known routes.
      const route = (req as any).route?.path || req.path || req.originalUrl || 'unknown';
      const method = req.method;

      res.on('finish', () => {
        const endHr = process.hrtime.bigint();
        const seconds = Number(endHr - startHr) / 1e9;
        const status = String(res.statusCode);
        this.httpRequestsTotal.inc({ method, route, status });
        this.httpRequestDurationSeconds.observe({ method, route, status }, seconds);
      });

      next();
    };
  }
}

export const metrics = new Metrics();