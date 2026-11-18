import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Router, Request, Response, NextFunction } from 'express';
import type multer from 'multer';
import {
  buildSessionCookie,
  resolveUserFromRequest,
  toPublicUserProfile,
  USER_SESSION_COOKIE,
  verifyResellerRequest,
  type AuthenticatedRequest,
  type AuthenticatedUserRequest,
} from './auth';
import { db } from './db';
import {
  generateActivationToken,
  generateResellerApplicationNumber,
  generateResellerCode,
  hashActivationToken,
  hashPassword,
  sanitizeText,
  sha256Buffer,
  signUserSessionToken,
  SlidingWindowRateLimiter,
  validateUploadedFileMagicBytes,
  verifyPassword,
} from './security';
import { hasOfficialQrisFile, OFFICIAL_QRIS_PATH, type DatabaseState } from './seedData';
import {
  computeResellerLeaderboard,
  isValidWhatsappNumber,
  maskWhatsappNumber,
  normalizeWhatsappNumber,
  RESELLER_REGISTRATION_FEE,
} from '../src/shared/pricing';
import type {
  LeaderboardRange,
  QrisHistoryEntry,
  RealtimeMutationMeta,
  ResellerApplication,
  ResellerProfile,
  ResellerProfileStatus,
  ResellerStatusHistoryEntry,
  UserAccount,
} from '../src/shared/types';
import { ensureResellerWallet, getTopupConfig } from './walletRoutes';

const resellerAuthLimiter = new SlidingWindowRateLimiter(20, 5 * 60 * 1000);
const ACTIVATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface ResellerRouteDeps {
  upload: multer.Multer;
  getClientIp: (req: Request) => string;
  isQrisImageAvailable: (url: string) => boolean;
  formatJakartaTimestamp: (iso: string) => string;
  appendAuditLog: (
    draft: DatabaseState,
    admin: { uid: string; email: string },
    action: string,
    targetType: string,
    targetId: string,
    summary: string
  ) => void;
}

function safeUnlinkSupersededQrisFile(previousUrl?: string, nextUrl?: string): void {
  if (!previousUrl) return;
  const cleanPrev = previousUrl.split('?')[0].split('#')[0].trim();
  const cleanNext = (nextUrl || '').split('?')[0].split('#')[0].trim();
  if (!cleanPrev || cleanPrev === cleanNext || cleanPrev === OFFICIAL_QRIS_PATH) {
    return;
  }
  if (!cleanPrev.startsWith('/uploads/qris/')) {
    return;
  }
  try {
    const qrisDir = path.resolve(process.cwd(), 'uploads', 'qris');
    const resolvedTarget = path.resolve(process.cwd(), cleanPrev.slice(1));
    if (!resolvedTarget.startsWith(qrisDir + path.sep)) {
      return;
    }
    if (fs.existsSync(resolvedTarget)) {
      fs.unlinkSync(resolvedTarget);
    }
  } catch {
    // Non-fatal cleanup error after DB transaction already committed
  }
}

function wrapSingleUpload(upload: multer.Multer, fieldName: string) {
  const middleware = upload.single(fieldName);
  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (err: any) => {
      if (!err) {
        next();
        return;
      }
      if (err?.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Ukuran bukti pembayaran maksimal 5MB.' });
        return;
      }
      res.status(400).json({
        error: err?.message || 'Gagal memproses file upload. Pastikan format file valid.',
      });
    });
  };
}

export function mountUserAndResellerPublicRoutes(
  router: Router,
  deps: ResellerRouteDeps
): void {
  const { upload, getClientIp, isQrisImageAvailable, formatJakartaTimestamp } = deps;

  // ================= 2-ROLE AUTH: RESELLER LOGIN / SESSION / LOGOUT =================
  // NOTE: Customer login & registration intentionally do not exist. Public buyers shop without accounts.
  router.post('/reseller/login', async (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const rate = resellerAuthLimiter.consume(`reseller-login:${ip}`);
    if (!rate.allowed) {
      res.status(429).json({
        error: `Terlalu banyak percobaan login reseller. Silakan tunggu ${rate.retryAfterSec} detik.`,
      });
      return;
    }

    const identifier = sanitizeText(
      req.body?.identifier || req.body?.username || req.body?.email || '',
      160
    ).toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!identifier || !password) {
      res.status(400).json({ error: 'Username/email dan password reseller wajib diisi.' });
      return;
    }

    const snap = db.getSnapshot();
    const account = snap.users.find(
      (u) =>
        u.active &&
        u.role === 'reseller' &&
        (u.username.toLowerCase() === identifier || u.email.toLowerCase() === identifier)
    );

    if (!account) {
      const pendingOrRejectedApp = snap.reseller_applications.find(
        (a) =>
          (a.username.toLowerCase() === identifier || a.applicantEmail.toLowerCase() === identifier) &&
          (a.status === 'pending_approval' ||
            a.status === 'pending_verification' ||
            a.status === 'unpaid' ||
            a.status === 'rejected')
      );
      if (pendingOrRejectedApp) {
        res.status(403).json({
          error:
            pendingOrRejectedApp.status === 'rejected'
              ? `Pendaftaran reseller Anda ditolak oleh admin.${pendingOrRejectedApp.rejectionReason ? ` Alasan: ${pendingOrRejectedApp.rejectionReason}` : ''}`
              : 'Pendaftaran akun reseller Anda masih menunggu persetujuan admin. Akun baru dapat digunakan setelah disetujui.',
        });
        return;
      }
      res.status(401).json({ error: 'Username/email atau password reseller tidak valid.' });
      return;
    }

    if (account.passwordSet === false) {
      res.status(403).json({
        error:
          'Akun reseller Anda telah disetujui, namun password aktivasi belum diatur. Silakan buka tautan aktivasi dari admin terlebih dahulu.',
      });
      return;
    }

    if (!verifyPassword(password, account.passwordSalt, account.passwordHash)) {
      res.status(401).json({ error: 'Username/email atau password reseller tidak valid.' });
      return;
    }

    const profile = snap.reseller_profiles.find((p) => p.userId === account.id);
    if (!profile || profile.status !== 'active') {
      const linkedApp = profile
        ? snap.reseller_applications.find((a) => a.id === profile.applicationId)
        : undefined;
      const statusMsg =
        profile?.status === 'banned'
          ? 'Akun reseller Anda telah diblokir permanen oleh admin.'
          : profile?.status === 'rejected'
            ? `Pendaftaran akun reseller Anda ditolak oleh admin.${linkedApp?.rejectionReason ? ` Alasan: ${linkedApp.rejectionReason}` : ''}`
            : profile?.status === 'pending_approval'
              ? 'Pendaftaran akun reseller Anda masih menunggu persetujuan admin.'
              : 'Status akun reseller Anda sedang dinonaktifkan sementara oleh admin.';
      res.status(403).json({
        error: statusMsg,
      });
      return;
    }

    const token = signUserSessionToken({
      uid: account.id,
      username: account.username,
    });
    res.setHeader(
      'Set-Cookie',
      buildSessionCookie(req, USER_SESSION_COOKIE, token, 604800)
    );

    res.json({
      ok: true,
      user: toPublicUserProfile(account.id, snap),
    });
  });

  const handleResellerLogout = (req: Request, res: Response) => {
    res.setHeader(
      'Set-Cookie',
      buildSessionCookie(req, USER_SESSION_COOKIE, '', 0)
    );
    res.json({ ok: true });
  };
  router.post('/reseller/logout', handleResellerLogout);
  router.post('/auth/logout', handleResellerLogout);

  const handleResellerSession = async (req: Request, res: Response) => {
    const user = await resolveUserFromRequest(req);
    res.setHeader('Cache-Control', 'no-store');
    if (!user || user.role !== 'reseller' || user.resellerStatus !== 'active') {
      res.json({ authenticated: false, user: null });
      return;
    }
    res.json({ authenticated: true, user });
  };
  router.get('/reseller/session', handleResellerSession);
  router.get('/auth/session', handleResellerSession);

  // ================= PUBLIC JOIN RESELLER FLOW (WITHOUT CUSTOMER ACCOUNT) =================
  router.get('/reseller/public-config', (_req: Request, res: Response) => {
    const snap = db.getSnapshot();
    const qrisReady =
      snap.store_settings.qrisEnabled &&
      isQrisImageAvailable(snap.store_settings.qrisImageUrl);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      feeAmount: RESELLER_REGISTRATION_FEE,
      isFree: true,
      qris: {
        ready: qrisReady,
        imageUrl: qrisReady ? snap.store_settings.qrisImageUrl : '',
        merchantName: snap.store_settings.qrisMerchantName,
        nmid: snap.store_settings.qrisNmid,
        instructions: snap.store_settings.qrisInstructions,
      },
      storeWhatsapp: snap.store_settings.whatsappNumber,
      storeName: snap.store_settings.storeName,
    });
  });

  router.post('/reseller/join', async (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const rate = resellerAuthLimiter.consume(`reseller-join:${ip}`);
    if (!rate.allowed) {
      res.status(429).json({
        error: `Terlalu banyak percobaan pendaftaran. Silakan tunggu ${rate.retryAfterSec} detik.`,
      });
      return;
    }

    const body = req.body || {};
    const applicantName = sanitizeText(body.applicantName || body.name || '', 120);
    const username = sanitizeText(body.username || '', 40).replace(/\s+/g, '');
    const applicantEmail = sanitizeText(body.applicantEmail || body.email || '', 254).toLowerCase();
    const rawWa = sanitizeText(body.applicantWhatsapp || body.whatsapp || '', 30);
    const password = typeof body.password === 'string' ? body.password : '';
    const confirmPassword =
      typeof body.confirmPassword === 'string' ? body.confirmPassword : undefined;
    const notes = sanitizeText(body.notes || '', 400);

    if (!applicantName || applicantName.length < 2) {
      res.status(400).json({ error: 'Nama lengkap wajib diisi minimal 2 karakter.' });
      return;
    }
    if (!username || !/^[a-zA-Z0-9_]{3,28}$/.test(username)) {
      res.status(400).json({
        error: 'Username wajib 3-28 karakter huruf, angka, atau garis bawah (_).',
      });
      return;
    }
    if (!applicantEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(applicantEmail)) {
      res.status(400).json({ error: 'Alamat email tidak valid.' });
      return;
    }
    if (!isValidWhatsappNumber(rawWa)) {
      res.status(400).json({
        error: 'Nomor WhatsApp tidak valid. Gunakan nomor Indonesia, contoh: 081234567890.',
      });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password wajib diisi minimal 6 karakter.' });
      return;
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
      res.status(400).json({ error: 'Konfirmasi password tidak cocok.' });
      return;
    }

    const applicantWhatsapp = normalizeWhatsappNumber(rawWa);
    const usernameLower = username.toLowerCase();

    try {
      const rtMeta: RealtimeMutationMeta = {
        areas: ['reseller_apps', 'resellers', 'overview', 'logs'],
      };

      const result = await db.withTransaction((draft) => {
        // Reject duplicates against existing resellers
        const existingUser = draft.users.find(
          (u) =>
            u.username.toLowerCase() === usernameLower ||
            u.email.toLowerCase() === applicantEmail ||
            normalizeWhatsappNumber(u.whatsapp) === applicantWhatsapp
        );
        if (existingUser) {
          const existingProfile = draft.reseller_profiles.find((p) => p.userId === existingUser.id);
          const msg =
            existingProfile?.status === 'pending_approval'
              ? 'Pendaftaran dengan email, WhatsApp, atau username tersebut sedang menunggu persetujuan admin.'
              : existingProfile?.status === 'rejected'
                ? 'Akun dengan email, WhatsApp, atau username tersebut sebelumnya pernah ditolak oleh admin.'
                : 'Email, nomor WhatsApp, atau username tersebut sudah terdaftar sebagai reseller. Silakan login melalui halaman Login Reseller.';
          throw Object.assign(new Error(msg), { statusCode: 400 });
        }

        // Reject duplicates against existing pending or approved applications
        const blockingApp = draft.reseller_applications.find(
          (a) =>
            (a.status === 'pending_approval' ||
              a.status === 'pending_verification' ||
              a.status === 'approved' ||
              a.status === 'unpaid') &&
            (a.username.toLowerCase() === usernameLower ||
              a.applicantEmail.toLowerCase() === applicantEmail ||
              normalizeWhatsappNumber(a.applicantWhatsapp) === applicantWhatsapp)
        );
        if (blockingApp) {
          throw Object.assign(
            new Error(
              blockingApp.status === 'approved'
                ? `Pendaftaran (${blockingApp.applicationNumber}) sudah disetujui sebelumnya.`
                : `Pendaftaran (${blockingApp.applicationNumber}) dengan email, WhatsApp, atau username tersebut sedang menunggu persetujuan admin.`
            ),
            { statusCode: 400 }
          );
        }

        const now = new Date().toISOString();
        const { salt, hash } = hashPassword(password);
        const userId = `usr-${crypto.randomUUID().slice(0, 12)}`;
        const userAccount: UserAccount = {
          id: userId,
          username,
          name: applicantName,
          email: applicantEmail,
          whatsapp: applicantWhatsapp,
          passwordHash: hash,
          passwordSalt: salt,
          passwordSet: true,
          role: 'reseller',
          active: true,
          createdAt: now,
          updatedAt: now,
        };
        draft.users.push(userAccount);

        draft.reseller_app_sequence += 1;
        const appId = `rslapp-${crypto.randomUUID().slice(0, 12)}`;
        const initialHistory: ResellerStatusHistoryEntry = {
          id: `sh-${crypto.randomUUID().slice(0, 8)}`,
          previousStatus: null,
          newStatus: 'pending_approval',
          reason: 'Pendaftaran akun reseller baru (menunggu persetujuan admin)',
          changedByName: applicantName,
          createdAt: now,
        };

        const application: ResellerApplication = {
          id: appId,
          applicationNumber: generateResellerApplicationNumber(draft.reseller_app_sequence),
          userId,
          username,
          applicantName,
          applicantWhatsapp,
          applicantEmail,
          feeAmount: RESELLER_REGISTRATION_FEE,
          paidAmount: 0,
          status: 'pending_approval',
          paymentStatus: 'paid',
          notes: notes || undefined,
          statusHistory: [initialHistory],
          idempotencyKey: `rsl-${usernameLower}-${Date.now()}`,
          createdAt: now,
          updatedAt: now,
        };
        draft.reseller_applications.unshift(application);

        const existingCodes = new Set(
          draft.reseller_profiles.map((p) => p.referralCode.toUpperCase())
        );
        const referralCode = generateResellerCode(username, existingCodes);
        const profile: ResellerProfile = {
          id: `rsl-${crypto.randomUUID().slice(0, 10)}`,
          userId,
          username,
          name: applicantName,
          referralCode,
          status: 'pending_approval',
          applicationId: appId,
          statusHistory: [{ ...initialHistory }],
          joinedAt: now,
          updatedAt: now,
        };
        draft.reseller_profiles.unshift(profile);
        ensureResellerWallet(draft, profile, now);
        rtMeta.targetUserId = userId;
        rtMeta.targetResellerId = profile.id;
        rtMeta.summary = `Pendaftaran reseller baru @${username}`;

        return { application, profileStatus: profile.status, reused: false };
      }, rtMeta);

      res.status(result.reused ? 200 : 201).json({
        ok: true,
        application: result.application,
        profileStatus: result.profileStatus,
        message:
          'Pendaftaran akun reseller gratis berhasil dikirim dan sedang menunggu persetujuan admin.',
      });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({
        error: err?.message || 'Gagal mengajukan pendaftaran reseller.',
      });
    }
  });

  router.post(
    '/reseller/applications/:id/confirm',
    (_req: Request, res: Response) => {
      res.status(400).json({
        error:
          'Pendaftaran reseller Catrizzz Store GRATIS (Rp0) tanpa biaya pendaftaran atau aktivasi. Pengajuan Anda langsung menunggu persetujuan admin.',
      });
    }
  );

  /* Legacy proof upload handler disabled because registration is free (Rp0) */
  if (false) {
    wrapSingleUpload(upload, 'proof');
    sha256Buffer(Buffer.alloc(0));
    validateUploadedFileMagicBytes(Buffer.alloc(0), ['png']);
    formatJakartaTimestamp(new Date().toISOString());
  }

  router.get('/reseller/applications/status', (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const rate = resellerAuthLimiter.consume(`reseller-status:${ip}`);
    if (!rate.allowed) {
      res.status(429).json({
        error: `Terlalu banyak permintaan pengecekan status. Silakan tunggu ${rate.retryAfterSec} detik.`,
      });
      return;
    }

    const rawQuery = sanitizeText(String(req.query.query || ''), 160);
    if (!rawQuery) {
      res.status(400).json({
        error: 'Masukkan Nomor Pendaftaran (RSL-...), Email, atau Nomor WhatsApp Anda.',
      });
      return;
    }

    const snap = db.getSnapshot();
    const queryLower = rawQuery.toLowerCase();
    const queryWa = normalizeWhatsappNumber(rawQuery);

    const matched = snap.reseller_applications
      .filter(
        (a) =>
          a.applicationNumber.toLowerCase() === queryLower ||
          a.applicantEmail.toLowerCase() === queryLower ||
          (queryWa.length >= 9 && normalizeWhatsappNumber(a.applicantWhatsapp) === queryWa) ||
          a.id === rawQuery
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    if (matched.length === 0) {
      res.status(404).json({
        error: 'Data pengajuan reseller tidak ditemukan. Periksa kembali nomor pengajuan, email, atau WhatsApp Anda.',
      });
      return;
    }

    const app = matched[0];
    const userAccount = app.userId
      ? snap.users.find((u) => u.id === app.userId)
      : snap.users.find((u) => u.username.toLowerCase() === app.username.toLowerCase());
    const profile = userAccount
      ? snap.reseller_profiles.find((p) => p.userId === userAccount.id)
      : snap.reseller_profiles.find((p) => p.applicationId === app.id);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      application: {
        id: app.id,
        applicationNumber: app.applicationNumber,
        username: app.username,
        applicantName: app.applicantName,
        maskedWhatsapp: maskWhatsappNumber(app.applicantWhatsapp),
        feeAmount: app.feeAmount,
        status: app.status,
        profileStatus: profile?.status,
        paymentStatus: app.paymentStatus,
        paidAmount: app.paidAmount,
        paymentTime: app.paymentTime,
        rejectionReason: app.rejectionReason,
        statusHistory: app.statusHistory || profile?.statusHistory || [],
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        passwordSet: userAccount ? userAccount.passwordSet !== false : false,
      },
    });
  });

  // ================= RESELLER ONE-TIME ACTIVATION (SET PASSWORD) =================
  router.get('/reseller/activate/validate', (req: Request, res: Response) => {
    const rawToken = sanitizeText(String(req.query.token || ''), 200);
    if (!rawToken) {
      res.status(400).json({ valid: false, error: 'Token aktivasi tidak ditemukan.' });
      return;
    }

    const tokenHash = hashActivationToken(rawToken);
    const snap = db.getSnapshot();
    const user = snap.users.find(
      (u) =>
        u.active &&
        u.role === 'reseller' &&
        u.activationTokenHash &&
        u.activationTokenHash === tokenHash
    );

    if (!user) {
      res.status(404).json({
        valid: false,
        error: 'Link aktivasi tidak valid atau sudah pernah digunakan.',
      });
      return;
    }

    if (!user.activationExpiresAt || Date.parse(user.activationExpiresAt) <= Date.now()) {
      res.status(410).json({
        valid: false,
        error: 'Link aktivasi sudah kedaluwarsa. Hubungi admin untuk meminta link baru.',
      });
      return;
    }

    const profile = snap.reseller_profiles.find((p) => p.userId === user.id);
    if (!profile || profile.status !== 'active') {
      res.status(403).json({
        valid: false,
        error: 'Akun reseller belum aktif atau sedang ditangguhkan oleh admin.',
      });
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      valid: true,
      username: user.username,
      name: user.name,
      email: user.email,
      referralCode: profile.referralCode,
    });
  });

  router.post('/reseller/activate', async (req: Request, res: Response) => {
    const ip = getClientIp(req);
    const rate = resellerAuthLimiter.consume(`reseller-activate:${ip}`);
    if (!rate.allowed) {
      res.status(429).json({
        error: `Terlalu banyak percobaan aktivasi. Silakan tunggu ${rate.retryAfterSec} detik.`,
      });
      return;
    }

    const rawToken = sanitizeText(String(req.body?.token || ''), 200);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const confirmPassword =
      typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

    if (!rawToken) {
      res.status(400).json({ error: 'Token aktivasi wajib disertakan.' });
      return;
    }
    if (!password || password.length < 6) {
      res.status(400).json({ error: 'Password minimal 6 karakter.' });
      return;
    }
    if (password !== confirmPassword) {
      res.status(400).json({ error: 'Konfirmasi password tidak cocok.' });
      return;
    }

    const tokenHash = hashActivationToken(rawToken);

    try {
      const rtMeta: RealtimeMutationMeta = {
        areas: ['resellers', 'reseller_apps'],
      };

      const account = await db.withTransaction((draft) => {
        const user = draft.users.find(
          (u) =>
            u.active &&
            u.role === 'reseller' &&
            u.activationTokenHash &&
            u.activationTokenHash === tokenHash
        );
        if (!user) {
          throw Object.assign(
            new Error('Link aktivasi tidak valid atau sudah pernah digunakan.'),
            { statusCode: 404 }
          );
        }
        if (!user.activationExpiresAt || Date.parse(user.activationExpiresAt) <= Date.now()) {
          throw Object.assign(
            new Error('Link aktivasi sudah kedaluwarsa. Silakan minta admin membuat link baru.'),
            { statusCode: 410 }
          );
        }
        const profile = draft.reseller_profiles.find((p) => p.userId === user.id);
        if (!profile || profile.status !== 'active') {
          throw Object.assign(
            new Error('Akun reseller tidak aktif.'),
            { statusCode: 403 }
          );
        }

        const { salt, hash } = hashPassword(password);
        user.passwordSalt = salt;
        user.passwordHash = hash;
        user.passwordSet = true;
        user.activationTokenHash = undefined;
        user.activationExpiresAt = undefined;
        user.updatedAt = new Date().toISOString();
        rtMeta.targetUserId = user.id;
        rtMeta.targetResellerId = profile.id;

        return user;
      }, rtMeta);

      const sessionToken = signUserSessionToken({
        uid: account.id,
        username: account.username,
      });
      res.setHeader(
        'Set-Cookie',
        buildSessionCookie(req, USER_SESSION_COOKIE, sessionToken, 604800)
      );

      res.json({
        ok: true,
        message: 'Password berhasil dibuat dan akun reseller Anda sudah aktif.',
        user: toPublicUserProfile(account.id),
      });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({
        error: err?.message || 'Gagal mengaktifkan akun reseller.',
      });
    }
  });

  // ================= RESELLER READ-ONLY MONITORING DASHBOARD =================
  router.get(
    '/reseller/dashboard',
    verifyResellerRequest,
    (req: AuthenticatedUserRequest, res: Response) => {
      const snap = db.getSnapshot();
      const user = req.user!;
      const profile = snap.reseller_profiles.find((p) => p.userId === user.id);

      if (!profile) {
        res.status(404).json({ error: 'Profil reseller tidak ditemukan.' });
        return;
      }

      const search = String(req.query.search || '').trim().toLowerCase();
      const paymentFilter = String(req.query.paymentStatus || 'all');

      const itemsByOrder = new Map<string, typeof snap.order_items>();
      for (const item of snap.order_items) {
        const list = itemsByOrder.get(item.orderId) || [];
        list.push(item);
        itemsByOrder.set(item.orderId, list);
      }

      const ownOrders = snap.orders.filter((o) => o.buyerUserId === user.id);
      const successfulOwn = ownOrders.filter(
        (o) => o.paymentStatus === 'paid' && o.orderStatus !== 'cancelled'
      );
      const pendingOwn = ownOrders.filter(
        (o) =>
          o.orderStatus !== 'cancelled' &&
          (o.paymentStatus === 'unpaid' || o.paymentStatus === 'pending_verification')
      );

      let totalProductsPurchased = 0;
      for (const ord of successfulOwn) {
        for (const it of itemsByOrder.get(ord.id) || []) {
          totalProductsPurchased += it.quantity;
        }
      }

      let filteredHistory = ownOrders;
      if (paymentFilter !== 'all') {
        filteredHistory = filteredHistory.filter((o) => o.paymentStatus === paymentFilter);
      }
      if (search) {
        filteredHistory = filteredHistory.filter((o) => {
          const ordItems = itemsByOrder.get(o.id) || [];
          return (
            o.orderNumber.toLowerCase().includes(search) ||
            ordItems.some((it) => it.productNameSnapshot.toLowerCase().includes(search))
          );
        });
      }

      const purchaseHistory = filteredHistory.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        createdAt: o.createdAt,
        subtotalNormal: o.subtotal,
        resellerDiscountTotal: o.resellerDiscountTotal || 0,
        totalAmount: o.totalAmount,
        pricingTier: o.pricingTier || 'normal',
        paymentMethod: o.paymentMethod || 'QRIS',
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
        receiptTokenMasked: o.receiptTokenMasked,
        items: (itemsByOrder.get(o.id) || []).map((it) => ({
          id: it.id,
          productId: it.productId,
          productName: it.productNameSnapshot,
          variantName: it.variantNameSnapshot,
          originalUnitPrice: it.originalUnitPriceSnapshot,
          resellerUnitPrice: it.unitPriceSnapshot,
          quantity: it.quantity,
          lineSubtotal: it.lineSubtotal,
        })),
      }));

      // Attributed referral sales (strictly paid & non-cancelled for official totals)
      const attributedOrders = snap.orders.filter(
        (o) => o.attributedResellerId === profile.id
      );
      const attributedSuccessful = attributedOrders.filter(
        (o) => o.paymentStatus === 'paid' && o.orderStatus !== 'cancelled'
      );
      let attributedTotalSales = 0;
      let attributedProductQty = 0;
      const topProductMap = new Map<string, { name: string; qty: number }>();

      for (const ord of attributedSuccessful) {
        attributedTotalSales += ord.totalAmount;
        for (const it of itemsByOrder.get(ord.id) || []) {
          attributedProductQty += it.quantity;
          const prev = topProductMap.get(it.productId) || {
            name: it.productNameSnapshot,
            qty: 0,
          };
          prev.qty += it.quantity;
          topProductMap.set(it.productId, prev);
        }
      }

      let topProduct = { name: '-', qty: 0 };
      for (const entry of topProductMap.values()) {
        if (entry.qty > topProduct.qty) topProduct = entry;
      }

      const attributedTransactions = attributedOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerInitial:
          o.customerName.length > 2
            ? `${o.customerName.slice(0, 2)}***`
            : o.customerName,
        maskedWhatsapp: maskWhatsappNumber(o.customerWhatsapp),
        totalAmount: o.totalAmount,
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
        createdAt: o.createdAt,
        itemsCount: (itemsByOrder.get(o.id) || []).reduce((s, it) => s + it.quantity, 0),
      }));

      const wallet = snap.reseller_wallets.find(
        (w) => w.resellerId === profile.id || w.userId === user.id
      ) || {
        id: '',
        resellerId: profile.id,
        userId: user.id,
        balance: 0,
        totalTopup: 0,
        totalFeesPaid: 0,
        totalSpent: 0,
        totalTransactions: 0,
        createdAt: profile.joinedAt,
        updatedAt: profile.updatedAt,
      };
      const topupConfig = getTopupConfig(snap);
      const recentTransactions = snap.wallet_transactions
        .filter((tx) => tx.userId === user.id)
        .slice(0, 8);
      const recentTopups = snap.reseller_topups
        .filter((t) => t.userId === user.id)
        .slice(0, 5);

      res.json({
        readOnly: false,
        profile: {
          id: profile.id,
          name: profile.name,
          username: profile.username,
          email: user.email,
          whatsapp: user.whatsapp,
          referralCode: profile.referralCode,
          referralPath: `/produk?ref=${encodeURIComponent(profile.referralCode)}`,
          status: profile.status,
          statusHistory: profile.statusHistory || [],
          joinedAt: profile.joinedAt,
          discountPercent: 20,
        },
        wallet,
        topupConfig,
        recentTransactions,
        recentTopups,
        overview: {
          totalOrders: ownOrders.length,
          successfulOrders: successfulOwn.length,
          totalSpent: successfulOwn.reduce((acc, o) => acc + o.totalAmount, 0),
          totalProductsPurchased,
          pendingOrders: pendingOwn.length,
          totalResellerSavings: successfulOwn.reduce(
            (acc, o) => acc + (o.resellerDiscountTotal || 0),
            0
          ),
        },
        purchaseHistory,
        attributedStats: {
          successfulCount: attributedSuccessful.length,
          pendingOrOtherCount: attributedOrders.length - attributedSuccessful.length,
          totalValue: attributedTotalSales,
          totalProductQty: attributedProductQty,
          topProduct,
          transactions: attributedTransactions,
        },
      });
    }
  );
}

export function mountAdminResellerAndPaymentRoutes(
  router: Router,
  deps: ResellerRouteDeps
): void {
  const { isQrisImageAvailable, appendAuditLog } = deps;

  // ================= ADMIN RESELLER MANAGEMENT & LEADERBOARD =================
  router.get('/admin/resellers', (req: AuthenticatedRequest, res: Response) => {
    const snap = db.getSnapshot();
    const rawRange = String(req.query.range || 'all');
    const validRanges: LeaderboardRange[] = ['today', '7d', '30d', 'month', 'all'];
    const range: LeaderboardRange = validRanges.includes(rawRange as LeaderboardRange)
      ? (rawRange as LeaderboardRange)
      : 'all';
    const search = String(req.query.search || '').trim().toLowerCase();

    const leaderboardAll = computeResellerLeaderboard({
      resellers: snap.reseller_profiles,
      orders: snap.orders,
      orderItems: snap.order_items,
      range,
    });

    const filteredLeaderboard = search
      ? leaderboardAll.filter(
          (row) =>
            row.name.toLowerCase().includes(search) ||
            row.username.toLowerCase().includes(search) ||
            row.referralCode.toLowerCase().includes(search)
        )
      : leaderboardAll;

    const resellersWithStats = snap.reseller_profiles.map((rp) => {
      const user = snap.users.find((u) => u.id === rp.userId);
      const lb = leaderboardAll.find((row) => row.resellerId === rp.id);
      const wallet = snap.reseller_wallets.find(
        (w) => w.resellerId === rp.id || w.userId === rp.userId
      );
      const ownPaidOrders = snap.orders.filter(
        (o) =>
          o.buyerUserId === rp.userId &&
          o.paymentStatus === 'paid' &&
          o.orderStatus !== 'cancelled'
      );
      return {
        ...rp,
        email: user?.email || '',
        whatsapp: user?.whatsapp || '',
        passwordSet: user ? user.passwordSet !== false : false,
        walletBalance: wallet?.balance || 0,
        walletTotalTopup: wallet?.totalTopup || 0,
        walletTotalFeesPaid: wallet?.totalFeesPaid || 0,
        walletTotalSpent: wallet?.totalSpent || 0,
        walletTotalTransactions: wallet?.totalTransactions || 0,
        rank: lb?.rank || 0,
        attributedOrderCount: lb?.attributedOrderCount || 0,
        totalAttributedSales: lb?.totalAttributedSales || 0,
        attributedProductQty: lb?.attributedProductQty || 0,
        topProductName: lb?.topProductName || '-',
        ownOrderCount: ownPaidOrders.length,
        ownTotalSpent: ownPaidOrders.reduce((s, o) => s + o.totalAmount, 0),
      };
    });

    const filteredResellers = search
      ? resellersWithStats.filter(
          (r) =>
            r.name.toLowerCase().includes(search) ||
            r.username.toLowerCase().includes(search) ||
            r.referralCode.toLowerCase().includes(search) ||
            r.whatsapp.includes(search) ||
            r.id.toLowerCase().includes(search)
        )
      : resellersWithStats;

    const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const newResellers = snap.reseller_profiles.filter(
      (r) => r.status === 'active' && Date.parse(r.joinedAt) >= thirtyDaysAgoMs
    ).length;

    const allResellerUserIds = new Set(snap.reseller_profiles.map((r) => r.userId));
    const totalResellerOrders = snap.orders.filter(
      (o) =>
        o.buyerUserId &&
        allResellerUserIds.has(o.buyerUserId) &&
        o.paymentStatus === 'paid' &&
        o.orderStatus !== 'cancelled'
    ).length;

    const approvedTopups = snap.reseller_topups.filter((t) => t.status === 'approved');
    const pendingAppsCount = snap.reseller_applications.filter(
      (a) =>
        a.status === 'pending_approval' ||
        a.status === 'pending_verification' ||
        a.status === 'unpaid'
    ).length;

    res.json({
      range,
      applications: snap.reseller_applications,
      resellers: filteredResellers,
      leaderboard: filteredLeaderboard,
      summary: {
        totalResellers: snap.reseller_profiles.length,
        activeResellers: snap.reseller_profiles.filter((r) => r.status === 'active').length,
        pendingApprovalResellers: snap.reseller_profiles.filter(
          (r) => r.status === 'pending_approval'
        ).length,
        rejectedResellers: snap.reseller_profiles.filter((r) => r.status === 'rejected').length,
        newResellers,
        suspendedResellers: snap.reseller_profiles.filter((r) => r.status === 'suspended').length,
        bannedResellers: snap.reseller_profiles.filter((r) => r.status === 'banned').length,
        pendingApplications: pendingAppsCount,
        totalWalletBalance: snap.reseller_wallets.reduce((s, w) => s + w.balance, 0),
        totalTopupAmount: snap.reseller_wallets.reduce((s, w) => s + w.totalTopup, 0),
        totalFeeRevenue: approvedTopups.reduce((s, t) => s + (t.feeAmount || 0), 0),
        totalWalletSpent: snap.reseller_wallets.reduce((s, w) => s + w.totalSpent, 0),
        totalResellerOrders,
      },
    });
  });

  router.get('/admin/resellers/:id', (req: AuthenticatedRequest, res: Response) => {
    const snap = db.getSnapshot();
    const profile = snap.reseller_profiles.find((r) => r.id === req.params.id);
    if (!profile) {
      res.status(404).json({ error: 'Reseller tidak ditemukan.' });
      return;
    }

    const user = snap.users.find((u) => u.id === profile.userId);
    const application = snap.reseller_applications.find((a) => a.id === profile.applicationId);
    const wallet = snap.reseller_wallets.find(
      (w) => w.resellerId === profile.id || w.userId === profile.userId
    ) || {
      id: '',
      resellerId: profile.id,
      userId: profile.userId,
      balance: 0,
      totalTopup: 0,
      totalFeesPaid: 0,
      totalSpent: 0,
      totalTransactions: 0,
      createdAt: profile.joinedAt,
      updatedAt: profile.updatedAt,
    };
    const walletTransactions = snap.wallet_transactions.filter(
      (tx) => tx.resellerId === profile.id || tx.userId === profile.userId
    );
    const topups = snap.reseller_topups.filter(
      (t) => t.resellerId === profile.id || t.userId === profile.userId
    );

    const attributedOrders = snap.orders
      .filter((o) => o.attributedResellerId === profile.id)
      .map((o) => ({
        ...o,
        items: snap.order_items.filter((it) => it.orderId === o.id),
      }));

    const ownOrders = snap.orders
      .filter((o) => o.buyerUserId === profile.userId)
      .map((o) => ({
        ...o,
        items: snap.order_items.filter((it) => it.orderId === o.id),
      }));

    const paidAttributed = attributedOrders.filter(
      (o) => o.paymentStatus === 'paid' && o.orderStatus !== 'cancelled'
    );

    res.json({
      reseller: {
        ...profile,
        email: user?.email || '',
        whatsapp: user?.whatsapp || '',
        passwordSet: user ? user.passwordSet !== false : false,
      },
      application: application || null,
      wallet,
      walletTransactions,
      topups,
      metrics: {
        attributedPaidCount: paidAttributed.length,
        attributedPaidSales: paidAttributed.reduce((s, o) => s + o.totalAmount, 0),
        attributedProductQty: paidAttributed.reduce(
          (s, o) => s + o.items.reduce((q, it) => q + it.quantity, 0),
          0
        ),
        ownPaidCount: ownOrders.filter(
          (o) => o.paymentStatus === 'paid' && o.orderStatus !== 'cancelled'
        ).length,
      },
      attributedOrders,
      ownOrders,
    });
  });

  router.post(
    '/admin/resellers/applications/:id/verify',
    async (req: AuthenticatedRequest, res: Response) => {
      const { decision, rejectionReason } = req.body || {};
      if (decision !== 'approve' && decision !== 'reject') {
        res.status(400).json({ error: 'Keputusan verifikasi harus approve atau reject.' });
        return;
      }
      const cleanReason = sanitizeText(rejectionReason || '', 500);
      if (decision === 'reject' && !cleanReason) {
        res.status(400).json({ error: 'Alasan penolakan pendaftaran reseller wajib diisi.' });
        return;
      }

      try {
        const rtMeta: RealtimeMutationMeta = {
          areas: ['reseller_apps', 'resellers', 'overview', 'logs'],
        };

        const result = await db.withTransaction((draft) => {
          const application = draft.reseller_applications.find(
            (a) => a.id === req.params.id
          );
          if (!application) {
            throw Object.assign(new Error('Pengajuan reseller tidak ditemukan.'), {
              statusCode: 404,
            });
          }

          const now = new Date().toISOString();

          if (decision === 'approve') {
            if (application.status === 'approved') {
              throw Object.assign(new Error('Pendaftaran reseller ini sudah disetujui sebelumnya.'), {
                statusCode: 409,
              });
            }

            let user = application.userId
              ? draft.users.find((u) => u.id === application.userId)
              : draft.users.find(
                  (u) =>
                    u.username.toLowerCase() === application.username.toLowerCase() ||
                    u.email.toLowerCase() === application.applicantEmail.toLowerCase()
                );

            const activationToken = generateActivationToken();
            const activationTokenHash = hashActivationToken(activationToken);
            const activationExpiresAt = new Date(Date.now() + ACTIVATION_TTL_MS).toISOString();

            if (!user) {
              const tempSecret = crypto.randomBytes(32).toString('hex');
              const { salt, hash } = hashPassword(tempSecret);
              const created: UserAccount = {
                id: `usr-${crypto.randomUUID().slice(0, 12)}`,
                username: application.username,
                name: application.applicantName,
                email: application.applicantEmail,
                whatsapp: application.applicantWhatsapp,
                passwordHash: hash,
                passwordSalt: salt,
                passwordSet: false,
                activationTokenHash,
                activationExpiresAt,
                role: 'reseller',
                active: true,
                createdAt: now,
                updatedAt: now,
              };
              draft.users.push(created);
              user = created;
            } else {
              user.role = 'reseller';
              user.active = true;
              if (user.passwordSet !== true) {
                user.passwordSet = false;
                user.activationTokenHash = activationTokenHash;
                user.activationExpiresAt = activationExpiresAt;
              }
              user.updatedAt = now;
            }

            const prevAppStatus = application.status;
            const historyEntry: ResellerStatusHistoryEntry = {
              id: `sh-${crypto.randomUUID().slice(0, 8)}`,
              previousStatus: prevAppStatus,
              newStatus: 'active',
              reason: 'Pendaftaran akun reseller disetujui oleh admin',
              changedByAdminId: req.admin!.uid,
              changedByName: req.admin!.email,
              createdAt: now,
            };

            application.userId = user.id;
            application.status = 'approved';
            application.paymentStatus = 'paid';
            application.verifiedByAdminId = req.admin!.uid;
            application.verifiedByAdminEmail = req.admin!.email;
            application.verifiedAt = now;
            application.rejectionReason = undefined;
            application.statusHistory = [...(application.statusHistory || []), historyEntry];
            application.updatedAt = now;

            let profile = draft.reseller_profiles.find((p) => p.userId === user!.id);
            if (!profile) {
              const existingCodes = new Set(
                draft.reseller_profiles.map((p) => p.referralCode.toUpperCase())
              );
              const referralCode = generateResellerCode(user.username, existingCodes);
              profile = {
                id: `rsl-${crypto.randomUUID().slice(0, 10)}`,
                userId: user.id,
                username: user.username,
                name: user.name,
                referralCode,
                status: 'active',
                applicationId: application.id,
                statusHistory: [{ ...historyEntry, previousStatus: prevAppStatus }],
                joinedAt: now,
                updatedAt: now,
              };
              draft.reseller_profiles.unshift(profile);
            } else {
              const prevProfileStatus = profile.status;
              profile.status = 'active';
              profile.statusHistory = [
                ...(profile.statusHistory || []),
                { ...historyEntry, previousStatus: prevProfileStatus },
              ];
              profile.updatedAt = now;
            }

            ensureResellerWallet(draft, profile, now);
            rtMeta.targetUserId = user.id;
            rtMeta.targetResellerId = profile.id;
            rtMeta.summary = `Pendaftaran reseller @${user.username} disetujui`;

            appendAuditLog(
              draft,
              req.admin!,
              'APPROVE_RESELLER_APPLICATION',
              'reseller_application',
              application.id,
              `Menyetujui pendaftaran reseller ${user.username} (${application.applicationNumber}) · Status: Active · Kode: ${profile.referralCode}`
            );

            return {
              application,
              profile,
              passwordAlreadySet: user.passwordSet === true,
              activationToken: user.passwordSet === false ? activationToken : undefined,
              activationPath:
                user.passwordSet === false
                  ? `/reseller/activate?token=${encodeURIComponent(activationToken)}`
                  : undefined,
            };
          } else {
            if (application.status === 'rejected') {
              throw Object.assign(new Error('Pendaftaran reseller ini sudah ditolak sebelumnya.'), {
                statusCode: 409,
              });
            }
            const prevAppStatus = application.status;
            const historyEntry: ResellerStatusHistoryEntry = {
              id: `sh-${crypto.randomUUID().slice(0, 8)}`,
              previousStatus: prevAppStatus,
              newStatus: 'rejected',
              reason: cleanReason,
              changedByAdminId: req.admin!.uid,
              changedByName: req.admin!.email,
              createdAt: now,
            };

            application.status = 'rejected';
            application.paymentStatus = 'rejected';
            application.verifiedByAdminId = req.admin!.uid;
            application.verifiedByAdminEmail = req.admin!.email;
            application.verifiedAt = now;
            application.rejectionReason = cleanReason;
            application.statusHistory = [...(application.statusHistory || []), historyEntry];
            application.updatedAt = now;

            const profile = application.userId
              ? draft.reseller_profiles.find(
                  (p) => p.userId === application.userId || p.applicationId === application.id
                )
              : draft.reseller_profiles.find((p) => p.applicationId === application.id);
            if (profile) {
              const prevProfStatus = profile.status;
              profile.status = 'rejected';
              profile.statusHistory = [
                ...(profile.statusHistory || []),
                { ...historyEntry, previousStatus: prevProfStatus },
              ];
              profile.updatedAt = now;
            }

            rtMeta.targetUserId = application.userId;
            rtMeta.targetResellerId = profile?.id;
            rtMeta.summary = `Pendaftaran reseller @${application.username} ditolak`;

            appendAuditLog(
              draft,
              req.admin!,
              'REJECT_RESELLER_APPLICATION',
              'reseller_application',
              application.id,
              `Menolak pendaftaran reseller ${application.username} (${application.applicationNumber}): ${cleanReason}`
            );

            return { application, profile: profile || null };
          }
        }, rtMeta);

        res.json({ ok: true, ...result });
      } catch (err: any) {
        res.status(err?.statusCode || 500).json({
          error: err?.message || 'Gagal memverifikasi pendaftaran reseller.',
        });
      }
    }
  );

  router.post(
    '/admin/resellers/:id/reissue-activation',
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const result = await db.withTransaction(
          (draft) => {
            const profile = draft.reseller_profiles.find((r) => r.id === req.params.id);
            if (!profile) {
              throw Object.assign(new Error('Profil reseller tidak ditemukan.'), {
                statusCode: 404,
              });
            }
            if (profile.status !== 'active') {
              throw Object.assign(
                new Error('Aktifkan kembali reseller sebelum membuat tautan aktivasi.'),
                { statusCode: 400 }
              );
            }
            const user = draft.users.find((u) => u.id === profile.userId);
            if (!user) {
              throw Object.assign(new Error('Akun reseller tidak ditemukan.'), {
                statusCode: 404,
              });
            }

            const rawToken = generateActivationToken();
            user.activationTokenHash = hashActivationToken(rawToken);
            user.activationExpiresAt = new Date(Date.now() + ACTIVATION_TTL_MS).toISOString();
            user.updatedAt = new Date().toISOString();

            appendAuditLog(
              draft,
              req.admin!,
              'REISSUE_RESELLER_ACTIVATION',
              'reseller',
              profile.id,
              `Membuat tautan aktivasi/reset password baru untuk reseller @${profile.username}`
            );

            return {
              activationToken: rawToken,
              activationPath: `/reseller/activate?token=${encodeURIComponent(rawToken)}`,
              username: profile.username,
              name: profile.name,
              whatsapp: user.whatsapp,
            };
          },
          { areas: ['resellers', 'logs'], summary: 'Link aktivasi reseller dibuat ulang' }
        );

        res.json({ ok: true, ...result });
      } catch (err: any) {
        res.status(err?.statusCode || 500).json({
          error: err?.message || 'Gagal membuat tautan aktivasi reseller.',
        });
      }
    }
  );

  router.patch('/admin/resellers/:id/status', async (req: AuthenticatedRequest, res: Response) => {
    const allowedStatuses: ResellerProfileStatus[] = [
      'active',
      'suspended',
      'banned',
      'rejected',
      'pending_approval',
    ];
    const nextStatus = allowedStatuses.includes(req.body?.status)
      ? (req.body.status as ResellerProfileStatus)
      : null;
    if (!nextStatus) {
      res.status(400).json({ error: 'Status reseller tidak valid.' });
      return;
    }
    const reason = sanitizeText(req.body?.reason || '', 400);

    try {
      const rtMeta: RealtimeMutationMeta = {
        areas: ['resellers', 'reseller_apps', 'overview', 'logs'],
      };

      const updated = await db.withTransaction((draft) => {
        const profile = draft.reseller_profiles.find((r) => r.id === req.params.id);
        if (!profile) {
          throw Object.assign(new Error('Profil reseller tidak ditemukan.'), { statusCode: 404 });
        }
        const now = new Date().toISOString();
        const prev = profile.status;
        profile.status = nextStatus;
        profile.updatedAt = now;

        const historyEntry: ResellerStatusHistoryEntry = {
          id: `sh-${crypto.randomUUID().slice(0, 8)}`,
          previousStatus: prev,
          newStatus: nextStatus,
          reason:
            reason ||
            (nextStatus === 'active'
              ? 'Akun reseller diaktifkan oleh admin'
              : nextStatus === 'suspended'
                ? 'Akun reseller dinonaktifkan sementara oleh admin'
                : nextStatus === 'banned'
                  ? 'Akun reseller diblokir permanen oleh admin'
                  : `Status akun diubah ke ${nextStatus}`),
          changedByAdminId: req.admin!.uid,
          changedByName: req.admin!.email,
          createdAt: now,
        };
        profile.statusHistory = [...(profile.statusHistory || []), historyEntry];

        const app = draft.reseller_applications.find((a) => a.id === profile.applicationId);
        if (app) {
          if (nextStatus === 'active' && (app.status === 'pending_approval' || app.status === 'rejected')) {
            app.status = 'approved';
            app.rejectionReason = undefined;
            app.verifiedAt = now;
            app.verifiedByAdminId = req.admin!.uid;
            app.verifiedByAdminEmail = req.admin!.email;
          } else if (nextStatus === 'rejected') {
            app.status = 'rejected';
            app.rejectionReason = reason || app.rejectionReason || 'Ditolak oleh admin';
          }
          app.statusHistory = [...(app.statusHistory || []), { ...historyEntry }];
          app.updatedAt = now;
        }

        rtMeta.targetUserId = profile.userId;
        rtMeta.targetResellerId = profile.id;
        rtMeta.summary = `Status reseller @${profile.username} diubah menjadi ${nextStatus}`;

        appendAuditLog(
          draft,
          req.admin!,
          'UPDATE_RESELLER_STATUS',
          'reseller',
          profile.id,
          `Status reseller "${profile.username}" (${profile.referralCode}) diubah dari ${prev} ke ${nextStatus}${reason ? ` · Alasan: ${reason}` : ''}`
        );
        return profile;
      }, rtMeta);
      res.json({ ok: true, reseller: updated });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({
        error: err?.message || 'Gagal memperbarui status reseller.',
      });
    }
  });

  // ================= ADMIN MANAJEMEN PEMBAYARAN & QRIS =================
  router.get('/admin/payment-settings', (_req, res: Response) => {
    const snap = db.getSnapshot();
    const qrisReady =
      snap.store_settings.qrisEnabled &&
      isQrisImageAvailable(snap.store_settings.qrisImageUrl);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      storeSettings: snap.store_settings,
      qrisReady,
      officialQrisAvailable: hasOfficialQrisFile(),
      shippingSettings: snap.shipping_settings,
      qrisHistory: snap.qris_history,
    });
  });

  router.patch(
    '/admin/payment-settings/qris',
    async (req: AuthenticatedRequest, res: Response) => {
      const nextEnabled =
        typeof req.body?.enabled === 'boolean'
          ? req.body.enabled
          : typeof req.body?.qrisEnabled === 'boolean'
            ? req.body.qrisEnabled
            : undefined;
      if (typeof nextEnabled !== 'boolean') {
        res.status(400).json({ error: 'Field enabled atau qrisEnabled (boolean) wajib disertakan.' });
        return;
      }

      try {
        const result = await db.withTransaction(
          (draft) => {
            const s = draft.store_settings;
            const now = new Date().toISOString();

            if (nextEnabled && !isQrisImageAvailable(s.qrisImageUrl)) {
              if (hasOfficialQrisFile()) {
                s.qrisImageUrl = OFFICIAL_QRIS_PATH;
                s.qrisMerchantName = s.qrisMerchantName || 'Catrizz_Store';
                s.qrisNmid = s.qrisNmid || 'ID1024365593051';
              } else {
                throw Object.assign(
                  new Error('Gambar QRIS resmi tidak ditemukan di server sehingga QRIS belum dapat diaktifkan.'),
                  { statusCode: 400 }
                );
              }
            }

            const prevEnabled = s.qrisEnabled;
            s.qrisEnabled = nextEnabled;
            s.qrisUpdatedByAdminId = req.admin!.uid;
            s.qrisUpdatedByAdminEmail = req.admin!.email;
            s.updatedAt = now;

            if (prevEnabled !== nextEnabled) {
              draft.qris_history.unshift({
                id: `qris-hist-${crypto.randomUUID().slice(0, 8)}`,
                action: nextEnabled ? 'enabled' : 'disabled',
                previousImageUrl: s.qrisImageUrl || undefined,
                newImageUrl: s.qrisImageUrl || undefined,
                merchantName: s.qrisMerchantName,
                nmid: s.qrisNmid,
                changedBy: req.admin!.email,
                note: nextEnabled
                  ? 'QRIS PAYMENT SWITCH diaktifkan (ACTIVE) oleh admin.'
                  : 'QRIS PAYMENT SWITCH dinonaktifkan (INACTIVE) oleh admin.',
                createdAt: now,
              });
              if (draft.qris_history.length > 100) {
                draft.qris_history = draft.qris_history.slice(0, 100);
              }
            }

            appendAuditLog(
              draft,
              req.admin!,
              'TOGGLE_QRIS_SWITCH',
              'payment_settings',
              'default',
              `Switch QRIS Payment diubah menjadi ${nextEnabled ? 'ACTIVE (ON)' : 'INACTIVE (OFF)'}`
            );

            return {
              qrisEnabled: s.qrisEnabled,
              storeSettings: s,
              qrisHistory: draft.qris_history,
              qrisReady: s.qrisEnabled && isQrisImageAvailable(s.qrisImageUrl),
            };
          },
          {
            areas: ['storefront', 'payment_settings', 'overview', 'logs'],
            summary: `Switch QRIS diubah ke ${nextEnabled ? 'ACTIVE' : 'INACTIVE'}`,
          }
        );

        res.json({ ok: true, ...result });
      } catch (err: any) {
        res.status(err?.statusCode || 500).json({
          error: err?.message || 'Gagal mengubah status switch pembayaran QRIS.',
        });
      }
    }
  );

  router.put('/admin/payment-settings', async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};

    if (body.qrisImageUrl !== undefined) {
      const candidateUrl = sanitizeText(body.qrisImageUrl, 500);
      if (candidateUrl && !isQrisImageAvailable(candidateUrl)) {
        res.status(400).json({
          error: 'File gambar QRIS belum tersedia atau gagal diunggah ke server. Silakan upload ulang.',
        });
        return;
      }
    }

    try {
      let supersededImageUrl: string | undefined;

      const result = await db.withTransaction(
        (draft) => {
          const s = draft.store_settings;
          const now = new Date().toISOString();

          const prevImage = s.qrisImageUrl;
          const prevEnabled = s.qrisEnabled;
          const prevMerchant = s.qrisMerchantName;
          const prevNmid = s.qrisNmid;

          if (body.whatsappNumber !== undefined) {
            const norm = normalizeWhatsappNumber(body.whatsappNumber);
            if (norm) s.whatsappNumber = norm;
          }
          if (body.taxPercent !== undefined) {
            s.taxPercent = Math.max(0, Math.min(50, Number(body.taxPercent)));
          }
          if (body.qrisEnabled !== undefined) s.qrisEnabled = Boolean(body.qrisEnabled);
          if (body.qrisImageUrl !== undefined) {
            s.qrisImageUrl = sanitizeText(body.qrisImageUrl, 500);
          }
          if (body.qrisMerchantName !== undefined) {
            s.qrisMerchantName = sanitizeText(body.qrisMerchantName, 120);
          }
          if (body.qrisNmid !== undefined) {
            s.qrisNmid = sanitizeText(body.qrisNmid, 60);
          }
          if (Array.isArray(body.qrisInstructions)) {
            s.qrisInstructions = body.qrisInstructions
              .map((i: unknown) => sanitizeText(i, 300))
              .filter(Boolean);
          }
          if (body.allowResellerStackPromo !== undefined) {
            s.allowResellerStackPromo = Boolean(body.allowResellerStackPromo);
          }

          const imageChanged = s.qrisImageUrl !== prevImage;
          if (imageChanged) {
            s.qrisVersion = (s.qrisVersion || 1) + 1;
            supersededImageUrl = prevImage;
          }
          s.qrisUpdatedByAdminId = req.admin!.uid;
          s.qrisUpdatedByAdminEmail = req.admin!.email;
          s.updatedAt = now;

          const qrisChanged =
            imageChanged ||
            s.qrisEnabled !== prevEnabled ||
            s.qrisMerchantName !== prevMerchant ||
            s.qrisNmid !== prevNmid;

          if (qrisChanged) {
            let action: QrisHistoryEntry['action'] = 'updated';
            if (imageChanged && s.qrisImageUrl) {
              action = prevImage ? 'updated' : 'uploaded';
            } else if (!s.qrisEnabled && prevEnabled) {
              action = 'disabled';
            } else if (s.qrisEnabled && !prevEnabled) {
              action = 'enabled';
            }

            const entry: QrisHistoryEntry = {
              id: `qris-hist-${crypto.randomUUID().slice(0, 8)}`,
              action,
              previousImageUrl: prevImage || undefined,
              newImageUrl: s.qrisImageUrl || undefined,
              merchantName: s.qrisMerchantName,
              nmid: s.qrisNmid,
              changedBy: req.admin!.email,
              note: sanitizeText(body.changeNote || '', 240) || 'Pembaruan konfigurasi QRIS pembayaran.',
              createdAt: now,
            };
            draft.qris_history.unshift(entry);
            if (draft.qris_history.length > 100) {
              draft.qris_history = draft.qris_history.slice(0, 100);
            }
          }

          appendAuditLog(
            draft,
            req.admin!,
            'UPDATE_PAYMENT_SETTINGS',
            'payment_settings',
            'default',
            `Memperbarui pengaturan pembayaran QRIS (${s.qrisMerchantName}, status: ${s.qrisEnabled ? 'Aktif' : 'Nonaktif'})`
          );

          return {
            storeSettings: s,
            qrisHistory: draft.qris_history,
            qrisReady: s.qrisEnabled && isQrisImageAvailable(s.qrisImageUrl),
          };
        },
        {
          areas: ['storefront', 'payment_settings', 'overview', 'logs'],
          summary: 'Pengaturan pembayaran & QRIS diperbarui',
        }
      );

      // Only delete superseded uploaded QRIS file AFTER DB persistence has committed safely
      if (supersededImageUrl) {
        safeUnlinkSupersededQrisFile(supersededImageUrl, result.storeSettings.qrisImageUrl);
      }

      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({
        error: err?.message || 'Gagal menyimpan pengaturan pembayaran QRIS.',
      });
    }
  });

  router.post('/admin/qris/disable', async (req: AuthenticatedRequest, res: Response) => {
    const result = await db.withTransaction(
      (draft) => {
        const s = draft.store_settings;
        const now = new Date().toISOString();
        s.qrisEnabled = false;
        s.qrisUpdatedByAdminId = req.admin!.uid;
        s.qrisUpdatedByAdminEmail = req.admin!.email;
        s.updatedAt = now;
        draft.qris_history.unshift({
          id: `qris-hist-${crypto.randomUUID().slice(0, 8)}`,
          action: 'disabled',
          previousImageUrl: s.qrisImageUrl || undefined,
          newImageUrl: s.qrisImageUrl || undefined,
          merchantName: s.qrisMerchantName,
          nmid: s.qrisNmid,
          changedBy: req.admin!.email,
          note: 'Pembayaran QRIS dinonaktifkan oleh admin.',
          createdAt: now,
        });
        appendAuditLog(
          draft,
          req.admin!,
          'DISABLE_QRIS',
          'payment_settings',
          'default',
          'Menonaktifkan metode pembayaran QRIS'
        );
        return { storeSettings: s, qrisHistory: draft.qris_history, qrisReady: false };
      },
      {
        areas: ['storefront', 'payment_settings', 'overview', 'logs'],
        summary: 'Pembayaran QRIS dinonaktifkan',
      }
    );
    res.json({ ok: true, ...result });
  });

  router.post('/admin/qris/remove', async (req: AuthenticatedRequest, res: Response) => {
    let prevImage: string | undefined;
    const result = await db.withTransaction(
      (draft) => {
        const s = draft.store_settings;
        const now = new Date().toISOString();
        prevImage = s.qrisImageUrl;
        s.qrisEnabled = false;
        s.qrisImageUrl = '';
        s.qrisVersion = (s.qrisVersion || 1) + 1;
        s.qrisUpdatedByAdminId = req.admin!.uid;
        s.qrisUpdatedByAdminEmail = req.admin!.email;
        s.updatedAt = now;
        draft.qris_history.unshift({
          id: `qris-hist-${crypto.randomUUID().slice(0, 8)}`,
          action: 'removed',
          previousImageUrl: prevImage || undefined,
          merchantName: s.qrisMerchantName,
          nmid: s.qrisNmid,
          changedBy: req.admin!.email,
          note: 'Gambar QRIS dihapus dari metode pembayaran aktif.',
          createdAt: now,
        });
        appendAuditLog(
          draft,
          req.admin!,
          'REMOVE_QRIS',
          'payment_settings',
          'default',
          'Menghapus gambar QRIS aktif'
        );
        return { storeSettings: s, qrisHistory: draft.qris_history, qrisReady: false };
      },
      {
        areas: ['storefront', 'payment_settings', 'overview', 'logs'],
        summary: 'Gambar QRIS aktif dihapus',
      }
    );
    safeUnlinkSupersededQrisFile(prevImage, '');
    res.json({ ok: true, ...result });
  });

  router.post('/admin/qris/restore-official', async (req: AuthenticatedRequest, res: Response) => {
    if (!hasOfficialQrisFile()) {
      res.status(404).json({ error: 'File QRIS resmi toko tidak ditemukan di server.' });
      return;
    }
    let prevImage: string | undefined;
    const result = await db.withTransaction(
      (draft) => {
        const s = draft.store_settings;
        const now = new Date().toISOString();
        prevImage = s.qrisImageUrl;
        s.qrisImageUrl = OFFICIAL_QRIS_PATH;
        s.qrisMerchantName = 'Catrizz_Store';
        s.qrisNmid = 'ID1024365593051';
        s.qrisEnabled = true;
        s.qrisVersion = (s.qrisVersion || 1) + 1;
        s.qrisUpdatedByAdminId = req.admin!.uid;
        s.qrisUpdatedByAdminEmail = req.admin!.email;
        s.updatedAt = now;
        draft.qris_history.unshift({
          id: `qris-hist-${crypto.randomUUID().slice(0, 8)}`,
          action: 'restored',
          previousImageUrl: prevImage || undefined,
          newImageUrl: OFFICIAL_QRIS_PATH,
          merchantName: s.qrisMerchantName,
          nmid: s.qrisNmid,
          changedBy: req.admin!.email,
          note: 'Memulihkan QRIS resmi Catrizz_Store (NMID ID1024365593051).',
          createdAt: now,
        });
        appendAuditLog(
          draft,
          req.admin!,
          'RESTORE_OFFICIAL_QRIS',
          'payment_settings',
          'default',
          'Memulihkan QRIS resmi Catrizz_Store'
        );
        return { storeSettings: s, qrisHistory: draft.qris_history, qrisReady: true };
      },
      {
        areas: ['storefront', 'payment_settings', 'overview', 'logs'],
        summary: 'QRIS resmi Catrizz_Store dipulihkan',
      }
    );
    safeUnlinkSupersededQrisFile(prevImage, OFFICIAL_QRIS_PATH);
    res.json({ ok: true, ...result });
  });
}
