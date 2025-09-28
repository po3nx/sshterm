import React, { useEffect, useRef } from 'react';
import { useSSHTerminal } from '../hooks/useSSHTerminal';
import { ConnectionStatus } from './ConnectionStatus';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { MetricsWidget } from '@/features/metrics/components/MetricsWidget';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';

interface TerminalProps {
  className?: string;
}

export const Terminal: React.FC<TerminalProps> = ({ className = '' }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const {
    stage,
    error,
    isConnecting,
    isConnected,
    login,
    disconnect,
    reset,
    setupTerminal
  } = useSSHTerminal();

  // Setup terminal when component mounts
  useEffect(() => {
    if (terminalRef.current) {
      const cleanup = setupTerminal(terminalRef.current);
      return cleanup;
    }
  }, [setupTerminal]);

  const handleLogin = async (credentials: { username: string; password: string; host?: string; port?: number }) => {
    try {
      await login(credentials);
    } catch (error) {
      // Error is already handled in the hook
      console.error('Login failed:', error);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    // Handle Ctrl+C to reset
    if (event.ctrlKey && event.key === 'c' && stage !== 'connected') {
      event.preventDefault();
      reset();
    }
  };

  return (
    <div 
      className={`terminal-container ${className}`}
      onKeyDown={handleKeyPress}
      tabIndex={0}
    >
      {/* Connection Status */}
      <ConnectionStatus
        stage={stage}
        error={error}
        isConnecting={isConnecting}
        isConnected={isConnected}
        onDisconnect={disconnect}
        onReset={reset}
      />

      {/* Metrics (client-side visualization, no Prometheus needed) */}
      <MetricsWidget />

      {/* Login Overlay */}
      {stage === 'login' && (
        <div className="terminal-overlay">
          <LoginForm
            onLogin={handleLogin}
            isLoading={isConnecting}
            error={error}
          />
        </div>
      )}

      {/* Terminal Display */}
      <div
        ref={terminalRef}
        className={`terminal-display ${stage === 'login' ? 'terminal-blurred' : ''}`}
        id="terminal"
      />
    </div>
  );
};
