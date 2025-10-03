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
    const headerIp = this.getIpFromHeaders(socket);
    if (headerIp) return headerIp;

    const fallback =
      (socket.handshake.address && socket.handshake.address.toString()) ||
      (socket.conn?.remoteAddress && socket.conn.remoteAddress.toString()) ||
      '';

    return this.normalizeIp(fallback);
  }

  private getIpFromHeaders(socket: Socket): string | undefined {
    const headerSources: Array<Record<string, string | string[] | undefined>> = [];
    if (socket.handshake?.headers) headerSources.push(socket.handshake.headers);
    if ((socket.request as unknown as { headers?: Record<string, string | string[] | undefined> })?.headers) {
      headerSources.push((socket.request as unknown as { headers: Record<string, string | string[] | undefined> }).headers);
    }

    const headerOrder = [
      'cf-connecting-ip',
      'true-client-ip',
      'x-real-ip',
      'x-forwarded-for',
      'x-client-ip',
      'fastly-client-ip',
    ];

    for (const headers of headerSources) {
      for (const name of headerOrder) {
        const ip = this.extractPublicIp(headers[name]);
        if (ip) return ip;
      }

      const forwarded = headers['forwarded'];
      if (forwarded) {
        const ip = this.extractForwardedIp(forwarded);
        if (ip) return ip;
      }
    }

    return undefined;
  }

  private extractPublicIp(value: string | string[] | undefined): string | undefined {
    const candidates = this.tokenizeIpCandidates(value);
    for (const candidate of candidates) {
      const cleaned = this.cleanIpToken(candidate);
      const normalized = cleaned ? this.normalizeIp(cleaned) : '';
      if (normalized && this.isPublicIp(normalized)) return normalized;
    }

    if (candidates.length > 0) {
      const fallback = this.normalizeIp(this.cleanIpToken(candidates[0]));
      if (fallback) return fallback;
    }

    return undefined;
  }

  private extractForwardedIp(value: string | string[]): string | undefined {
    const raw = Array.isArray(value) ? value.find(Boolean) : value;
    if (!raw) return undefined;

    const parts = raw.split(',');
    for (const part of parts) {
      const match = part.match(/for=([^;]+)/i);
      if (match && match[1]) {
        const cleaned = this.cleanIpToken(match[1]);
        const normalized = cleaned ? this.normalizeIp(cleaned) : '';
        if (normalized && this.isPublicIp(normalized)) return normalized;
      }
    }

    return undefined;
  }

  private tokenizeIpCandidates(value: string | string[] | undefined): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value
        .filter(Boolean)
        .flatMap(entry => entry.split(',').map(part => part.trim()))
        .filter(Boolean);
    }
    return value
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
  }

  private cleanIpToken(token: string): string {
    let ip = token.trim();
    if (!ip) return '';

    if (ip.startsWith('"') && ip.endsWith('"')) {
      ip = ip.substring(1, ip.length - 1);
    }

    if (ip.startsWith('[') && ip.endsWith(']')) {
      ip = ip.substring(1, ip.length - 1);
    }

    if (ip.toLowerCase().startsWith('for=')) {
      ip = ip.substring(4).trim();
    }

    ip = ip.split(';')[0].trim();

    const ipv6PortIndex = ip.indexOf(']:');
    if (ipv6PortIndex !== -1 && ip.includes(':') && ip.startsWith('[')) {
      ip = ip.substring(0, ipv6PortIndex + 1);
    }

    if (/^(\d{1,3}\.){3}\d{1,3}:\d+$/.test(ip)) {
      ip = ip.split(':')[0];
    }

    if (ip.startsWith('[') && ip.endsWith(']')) {
      ip = ip.substring(1, ip.length - 1);
    }

    return ip;
  }

  private normalizeIp(ip: string): string {
    let normalized = ip.trim();
    if (!normalized) return '';

    if (normalized.startsWith('::ffff:')) {
      normalized = normalized.substring(7);
    }

    if (/^(\d{1,3}\.){3}\d{1,3}:\d+$/.test(normalized)) {
      normalized = normalized.split(':')[0];
    }

    if (normalized.startsWith('[') && normalized.endsWith(']')) {
      normalized = normalized.substring(1, normalized.length - 1);
    }

    return normalized;
  }

  private isPublicIp(ip: string): boolean {
    const lower = ip.toLowerCase();
    if (!ip || lower === 'unknown' || lower === 'null') return false;

    if (ip.includes(':')) {
      return !(
        lower === '::1' ||
        lower.startsWith('fe80::') ||
        lower.startsWith('febf::') ||
        lower.startsWith('fc') ||
        lower.startsWith('fd')
      );
    }

    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(part => Number.isNaN(part))) return true;

    if (parts[0] === 10) return false;
    if (parts[0] === 127) return false;
    if (parts[0] === 169 && parts[1] === 254) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;

    return true;
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