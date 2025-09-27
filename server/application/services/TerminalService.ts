import { ITerminalService, TerminalSize } from '../../domain/models';
import { SSHConnectionService } from '../../infrastructure/ssh/SSHConnectionService';

export class TerminalService implements ITerminalService {
  constructor(private sshConnectionService: SSHConnectionService) {}

  async handleInput(connectionId: string, data: string): Promise<void> {
    const connection = this.sshConnectionService.getConnection(connectionId);
    if (!connection) {
      throw new Error(`SSH connection ${connectionId} not found`);
    }

    if (!connection.isActive()) {
      throw new Error(`SSH connection ${connectionId} is not active`);
    }

    try {
      connection.writeInput(data);
    } catch (error) {
      throw new Error(`Failed to send input to SSH connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async handleResize(connectionId: string, size: TerminalSize): Promise<void> {
    const connection = this.sshConnectionService.getConnection(connectionId);
    if (!connection) {
      throw new Error(`SSH connection ${connectionId} not found`);
    }

    if (!connection.isActive()) {
      throw new Error(`SSH connection ${connectionId} is not active`);
    }

    try {
      connection.resize(size);
    } catch (error) {
      throw new Error(`Failed to resize terminal: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async *getTerminalOutput(connectionId: string): AsyncGenerator<string> {
    const connection = this.sshConnectionService.getConnection(connectionId);
    if (!connection) {
      throw new Error(`SSH connection ${connectionId} not found`);
    }

    // Create a promise-based event listener for output
    const outputQueue: string[] = [];
    let outputResolver: ((value: IteratorResult<string>) => void) | null = null;
    let isEnded = false;

    const handleOutput = (data: string) => {
      if (outputResolver) {
        outputResolver({ value: data, done: false });
        outputResolver = null;
      } else {
        outputQueue.push(data);
      }
    };

    const handleDisconnect = () => {
      isEnded = true;
      if (outputResolver) {
        outputResolver({ value: undefined, done: true });
        outputResolver = null;
      }
    };

    const handleError = (error: Error) => {
      isEnded = true;
      if (outputResolver) {
        outputResolver({ value: `Error: ${error.message}`, done: false });
        outputResolver = null;
      }
    };

    // Setup event listeners
    connection.on('output', handleOutput);
    connection.on('disconnect', handleDisconnect);
    connection.on('error', handleError);

    try {
      while (!isEnded) {
        if (outputQueue.length > 0) {
          yield outputQueue.shift()!;
        } else {
          // Wait for the next output
          const result = await new Promise<IteratorResult<string>>((resolve) => {
            outputResolver = resolve;
          });

          if (result.done) {
            break;
          }

          yield result.value;
        }
      }
    } finally {
      // Cleanup event listeners
      connection.removeListener('output', handleOutput);
      connection.removeListener('disconnect', handleDisconnect);
      connection.removeListener('error', handleError);
    }
  }

  getActiveConnectionsCount(): number {
    return this.sshConnectionService.getActiveConnectionsCount();
  }

  async closeConnection(connectionId: string): Promise<void> {
    await this.sshConnectionService.closeConnection(connectionId);
  }

  async closeAllConnections(): Promise<void> {
    await this.sshConnectionService.closeAllConnections();
  }
}
