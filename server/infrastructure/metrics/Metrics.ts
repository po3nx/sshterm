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

  public async snapshot() {
    const safeValue = (v: any, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

    // Gauges
    const socketClients = await this.socketConnectedClients.get();
    const sshActive = await this.sshActiveConnections.get();

    // Counters
    const sshFailures = await this.sshConnectionFailuresTotal.get();
    const sshLogin = await this.sshLoginAttempts.get();

    // HTTP counters
    const httpReqs = await this.httpRequestsTotal.get();
    const httpDur = await this.httpRequestDurationSeconds.get();

    const sumHttpReqsByStatus: Record<string, number> = {};
    for (const v of httpReqs.values) {
      const status = (v.labels as any)?.status ?? 'unknown';
      sumHttpReqsByStatus[status] = safeValue(sumHttpReqsByStatus[status], 0) + safeValue(v.value, 0);
    }

    const loginCounts: Record<string, number> = { attempt: 0, success: 0, failure: 0 };
    for (const v of sshLogin.values) {
      const result = (v.labels as any)?.result ?? 'unknown';
      if (result in loginCounts) loginCounts[result] += safeValue(v.value, 0);
    }

    // Extract overall count/sum for duration histogram
    let httpDurationCount = 0;
    let httpDurationSum = 0;
    for (const v of httpDur.values) {
      if ((v.labels as any)?.le === undefined) {
        // _count or _sum
        if ((v as any).metricName?.endsWith('_count')) httpDurationCount = safeValue(v.value, 0);
        if ((v as any).metricName?.endsWith('_sum')) httpDurationSum = safeValue(v.value, 0);
      }
    }

    return {
      socketConnectedClients: safeValue(socketClients.values?.[0]?.value, 0),
      sshActiveConnections: safeValue(sshActive.values?.[0]?.value, 0),
      sshConnectionFailuresTotal: safeValue(sshFailures.values?.[0]?.value, 0),
      sshLoginAttempts: loginCounts,
      httpRequestsTotalByStatus: sumHttpReqsByStatus,
      httpRequestDuration: {
        count: httpDurationCount,
        sumSeconds: httpDurationSum,
        avgSeconds: httpDurationCount > 0 ? httpDurationSum / httpDurationCount : 0,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export const metrics = new Metrics();
