import { EventEmitter } from 'events';

// Domain entities
export interface User {
  username: string;
  sessionId: string;
  createdAt: Date;
  lastActivity: Date;
}

export interface SSHSession {
  id: string;
  userId: string;
  host: string;
  port: number;
  username: string;
  isActive: boolean;
  createdAt: Date;
  lastActivity: Date;
}

// Value objects
export class Credentials {
  constructor(
    public readonly username: string,
    public readonly password: string
  ) {
    if (!username?.trim() || !password?.trim()) {
      throw new Error('Username and password are required');
    }
  }
}

export class TerminalSize {
  constructor(
    public readonly cols: number,
    public readonly rows: number
  ) {
    if (cols <= 0 || rows <= 0) {
      throw new Error('Terminal dimensions must be positive');
    }
  }
}

// Domain services interfaces
export interface ISSHConnectionService {
  createConnection(credentials: Credentials, config: SSHConfig): Promise<SSHConnection>;
  closeConnection(connectionId: string): Promise<void>;
  getConnection(connectionId: string): SSHConnection | null;
}

export interface ITerminalService {
  handleInput(connectionId: string, data: string): Promise<void>;
  handleResize(connectionId: string, size: TerminalSize): Promise<void>;
  getTerminalOutput(connectionId: string): AsyncGenerator<string>;
}

export interface IAuthenticationService {
  authenticate(credentials: Credentials): Promise<AuthResult>;
  validateSession(sessionId: string): Promise<boolean>;
}

// SSH Configuration
export class SSHConfig {
  constructor(
    public readonly host: string,
    public readonly port: number = 22,
    public readonly timeout: number = 30000
  ) {
    if (!host?.trim()) {
      throw new Error('SSH host is required');
    }
    if (port <= 0 || port > 65535) {
      throw new Error('Invalid SSH port');
    }
  }
}

// SSH Connection wrapper
export class SSHConnection extends EventEmitter {
  constructor(
    public readonly id: string,
    public readonly config: SSHConfig,
    public readonly credentials: Credentials,
    private connection: any, // ssh2 connection
    private stream: any // ssh2 stream
  ) {
    super();
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.stream?.on('data', (data: Buffer) => {
      this.emit('output', data.toString('utf-8'));
    });

    this.stream?.on('close', () => {
      this.emit('disconnect');
    });

    this.connection?.on('error', (error: Error) => {
      this.emit('error', error);
    });
  }

  public writeInput(data: string): void {
    if (!this.stream) {
      throw new Error('SSH stream not available');
    }
    this.stream.write(data);
  }

  public resize(size: TerminalSize): void {
    if (!this.stream) {
      throw new Error('SSH stream not available');
    }
    this.stream.setWindow(size.rows, size.cols, size.rows * 24, size.cols * 10);
  }

  public close(): void {
    this.stream?.end();
    this.connection?.end();
    this.emit('closed');
  }

  public isActive(): boolean {
    // Consider the SSH connection active when we have a usable stream that isn't destroyed.
    // Some environments/drivers may not expose a stable `state === 'authenticated'` value.
    return !!this.stream && !this.stream.destroyed;
  }
}

// Authentication result
export class AuthResult {
  constructor(
    public readonly success: boolean,
    public readonly message?: string,
    public readonly user?: User
  ) {}

  static success(user: User): AuthResult {
    return new AuthResult(true, undefined, user);
  }

  static failure(message: string): AuthResult {
    return new AuthResult(false, message);
  }
}

// Domain events
export abstract class DomainEvent {
  constructor(
    public readonly occurredOn: Date = new Date(),
    public readonly aggregateId: string
  ) {}
}

export class UserAuthenticatedEvent extends DomainEvent {
  constructor(
    public readonly user: User,
    aggregateId: string
  ) {
    super(new Date(), aggregateId);
  }
}

export class SSHConnectionEstablishedEvent extends DomainEvent {
  constructor(
    public readonly session: SSHSession,
    aggregateId: string
  ) {
    super(new Date(), aggregateId);
  }
}

export class SSHConnectionClosedEvent extends DomainEvent {
  constructor(
    public readonly sessionId: string,
    aggregateId: string
  ) {
    super(new Date(), aggregateId);
  }
}
