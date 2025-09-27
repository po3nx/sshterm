import React from 'react';
import type { ConnectionStage } from '@/shared/types';
import './ConnectionStatus.css';

interface ConnectionStatusProps {
  stage: ConnectionStage;
  error: string | null;
  isConnecting: boolean;
  isConnected: boolean;
  onDisconnect: () => void;
  onReset: () => void;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  stage,
  error,
  isConnecting,
  isConnected,
  onDisconnect,
  onReset
}) => {
  const getStatusInfo = () => {
    switch (stage) {
      case 'login':
        return {
          text: 'Ready to connect',
          className: 'status-idle',
          showActions: false
        };
      case 'connecting':
        return {
          text: 'Connecting to SSH server...',
          className: 'status-connecting',
          showActions: false
        };
      case 'connected':
        return {
          text: 'Connected to SSH server',
          className: 'status-connected',
          showActions: true
        };
      case 'disconnected':
        return {
          text: 'Disconnected from server',
          className: 'status-disconnected',
          showActions: false
        };
      case 'error':
        return {
          text: error || 'Connection error',
          className: 'status-error',
          showActions: false
        };
      default:
        return {
          text: 'Unknown status',
          className: 'status-idle',
          showActions: false
        };
    }
  };

  const statusInfo = getStatusInfo();

  return (
    <div className="connection-status">
      <div className={`status-indicator ${statusInfo.className}`}>
        <div className="status-dot"></div>
        <span className="status-text">{statusInfo.text}</span>
        
        {isConnecting && (
          <div className="loading-spinner">
            <div className="spinner"></div>
          </div>
        )}
      </div>

      {statusInfo.showActions && (
        <div className="status-actions">
          <button
            onClick={onDisconnect}
            className="action-button disconnect-button"
            title="Disconnect from server"
          >
            Disconnect
          </button>
        </div>
      )}

      {(stage === 'error' || stage === 'disconnected') && (
        <div className="status-actions">
          <button
            onClick={onReset}
            className="action-button reset-button"
            title="Reset connection"
          >
            {stage === 'error' ? 'Try Again' : 'Reconnect'}
          </button>
        </div>
      )}

      {error && stage !== 'error' && (
        <div className="error-message">
          <span className="error-text">{error}</span>
        </div>
      )}
    </div>
  );
};
