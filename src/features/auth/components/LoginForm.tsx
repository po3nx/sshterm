import React, { useState, useCallback, useEffect } from 'react';
import type { LoginCredentials } from '@/shared/types';
import './LoginForm.css';

interface LoginFormProps {
  onLogin: (credentials: LoginCredentials) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLogin, isLoading, error }) => {
  const [credentials, setCredentials] = useState<LoginCredentials>({
    username: '',
    password: '',
    host: '',
    port: 22,
  });
  const [localError, setLocalError] = useState<string | null>(null);

  // Fetch default SSH host/port from server .env to prefill the form
  useEffect(() => {
    let isMounted = true;
    const loadDefaults = async () => {
      try {
        const res = await fetch('/api/config', { credentials: 'include' });
        if (!res.ok) return;
        const data = await res.json();
        if (!isMounted) return;
        setCredentials(prev => ({
          ...prev,
          host: data?.defaultSSHHost || prev.host || '',
          port: typeof data?.defaultSSHPort === 'number' ? data.defaultSSHPort : (prev.port ?? 22),
        }));
      } catch {}
    };
    loadDefaults();
    return () => { isMounted = false; };
  }, []);

  const handleInputChange = useCallback((field: keyof LoginCredentials, value: string) => {
    setCredentials(prev => ({
      ...prev,
      [field]: field === 'port' ? Number(value) : value
    }));
    // Clear local error when user starts typing
    if (localError) {
      setLocalError(null);
    }
  }, [localError]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!credentials.username.trim()) {
      setLocalError('Username is required');
      return;
    }
    
    if (!credentials.password) {
      setLocalError('Password is required');
      return;
    }

    if (!credentials.host?.trim()) {
      setLocalError('SSH host is required');
      return;
    }

    setLocalError(null);
    
    try {
      await onLogin(credentials);
    } catch (error) {
      // Error handling is done by the parent component/hook
    }
  }, [credentials, onLogin]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setCredentials({ username: '', password: '', host: '', port: 22 });
      setLocalError(null);
    }
  }, []);

  const displayError = localError || error;

  return (
    <div className="login-form-container" onKeyDown={handleKeyDown}>
      <div className="login-form">
        <div className="login-header">
          <h2 className="login-title">SSH Terminal Access</h2>
          <p className="login-subtitle">
            Enter your credentials to connect to the remote server
          </p>
        </div>

        <form onSubmit={handleSubmit} className="credentials-form">
          <div className="form-group">
            <label htmlFor="host" className="form-label">
              SSH Host
            </label>
            <input
              id="host"
              type="text"
              value={credentials.host || ''}
              onChange={(e) => handleInputChange('host', e.target.value)}
              className="form-input"
              placeholder="e.g. server.example.com"
              disabled={isLoading}
              autoComplete="off"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="port" className="form-label">
              SSH Port
            </label>
            <input
              id="port"
              type="number"
              min={1}
              max={65535}
              value={credentials.port ?? 22}
              onChange={(e) => handleInputChange('port', e.target.value)}
              className="form-input"
              placeholder="22"
              disabled={isLoading}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="username" className="form-label">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={credentials.username}
              onChange={(e) => handleInputChange('username', e.target.value)}
              className="form-input"
              placeholder="Enter username"
              disabled={isLoading}
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password" className="form-label">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={credentials.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              className="form-input"
              placeholder="Enter password"
              disabled={isLoading}
              autoComplete="current-password"
              required
            />
          </div>

          {displayError && (
            <div className="error-message" role="alert" aria-live="polite">
              <span className="error-icon">⚠</span>
              <span className="error-text">{displayError}</span>
            </div>
          )}

          <div className="form-actions">
            <button
              type="submit"
              className={`submit-button ${isLoading ? 'loading' : ''}`}
              disabled={
                isLoading ||
                !credentials.username.trim() ||
                !credentials.password ||
                !credentials.host?.trim() ||
                !(credentials.port && credentials.port > 0 && credentials.port <= 65535)
              }
            >
              {isLoading ? (
                <>
                  <div className="button-spinner"></div>
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <span>Connect</span>
                  <span className="button-arrow">→</span>
                </>
              )}
            </button>
          </div>
        </form>

        <div className="login-footer">
          <p className="help-text">
            Press <kbd>Escape</kbd> to clear form • <kbd>Enter</kbd> to connect
          </p>
          <p className="security-note">
            🔒 Your credentials are encrypted during transmission
          </p>
        </div>
      </div>
    </div>
  );
};
