import React, { useEffect, useState } from 'react';
import './MetricsWidget.css';

interface Snapshot {
  socketConnectedClients: number;
  sshActiveConnections: number;
  sshConnectionFailuresTotal: number;
  sshLoginAttempts: { attempt: number; success: number; failure: number };
  httpRequestsTotalByStatus: Record<string, number>;
  httpRequestDuration: { count: number; sumSeconds: number; avgSeconds: number };
  processMemory: { rssBytes: number; heapUsedBytes: number; heapTotalBytes: number };
  processUptimeSeconds: number;
  processCpuPercent: number;
  systemMemory: { totalBytes: number; freeBytes: number; usedBytes: number; usedPercent: number };
  systemLoadAvg: number[];
  timestamp: string;
}

export const MetricsWidget: React.FC = () => {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let retryCount = 0;
    const maxRetries = 3;

    const fetchOnce = async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const res = await fetch('/api/metrics-json', { 
          credentials: 'include',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Snapshot;
        if (!cancelled) {
          setData(json);
          setError(null);
          retryCount = 0; // Reset retry count on success
        }
      } catch (e: any) {
        if (!cancelled) {
          retryCount++;
          if (retryCount < maxRetries) {
            setError(`Retrying... (${retryCount}/${maxRetries})`);
          } else {
            setError(e?.message || 'Failed to load metrics');
          }
        }
      }
    };

    const loop = async () => {
      await fetchOnce();
      // Increase interval when there are errors to reduce server load
      const interval = retryCount > 0 ? 15000 : 10000;
      timer = window.setTimeout(loop, interval);
    };

    loop();

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="metrics-widget" role="region" aria-label="Application metrics">
      <div className="metrics-header">
        <span>📊 Metrics</span>
        {error && <span className="metrics-error">{error}</span>}
      </div>
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Clients</div>
          <div className="metric-value">{data?.socketConnectedClients ?? 0}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">SSH Active</div>
          <div className="metric-value">{data?.sshActiveConnections ?? 0}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">CPU (%)</div>
          <div className="metric-value">{(data?.processCpuPercent ?? 0).toFixed(0)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Mem (MB)</div>
          <div className="metric-value">{(((data?.processMemory.rssBytes ?? 0) / (1024 * 1024)) || 0).toFixed(0)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Login ✓/✗</div>
          <div className="metric-value">
            {(data?.sshLoginAttempts.success ?? 0)}/{(data?.sshLoginAttempts.failure ?? 0)}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">HTTP avg (ms)</div>
          <div className="metric-value">{((data?.httpRequestDuration.avgSeconds ?? 0) * 1000).toFixed(1)}</div>
        </div>
      </div>
      <div className="metrics-footer">
        <span className="metrics-timestamp">{data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : ''}</span>
      </div>
    </div>
  );
};