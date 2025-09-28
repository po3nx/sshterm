import { Socket } from 'socket.io';

interface ThrottleRecord {
  timestamps: number[]; // failure times (epoch ms)
  blockedUntil?: number; // epoch ms
}

export class LoginThrottleService {
  private records = new Map<string, ThrottleRecord>();
  private readonly maxFailures: number;
  private readonly lockoutMs: number;
  private readonly windowMs: number;

  constructor(options?: { maxFailures?: number; lockoutMs?: number; windowMs?: number }) {
    this.maxFailures = options?.maxFailures ?? parseInt(process.env.MAX_LOGIN_FAILURES || '3', 10);
    this.lockoutMs = options?.lockoutMs ?? parseInt(process.env.LOGIN_LOCKOUT_MS || String(60 * 60 * 1000), 10); // 1 hour
    this.windowMs = options?.windowMs ?? parseInt(process.env.LOGIN_WINDOW_MS || String(10 * 60 * 1000), 10); // 10 minutes
  }

  public getClientIp(socket: Socket): string {
    const xff = (socket.handshake.headers['x-forwarded-for'] || '') as string;
    if (xff) {
      const first = xff.split(',')[0].trim();
      return this.normalizeIp(first);
    }
    const addr = (socket.handshake.address || '').toString();
    return this.normalizeIp(addr);
  }

  private normalizeIp(ip: string): string {
    // Strip IPv6 prefix if present (e.g., ::ffff:127.0.0.1)
    if (ip.startsWith('::ffff:')) return ip.substring(7);
    return ip;
  }

  private key(ip: string, host: string): string {
    return `${ip}::${host.toLowerCase()}`;
  }

  public isBlocked(ip: string, host: string): { blocked: boolean; retryAfterMs: number } {
    const k = this.key(ip, host);
    const rec = this.records.get(k);
    const now = Date.now();

    if (!rec) return { blocked: false, retryAfterMs: 0 };

    // Honor active lockout
    if (rec.blockedUntil && rec.blockedUntil > now) {
      return { blocked: true, retryAfterMs: rec.blockedUntil - now };
    }

    // Purge old timestamps outside the window
    rec.timestamps = rec.timestamps.filter(ts => now - ts <= this.windowMs);
    if (rec.timestamps.length >= this.maxFailures) {
      // If threshold is reached within the rolling window, enforce lockout
      rec.blockedUntil = now + this.lockoutMs;
      rec.timestamps = [];
      this.records.set(k, rec);
      return { blocked: true, retryAfterMs: this.lockoutMs };
    }

    // Update record with purged timestamps
    this.records.set(k, rec);
    return { blocked: false, retryAfterMs: 0 };
  }

  public registerFailure(ip: string, host: string): void {
    const k = this.key(ip, host);
    const now = Date.now();
    const rec = this.records.get(k) || { timestamps: [] };

    // If already blocked, extend block to discourage rapid retries during lockout
    if (rec.blockedUntil && rec.blockedUntil > now) {
      rec.blockedUntil = Math.max(rec.blockedUntil, now + this.lockoutMs);
      this.records.set(k, rec);
      return;
    }

    // Add failure and purge old entries outside the window
    rec.timestamps.push(now);
    rec.timestamps = rec.timestamps.filter(ts => now - ts <= this.windowMs);

    if (rec.timestamps.length >= this.maxFailures) {
      rec.blockedUntil = now + this.lockoutMs;
      rec.timestamps = []; // reset after applying penalty
    }

    this.records.set(k, rec);
  }

  public registerSuccess(ip: string, host: string): void {
    const k = this.key(ip, host);
    // On success, clear failures and block status
    this.records.delete(k);
  }

  public formatRetryAfter(ms: number): string {
    const seconds = Math.ceil(ms / 1000);
    const minutes = Math.ceil(seconds / 60);
    if (minutes >= 1) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }
}