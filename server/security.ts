import crypto from 'node:crypto';

const DEFAULT_PEPPER = 'catrizzz-store-dev-pepper-change-in-production';

function getPepper(): string {
  return process.env.RECEIPT_TOKEN_PEPPER || DEFAULT_PEPPER;
}

export function generateReceiptToken(): string {
  // 256-bit (32 bytes) CSPRNG token
  const bytes = crypto.randomBytes(32);
  return `CTRZ-${bytes.toString('base64url')}`;
}

export function hashReceiptToken(rawToken: string): string {
  return crypto
    .createHmac('sha256', getPepper())
    .update(String(rawToken || '').trim())
    .digest('hex');
}

export function maskReceiptToken(rawToken: string): string {
  const clean = String(rawToken || '').trim();
  if (clean.length <= 12) return 'CTRZ-****';
  return `${clean.slice(0, 9)}...${clean.slice(-4)}`;
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function generateOrderNumber(sequenceNumber: number, now: Date = new Date()): string {
  const jakartaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .replace(/-/g, '');
  const seq = String(Math.max(1, sequenceNumber)).padStart(4, '0');
  return `CTR-${jakartaDate}-${seq}`;
}

export function sanitizeText(input: unknown, maxLength = 500): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, maxLength);
}

export function slugify(input: string): string {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function validateUploadedFileMagicBytes(
  buffer: Buffer,
  allowedTypes: Array<'jpg' | 'png' | 'pdf' | 'webp'>
): { ok: true; ext: 'jpg' | 'png' | 'pdf' | 'webp'; mime: string } | { ok: false; error: string } {
  if (!buffer || buffer.length < 4) {
    return { ok: false, error: 'File kosong atau rusak.' };
  }

  // JPEG: FF D8 FF
  if (
    allowedTypes.includes('jpg') &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { ok: true, ext: 'jpg', mime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    allowedTypes.includes('png') &&
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return { ok: true, ext: 'png', mime: 'image/png' };
  }

  // PDF: %PDF-
  if (
    allowedTypes.includes('pdf') &&
    buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  ) {
    return { ok: true, ext: 'pdf', mime: 'application/pdf' };
  }

  // WEBP: RIFF....WEBP
  if (
    allowedTypes.includes('webp') &&
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { ok: true, ext: 'webp', mime: 'image/webp' };
  }

  const labels = allowedTypes
    .map((t) => (t === 'jpg' ? 'JPG/JPEG' : t.toUpperCase()))
    .join(', ');
  return {
    ok: false,
    error: `Format file tidak didukung. Gunakan file ${labels} yang valid.`,
  };
}

export class SlidingWindowRateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  consume(key: string, nowMs: number = Date.now()): { allowed: boolean; retryAfterSec: number } {
    const cutoff = nowMs - this.windowMs;
    const prev = (this.hits.get(key) || []).filter((ts) => ts > cutoff);
    if (prev.length >= this.maxRequests) {
      const oldest = prev[0];
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - nowMs) / 1000));
      this.hits.set(key, prev);
      return { allowed: false, retryAfterSec };
    }
    prev.push(nowMs);
    this.hits.set(key, prev);
    return { allowed: true, retryAfterSec: 0 };
  }
}

function getSessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.RECEIPT_TOKEN_PEPPER ||
    'catrizzz-store-admin-session-secret-change-in-prod'
  );
}

export function hashPassword(password: string, existingSalt?: string): {
  salt: string;
  hash: string;
} {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  if (!password || !salt || !expectedHash) return false;
  try {
    const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return timingSafeEqualHex(derived, expectedHash);
  } catch {
    return false;
  }
}

export function generateResellerApplicationNumber(
  sequenceNumber: number,
  now: Date = new Date()
): string {
  const jakartaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .replace(/-/g, '');
  const seq = String(Math.max(1, sequenceNumber)).padStart(4, '0');
  return `RSL-${jakartaDate}-${seq}`;
}

export function generateTopupNumber(
  sequenceNumber: number,
  now: Date = new Date()
): string {
  const jakartaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .replace(/-/g, '');
  const seq = String(Math.max(1, sequenceNumber)).padStart(4, '0');
  return `TOP-${jakartaDate}-${seq}`;
}

export function generateWalletTxNumber(
  sequenceNumber: number,
  now: Date = new Date()
): string {
  const jakartaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .replace(/-/g, '');
  const seq = String(Math.max(1, sequenceNumber)).padStart(4, '0');
  return `WTX-${jakartaDate}-${seq}`;
}

export function generateResellerCode(username: string, existingCodes: Set<string>): string {
  const cleanUser =
    String(username || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6) || 'MEMBER';
  for (let i = 0; i < 20; i++) {
    const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const candidate = `CAT-${cleanUser}-${suffix}`;
    if (!existingCodes.has(candidate)) {
      return candidate;
    }
  }
  return `CAT-${cleanUser}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

export function sha256Buffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export function generateActivationToken(): string {
  const bytes = crypto.randomBytes(24);
  return `CTRZ-ACT-${bytes.toString('base64url')}`;
}

export function hashActivationToken(rawToken: string): string {
  return crypto
    .createHmac('sha256', getPepper())
    .update(`activate:${String(rawToken || '').trim()}`)
    .digest('hex');
}

export interface AdminSessionPayload {
  uid: string;
  username: string;
  role: string;
  typ?: 'admin';
  exp: number;
}

export interface UserSessionPayload {
  uid: string;
  username: string;
  typ: 'user';
  exp: number;
}

export function signAdminSessionToken(
  payload: Omit<AdminSessionPayload, 'exp' | 'typ'>,
  ttlMs = 24 * 60 * 60 * 1000
): string {
  const full: AdminSessionPayload = {
    ...payload,
    typ: 'admin',
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAdminSessionToken(token: string): AdminSessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const raw = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as Partial<Omit<AdminSessionPayload, 'typ'>> & { typ?: unknown };
    if (!raw || !raw.uid || !raw.username || !raw.role || typeof raw.exp !== 'number') {
      return null;
    }
    if (raw.typ !== undefined && raw.typ !== 'admin') return null;
    if (Date.now() > raw.exp) return null;
    return {
      uid: raw.uid,
      username: raw.username,
      role: raw.role,
      typ: 'admin',
      exp: raw.exp,
    };
  } catch {
    return null;
  }
}

export function signUserSessionToken(
  payload: Omit<UserSessionPayload, 'exp' | 'typ'>,
  ttlMs = 7 * 24 * 60 * 60 * 1000
): string {
  const full: UserSessionPayload = {
    ...payload,
    typ: 'user',
    exp: Date.now() + ttlMs,
  };
  const encoded = Buffer.from(JSON.stringify(full), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(`user:${encoded}`)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyUserSessionToken(token: string): UserSessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(`user:${encoded}`)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8')
    ) as UserSessionPayload;
    if (!parsed || parsed.typ !== 'user' || !parsed.uid || !parsed.username || typeof parsed.exp !== 'number') {
      return null;
    }
    if (Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(val);
    } catch {
      result[key] = val;
    }
  }
  return result;
}

