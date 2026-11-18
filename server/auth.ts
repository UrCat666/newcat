import fs from 'node:fs';
import path from 'node:path';
import type { Request, Response, NextFunction } from 'express';
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { db } from './db';
import {
  parseCookieHeader,
  verifyAdminSessionToken,
  verifyUserSessionToken,
} from './security';
import type { PublicUserProfile } from '../src/shared/types';

export const ADMIN_SESSION_COOKIE = 'catrizzz_admin_session';
export const USER_SESSION_COOKIE = 'catrizzz_user_session';

const VALID_ADMIN_ROLES = new Set(['super_admin', 'admin', 'verifier']);

const firebaseConfigPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = fs.existsSync(firebaseConfigPath)
  ? JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'))
  : { projectId: 'deep-bonsai-407pf' };

if (getApps().length === 0) {
  const saEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (saEnv && saEnv.trim().startsWith('{')) {
    initializeApp({
      credential: cert(JSON.parse(saEnv)),
      projectId: firebaseConfig.projectId,
    });
  } else {
    initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }
}

export interface AuthenticatedAdmin {
  uid: string;
  username?: string;
  email: string;
  role: string;
  authMethod: 'session' | 'firebase';
}

export interface AuthenticatedRequest extends Request {
  admin?: AuthenticatedAdmin;
}

export interface AuthenticatedUserRequest extends Request {
  user?: PublicUserProfile;
}

export type AdminAuthFailureReason =
  | 'unauthenticated'
  | 'invalid_token'
  | 'unverified_email'
  | 'disabled'
  | 'not_admin'
  | 'server_error';

export function buildSessionCookie(
  req: Request,
  name: string,
  value: string,
  maxAgeSeconds: number
): string {
  const fwdProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const origin = String(req.headers.origin || '').toLowerCase();
  const isHttps = Boolean(req.secure || fwdProto === 'https' || origin.startsWith('https://'));
  const sameSiteAttr = isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax';
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; ${sameSiteAttr}; Max-Age=${maxAgeSeconds}`;
}

function getBootstrappedAdminEmails(): Set<string> {
  const emails = new Set<string>(['risqicatur82@gmail.com']);
  const extra = process.env.BOOTSTRAP_ADMIN_EMAILS || '';
  for (const raw of extra.split(',')) {
    const clean = raw.trim().toLowerCase();
    if (clean) emails.add(clean);
  }
  return emails;
}

async function lookupFirestoreAdminRole(
  uid: string
): Promise<{ exists: boolean; active?: boolean; role?: string; email?: string } | null> {
  const hasServerCredentials = Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.K_SERVICE
  );
  if (!hasServerCredentials || !firebaseConfig.firestoreDatabaseId) {
    return null;
  }
  try {
    const fsDb = getFirestore(getApps()[0], firebaseConfig.firestoreDatabaseId);
    const snap = await Promise.race([
      fsDb.collection('admin_roles').doc(uid).get(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 1200)),
    ]);
    if (!snap.exists) return { exists: false };
    const data = snap.data() as { active?: boolean; role?: string; email?: string } | undefined;
    return {
      exists: true,
      active: data?.active,
      role: data?.role,
      email: data?.email,
    };
  } catch {
    return null;
  }
}

export async function verifyFirebaseAdminToken(
  idToken: string
): Promise<
  | { ok: true; admin: AuthenticatedAdmin }
  | { ok: false; code: AdminAuthFailureReason; error: string }
> {
  if (!idToken) {
    return { ok: false, code: 'invalid_token', error: 'Token autentikasi kosong.' };
  }

  let decoded;
  try {
    decoded = await getAuth().verifyIdToken(idToken);
  } catch {
    return { ok: false, code: 'invalid_token', error: 'Sesi login tidak valid atau telah kedaluwarsa.' };
  }

  if (!decoded.email || decoded.email_verified !== true) {
    return { ok: false, code: 'unverified_email', error: 'Akun belum terverifikasi email.' };
  }

  const emailLower = decoded.email.toLowerCase();
  const snapshot = db.getSnapshot();

  // Check local admin_roles mapping (uid first, then email)
  const localRole =
    snapshot.admin_roles.find((r) => r.uid === decoded.uid) ||
    snapshot.admin_roles.find((r) => r.email && r.email.toLowerCase() === emailLower);

  if (localRole) {
    if (!localRole.active) {
      return { ok: false, code: 'disabled', error: 'Akun dinonaktifkan.' };
    }
    if (VALID_ADMIN_ROLES.has(localRole.role)) {
      return {
        ok: true,
        admin: {
          uid: decoded.uid,
          email: decoded.email,
          role: localRole.role,
          authMethod: 'firebase',
        },
      };
    }
  }

  // Check Firestore admin_roles/{uid} when Admin SDK credentials exist
  const firestoreRole = await lookupFirestoreAdminRole(decoded.uid);
  if (firestoreRole?.exists) {
    if (firestoreRole.active !== true) {
      return { ok: false, code: 'disabled', error: 'Akun dinonaktifkan.' };
    }
    if (firestoreRole.role && VALID_ADMIN_ROLES.has(firestoreRole.role)) {
      return {
        ok: true,
        admin: {
          uid: decoded.uid,
          email: decoded.email,
          role: firestoreRole.role,
          authMethod: 'firebase',
        },
      };
    }
  }

  // Check verified Firebase custom claims
  const claimRole = typeof decoded.role === 'string' ? decoded.role : '';
  if (VALID_ADMIN_ROLES.has(claimRole)) {
    return {
      ok: true,
      admin: {
        uid: decoded.uid,
        email: decoded.email,
        role: claimRole,
        authMethod: 'firebase',
      },
    };
  }
  if (decoded.admin === true) {
    return {
      ok: true,
      admin: {
        uid: decoded.uid,
        email: decoded.email,
        role: 'admin',
        authMethod: 'firebase',
      },
    };
  }

  // Bootstrapped owner emails (if not disabled in admin_roles above)
  if (getBootstrappedAdminEmails().has(emailLower)) {
    return {
      ok: true,
      admin: {
        uid: decoded.uid,
        email: decoded.email,
        role: 'super_admin',
        authMethod: 'firebase',
      },
    };
  }

  return {
    ok: false,
    code: 'not_admin',
    error: 'Akun belum memiliki akses admin.',
  };
}

async function resolveCookieAdmin(
  req: Request
): Promise<{ admin: AuthenticatedAdmin | null; reason?: AdminAuthFailureReason }> {
  const cookies = parseCookieHeader(req.headers.cookie);
  const sessionToken = cookies[ADMIN_SESSION_COOKIE];
  if (!sessionToken) return { admin: null };

  const payload = verifyAdminSessionToken(sessionToken);
  if (!payload) return { admin: null, reason: 'invalid_token' };

  const snapshot = db.getSnapshot();
  const account = snapshot.admin_accounts.find((a) => a.id === payload.uid);
  if (!account) return { admin: null, reason: 'not_admin' };
  if (!account.active) return { admin: null, reason: 'disabled' };

  return {
    admin: {
      uid: account.id,
      username: account.username,
      email: `${account.username} (Admin)`,
      role: account.role,
      authMethod: 'session',
    },
  };
}

export async function resolveAdminWithReason(req: Request): Promise<{
  admin: AuthenticatedAdmin | null;
  reason: AdminAuthFailureReason | null;
}> {
  try {
    const cookieRes = await resolveCookieAdmin(req);
    if (cookieRes.admin) {
      return { admin: cookieRes.admin, reason: null };
    }

    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.slice('Bearer '.length).trim();
      if (!idToken) {
        return { admin: null, reason: 'invalid_token' };
      }
      const fbRes = await verifyFirebaseAdminToken(idToken);
      if (fbRes.ok) {
        return { admin: fbRes.admin, reason: null };
      }
      return { admin: null, reason: fbRes.code };
    }

    return { admin: null, reason: cookieRes.reason || 'unauthenticated' };
  } catch {
    return { admin: null, reason: 'server_error' };
  }
}

export async function resolveAdminFromRequest(req: Request): Promise<AuthenticatedAdmin | null> {
  const result = await resolveAdminWithReason(req);
  return result.admin;
}

export async function verifyAdminRequest(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Check signed HttpOnly admin session cookie first
    const cookieRes = await resolveCookieAdmin(req);
    if (cookieRes.admin) {
      req.admin = cookieRes.admin;
      next();
      return;
    }

    // 2. Fallback to Firebase ID token Authorization Bearer header
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      if (cookieRes.reason === 'disabled') {
        res.status(403).json({ error: 'Akun dinonaktifkan.' });
        return;
      }
      res.status(401).json({ error: 'Autentikasi admin diperlukan.' });
      return;
    }

    const idToken = authHeader.slice('Bearer '.length).trim();
    const fbRes = await verifyFirebaseAdminToken(idToken);
    if (!fbRes.ok) {
      const status =
        fbRes.code === 'disabled' || fbRes.code === 'not_admin' || fbRes.code === 'unverified_email'
          ? 403
          : 401;
      res.status(status).json({ error: fbRes.error, code: fbRes.code });
      return;
    }

    req.admin = fbRes.admin;
    next();
  } catch (err) {
    console.error('Admin auth verification failed:', err instanceof Error ? err.message : err);
    res.status(401).json({ error: 'Sesi login tidak valid atau telah kedaluwarsa.' });
  }
}

export function toPublicUserProfile(
  userId: string,
  snap = db.getSnapshot()
): PublicUserProfile | null {
  const account = snap.users.find(
    (u) => u.id === userId && u.active && u.role === 'reseller'
  );
  if (!account) return null;

  const profile = snap.reseller_profiles.find((p) => p.userId === account.id);
  if (!profile) return null;

  return {
    id: account.id,
    resellerId: profile.id,
    username: account.username,
    name: account.name,
    email: account.email,
    whatsapp: account.whatsapp,
    role: 'reseller',
    resellerStatus: profile.status,
    referralCode: profile.referralCode,
    joinedAt: profile.joinedAt,
    passwordSet: account.passwordSet !== false,
  };
}

export async function resolveUserFromRequest(req: Request): Promise<PublicUserProfile | null> {
  try {
    const cookies = parseCookieHeader(req.headers.cookie);
    const token = cookies[USER_SESSION_COOKIE];
    if (!token) return null;
    const payload = verifyUserSessionToken(token);
    if (!payload) return null;
    return toPublicUserProfile(payload.uid);
  } catch {
    return null;
  }
}

export async function verifyResellerRequest(
  req: AuthenticatedUserRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = await resolveUserFromRequest(req);
  if (!user) {
    res.status(401).json({
      error: 'Silakan login dengan akun reseller resmi untuk mengakses dashboard reseller.',
    });
    return;
  }
  if (user.role !== 'reseller') {
    res.status(403).json({
      error: 'Akses ditolak. Akun Anda bukan reseller resmi.',
    });
    return;
  }
  if (user.resellerStatus !== 'active') {
    const statusMsg =
      user.resellerStatus === 'banned'
        ? 'Akun reseller Anda telah diblokir permanen oleh admin.'
        : user.resellerStatus === 'rejected'
          ? 'Pendaftaran akun reseller Anda ditolak oleh admin.'
          : user.resellerStatus === 'pending_approval'
            ? 'Pendaftaran akun reseller Anda masih menunggu persetujuan admin.'
            : 'Status reseller Anda sedang dinonaktifkan sementara oleh admin.';
    res.status(403).json({
      error: statusMsg,
    });
    return;
  }
  req.user = user;
  next();
}

