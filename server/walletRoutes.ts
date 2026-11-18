import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Router, Request, Response, NextFunction } from 'express';
import type multer from 'multer';
import {
  verifyResellerRequest,
  type AuthenticatedRequest,
  type AuthenticatedUserRequest,
} from './auth';
import { db } from './db';
import {
  generateTopupNumber,
  generateWalletTxNumber,
  sanitizeText,
  sha256Buffer,
  SlidingWindowRateLimiter,
  validateUploadedFileMagicBytes,
} from './security';
import type { DatabaseState } from './seedData';
import type { ResellerRouteDeps } from './resellerRoutes';
import {
  buildTopupWhatsAppMessage,
  buildWhatsAppConfirmationUrl,
  calculateTopupFee,
  computeTopupFeeStats,
  DEFAULT_TOPUP_MAX,
  DEFAULT_TOPUP_MIN,
  formatIDR,
  isValidWhatsappNumber,
  normalizeWhatsappNumber,
  TOPUP_FEE_PERCENTAGE,
  TOPUP_PRESET_AMOUNTS,
  type TopupRevenueRange,
} from '../src/shared/pricing';
import type {
  RealtimeMutationMeta,
  ResellerProfile,
  ResellerTopup,
  ResellerWallet,
  WalletTransaction,
  WalletTransactionType,
} from '../src/shared/types';

const topupActionLimiter = new SlidingWindowRateLimiter(15, 60 * 1000);

function wrapSingleUpload(upload: multer.Multer, fieldName: string) {
  const middleware = upload.single(fieldName);
  return (req: Request, res: Response, next: NextFunction) => {
    middleware(req, res, (err: any) => {
      if (!err) {
        next();
        return;
      }
      if (err?.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Ukuran file bukti maksimal 5MB.' });
        return;
      }
      res.status(400).json({
        error: err?.message || 'Gagal membaca file upload. Pastikan format file valid.',
      });
    });
  };
}

export function ensureResellerWallet(
  draft: DatabaseState,
  profile: ResellerProfile,
  now = new Date().toISOString()
): ResellerWallet {
  let wallet = draft.reseller_wallets.find(
    (w) => w.resellerId === profile.id || w.userId === profile.userId
  );
  if (!wallet) {
    wallet = {
      id: `wal-${crypto.randomUUID().slice(0, 10)}`,
      resellerId: profile.id,
      userId: profile.userId,
      balance: 0,
      totalTopup: 0,
      totalFeesPaid: 0,
      totalSpent: 0,
      totalTransactions: 0,
      createdAt: profile.joinedAt || now,
      updatedAt: now,
    };
    draft.reseller_wallets.push(wallet);
  }
  return wallet;
}

export function recordWalletTransaction(
  draft: DatabaseState,
  params: {
    resellerId: string;
    userId: string;
    type: WalletTransactionType;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    referenceType: WalletTransaction['referenceType'];
    referenceId: string;
    description: string;
    reason?: string;
    actorId?: string;
    actorName?: string;
    now?: string;
  }
): WalletTransaction {
  const now = params.now || new Date().toISOString();
  draft.wallet_tx_sequence = (draft.wallet_tx_sequence || 0) + 1;
  const tx: WalletTransaction = {
    id: `wtx-${crypto.randomUUID().slice(0, 12)}`,
    txNumber: generateWalletTxNumber(draft.wallet_tx_sequence),
    resellerId: params.resellerId,
    userId: params.userId,
    type: params.type,
    amount: Math.round(params.amount),
    balanceBefore: Math.round(params.balanceBefore),
    balanceAfter: Math.round(params.balanceAfter),
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    description: sanitizeText(params.description, 300),
    reason: params.reason ? sanitizeText(params.reason, 400) : undefined,
    actorId: params.actorId,
    actorName: params.actorName,
    createdAt: now,
  };
  draft.wallet_transactions.unshift(tx);
  return tx;
}

export function getTopupConfig(snap: DatabaseState) {
  return {
    minAmount:
      typeof snap.store_settings.topupMinAmount === 'number' &&
      snap.store_settings.topupMinAmount >= 1000
        ? Math.round(snap.store_settings.topupMinAmount)
        : DEFAULT_TOPUP_MIN,
    maxAmount:
      typeof snap.store_settings.topupMaxAmount === 'number' &&
      snap.store_settings.topupMaxAmount >= DEFAULT_TOPUP_MIN
        ? Math.round(snap.store_settings.topupMaxAmount)
        : DEFAULT_TOPUP_MAX,
    feePercentage:
      typeof snap.store_settings.topupFeePercentage === 'number'
        ? snap.store_settings.topupFeePercentage
        : TOPUP_FEE_PERCENTAGE,
    presetAmounts: TOPUP_PRESET_AMOUNTS,
  };
}

export function mountResellerWalletPublicRoutes(
  router: Router,
  deps: ResellerRouteDeps
): void {
  const { upload, getClientIp, isQrisImageAvailable, formatJakartaTimestamp } = deps;

  // ================= GET CURRENT RESELLER WALLET SUMMARY =================
  router.get(
    '/reseller/wallet',
    verifyResellerRequest,
    (req: AuthenticatedUserRequest, res: Response) => {
      const snap = db.getSnapshot();
      const user = req.user!;
      const profile = snap.reseller_profiles.find((p) => p.userId === user.id);
      if (!profile) {
        res.status(404).json({ error: 'Profil reseller tidak ditemukan.' });
        return;
      }

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

      const transactions = snap.wallet_transactions
        .filter((tx) => tx.userId === user.id)
        .slice(0, 10);

      const topups = snap.reseller_topups
        .filter((t) => t.userId === user.id)
        .slice(0, 10);

      const topupConfig = getTopupConfig(snap);
      const qrisReady =
        snap.store_settings.qrisEnabled &&
        isQrisImageAvailable(snap.store_settings.qrisImageUrl);

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        wallet,
        topupConfig,
        qris: {
          ready: qrisReady,
          imageUrl: qrisReady ? snap.store_settings.qrisImageUrl : '',
          merchantName: snap.store_settings.qrisMerchantName,
          nmid: snap.store_settings.qrisNmid,
          instructions: snap.store_settings.qrisInstructions,
        },
        storeWhatsapp: snap.store_settings.whatsappNumber,
        recentTransactions: transactions,
        recentTopups: topups,
      });
    }
  );

  // ================= RESELLER WALLET MUTATION HISTORY =================
  router.get(
    '/reseller/wallet/transactions',
    verifyResellerRequest,
    (req: AuthenticatedUserRequest, res: Response) => {
      const snap = db.getSnapshot();
      const user = req.user!;
      const typeFilter = String(req.query.type || 'all').trim();
      const search = String(req.query.search || '').trim().toLowerCase();
      const startDate = String(req.query.startDate || '').trim();
      const endDate = String(req.query.endDate || '').trim();
      const page = Math.max(1, Math.floor(Number(req.query.page || 1)));
      const limit = Math.min(50, Math.max(1, Math.floor(Number(req.query.limit || 15))));

      let list = snap.wallet_transactions.filter((tx) => tx.userId === user.id);

      if (typeFilter !== 'all') {
        if (typeFilter === 'adjustment') {
          list = list.filter(
            (tx) =>
              tx.type === 'adjustment' ||
              tx.type === 'manual_credit' ||
              tx.type === 'manual_debit'
          );
        } else {
          list = list.filter((tx) => tx.type === typeFilter);
        }
      }

      if (search) {
        list = list.filter(
          (tx) =>
            tx.txNumber.toLowerCase().includes(search) ||
            tx.description.toLowerCase().includes(search) ||
            tx.referenceId.toLowerCase().includes(search) ||
            (tx.reason || '').toLowerCase().includes(search)
        );
      }

      if (startDate) {
        const startMs = Date.parse(`${startDate}T00:00:00.000Z`);
        if (Number.isFinite(startMs)) {
          list = list.filter((tx) => Date.parse(tx.createdAt) >= startMs - 7 * 3600 * 1000);
        }
      }
      if (endDate) {
        const endMs = Date.parse(`${endDate}T23:59:59.999Z`);
        if (Number.isFinite(endMs)) {
          list = list.filter((tx) => Date.parse(tx.createdAt) <= endMs);
        }
      }

      const total = list.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const safePage = Math.min(page, totalPages);
      const offset = (safePage - 1) * limit;

      const wallet = snap.reseller_wallets.find((w) => w.userId === user.id);

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        wallet: wallet || null,
        transactions: list.slice(offset, offset + limit),
        total,
        page: safePage,
        totalPages,
      });
    }
  );

  // ================= RESELLER TOP UP LIST & DETAIL =================
  router.get(
    '/reseller/topups',
    verifyResellerRequest,
    (req: AuthenticatedUserRequest, res: Response) => {
      const snap = db.getSnapshot();
      const user = req.user!;
      const status = String(req.query.status || 'all').trim();
      const search = String(req.query.search || '').trim().toLowerCase();

      let list = snap.reseller_topups.filter((t) => t.userId === user.id);
      if (status !== 'all') {
        list = list.filter((t) => t.status === status);
      }
      if (search) {
        list = list.filter(
          (t) =>
            t.topupNumber.toLowerCase().includes(search) ||
            (t.payerName || '').toLowerCase().includes(search)
        );
      }

      const wallet = snap.reseller_wallets.find((w) => w.userId === user.id) || null;
      const topupConfig = getTopupConfig(snap);
      const qrisReady =
        snap.store_settings.qrisEnabled &&
        isQrisImageAvailable(snap.store_settings.qrisImageUrl);

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        topups: list,
        wallet,
        topupConfig,
        qris: {
          ready: qrisReady,
          imageUrl: qrisReady ? snap.store_settings.qrisImageUrl : '',
          merchantName: snap.store_settings.qrisMerchantName,
          nmid: snap.store_settings.qrisNmid,
          instructions: snap.store_settings.qrisInstructions,
        },
        storeWhatsapp: snap.store_settings.whatsappNumber,
      });
    }
  );

  router.get(
    '/reseller/topups/:id',
    verifyResellerRequest,
    (req: AuthenticatedUserRequest, res: Response) => {
      const snap = db.getSnapshot();
      const user = req.user!;
      const topup = snap.reseller_topups.find(
        (t) =>
          (t.id === req.params.id || t.topupNumber === req.params.id) &&
          t.userId === user.id
      );
      if (!topup) {
        res.status(404).json({ error: 'Riwayat top up tidak ditemukan.' });
        return;
      }

      const waMessage = buildTopupWhatsAppMessage({
        topupNumber: topup.topupNumber,
        resellerId: topup.resellerId,
        resellerName: topup.resellerName,
        resellerUsername: topup.resellerUsername,
        resellerWhatsapp: topup.resellerWhatsapp,
        amount: topup.amount,
        feeAmount: topup.feeAmount,
        totalPayment: topup.totalPayment,
        walletCredit: topup.walletCredit,
        feePercentage: topup.feePercentage,
        confirmationTime: formatJakartaTimestamp(topup.updatedAt),
      });

      res.setHeader('Cache-Control', 'no-store');
      res.json({
        topup,
        whatsappMessage: waMessage,
        whatsappUrl: buildWhatsAppConfirmationUrl(snap.store_settings.whatsappNumber, waMessage),
      });
    }
  );

  // ================= CREATE TOP UP REQUEST (STEP 1) =================
  router.post(
    '/reseller/topups',
    verifyResellerRequest,
    async (req: AuthenticatedUserRequest, res: Response) => {
      const ip = getClientIp(req);
      const rate = topupActionLimiter.consume(`topup-create:${req.user!.id}:${ip}`);
      if (!rate.allowed) {
        res.status(429).json({
          error: `Terlalu banyak permintaan top up. Coba lagi dalam ${rate.retryAfterSec} detik.`,
        });
        return;
      }

      const rawAmount = Number(req.body?.amount);
      const notes = sanitizeText(req.body?.notes || '', 400);

      if (!Number.isFinite(rawAmount) || !Number.isInteger(rawAmount) || rawAmount <= 0) {
        res.status(400).json({
          error: 'Nominal top up harus berupa angka bulat Rupiah yang valid.',
        });
        return;
      }

      try {
        const rtMeta: RealtimeMutationMeta = {
          areas: ['topups', 'overview'],
          targetUserId: req.user!.id,
          targetResellerId: req.user!.resellerId,
          summary: `Permintaan top up baru oleh @${req.user!.username}`,
        };

        const result = await db.withTransaction((draft) => {
          const user = req.user!;
          const profile = draft.reseller_profiles.find((p) => p.userId === user.id);
          if (!profile || profile.status !== 'active') {
            throw Object.assign(
              new Error('Hanya reseller dengan status Active yang dapat melakukan top up saldo.'),
              { statusCode: 403 }
            );
          }

          if (
            !draft.store_settings.qrisEnabled ||
            !isQrisImageAvailable(draft.store_settings.qrisImageUrl)
          ) {
            throw Object.assign(
              new Error('Pembayaran QRIS sedang tidak tersedia. Silakan hubungi admin untuk informasi lebih lanjut.'),
              { statusCode: 503 }
            );
          }

          const cfg = getTopupConfig(draft);
          if (rawAmount < cfg.minAmount) {
            throw Object.assign(
              new Error(`Nominal top up minimal ${formatIDR(cfg.minAmount)}.`),
              { statusCode: 400 }
            );
          }
          if (rawAmount > cfg.maxAmount) {
            throw Object.assign(
              new Error(`Nominal top up maksimal ${formatIDR(cfg.maxAmount)}.`),
              { statusCode: 400 }
            );
          }

          const { amount, feePercentage, feeAmount, totalPayment, walletCredit } = calculateTopupFee(
            rawAmount,
            cfg.feePercentage
          );

          const now = new Date().toISOString();
          ensureResellerWallet(draft, profile, now);
          draft.topup_sequence = (draft.topup_sequence || 0) + 1;
          const topupNumber = generateTopupNumber(draft.topup_sequence);

          const topup: ResellerTopup = {
            id: `top-${crypto.randomUUID().slice(0, 12)}`,
            topupNumber,
            resellerId: profile.id,
            userId: user.id,
            resellerName: user.name,
            resellerUsername: user.username,
            resellerWhatsapp: user.whatsapp,
            amount,
            feePercentage,
            feeAmount,
            totalPayment,
            walletCredit,
            method: 'QRIS',
            status: 'pending_payment',
            credited: false,
            notes: notes || undefined,
            createdAt: now,
            updatedAt: now,
          };

          draft.reseller_topups.unshift(topup);
          rtMeta.targetResellerId = profile.id;
          return topup;
        }, rtMeta);

        res.status(201).json({
          ok: true,
          topup: result,
        });
      } catch (err: any) {
        res.status(err?.statusCode || 500).json({
          error: err?.message || 'Gagal membuat permintaan top up saldo.',
        });
      }
    }
  );

  // ================= CONFIRM TOP UP & UPLOAD PROOF (STEP 2) =================
  router.post(
    '/reseller/topups/:id/confirm',
    verifyResellerRequest,
    wrapSingleUpload(upload, 'proof'),
    async (req: AuthenticatedUserRequest, res: Response) => {
      try {
        const user = req.user!;
        const body = req.body || {};
        const payerName = sanitizeText(body.payerName || user.name || '', 120);
        const rawWhatsapp = sanitizeText(body.payerWhatsapp || user.whatsapp || '', 30);
        const paymentTime = sanitizeText(body.paymentTime || '', 80);
        const notes = sanitizeText(body.notes || '', 400);

        if (!payerName || payerName.length < 2) {
          res.status(400).json({ error: 'Nama pengirim pembayaran wajib diisi.' });
          return;
        }
        if (!isValidWhatsappNumber(rawWhatsapp)) {
          res.status(400).json({ error: 'Nomor WhatsApp pengirim tidak valid.' });
          return;
        }
        if (!req.file) {
          res.status(400).json({ error: 'Bukti pembayaran QRIS wajib diunggah.' });
          return;
        }

        const magic = validateUploadedFileMagicBytes(req.file.buffer, [
          'jpg',
          'png',
          'webp',
          'pdf',
        ]);
        if (magic.ok === false) {
          res.status(400).json({ error: magic.error });
          return;
        }

        const proofHash = sha256Buffer(req.file.buffer);
        const proofsDir = path.resolve(process.cwd(), 'uploads', 'topup-proofs');
        fs.mkdirSync(proofsDir, { recursive: true });
        const fileName = `topup-proof-${crypto.randomUUID()}.${magic.ext}`;

        const normalizedWa = normalizeWhatsappNumber(rawWhatsapp);
        const now = new Date().toISOString();

        const rtMeta: RealtimeMutationMeta = {
          areas: ['topups', 'overview'],
          targetUserId: user.id,
          targetResellerId: user.resellerId,
          summary: `Konfirmasi pembayaran top up oleh @${user.username}`,
        };

        const updated = await db.withTransaction((draft) => {
          const topup = draft.reseller_topups.find(
            (t) => t.id === req.params.id || t.topupNumber === req.params.id
          );
          if (!topup || topup.userId !== user.id) {
            throw Object.assign(new Error('Permintaan top up tidak ditemukan.'), {
              statusCode: 404,
            });
          }
          if (topup.status === 'approved' || topup.credited) {
            throw Object.assign(
              new Error('Top up ini sudah disetujui dan dikreditkan ke wallet Anda.'),
              { statusCode: 400 }
            );
          }

          const duplicateProofTopup = draft.reseller_topups.find(
            (t) => t.id !== topup.id && t.proofHash === proofHash
          );
          const duplicateProofApp = draft.reseller_applications.find(
            (a) => a.proofHash === proofHash
          );
          if (duplicateProofTopup || duplicateProofApp) {
            throw Object.assign(
              new Error('Bukti pembayaran ini sudah pernah digunakan pada transaksi lain.'),
              { statusCode: 400 }
            );
          }

          fs.writeFileSync(path.join(proofsDir, fileName), req.file!.buffer);
          const proofUrl = `/uploads/topup-proofs/${fileName}`;

          topup.proofUrl = proofUrl;
          topup.proofMimeType = magic.mime;
          topup.proofHash = proofHash;
          topup.payerName = payerName;
          topup.payerWhatsapp = normalizedWa;
          topup.paymentTime = paymentTime || formatJakartaTimestamp(now);
          if (notes) topup.notes = notes;
          topup.rejectionReason = undefined;
          // NEVER credit wallet on upload — must wait for Admin atomic approval
          topup.status = 'pending_verification';
          topup.credited = false;
          topup.updatedAt = now;
          rtMeta.targetResellerId = topup.resellerId;

          return {
            topup,
            storeWhatsapp: draft.store_settings.whatsappNumber,
          };
        }, rtMeta);

        const waMessage = buildTopupWhatsAppMessage({
          topupNumber: updated.topup.topupNumber,
          resellerId: updated.topup.resellerId,
          resellerName: updated.topup.resellerName,
          resellerUsername: updated.topup.resellerUsername,
          resellerWhatsapp: updated.topup.resellerWhatsapp,
          amount: updated.topup.amount,
          feeAmount: updated.topup.feeAmount,
          totalPayment: updated.topup.totalPayment,
          walletCredit: updated.topup.walletCredit,
          feePercentage: updated.topup.feePercentage,
          confirmationTime: formatJakartaTimestamp(updated.topup.updatedAt),
        });

        res.json({
          ok: true,
          topup: updated.topup,
          whatsappMessage: waMessage,
          whatsappUrl: buildWhatsAppConfirmationUrl(updated.storeWhatsapp, waMessage),
          message:
            'Bukti transfer top up berhasil dikirim. Menunggu verifikasi admin Catrizzz Store.',
        });
      } catch (err: any) {
        res.status(err?.statusCode || 500).json({
          error: err?.message || 'Gagal mengonfirmasi top up saldo.',
        });
      }
    }
  );
}

export function mountAdminWalletAndTopupRoutes(
  router: Router,
  deps: ResellerRouteDeps
): void {
  const { appendAuditLog } = deps;

  // ================= ADMIN LIST & FILTER TOP UP REQUESTS =================
  router.get('/admin/topups', (req: AuthenticatedRequest, res: Response) => {
    const snap = db.getSnapshot();
    const status = String(req.query.status || 'all').trim();
    const search = String(req.query.search || '').trim().toLowerCase();
    const rawRange = String(req.query.range || 'all').trim();
    const validRanges: TopupRevenueRange[] = ['today', '7d', '30d', 'month', 'all', 'custom'];
    const range: TopupRevenueRange = validRanges.includes(rawRange as TopupRevenueRange)
      ? (rawRange as TopupRevenueRange)
      : 'all';
    const startDate = String(req.query.startDate || '').trim();
    const endDate = String(req.query.endDate || '').trim();
    const minAmount = Number(req.query.minAmount || 0);
    const maxAmount = Number(req.query.maxAmount || 0);

    const topupFeeStats = computeTopupFeeStats(snap.reseller_topups, {
      range,
      startDate,
      endDate,
    });

    let list = snap.reseller_topups;
    if (status !== 'all') {
      list = list.filter((t) => t.status === status);
    }
    if (search) {
      list = list.filter(
        (t) =>
          t.topupNumber.toLowerCase().includes(search) ||
          t.resellerId.toLowerCase().includes(search) ||
          t.resellerName.toLowerCase().includes(search) ||
          t.resellerUsername.toLowerCase().includes(search) ||
          t.resellerWhatsapp.includes(search)
      );
    }
    if (startDate) {
      const startMs = Date.parse(`${startDate}T00:00:00.000Z`);
      if (Number.isFinite(startMs)) {
        list = list.filter((t) => Date.parse(t.createdAt) >= startMs - 7 * 3600 * 1000);
      }
    }
    if (endDate) {
      const endMs = Date.parse(`${endDate}T23:59:59.999Z`);
      if (Number.isFinite(endMs)) {
        list = list.filter((t) => Date.parse(t.createdAt) <= endMs - 7 * 3600 * 1000);
      }
    }
    if (Number.isFinite(minAmount) && minAmount > 0) {
      list = list.filter((t) => t.amount >= minAmount);
    }
    if (Number.isFinite(maxAmount) && maxAmount > 0) {
      list = list.filter((t) => t.amount <= maxAmount);
    }

    const approvedTopups = snap.reseller_topups.filter((t) => t.status === 'approved');
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      topups: list,
      topupConfig: getTopupConfig(snap),
      topupFeeStats,
      summary: {
        pendingPaymentCount: snap.reseller_topups.filter((t) => t.status === 'pending_payment')
          .length,
        pendingVerificationCount: snap.reseller_topups.filter(
          (t) => t.status === 'pending_verification'
        ).length,
        approvedCount: approvedTopups.length,
        rejectedCount: snap.reseller_topups.filter((t) => t.status === 'rejected').length,
        totalSaldoWallet: approvedTopups.reduce((s, t) => s + (t.walletCredit ?? t.amount), 0),
        totalFeeCollected: approvedTopups.reduce((s, t) => s + (t.feeAmount || 0), 0),
        totalQrisPayments: approvedTopups.reduce(
          (s, t) => s + (t.totalPayment ?? t.amount + (t.feeAmount || 0)),
          0
        ),
      },
    });
  });

  // ================= ADMIN ATOMIC APPROVE TOP UP =================
  router.post('/admin/topups/:id/approve', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const rtMeta: RealtimeMutationMeta = {
        areas: ['topups', 'resellers', 'reseller_wallet', 'overview', 'logs'],
      };

      const result = await db.withTransaction((draft) => {
        const topup = draft.reseller_topups.find((t) => t.id === req.params.id);
        if (!topup) {
          throw Object.assign(new Error('Permintaan top up tidak ditemukan.'), { statusCode: 404 });
        }
        if (topup.credited || topup.status === 'approved') {
          throw Object.assign(
            new Error('Top up ini sudah pernah disetujui dan saldo sudah dikreditkan sebelumnya.'),
            { statusCode: 409 }
          );
        }
        if (topup.status !== 'pending_verification') {
          throw Object.assign(
            new Error(
              topup.status === 'pending_payment'
                ? 'Reseller belum mengunggah bukti pembayaran QRIS untuk top up ini.'
                : 'Top up yang sudah ditolak tidak dapat langsung disetujui.'
            ),
            { statusCode: 409 }
          );
        }

        const profile = draft.reseller_profiles.find((p) => p.id === topup.resellerId);
        if (!profile) {
          throw Object.assign(new Error('Profil reseller tidak ditemukan.'), { statusCode: 404 });
        }
        if (profile.status !== 'active') {
          throw Object.assign(
            new Error(
              profile.status === 'banned'
                ? 'Akun reseller berstatus Banned sehingga top up tidak dapat disetujui.'
                : 'Hanya reseller dengan status Active yang dapat menerima kredit top up saldo.'
            ),
            { statusCode: 400 }
          );
        }

        // Verify fee & wallet credit consistency against server formula
        const expected = calculateTopupFee(topup.amount, topup.feePercentage);
        if (
          topup.amount <= 0 ||
          topup.feeAmount !== expected.feeAmount ||
          topup.totalPayment !== expected.totalPayment ||
          topup.walletCredit !== expected.walletCredit
        ) {
          throw Object.assign(
            new Error('Data nominal top up atau kalkulasi biaya top up 10% tidak konsisten.'),
            { statusCode: 400 }
          );
        }

        const now = new Date().toISOString();
        const wallet = ensureResellerWallet(draft, profile, now);

        const balanceBefore = wallet.balance;
        const balanceAfter = balanceBefore + expected.walletCredit;

        const topupTx = recordWalletTransaction(draft, {
          resellerId: profile.id,
          userId: profile.userId,
          type: 'topup',
          amount: expected.walletCredit,
          balanceBefore,
          balanceAfter,
          referenceType: 'topup',
          referenceId: topup.id,
          description: `Top Up Saldo Wallet (${topup.topupNumber}) · Bayar QRIS ${formatIDR(expected.totalPayment)} (Termasuk Biaya ${expected.feePercentage}%: ${formatIDR(expected.feeAmount)})`,
          actorId: req.admin!.uid,
          actorName: req.admin!.email,
          now,
        });

        wallet.balance = balanceAfter;
        wallet.totalTopup += expected.walletCredit;
        wallet.totalFeesPaid = (wallet.totalFeesPaid || 0) + expected.feeAmount;
        wallet.updatedAt = now;

        topup.credited = true;
        topup.status = 'approved';
        topup.approvedAt = now;
        topup.approvedByAdminId = req.admin!.uid;
        topup.approvedByAdminEmail = req.admin!.email;
        topup.rejectionReason = undefined;
        topup.topupTxId = topupTx.id;
        topup.updatedAt = now;

        rtMeta.targetUserId = profile.userId;
        rtMeta.targetResellerId = profile.id;
        rtMeta.summary = `Top up ${topup.topupNumber} (@${topup.resellerUsername}) disetujui`;

        appendAuditLog(
          draft,
          req.admin!,
          'APPROVE_RESELLER_TOPUP',
          'reseller_topup',
          topup.id,
          `Menyetujui top up ${topup.topupNumber} (@${topup.resellerUsername}): Saldo Masuk Wallet ${formatIDR(expected.walletCredit)} | Biaya Top Up ${expected.feePercentage}% (${formatIDR(expected.feeAmount)}) | Total Bayar QRIS ${formatIDR(expected.totalPayment)}`
        );

        return { topup, wallet, topupTx };
      }, rtMeta);

      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({
        error: err?.message || 'Gagal menyetujui top up reseller.',
      });
    }
  });

  // ================= ADMIN REJECT TOP UP =================
  router.post('/admin/topups/:id/reject', async (req: AuthenticatedRequest, res: Response) => {
    const cleanReason = sanitizeText(req.body?.reason || req.body?.rejectionReason || '', 500);
    if (!cleanReason || cleanReason.length < 3) {
      res.status(400).json({ error: 'Alasan penolakan top up wajib diisi.' });
      return;
    }

    try {
      const rtMeta: RealtimeMutationMeta = {
        areas: ['topups', 'overview', 'logs'],
      };

      const updated = await db.withTransaction((draft) => {
        const topup = draft.reseller_topups.find((t) => t.id === req.params.id);
        if (!topup) {
          throw Object.assign(new Error('Permintaan top up tidak ditemukan.'), { statusCode: 404 });
        }
        if (topup.credited || topup.status === 'approved') {
          throw Object.assign(
            new Error('Top up yang sudah disetujui dan dikreditkan tidak dapat ditolak.'),
            { statusCode: 409 }
          );
        }

        const now = new Date().toISOString();
        topup.status = 'rejected';
        topup.credited = false;
        topup.rejectedAt = now;
        topup.rejectedByAdminId = req.admin!.uid;
        topup.rejectionReason = cleanReason;
        topup.updatedAt = now;

        rtMeta.targetUserId = topup.userId;
        rtMeta.targetResellerId = topup.resellerId;
        rtMeta.summary = `Top up ${topup.topupNumber} ditolak`;

        appendAuditLog(
          draft,
          req.admin!,
          'REJECT_RESELLER_TOPUP',
          'reseller_topup',
          topup.id,
          `Menolak top up ${topup.topupNumber} (@${topup.resellerUsername}): ${cleanReason}`
        );
        return topup;
      }, rtMeta);

      res.json({ ok: true, topup: updated });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({
        error: err?.message || 'Gagal menolak permintaan top up.',
      });
    }
  });

  // ================= ADMIN TOP UP SETTINGS (MIN, MAX, FEE %) =================
  router.put('/admin/topup-settings', async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    const minAmount = Math.round(Number(body.minAmount));
    const maxAmount = Math.round(Number(body.maxAmount));
    const rawFeePct = body.feePercentage !== undefined ? body.feePercentage : body.bonusPercentage;
    const feePercentage = Number(rawFeePct);
    const confirmFeeChange = Boolean(body.confirmFeeChange ?? body.confirmBonusChange);
    const changeReason = sanitizeText(body.reason || '', 300);

    if (!Number.isFinite(minAmount) || minAmount < 1000) {
      res.status(400).json({ error: 'Minimal top up minimal Rp1.000.' });
      return;
    }
    if (!Number.isFinite(maxAmount) || maxAmount < minAmount) {
      res.status(400).json({ error: 'Maksimal top up harus lebih besar atau sama dengan minimal top up.' });
      return;
    }
    if (!Number.isFinite(feePercentage) || feePercentage < 0 || feePercentage > 100) {
      res.status(400).json({ error: 'Persentase biaya top up harus antara 0% hingga 100%.' });
      return;
    }

    try {
      const updated = await db.withTransaction(
        (draft) => {
          const s = draft.store_settings;
          const prevPct =
            typeof s.topupFeePercentage === 'number'
              ? s.topupFeePercentage
              : TOPUP_FEE_PERCENTAGE;

          if (feePercentage !== prevPct) {
            if (req.admin?.role !== 'super_admin') {
              throw Object.assign(
                new Error('Hanya Super Admin yang memiliki izin khusus untuk mengubah persentase biaya top up.'),
                { statusCode: 403 }
              );
            }
            if (!confirmFeeChange || !changeReason) {
              throw Object.assign(
                new Error(
                  'Perubahan persentase biaya top up memerlukan konfirmasi eksplisit dan alasan perubahan.'
                ),
                { statusCode: 400 }
              );
            }
          }

          s.topupMinAmount = minAmount;
          s.topupMaxAmount = maxAmount;
          s.topupFeePercentage = feePercentage;
          s.updatedAt = new Date().toISOString();

          appendAuditLog(
            draft,
            req.admin!,
            'UPDATE_TOPUP_SETTINGS',
            'store_settings',
            'default',
            `Pengaturan top up diubah: min ${formatIDR(minAmount)}, max ${formatIDR(maxAmount)}, biaya top up ${feePercentage}%${changeReason ? ` (${changeReason})` : ''}`
          );

          return getTopupConfig(draft);
        },
        {
          areas: ['storefront', 'topups', 'payment_settings', 'overview', 'logs'],
          summary: 'Pengaturan top up diperbarui',
        }
      );

      res.json({ ok: true, topupConfig: updated });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({
        error: err?.message || 'Gagal menyimpan pengaturan top up.',
      });
    }
  });

  // ================= ADMIN RESELLER WALLET DETAIL & MANUAL ADJUSTMENT =================
  router.get('/admin/resellers/:id/wallet', (req: AuthenticatedRequest, res: Response) => {
    const snap = db.getSnapshot();
    const profile = snap.reseller_profiles.find((r) => r.id === req.params.id);
    if (!profile) {
      res.status(404).json({ error: 'Reseller tidak ditemukan.' });
      return;
    }

    const wallet = snap.reseller_wallets.find((w) => w.resellerId === profile.id) || {
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

    const transactions = snap.wallet_transactions.filter((tx) => tx.resellerId === profile.id);
    const topups = snap.reseller_topups.filter((t) => t.resellerId === profile.id);

    res.json({
      wallet,
      transactions,
      topups,
    });
  });

  router.post(
    '/admin/resellers/:id/wallet/adjust',
    async (req: AuthenticatedRequest, res: Response) => {
      const action = req.body?.action;
      const rawAmount = Math.round(Number(req.body?.amount));
      const reason = sanitizeText(req.body?.reason || '', 400);

      if (action !== 'manual_credit' && action !== 'manual_debit' && action !== 'adjustment') {
        res.status(400).json({
          error: 'Tipe penyesuaian harus manual_credit, manual_debit, atau adjustment.',
        });
        return;
      }
      if (!Number.isFinite(rawAmount) || rawAmount === 0) {
        res.status(400).json({ error: 'Nominal penyesuaian saldo tidak boleh nol.' });
        return;
      }
      if (action !== 'adjustment' && rawAmount < 0) {
        res.status(400).json({ error: 'Nominal kredit/debit manual harus bernilai positif.' });
        return;
      }
      if (!reason || reason.length < 4) {
        res.status(400).json({ error: 'Alasan penyesuaian saldo wajib diisi.' });
        return;
      }

      try {
        const rtMeta: RealtimeMutationMeta = {
          areas: ['resellers', 'reseller_wallet', 'overview', 'logs'],
        };

        const result = await db.withTransaction((draft) => {
          const profile = draft.reseller_profiles.find((r) => r.id === req.params.id);
          if (!profile) {
            throw Object.assign(new Error('Profil reseller tidak ditemukan.'), { statusCode: 404 });
          }

          const now = new Date().toISOString();
          const wallet = ensureResellerWallet(draft, profile, now);
          const signedDelta =
            action === 'manual_credit'
              ? Math.abs(rawAmount)
              : action === 'manual_debit'
                ? -Math.abs(rawAmount)
                : rawAmount;

          if (wallet.balance + signedDelta < 0) {
            throw Object.assign(
              new Error(
                `Saldo wallet (${formatIDR(wallet.balance)}) tidak mencukupi untuk dikurangi ${formatIDR(Math.abs(signedDelta))}.`
              ),
              { statusCode: 400 }
            );
          }

          const before = wallet.balance;
          const after = before + signedDelta;
          wallet.balance = after;
          wallet.updatedAt = now;

          const tx = recordWalletTransaction(draft, {
            resellerId: profile.id,
            userId: profile.userId,
            type: action,
            amount: action === 'adjustment' ? signedDelta : Math.abs(signedDelta),
            balanceBefore: before,
            balanceAfter: after,
            referenceType: 'admin_adjustment',
            referenceId: `adj-${profile.id}`,
            description:
              signedDelta >= 0
                ? `Penambahan Saldo Manual oleh Admin (${formatIDR(Math.abs(signedDelta))})`
                : `Pengurangan Saldo Manual oleh Admin (${formatIDR(Math.abs(signedDelta))})`,
            reason,
            actorId: req.admin!.uid,
            actorName: req.admin!.email,
            now,
          });

          rtMeta.targetUserId = profile.userId;
          rtMeta.targetResellerId = profile.id;
          rtMeta.summary = `Penyesuaian saldo wallet @${profile.username}`;

          appendAuditLog(
            draft,
            req.admin!,
            'ADMIN_MANUAL_WALLET_ADJUSTMENT',
            'reseller_wallet',
            wallet.id,
            `Penyesuaian wallet @${profile.username} (${action}): ${signedDelta >= 0 ? '+' : ''}${formatIDR(signedDelta)} | Sebelum: ${formatIDR(before)} -> Sesudah: ${formatIDR(after)} | Alasan: ${reason}`
          );

          return { wallet, transaction: tx };
        }, rtMeta);

        res.json({ ok: true, ...result });
      } catch (err: any) {
        res.status(err?.statusCode || 500).json({
          error: err?.message || 'Gagal menyesuaikan saldo wallet reseller.',
        });
      }
    }
  );
}
