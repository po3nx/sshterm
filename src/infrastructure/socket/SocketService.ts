import { io, Socket } from 'socket.io-client';
import type { 
  ServerToClientEvents, 
  ClientToServerEvents, 
  LoginCredentials, 
  TerminalSize 
} from '@/shared/types';

export class SocketService {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private isConnecting = false;

  // If no URL is provided, we'll connect to the same-origin Socket.IO endpoint.
  // This avoids mixed-content and cross-origin issues in production when served over HTTPS.
  constructor(private serverUrl?: string) {}

  connect(): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
    if (this.socket?.connected) {
      return Promise.resolve(this.socket);
    }

    if (this.isConnecting) {
      return new Promise((resolve, reject) => {
        const checkConnection = () => {
          if (this.socket?.connected) {
            resolve(this.socket);
          } else if (!this.isConnecting) {
            reject(new Error('Connection failed'));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }

    return new Promise((resolve, reject) => {
      this.isConnecting = true;

      const target = this.serverUrl && this.serverUrl.trim().length > 0 ? this.serverUrl : undefined;

      // When target is undefined, Socket.IO connects to the current origin at /socket.io,
      // which pairs with the Vite dev proxy and production same-origin setup.
      this.socket = io(target, {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: 3,
        reconnectionDelay: 1000,
      });

      const onConnect = () => {
        this.isConnecting = false;
        console.log('Socket connected:', this.socket?.id);
        this.socket?.off('connect', onConnect);
        this.socket?.off('connect_error', onConnectError);
        resolve(this.socket!);
      };

      const onConnectError = (error: Error) => {
        this.isConnecting = false;
        console.error('Socket connection error:', error);
        this.socket?.off('connect', onConnect);
        this.socket?.off('connect_error', onConnectError);
        reject(error);
      };

      this.socket.on('connect', onConnect);
      this.socket.on('connect_error', onConnectError);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.isConnecting = false;
  }

  async login(credentials: LoginCredentials): Promise<void> {
    const socket = await this.connect();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        socket.off('loginResult', onLoginResult);
        reject(new Error('Login timeout'));
      }, 10000);

      const onLoginResult = (result: { success: boolean; message?: string }) => {
        clearTimeout(timeout);
        if (result.success) {
          resolve();
        } else {
          reject(new Error(result.message || 'Login failed'));
        }
      };

      socket.on('loginResult', onLoginResult);
      socket.emit('login', credentials);
    });
  }

  sendInput(data: string): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('input', data);
  }

  resize(size: TerminalSize): void {
    if (!this.socket?.connected) {
      throw new Error('Socket not connected');
    }
    this.socket.emit('resize', size);
  }

  onOutput(callback: (data: string) => void): () => void {
    if (!this.socket) {
      throw new Error('Socket not initialized');
    }
    this.socket.on('output', callback);
    return () => this.socket?.off('output', callback);
  }

  onDisconnect(callback: () => void): () => void {
    if (!this.socket) {
      throw new Error('Socket not initialized');
    }
    this.socket.on('disconnect', callback);
    return () => this.socket?.off('disconnect', callback);
  }

  onError(callback: (error: string) => void): () => void {
    if (!this.socket) {
      throw new Error('Socket not initialized');
    }
    this.socket.on('error', callback);
    return () => this.socket?.off('error', callback);
  }

  onReconnect(callback: () => void): () => void {
    if (!this.socket) {
      throw new Error('Socket not initialized');
    }
    (this.socket as any).on('reconnect', callback);
    return () => (this.socket as any)?.off('reconnect', callback);
  }

  onReconnectError(callback: (error: Error) => void): () => void {
    if (!this.socket) {
      throw new Error('Socket not initialized');
    }
    (this.socket as any).on('reconnect_error', callback);
    return () => (this.socket as any)?.off('reconnect_error', callback);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  getConnectionId(): string | undefined {
    return this.socket?.id;
  }
}
