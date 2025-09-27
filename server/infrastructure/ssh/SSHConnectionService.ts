import { Client } from 'ssh2';
import { randomUUID } from 'crypto';
import { 
  ISSHConnectionService, 
  SSHConnection, 
  Credentials, 
  SSHConfig,
  TerminalSize 
} from '../../domain/models';

export class SSHConnectionService implements ISSHConnectionService {
  private connections: Map<string, SSHConnection> = new Map();

  async createConnection(credentials: Credentials, config: SSHConfig): Promise<SSHConnection> {
    return new Promise((resolve, reject) => {
      const connectionId = randomUUID();
      const client = new Client();
      
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('SSH connection timeout'));
      }, config.timeout);

      client.on('ready', () => {
        clearTimeout(timeout);
        
        client.shell((err, stream) => {
          if (err) {
            client.end();
            reject(new Error(`Failed to create shell: ${err.message}`));
            return;
          }

          const sshConnection = new SSHConnection(
            connectionId,
            config,
            credentials,
            client,
            stream
          );

          // Setup connection cleanup
          sshConnection.on('disconnect', () => {
            this.closeConnection(connectionId);
          });

          sshConnection.on('error', (error) => {
            console.error(`SSH Connection ${connectionId} error:`, error);
            this.closeConnection(connectionId);
          });

          sshConnection.on('closed', () => {
            this.connections.delete(connectionId);
          });

          this.connections.set(connectionId, sshConnection);
          resolve(sshConnection);
        });
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`SSH connection failed: ${err.message}`));
      });

      client.connect({
        host: config.host,
        port: config.port,
        username: credentials.username,
        password: credentials.password,
        readyTimeout: config.timeout,
        algorithms: {
          kex: [
            'diffie-hellman-group14-sha256',
            'diffie-hellman-group16-sha512',
            'diffie-hellman-group18-sha512',
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521'
          ],
          cipher: [
            'aes128-ctr',
            'aes192-ctr',
            'aes256-ctr'
          ],
          hmac: [
            'hmac-sha2-256',
            'hmac-sha2-512'
          ]
        }
      });
    });
  }

  async closeConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.close();
      this.connections.delete(connectionId);
    }
  }

  getConnection(connectionId: string): SSHConnection | null {
    return this.connections.get(connectionId) || null;
  }

  getAllConnections(): SSHConnection[] {
    return Array.from(this.connections.values());
  }

  getActiveConnectionsCount(): number {
    return Array.from(this.connections.values())
      .filter(conn => conn.isActive()).length;
  }

  async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.connections.keys())
      .map(id => this.closeConnection(id));
    
    await Promise.all(closePromises);
  }
}
