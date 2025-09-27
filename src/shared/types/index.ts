// Authentication types
export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResult {
  success: boolean;
  message?: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isConnecting: boolean;
  error?: string;
}

// SSH Connection types
export interface SSHConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface SSHConnection {
  id: string;
  config: SSHConnectionConfig;
  isConnected: boolean;
  lastActivity: Date;
}

// Terminal types
export interface TerminalSize {
  cols: number;
  rows: number;
}

export interface TerminalState {
  isConnected: boolean;
  size: TerminalSize;
  output: string;
}

export interface TerminalMessage {
  type: 'input' | 'output' | 'resize' | 'connect' | 'disconnect';
  data: any;
  timestamp: Date;
}

// Socket events
export interface ServerToClientEvents {
  loginResult: (result: LoginResult) => void;
  output: (data: string) => void;
  disconnect: () => void;
  error: (error: string) => void;
}

export interface ClientToServerEvents {
  login: (credentials: LoginCredentials) => void;
  input: (data: string) => void;
  resize: (size: TerminalSize) => void;
  disconnect: () => void;
}

// Application states
export type ConnectionStage = 'login' | 'connecting' | 'connected' | 'disconnected' | 'error';

export interface AppState {
  stage: ConnectionStage;
  auth: AuthState;
  terminal: TerminalState;
}

// Error types
export class SSHError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'SSHError';
  }
}

export class AuthenticationError extends SSHError {
  constructor(message: string, cause?: Error) {
    super(message, 'AUTH_ERROR', cause);
    this.name = 'AuthenticationError';
  }
}

export class ConnectionError extends SSHError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'ConnectionError';
  }
}
