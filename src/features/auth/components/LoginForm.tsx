import React, { useState, useCallback } from 'react';
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
    password: ''
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const handleInputChange = useCallback((field: keyof LoginCredentials, value: string) => {
    setCredentials(prev => ({
      ...prev,
      [field]: value
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

    setLocalError(null);
    
    try {
      await onLogin(credentials);
    } catch (error) {
      // Error handling is done by the parent component/hook
    }
  }, [credentials, onLogin]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setCredentials({ username: '', password: '' });
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
              disabled={isLoading || !credentials.username.trim() || !credentials.password}
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
