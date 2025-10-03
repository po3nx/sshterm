import { promises as fs } from 'fs';
import { dirname, isAbsolute, join, resolve } from 'path';
import crypto from 'crypto';

export interface AuthFailureLog {
  ts: string; // ISO timestamp
  ip: string;
  host: string;
  username: string;
  passwordRedacted: string; // never plaintext
  passwordHash?: string; // HMAC-SHA256 if secret configured
  reason: 'auth_failed' | 'ssh_connect_failed';
  userAgent?: string;
  socketId?: string;
}

export class AuditLogger {
  private enabled: boolean;
  private logPath: string;
  private hashSecret?: string;

  constructor() {
    this.enabled = process.env.AUDIT_LOG_ENABLED === '1' || process.env.AUDIT_LOG_ENABLED === 'true';
    const configuredPath = process.env.AUDIT_LOG_PATH || 'logs/security.log';
    this.logPath = isAbsolute(configuredPath) ? configuredPath : resolve(process.cwd(), configuredPath);
    this.hashSecret = process.env.AUDIT_LOG_HASH_SECRET;
  }

  private async ensureDirExists(filePath: string) {
    try {
      await fs.mkdir(dirname(filePath), { recursive: true });
    } catch {}
  }

  private redactPassword(pw?: string): string {
    if (!pw) return '<redacted:length=0>';
    const len = pw.length;
    return `<redacted:length=${len}>`;
  }

  private hashPassword(pw?: string): string | undefined {
    if (!pw || !this.hashSecret) return undefined;
    try {
      const h = crypto.createHmac('sha256', this.hashSecret).update(pw, 'utf8').digest('hex');
      return h;
    } catch {
      return undefined;
    }
  }

  async logAuthFailure(entry: Omit<AuthFailureLog, 'ts' | 'passwordRedacted' | 'passwordHash'> & { password?: string }) {
    if (!this.enabled) return;
    const record: AuthFailureLog = {
      ts: new Date().toISOString(),
      ip: entry.ip,
      host: entry.host,
      username: entry.username,
      passwordRedacted: this.redactPassword(entry.password),
      passwordHash: this.hashPassword(entry.password),
      reason: entry.reason,
      userAgent: entry.userAgent,
      socketId: entry.socketId,
    };

    const line = JSON.stringify(record) + '\n';
    await this.ensureDirExists(this.logPath);
    try {
      await fs.appendFile(this.logPath, line, { encoding: 'utf8' });
    } catch (err) {
      // Best-effort logging; swallow errors to avoid affecting app flow
    }
  }
}

export const auditLogger = new AuditLogger();