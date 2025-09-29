import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { MetricsSnapshot, ServerToClientEvents, ClientToServerEvents } from '@/shared/types';
import './MetricsWidget.css';

export const MetricsWidget: React.FC = () => {
  const [data, setData] = useState<MetricsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);

  useEffect(() => {
    // Create socket connection for metrics only
    const configuredUrl = (typeof import.meta !== 'undefined' && (import.meta as any).env)
      ? ((import.meta as any).env.VITE_SERVER_URL as string | undefined)
      : undefined;

    const serverUrl = configuredUrl && configuredUrl.trim().length > 0 ? configuredUrl : undefined;
    
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      reconnection: true,
      reconnectionAttempts: 3,
      reconnectionDelay: 2000,
    }) as Socket<ServerToClientEvents, ClientToServerEvents>;

    socketRef.current = socket;

    // Socket event handlers
    socket.on('connect', () => {
      console.log('Metrics socket connected');
      setIsConnected(true);
      setError(null);
      
      // Subscribe to metrics updates
      socket.emit('subscribe_metrics');
    });

    socket.on('disconnect', () => {
      console.log('Metrics socket disconnected');
      setIsConnected(false);
      setError('Connection lost');
    });

    socket.on('connect_error', (err) => {
      console.error('Metrics socket connection error:', err);
      setIsConnected(false);
      setError(`Connection error: ${err.message}`);
    });

    socket.on('metrics_data', (snapshot: MetricsSnapshot) => {
      if (snapshot.error) {
        setError(snapshot.error);
        setData(null);
      } else {
        setData(snapshot);
        setError(null);
      }
    });

    return () => {
      if (socket) {
        socket.emit('unsubscribe_metrics');
        socket.disconnect();
      }
      socketRef.current = null;
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