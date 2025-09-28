import React, { useEffect, useState } from 'react';
import './MetricsWidget.css';

interface Snapshot {
  socketConnectedClients: number;
  sshActiveConnections: number;
  sshConnectionFailuresTotal: number;
  sshLoginAttempts: { attempt: number; success: number; failure: number };
  httpRequestsTotalByStatus: Record<string, number>;
  httpRequestDuration: { count: number; sumSeconds: number; avgSeconds: number };
  timestamp: string;
}

export const MetricsWidget: React.FC = () => {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const fetchOnce = async () => {
      try {
        const res = await fetch('/api/metrics-json', { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Snapshot;
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load metrics');
      }
    };

    const loop = async () => {
      await fetchOnce();
      timer = window.setTimeout(loop, 5000);
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