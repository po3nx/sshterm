import { Socket } from 'socket.io';

interface ThrottleRecord {
  failures: number;
  blockedUntil?: number; // epoch ms
}

export class LoginThrottleService {
  private records = new Map<string, ThrottleRecord>();
  private readonly maxFailures: number;
  private readonly lockoutMs: number;

  constructor(options?: { maxFailures?: number; lockoutMs?: number }) {
    this.maxFailures = options?.maxFailures ?? parseInt(process.env.MAX_LOGIN_FAILURES || '3', 10);
    this.lockoutMs = options?.lockoutMs ?? parseInt(process.env.LOGIN_LOCKOUT_MS || String(60 * 60 * 1000), 10); // 1 hour
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
    if (rec?.blockedUntil && rec.blockedUntil > now) {
      return { blocked: true, retryAfterMs: rec.blockedUntil - now };
    }
    return { blocked: false, retryAfterMs: 0 };
  }

  public registerFailure(ip: string, host: string): void {
    const k = this.key(ip, host);
    const rec = this.records.get(k) || { failures: 0 };
    const now = Date.now();

    // If still blocked, extend block (optional: keep as-is)
    if (rec.blockedUntil && rec.blockedUntil > now) {
      // keep the longer of the two
      rec.blockedUntil = Math.max(rec.blockedUntil, now + this.lockoutMs);
      this.records.set(k, rec);
      return;
    }

    rec.failures += 1;

    if (rec.failures >= this.maxFailures) {
      rec.blockedUntil = now + this.lockoutMs;
      rec.failures = 0; // reset failures after triggering lockout
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