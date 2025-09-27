import { randomUUID } from 'crypto';
import { IAuthenticationService, Credentials, AuthResult, User } from '../../domain/models';

export class AuthenticationService implements IAuthenticationService {
  private activeSessions: Map<string, User> = new Map();

  async authenticate(credentials: Credentials): Promise<AuthResult> {
    try {
      // In a real application, you would validate credentials against a database
      // For this demo, we'll create a basic validation
      if (!credentials.username || !credentials.password) {
        return AuthResult.failure('Username and password are required');
      }

      // Basic validation - in production, use proper authentication
      if (credentials.username.length < 1 || credentials.password.length < 1) {
        return AuthResult.failure('Invalid credentials');
      }

      // Create user session
      const sessionId = randomUUID();
      const user: User = {
        username: credentials.username,
        sessionId,
        createdAt: new Date(),
        lastActivity: new Date()
      };

      // Store active session
      this.activeSessions.set(sessionId, user);

      // Clean up old sessions (basic session management)
      this.cleanupExpiredSessions();

      return AuthResult.success(user);
    } catch (error) {
      return AuthResult.failure(`Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async validateSession(sessionId: string): Promise<boolean> {
    const user = this.activeSessions.get(sessionId);
    if (!user) {
      return false;
    }

    // Check if session is still valid (within 24 hours)
    const now = new Date();
    const sessionAge = now.getTime() - user.lastActivity.getTime();
    const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours

    if (sessionAge > maxSessionAge) {
      this.activeSessions.delete(sessionId);
      return false;
    }

    // Update last activity
    user.lastActivity = now;
    return true;
  }

  async invalidateSession(sessionId: string): Promise<void> {
    this.activeSessions.delete(sessionId);
  }

  getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }

  getUser(sessionId: string): User | null {
    return this.activeSessions.get(sessionId) || null;
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    const maxSessionAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [sessionId, user] of this.activeSessions) {
      const sessionAge = now.getTime() - user.lastActivity.getTime();
      if (sessionAge > maxSessionAge) {
        this.activeSessions.delete(sessionId);
      }
    }
  }

  // Periodic cleanup method
  startSessionCleanup(): NodeJS.Timeout {
    // Run cleanup every hour
    return setInterval(() => {
      this.cleanupExpiredSessions();
    }, 60 * 60 * 1000);
  }
}
