import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import multer from 'multer';
import {
  ADMIN_SESSION_COOKIE,
  buildSessionCookie,
  resolveAdminWithReason,
  resolveUserFromRequest,
  verifyAdminRequest,
  type AuthenticatedRequest,
} from './auth';
import { db } from './db';
import {
  mountAdminResellerAndPaymentRoutes,
  mountUserAndResellerPublicRoutes,
} from './resellerRoutes';
import {
  ensureResellerWallet,
  mountAdminWalletAndTopupRoutes,
  mountResellerWalletPublicRoutes,
  recordWalletTransaction,
} from './walletRoutes';
import {
  generateOrderNumber,
  generateReceiptToken,
  hashPassword,
  hashReceiptToken,
  maskReceiptToken,
  sanitizeText,
  signAdminSessionToken,
  SlidingWindowRateLimiter,
  slugify,
  timingSafeEqualHex,
  validateUploadedFileMagicBytes,
  verifyPassword,
} from './security';
import { CAT_AI_CLEAN_IMAGE, hasOfficialQrisFile, HERO_CLEAN_IMAGE } from './seedData';
import {
  buildWhatsAppConfirmationMessage,
  buildWhatsAppConfirmationUrl,
  calculateOrderTotals,
  calculateResellerPrice,
  computeServerSideCart,
  computeTopupFeeStats,
  formatIDR,
  isValidWhatsappNumber,
  maskAddress,
  maskWhatsappNumber,
  normalizeWhatsappNumber,
  validateDiscountCode,
} from '../src/shared/pricing';
import type {
  AuditLog,
  Banner,
  Category,
  DiscountCode,
  NavigationMenuItem,
  Order,
  OrderItemSnapshot,
  OrderStatus,
  OrderTimelineEvent,
  Payment,
  PaymentConfirmation,
  Product,
  ProductVariant,
  PublicReceiptView,
  RealtimeMutationMeta,
  ShippingSetting,
} from '../src/shared/types';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const receiptRateLimiter = new SlidingWindowRateLimiter(20, 60 * 1000);
const checkoutRateLimiter = new SlidingWindowRateLimiter(15, 60 * 1000);
const loginRateLimiter = new SlidingWindowRateLimiter(15, 5 * 60 * 1000);

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function getPublicBaseUrl(req: Request): string {
  if (process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL') {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

function isQrisImageAvailable(qrisImageUrl: string): boolean {
  if (!qrisImageUrl) return false;
  const cleanUrl = qrisImageUrl.split('?')[0].split('#')[0].trim();
  if (!cleanUrl) return false;
  if (cleanUrl.startsWith('/assets/')) {
    return fs.existsSync(path.resolve(process.cwd(), 'public', cleanUrl.slice(1)));
  }
  if (cleanUrl.startsWith('/uploads/')) {
    return fs.existsSync(path.resolve(process.cwd(), cleanUrl.slice(1)));
  }
  return hasOfficialQrisFile();
}

function handleSingleFileUpload(fieldName: string) {
  const middleware = upload.single(fieldName);
  return (req: Request, res: Response, next: express.NextFunction) => {
    middleware(req, res, (err: any) => {
      if (!err) {
        next();
        return;
      }
      if (err?.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Ukuran file maksimal 5MB.' });
        return;
      }
      if (err?.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({ error: 'Field upload file tidak valid.' });
        return;
      }
      res.status(400).json({
        error: err?.message || 'Gagal membaca file upload. Pastikan format file valid.',
      });
    });
  };
}

function formatJakartaTimestamp(iso: string): string {
  try {
    return (
      new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso)) + ' WIB'
    );
  } catch {
    return iso;
  }
}

function buildOrderTimeline(
  order: Order,
  payment?: Payment,
  confirmation?: PaymentConfirmation
): OrderTimelineEvent[] {
  const events: OrderTimelineEvent[] = [
    {
      title: 'Pesanan Dibuat',
      description: `Order ${order.orderNumber} tercatat di sistem.`,
      timestamp: order.createdAt,
      status: 'done',
    },
  ];

  if (order.paymentStatus === 'unpaid') {
    events.push({
      title: 'Menunggu Pembayaran QRIS',
      description: 'Silakan selesaikan pembayaran dan kirim konfirmasi.',
      timestamp: order.updatedAt,
      status: 'current',
    });
  } else if (order.paymentStatus === 'pending_verification') {
    events.push({
      title: 'Konfirmasi Dikirim',
      description: 'Menunggu verifikasi pembayaran oleh admin.',
      timestamp: confirmation?.createdAt || order.updatedAt,
      status: 'current',
    });
  } else if (order.paymentStatus === 'rejected') {
    events.push({
      title: 'Pembayaran Ditolak',
      description: order.rejectionReason || payment?.rejectionReason || 'Perlu konfirmasi ulang.',
      timestamp: payment?.updatedAt || order.updatedAt,
      status: 'rejected',
    });
  } else if (order.paymentStatus === 'paid' || order.paymentStatus === 'refunded') {
    events.push({
      title: 'Pembayaran Terverifikasi',
      description:
        order.paymentStatus === 'refunded'
          ? 'Dana telah dikembalikan ke saldo wallet.'
          : order.paymentMethod === 'WALLET'
            ? 'Pembayaran lunas otomatis via Reseller Wallet.'
            : 'Pembayaran QRIS telah disetujui admin.',
      timestamp: payment?.verifiedAt || order.updatedAt,
      status: 'done',
    });
  }

  if (order.orderStatus === 'cancelled') {
    events.push({
      title: 'Pesanan Dibatalkan',
      description: 'Pesanan dibatalkan dan stok dikembalikan.',
      timestamp: order.updatedAt,
      status: 'rejected',
    });
  } else {
    events.push({
      title: 'Pesanan Diproses',
      description: 'Pesanan sedang disiapkan oleh tim Catrizzz Store.',
      timestamp: order.orderStatus !== 'pending_payment' ? order.updatedAt : '',
      status:
        order.orderStatus === 'processing'
          ? 'current'
          : order.orderStatus === 'shipped' || order.orderStatus === 'completed'
            ? 'done'
            : 'upcoming',
    });

    const isDigital =
      order.shippingMethodName.toLowerCase().includes('digital') ||
      order.shippingMethodName.toLowerCase().includes('whatsapp') ||
      order.shippingMethodName.toLowerCase().includes('email');

    if (isDigital) {
      events.push({
        title: 'Akses Digital Dikirim / Selesai',
        description: 'Produk digital & panduan aktivasi dikirimkan kepada pembeli.',
        timestamp:
          order.orderStatus === 'completed' || order.orderStatus === 'shipped'
            ? order.updatedAt
            : '',
        status:
          order.orderStatus === 'completed'
            ? 'done'
            : order.orderStatus === 'shipped'
              ? 'current'
              : 'upcoming',
      });
    } else {
      events.push({
        title: 'Dikirim / Diproses',
        description: `Metode: ${order.shippingMethodName}.`,
        timestamp:
          order.orderStatus === 'shipped' || order.orderStatus === 'completed'
            ? order.updatedAt
            : '',
        status:
          order.orderStatus === 'shipped'
            ? 'current'
            : order.orderStatus === 'completed'
              ? 'done'
              : 'upcoming',
      });
      events.push({
        title: 'Selesai',
        description: 'Transaksi selesai.',
        timestamp: order.orderStatus === 'completed' ? order.updatedAt : '',
        status: order.orderStatus === 'completed' ? 'done' : 'upcoming',
      });
    }
  }

  return events;
}

function appendAuditLog(
  draft: ReturnType<typeof db.getSnapshot>,
  admin: { uid: string; email: string },
  action: string,
  targetType: string,
  targetId: string,
  summary: string
): void {
  const entry: AuditLog = {
    id: `aud-${crypto.randomUUID()}`,
    actorEmail: admin.email,
    actorUid: admin.uid,
    action,
    targetType,
    targetId,
    summary: sanitizeText(summary, 500),
    createdAt: new Date().toISOString(),
  };
  draft.audit_logs.unshift(entry);
  if (draft.audit_logs.length > 500) {
    draft.audit_logs = draft.audit_logs.slice(0, 500);
  }
}

export function createApiRouter(): express.Router {
  const router = express.Router();

  const resellerDeps = {
    upload,
    getClientIp,
    isQrisImageAvailable,
    formatJakartaTimestamp,
    appendAuditLog,
  };

  // Mount public/user auth & reseller application/dashboard/wallet routes before admin guard
  mountUserAndResellerPublicRoutes(router, resellerDeps);
  mountResellerWalletPublicRoutes(router, resellerDeps);

  // ================= PUBLIC STOREFRONT =================
  router.get('/storefront', (_req, res) => {
    const snap = db.getSnapshot();
    const nowMs = Date.now();
    const activeCategories = snap.categories
      .filter((c) => c.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const activeProducts = snap.products.filter(
      (p) =>
        p.active &&
        !p.archived &&
        p.publicationStatus !== 'draft' &&
        p.publicationStatus !== 'inactive'
    );
    const activeVariants = snap.product_variants.filter((v) => v.active);

    const productCounts = new Map<string, number>();
    for (const p of activeProducts) {
      productCounts.set(p.categoryId, (productCounts.get(p.categoryId) || 0) + 1);
    }

    const categoriesWithCount = activeCategories.map((c) => ({
      ...c,
      productCount: productCounts.get(c.id) || 0,
    }));

    const featuredProducts = activeProducts
      .filter((p) => p.featured)
      .sort((a, b) => (a.featuredOrder ?? 99) - (b.featuredOrder ?? 99))
      .slice(0, 8)
      .map((p) => ({
        ...p,
        variants: activeVariants.filter((v) => v.productId === p.id),
      }));

    const activeBanners = snap.banners.filter((b) => {
      if (!b.active) return false;
      const start = b.startDate ? Date.parse(b.startDate) : NaN;
      const end = b.endDate ? Date.parse(b.endDate) : NaN;
      if (Number.isFinite(start) && nowMs < start) return false;
      if (Number.isFinite(end) && nowMs > end) return false;
      return true;
    });

    const activeNavigationMenus = (snap.navigation_menus || [])
      .filter((m) => m.active)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const qrisReady =
      snap.store_settings.qrisEnabled && isQrisImageAvailable(snap.store_settings.qrisImageUrl);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      storeSettings: {
        ...snap.store_settings,
        qrisReady,
      },
      siteContent: snap.site_contents,
      navigationMenus: activeNavigationMenus,
      categories: categoriesWithCount,
      featuredProducts,
      banners: activeBanners,
      shippingSettings: snap.shipping_settings.filter((s) => s.active),
    });
  });

  // ================= PUBLIC PRODUCTS CATALOG =================
  router.get('/products', (req, res) => {
    const snap = db.getSnapshot();
    const search = String(req.query.search || '').trim().toLowerCase();
    const categoryId = String(req.query.categoryId || '').trim();
    const availability = String(req.query.availability || 'all');
    const sort = String(req.query.sort || 'newest');
    const minPrice = Number(req.query.minPrice || 0);
    const maxPrice = Number(req.query.maxPrice || 0);
    const page = Math.max(1, Math.floor(Number(req.query.page || 1)));
    const limit = Math.min(48, Math.max(1, Math.floor(Number(req.query.limit || 12))));

    const activeVariants = snap.product_variants.filter((v) => v.active);

    let items = snap.products.filter(
      (p) =>
        p.active &&
        !p.archived &&
        p.publicationStatus !== 'draft' &&
        p.publicationStatus !== 'inactive'
    );

    if (search) {
      items = items.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description.toLowerCase().includes(search) ||
          (p.subscriptionDuration || '').toLowerCase().includes(search)
      );
    }

    if (categoryId && categoryId !== 'all') {
      items = items.filter((p) => p.categoryId === categoryId);
    }

    if (availability === 'in_stock') {
      items = items.filter((p) => p.stock > 0 && p.availabilityStatus !== 'out_of_stock');
    } else if (availability === 'limited') {
      items = items.filter((p) => p.availabilityStatus === 'limited' || (p.stock > 0 && p.stock <= 5));
    } else if (availability === 'out_of_stock') {
      items = items.filter((p) => p.stock <= 0 || p.availabilityStatus === 'out_of_stock');
    }

    const effectivePrice = (p: Product) =>
      typeof p.discountPrice === 'number' && p.discountPrice < p.price ? p.discountPrice : p.price;

    if (Number.isFinite(minPrice) && minPrice > 0) {
      items = items.filter((p) => effectivePrice(p) >= minPrice);
    }
    if (Number.isFinite(maxPrice) && maxPrice > 0) {
      items = items.filter((p) => effectivePrice(p) <= maxPrice);
    }

    if (sort === 'price_asc') {
      items.sort((a, b) => effectivePrice(a) - effectivePrice(b));
    } else if (sort === 'price_desc') {
      items.sort((a, b) => effectivePrice(b) - effectivePrice(a));
    } else if (sort === 'best_seller' || sort === 'popular') {
      items.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
    } else if (sort === 'rating') {
      items.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    } else {
      items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    }

    const total = items.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const offset = (safePage - 1) * limit;
    const paged = items.slice(offset, offset + limit).map((p) => ({
      ...p,
      variants: activeVariants.filter((v) => v.productId === p.id),
    }));

    res.json({
      products: paged,
      total,
      page: safePage,
      totalPages,
      categories: snap.categories.filter((c) => c.active).sort((a, b) => a.sortOrder - b.sortOrder),
    });
  });

  router.get('/products/:slug', (req, res) => {
    const snap = db.getSnapshot();
    const isVisiblePublic = (p: Product) =>
      p.active &&
      !p.archived &&
      p.publicationStatus !== 'draft' &&
      p.publicationStatus !== 'inactive';
    const product = snap.products.find(
      (p) => isVisiblePublic(p) && (p.slug === req.params.slug || p.id === req.params.slug)
    );
    if (!product) {
      res.status(404).json({ error: 'Produk tidak ditemukan.' });
      return;
    }

    const activeVariants = snap.product_variants.filter((v) => v.active);
    const category = snap.categories.find((c) => c.id === product.categoryId) || null;
    const related = snap.products
      .filter((p) => isVisiblePublic(p) && p.id !== product.id && p.categoryId === product.categoryId)
      .slice(0, 4)
      .map((p) => ({
        ...p,
        variants: activeVariants.filter((v) => v.productId === p.id),
      }));

    res.json({
      product: {
        ...product,
        variants: activeVariants.filter((v) => v.productId === product.id),
      },
      category,
      related,
    });
  });

  // ================= SERVER-SIDE DISCOUNT VALIDATION =================
  router.post('/discounts/validate', async (req, res) => {
    const ip = getClientIp(req);
    const rate = receiptRateLimiter.consume(`discount:${ip}`);
    if (!rate.allowed) {
      res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi sebentar lagi.' });
      return;
    }

    const snap = db.getSnapshot();
    const user = await resolveUserFromRequest(req);
    const isReseller = Boolean(user?.role === 'reseller' && user?.resellerStatus === 'active');
    const { code, items, customerWhatsapp } = req.body || {};

    const cartResult = computeServerSideCart(items || [], snap.products, snap.product_variants, {
      isReseller,
    });
    if (cartResult.ok === false) {
      res.status(400).json({ valid: false, message: cartResult.error });
      return;
    }

    const validation = validateDiscountCode({
      rawCode: code,
      discountCodes: snap.discount_codes,
      discountUsages: snap.discount_usages,
      pricedItems: cartResult.data.items,
      customerWhatsapp,
      isReseller,
      allowResellerStackPromo: Boolean(snap.store_settings.allowResellerStackPromo),
    });

    if (validation.valid === false) {
      res.json({
        valid: false,
        codeStatus: validation.codeStatus,
        discountAmount: 0,
        message: validation.message,
      });
      return;
    }

    res.json({
      valid: true,
      code: validation.discount.code,
      promoName: validation.discount.promoName,
      discountAmount: validation.discountAmount,
      message: validation.message,
    });
  });

  // ================= CHECKOUT (TRANSACTIONAL & IDEMPOTENT) =================
  router.post('/checkout', async (req, res) => {
    const ip = getClientIp(req);
    const rate = checkoutRateLimiter.consume(`checkout:${ip}`);
    if (!rate.allowed) {
      res.status(429).json({ error: `Terlalu banyak permintaan checkout. Coba lagi dalam ${rate.retryAfterSec} detik.` });
      return;
    }

    try {
      const buyer = await resolveUserFromRequest(req);
      const isReseller = Boolean(buyer?.role === 'reseller' && buyer?.resellerStatus === 'active');

      const body = req.body || {};
      const requestedPaymentMethod =
        body.paymentMethod === 'WALLET' ? 'WALLET' : 'QRIS';
      const idempotencyKey = sanitizeText(body.idempotencyKey || '', 128);
      const customerName = sanitizeText(body.customerName || '', 120);
      const rawWhatsapp = sanitizeText(body.customerWhatsapp || '', 30);
      const customerEmail = sanitizeText(body.customerEmail || '', 254);
      const shippingMethodId = sanitizeText(body.shippingMethodId || '', 80);
      const shippingAddress = sanitizeText(body.shippingAddress || '', 600);
      const orderNotes = sanitizeText(body.orderNotes || '', 500);
      const couponCodeRaw = sanitizeText(body.couponCode || '', 40);
      const referralCodeRaw = sanitizeText(body.referralCode || '', 40).toUpperCase();
      const requestedItems = Array.isArray(body.items) ? body.items : [];

      if (requestedPaymentMethod === 'WALLET') {
        if (!buyer || buyer.role !== 'reseller') {
          res.status(403).json({
            error: 'Pembayaran menggunakan Reseller Wallet hanya tersedia untuk akun reseller aktif.',
          });
          return;
        }
        if (buyer.resellerStatus !== 'active') {
          res.status(403).json({
            error:
              buyer.resellerStatus === 'banned'
                ? 'Akun reseller Anda telah diblokir permanen.'
                : buyer.resellerStatus === 'rejected'
                  ? 'Pendaftaran akun reseller Anda ditolak oleh admin.'
                  : buyer.resellerStatus === 'pending_approval'
                    ? 'Pendaftaran akun reseller Anda masih menunggu persetujuan admin.'
                    : 'Akun reseller Anda sedang dinonaktifkan sementara oleh admin.',
          });
          return;
        }
      }

      if (!customerName || customerName.length < 2) {
        res.status(400).json({ error: 'Nama lengkap wajib diisi minimal 2 karakter.' });
        return;
      }
      if (!isValidWhatsappNumber(rawWhatsapp)) {
        res.status(400).json({ error: 'Nomor WhatsApp tidak valid. Gunakan format Indonesia, misalnya 087738172871.' });
        return;
      }
      const customerWhatsapp = normalizeWhatsappNumber(rawWhatsapp);

      const rtMeta: RealtimeMutationMeta = {
        areas: ['orders', 'payments', 'products', 'overview', 'logs'],
      };

      const result = await db.withTransaction((draft) => {
        if (idempotencyKey) {
          const existingOrder = draft.orders.find((o) => o.idempotencyKey === idempotencyKey);
          if (existingOrder) {
            rtMeta.areas = [];
            return {
              duplicate: true,
              orderId: existingOrder.id,
              orderNumber: existingOrder.orderNumber,
              totalAmount: existingOrder.totalAmount,
              paymentMethod: existingOrder.paymentMethod || 'QRIS',
              paymentStatus: existingOrder.paymentStatus,
              pricingTier: existingOrder.pricingTier,
            };
          }
        }

        if (
          requestedPaymentMethod === 'QRIS' &&
          (!draft.store_settings.qrisEnabled || !isQrisImageAvailable(draft.store_settings.qrisImageUrl))
        ) {
          throw Object.assign(
            new Error('Pembayaran QRIS sedang tidak tersedia. Silakan hubungi admin untuk informasi lebih lanjut.'),
            { statusCode: 503 }
          );
        }

        const cartCheck = computeServerSideCart(
          requestedItems,
          draft.products,
          draft.product_variants,
          { isReseller }
        );
        if (cartCheck.ok === false) {
          throw Object.assign(new Error(cartCheck.error), { statusCode: 400 });
        }

        const shippingOption: ShippingSetting | undefined = draft.shipping_settings.find(
          (s) => s.id === shippingMethodId && s.active
        );
        if (!shippingOption) {
          throw Object.assign(new Error('Silakan pilih metode pengiriman yang valid.'), { statusCode: 400 });
        }

        const needsAddress = shippingOption.requiresAddress && cartCheck.data.requiresShippingAddress;
        if (needsAddress && shippingAddress.length < 10) {
          throw Object.assign(
            new Error('Alamat pengiriman wajib diisi lengkap untuk metode pengiriman ini.'),
            { statusCode: 400 }
          );
        }

        let couponDiscount = 0;
        let appliedDiscount: DiscountCode | null = null;
        if (couponCodeRaw) {
          const discRes = validateDiscountCode({
            rawCode: couponCodeRaw,
            discountCodes: draft.discount_codes,
            discountUsages: draft.discount_usages,
            pricedItems: cartCheck.data.items,
            customerWhatsapp,
            isReseller,
            allowResellerStackPromo: Boolean(draft.store_settings.allowResellerStackPromo),
          });
          if (discRes.valid === false) {
            throw Object.assign(new Error(discRes.message), { statusCode: 400 });
          }
          couponDiscount = discRes.discountAmount;
          appliedDiscount = discRes.discount;
        }

        // Referral attribution with strict anti-self-referral check
        let attributedResellerId: string | undefined;
        let referralCodeUsed: string | undefined;
        if (referralCodeRaw) {
          const matchedReseller = draft.reseller_profiles.find(
            (r) => r.status === 'active' && r.referralCode.toUpperCase() === referralCodeRaw
          );
          if (matchedReseller) {
            const resellerUser = draft.users.find((u) => u.id === matchedReseller.userId);
            const isSelfById = Boolean(buyer?.id && matchedReseller.userId === buyer.id);
            const isSelfByWa = Boolean(
              resellerUser && normalizeWhatsappNumber(resellerUser.whatsapp) === customerWhatsapp
            );
            const isSelfByEmail = Boolean(
              resellerUser &&
                customerEmail &&
                resellerUser.email.toLowerCase() === customerEmail.toLowerCase()
            );
            if (!isSelfById && !isSelfByWa && !isSelfByEmail) {
              attributedResellerId = matchedReseller.id;
              referralCodeUsed = matchedReseller.referralCode;
            }
          }
        }

        const totals = calculateOrderTotals({
          subtotalAfterProductDiscount: cartCheck.data.subtotalAfterProductDiscount,
          couponDiscount,
          shippingSetting: shippingOption,
          taxPercent: draft.store_settings.taxPercent || 0,
        });

        const now = new Date().toISOString();

        // Check wallet balance BEFORE mutating stock/coupons when using Reseller Wallet
        let walletTxId: string | undefined;
        let activeResellerProfile = buyer
          ? draft.reseller_profiles.find((p) => p.userId === buyer.id && p.status === 'active')
          : undefined;
        if (requestedPaymentMethod === 'WALLET') {
          if (!activeResellerProfile) {
            throw Object.assign(
              new Error('Akun reseller Anda tidak aktif untuk transaksi wallet.'),
              { statusCode: 403 }
            );
          }
          const wallet = ensureResellerWallet(draft, activeResellerProfile, now);
          if (wallet.balance < totals.totalAmount) {
            throw Object.assign(
              new Error('Saldo Anda tidak mencukupi untuk melakukan transaksi ini.'),
              {
                statusCode: 400,
                code: 'INSUFFICIENT_WALLET_BALANCE',
                currentBalance: wallet.balance,
                requiredAmount: totals.totalAmount,
                shortfallAmount: Math.max(0, totals.totalAmount - wallet.balance),
              }
            );
          }
        }

        draft.order_sequence += 1;
        const orderNumber = generateOrderNumber(draft.order_sequence);
        const orderId = `ord-${crypto.randomUUID()}`;
        const rawToken = generateReceiptToken();
        const tokenHash = hashReceiptToken(rawToken);
        const tokenMasked = maskReceiptToken(rawToken);

        // Deduct wallet atomically inside the same transaction if paying by WALLET
        if (requestedPaymentMethod === 'WALLET' && activeResellerProfile) {
          const wallet = ensureResellerWallet(draft, activeResellerProfile, now);
          const balanceBefore = wallet.balance;
          const balanceAfter = balanceBefore - totals.totalAmount;
          wallet.balance = balanceAfter;
          wallet.totalSpent += totals.totalAmount;
          wallet.totalTransactions += 1;
          wallet.updatedAt = now;

          const tx = recordWalletTransaction(draft, {
            resellerId: activeResellerProfile.id,
            userId: activeResellerProfile.userId,
            type: 'purchase',
            amount: totals.totalAmount,
            balanceBefore,
            balanceAfter,
            referenceType: 'order',
            referenceId: orderId,
            description: `Pembelian Produk (${orderNumber}) via Reseller Wallet`,
            actorId: buyer?.id,
            actorName: buyer?.username,
            now,
          });
          walletTxId = tx.id;
        }

        // Decrement stock atomically and log inventory movement
        for (const item of cartCheck.data.items) {
          const prod = draft.products.find((p) => p.id === item.product.id)!;
          const prevProdStock = prod.stock;
          prod.stock = Math.max(0, prod.stock - item.quantity);
          if (requestedPaymentMethod === 'WALLET') {
            prod.soldCount = (prod.soldCount || 0) + item.quantity;
          }
          prod.updatedAt = now;

          if (item.variant) {
            const variant = draft.product_variants.find((v) => v.id === item.variant!.id)!;
            const prevVarStock = variant.stock;
            variant.stock = Math.max(0, variant.stock - item.quantity);
            draft.inventory_logs.unshift({
              id: `inv-${crypto.randomUUID()}`,
              productId: prod.id,
              productName: prod.name,
              variantId: variant.id,
              delta: -item.quantity,
              previousStock: prevVarStock,
              newStock: variant.stock,
              reason: `Checkout ${orderNumber} (${variant.name})`,
              orderId,
              actor: requestedPaymentMethod === 'WALLET' ? 'system:wallet-checkout' : 'system:checkout',
              createdAt: now,
            });
          } else {
            draft.inventory_logs.unshift({
              id: `inv-${crypto.randomUUID()}`,
              productId: prod.id,
              productName: prod.name,
              delta: -item.quantity,
              previousStock: prevProdStock,
              newStock: prod.stock,
              reason: `Checkout ${orderNumber}`,
              orderId,
              actor: requestedPaymentMethod === 'WALLET' ? 'system:wallet-checkout' : 'system:checkout',
              createdAt: now,
            });
          }
        }

        // Consume discount quota atomically
        if (appliedDiscount) {
          const disc = draft.discount_codes.find((d) => d.id === appliedDiscount!.id)!;
          disc.usedCount += 1;
          disc.updatedAt = now;
          draft.discount_usages.push({
            id: `du-${crypto.randomUUID()}`,
            discountCodeId: disc.id,
            code: disc.code,
            orderId,
            orderNumber,
            customerWhatsapp,
            discountAmount: couponDiscount,
            createdAt: now,
          });
        }

        // Upsert customer record
        let customer = draft.customers.find(
          (c) => normalizeWhatsappNumber(c.whatsapp) === customerWhatsapp
        );
        if (!customer) {
          customer = {
            id: `cust-${crypto.randomUUID()}`,
            name: customerName,
            whatsapp: customerWhatsapp,
            email: customerEmail || undefined,
            totalOrders: 0,
            totalSpent: 0,
            lastOrderAt: now,
          };
          draft.customers.push(customer);
        }
        customer.name = customerName;
        if (customerEmail) customer.email = customerEmail;
        customer.totalOrders += 1;
        customer.totalSpent += totals.totalAmount;
        customer.lastOrderAt = now;

        const isWalletPaid = requestedPaymentMethod === 'WALLET';
        const order: Order = {
          id: orderId,
          orderNumber,
          idempotencyKey: idempotencyKey || `auto-${orderId}`,
          buyerUserId: buyer?.id,
          buyerType: isReseller ? 'reseller' : 'customer',
          pricingTier: cartCheck.data.pricingTier,
          attributedResellerId,
          referralCodeUsed,
          customerId: customer.id,
          customerName,
          customerWhatsapp,
          customerEmail: customerEmail || undefined,
          shippingAddress: shippingAddress || undefined,
          shippingMethodId: shippingOption.id,
          shippingMethodName: shippingOption.name,
          orderNotes: orderNotes || undefined,
          subtotal: cartCheck.data.subtotalOriginal,
          productDiscountTotal: cartCheck.data.productDiscountTotal,
          resellerDiscountTotal: cartCheck.data.resellerDiscountTotal,
          couponCode: appliedDiscount ? appliedDiscount.code : undefined,
          couponDiscount,
          shippingCost: totals.shippingCost,
          taxAmount: totals.taxAmount,
          totalAmount: totals.totalAmount,
          paymentMethod: requestedPaymentMethod,
          paymentStatus: isWalletPaid ? 'paid' : 'unpaid',
          orderStatus: isWalletPaid ? 'processing' : 'pending_payment',
          walletTransactionId: walletTxId,
          walletRefunded: false,
          receiptTokenHash: tokenHash,
          receiptTokenMasked: tokenMasked,
          receiptActive: true,
          createdAt: now,
          updatedAt: now,
        };
        draft.orders.unshift(order);

        const orderItems: OrderItemSnapshot[] = cartCheck.data.items.map((item) => ({
          id: `oi-${crypto.randomUUID()}`,
          orderId,
          productId: item.product.id,
          productNameSnapshot: item.product.name,
          productImageSnapshot: item.product.imageUrl,
          variantId: item.variant?.id,
          variantNameSnapshot: item.variant?.name,
          unitPriceSnapshot: item.effectiveUnitPrice,
          originalUnitPriceSnapshot: item.originalUnitPrice,
          pricingTierSnapshot: item.pricingTier,
          quantity: item.quantity,
          lineSubtotal: item.lineSubtotal,
        }));
        draft.order_items.push(...orderItems);

        const payment: Payment = {
          id: `pay-${crypto.randomUUID()}`,
          orderId,
          orderNumber,
          method: requestedPaymentMethod,
          expectedAmount: totals.totalAmount,
          confirmedAmount: isWalletPaid ? totals.totalAmount : undefined,
          status: isWalletPaid ? 'paid' : 'unpaid',
          verifiedAt: isWalletPaid ? now : undefined,
          createdAt: now,
          updatedAt: now,
        };
        draft.payments.unshift(payment);

        const remainingWalletBalance =
          isWalletPaid && activeResellerProfile
            ? ensureResellerWallet(draft, activeResellerProfile, now).balance
            : undefined;

        rtMeta.targetUserId = buyer?.id;
        rtMeta.targetResellerId = activeResellerProfile?.id || attributedResellerId;
        rtMeta.orderId = orderId;
        rtMeta.receiptTokenHash = tokenHash;
        rtMeta.summary = `Pesanan baru ${orderNumber} (${requestedPaymentMethod})`;
        if (isWalletPaid) {
          rtMeta.areas.push('reseller_wallet', 'resellers');
        }
        if (appliedDiscount) {
          rtMeta.areas.push('discounts');
        }

        return {
          duplicate: false,
          orderId,
          orderNumber,
          receiptToken: rawToken,
          totalAmount: totals.totalAmount,
          pricingTier: order.pricingTier,
          paymentMethod: requestedPaymentMethod,
          paymentStatus: order.paymentStatus,
          walletBalance: remainingWalletBalance,
        };
      }, rtMeta);

      res.status(result.duplicate ? 200 : 201).json(result);
    } catch (err: any) {
      const code = typeof err?.statusCode === 'number' ? err.statusCode : 500;
      res.status(code).json({
        error: err?.message || 'Gagal memproses checkout. Silakan coba kembali.',
        ...(err?.code ? { code: err.code } : {}),
        ...(typeof err?.currentBalance === 'number' ? { currentBalance: err.currentBalance } : {}),
        ...(typeof err?.requiredAmount === 'number' ? { requiredAmount: err.requiredAmount } : {}),
        ...(typeof err?.shortfallAmount === 'number' ? { shortfallAmount: err.shortfallAmount } : {}),
      });
    }
  });

  // ================= SCOPED PAYMENT PAGE DATA =================
  router.get('/orders/:orderId/payment', (req, res) => {
    const snap = db.getSnapshot();
    const order = snap.orders.find(
      (o) => o.id === req.params.orderId || o.orderNumber === req.params.orderId
    );
    if (!order) {
      res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
      return;
    }

    const items = snap.order_items.filter((i) => i.orderId === order.id);
    const payment = snap.payments.find((p) => p.orderId === order.id);
    const qrisReady =
      snap.store_settings.qrisEnabled && isQrisImageAvailable(snap.store_settings.qrisImageUrl);

    res.setHeader('Cache-Control', 'no-store');
    res.json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      maskedWhatsapp: maskWhatsappNumber(order.customerWhatsapp),
      items,
      subtotal: order.subtotal,
      productDiscountTotal: order.productDiscountTotal,
      resellerDiscountTotal: order.resellerDiscountTotal || 0,
      pricingTier: order.pricingTier || 'normal',
      couponCode: order.couponCode,
      couponDiscount: order.couponDiscount,
      shippingCost: order.shippingCost,
      taxAmount: order.taxAmount,
      totalAmount: order.totalAmount,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      rejectionReason: order.rejectionReason || payment?.rejectionReason,
      createdAt: order.createdAt,
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

  // ================= PAYMENT CONFIRMATION & FILE UPLOAD =================
  router.post('/payments/confirm', handleSingleFileUpload('proof'), async (req, res) => {
    try {
      const body = req.body || {};
      const orderId = sanitizeText(body.orderId || '', 128);
      const payerName = sanitizeText(body.payerName || '', 120);
      const rawWhatsapp = sanitizeText(body.payerWhatsapp || '', 30);
      const paymentTime = sanitizeText(body.paymentTime || '', 80);
      const paidAmount = Number(body.paidAmount);
      const notes = sanitizeText(body.notes || '', 500);
      const providedToken = sanitizeText(body.receiptToken || '', 200);

      if (!orderId) {
        res.status(400).json({ error: 'ID pesanan wajib disertakan.' });
        return;
      }
      if (!payerName || payerName.length < 2) {
        res.status(400).json({ error: 'Nama pembayar wajib diisi.' });
        return;
      }
      if (!isValidWhatsappNumber(rawWhatsapp)) {
        res.status(400).json({ error: 'Nomor WhatsApp pembayar tidak valid.' });
        return;
      }
      if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
        res.status(400).json({ error: 'Nominal yang dibayarkan tidak valid.' });
        return;
      }

      let proofUrl: string | undefined;
      let proofMimeType: string | undefined;

      if (req.file) {
        const magic = validateUploadedFileMagicBytes(req.file.buffer, ['jpg', 'png', 'pdf']);
        if (magic.ok === false) {
          res.status(400).json({ error: magic.error });
          return;
        }
        const proofsDir = path.resolve(process.cwd(), 'uploads', 'proofs');
        fs.mkdirSync(proofsDir, { recursive: true });
        const fileName = `proof-${crypto.randomUUID()}.${magic.ext}`;
        fs.writeFileSync(path.join(proofsDir, fileName), req.file.buffer);
        proofUrl = `/uploads/proofs/${fileName}`;
        proofMimeType = magic.mime;
      }

      const normalizedPayerWa = normalizeWhatsappNumber(rawWhatsapp);
      const now = new Date().toISOString();

      const rtMeta: RealtimeMutationMeta = {
        areas: ['orders', 'payments', 'overview'],
      };

      const result = await db.withTransaction((draft) => {
        const order = draft.orders.find(
          (o) => o.id === orderId || o.orderNumber === orderId
        );
        if (!order) {
          throw Object.assign(new Error('Pesanan tidak ditemukan.'), { statusCode: 404 });
        }
        if (order.orderStatus === 'cancelled' || order.orderStatus === 'completed') {
          throw Object.assign(
            new Error('Pesanan ini sudah dibatalkan atau selesai sehingga tidak dapat dikonfirmasi.'),
            { statusCode: 400 }
          );
        }
        if (order.paymentStatus === 'paid') {
          throw Object.assign(new Error('Pembayaran pesanan ini sudah terverifikasi lunas.'), {
            statusCode: 400,
          });
        }

        // Verify ownership via receiptToken OR matching WhatsApp while unpaid/rejected
        let activeReceiptToken = providedToken;
        const tokenMatches =
          Boolean(providedToken) &&
          timingSafeEqualHex(hashReceiptToken(providedToken), order.receiptTokenHash);

        if (!tokenMatches) {
          if (
            (order.paymentStatus === 'unpaid' || order.paymentStatus === 'rejected') &&
            normalizeWhatsappNumber(order.customerWhatsapp) === normalizedPayerWa
          ) {
            activeReceiptToken = generateReceiptToken();
            order.receiptTokenHash = hashReceiptToken(activeReceiptToken);
            order.receiptTokenMasked = maskReceiptToken(activeReceiptToken);
          } else {
            throw Object.assign(
              new Error('Nomor WhatsApp atau kode akses pesanan tidak sesuai dengan data transaksi.'),
              { statusCode: 403 }
            );
          }
        }

        const confirmation: PaymentConfirmation = {
          id: `pconf-${crypto.randomUUID()}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          payerName,
          payerWhatsapp: normalizedPayerWa,
          paymentTime: paymentTime || formatJakartaTimestamp(now),
          method: 'QRIS',
          paidAmount: Math.round(paidAmount),
          proofUrl,
          proofMimeType,
          notes: notes || undefined,
          createdAt: now,
        };
        draft.payment_confirmations.unshift(confirmation);

        // NEVER auto-mark as paid; always set pending_verification
        order.paymentStatus = 'pending_verification';
        order.rejectionReason = undefined;
        order.updatedAt = now;

        const payment = draft.payments.find((p) => p.orderId === order.id);
        if (payment) {
          payment.status = 'pending_verification';
          payment.confirmedAmount = Math.round(paidAmount);
          payment.rejectionReason = undefined;
          payment.updatedAt = now;
        }

        rtMeta.targetUserId = order.buyerUserId;
        rtMeta.orderId = order.id;
        rtMeta.receiptTokenHash = order.receiptTokenHash;
        rtMeta.summary = `Konfirmasi pembayaran QRIS ${order.orderNumber}`;

        const items = draft.order_items.filter((i) => i.orderId === order.id);
        return {
          order,
          items,
          confirmation,
          receiptToken: activeReceiptToken,
          storeWhatsapp: draft.store_settings.whatsappNumber,
        };
      }, rtMeta);

      const baseUrl = getPublicBaseUrl(req);
      const receiptUrl = `${baseUrl}/resi/${encodeURIComponent(result.receiptToken)}`;
      const waMessage = buildWhatsAppConfirmationMessage({
        orderNumber: result.order.orderNumber,
        customerName: result.order.customerName,
        customerWhatsapp: result.order.customerWhatsapp,
        items: result.items,
        totalAmount: result.order.totalAmount,
        confirmationTime: formatJakartaTimestamp(result.confirmation.createdAt),
        receiptUrl,
        receiptToken: result.receiptToken,
      });
      const whatsappUrl = buildWhatsAppConfirmationUrl(result.storeWhatsapp, waMessage);

      res.status(201).json({
        ok: true,
        orderId: result.order.id,
        orderNumber: result.order.orderNumber,
        paymentStatus: result.order.paymentStatus,
        receiptToken: result.receiptToken,
        receiptUrl,
        whatsappUrl,
        whatsappMessage: waMessage,
      });
    } catch (err: any) {
      if (err?.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Ukuran bukti pembayaran maksimal 5MB.' });
        return;
      }
      const code = typeof err?.statusCode === 'number' ? err.statusCode : 500;
      res.status(code).json({
        error: err?.message || 'Gagal mengirim konfirmasi pembayaran.',
      });
    }
  });

  // ================= RECEIPT TOKEN LOOKUP (RATE LIMITED & SANITIZED) =================
  router.post('/receipts/lookup', (req, res) => {
    const ip = getClientIp(req);
    const rate = receiptRateLimiter.consume(`receipt-lookup:${ip}`);
    if (!rate.allowed) {
      res.status(429).json({
        error: `Terlalu banyak percobaan pencarian resi. Coba lagi dalam ${rate.retryAfterSec} detik.`,
      });
      return;
    }

    const query = sanitizeText(req.body?.query || '', 200);
    if (!query) {
      res.status(400).json({ error: 'RESI TIDAK DITEMUKAN ATAU KODE AKSES TIDAK VALID.' });
      return;
    }

    // Extract token if full URL was pasted
    let candidateToken = query;
    const urlMatch = query.match(/\/resi\/([^/?#]+)/i);
    if (urlMatch && urlMatch[1]) {
      candidateToken = decodeURIComponent(urlMatch[1]);
    }

    if (candidateToken.startsWith('CTR-')) {
      res.status(400).json({
        error:
          'Untuk keamanan privasi transaksi, silakan masukkan Kode Akses Resi unik (diawali CTRZ-...) atau buka tautan resi lengkap Anda.',
      });
      return;
    }

    const snap = db.getSnapshot();
    const targetHash = hashReceiptToken(candidateToken);
    const order = snap.orders.find(
      (o) => o.receiptActive && timingSafeEqualHex(o.receiptTokenHash, targetHash)
    );

    if (!order) {
      res.status(404).json({ error: 'RESI TIDAK DITEMUKAN ATAU KODE AKSES TIDAK VALID.' });
      return;
    }

    res.json({ ok: true, token: candidateToken });
  });

  router.get('/receipts/:token', (req, res) => {
    const ip = getClientIp(req);
    const rate = receiptRateLimiter.consume(`receipt-get:${ip}`);
    if (!rate.allowed) {
      res.status(429).json({
        error: `Terlalu banyak permintaan resi. Coba lagi dalam ${rate.retryAfterSec} detik.`,
      });
      return;
    }

    const rawToken = sanitizeText(req.params.token || '', 200);
    if (!rawToken) {
      res.status(404).json({ error: 'RESI TIDAK DITEMUKAN ATAU KODE AKSES TIDAK VALID.' });
      return;
    }

    const snap = db.getSnapshot();
    const targetHash = hashReceiptToken(rawToken);
    const order = snap.orders.find(
      (o) => o.receiptActive && timingSafeEqualHex(o.receiptTokenHash, targetHash)
    );

    if (!order) {
      res.status(404).json({ error: 'RESI TIDAK DITEMUKAN ATAU KODE AKSES TIDAK VALID.' });
      return;
    }

    const items = snap.order_items.filter((i) => i.orderId === order.id);
    const payment = snap.payments.find((p) => p.orderId === order.id);
    const confirmation = snap.payment_confirmations.find((c) => c.orderId === order.id);

    const view: PublicReceiptView = {
      orderNumber: order.orderNumber,
      createdAt: order.createdAt,
      customerName: order.customerName,
      maskedWhatsapp: maskWhatsappNumber(order.customerWhatsapp),
      shippingMethodName: order.shippingMethodName,
      trackingNumber: order.trackingNumber,
      shippingAddressMasked: maskAddress(order.shippingAddress),
      items,
      subtotal: order.subtotal,
      productDiscountTotal: order.productDiscountTotal,
      resellerDiscountTotal: order.resellerDiscountTotal || 0,
      pricingTier: order.pricingTier || 'normal',
      couponCode: order.couponCode,
      couponDiscount: order.couponDiscount,
      shippingCost: order.shippingCost,
      taxAmount: order.taxAmount,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod || 'QRIS',
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      confirmedAt: confirmation?.createdAt,
      verifiedAt: payment?.verifiedAt,
      rejectionReason: order.rejectionReason || payment?.rejectionReason,
      receiptTokenMasked: order.receiptTokenMasked,
      timeline: buildOrderTimeline(order, payment, confirmation),
    };

    res.json({
      receipt: view,
      storeSettings: {
        storeName: snap.store_settings.storeName,
        whatsappNumber: snap.store_settings.whatsappNumber,
        email: snap.store_settings.email,
        address: snap.store_settings.address,
      },
    });
  });

  // ================= ADMIN CREDENTIAL AUTH (LOGIN / LOGOUT) =================
  router.post('/admin/login', async (req, res) => {
    const ip = getClientIp(req);
    const rate = loginRateLimiter.consume(`admin-login:${ip}`);
    if (!rate.allowed) {
      res.status(429).json({
        error: `Terlalu banyak percobaan login. Silakan tunggu ${rate.retryAfterSec} detik.`,
      });
      return;
    }

    const username = sanitizeText(req.body?.username || '', 80);
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!username || !password) {
      res.status(400).json({ error: 'Username dan password wajib diisi.' });
      return;
    }

    const snap = db.getSnapshot();
    const account = snap.admin_accounts.find(
      (a) => a.username.toLowerCase() === username.toLowerCase()
    );

    if (!account) {
      res.status(401).json({
        error: 'Username atau password admin salah.',
        code: 'invalid_credentials',
      });
      return;
    }

    if (!account.active) {
      res.status(403).json({
        error: 'Akun dinonaktifkan.',
        code: 'disabled',
      });
      return;
    }

    if (!verifyPassword(password, account.passwordSalt, account.passwordHash)) {
      res.status(401).json({
        error: 'Username atau password admin salah.',
        code: 'invalid_credentials',
      });
      return;
    }

    const sessionToken = signAdminSessionToken({
      uid: account.id,
      username: account.username,
      role: account.role,
    });

    await db.withTransaction(
      (draft) => {
        appendAuditLog(
          draft,
          { uid: account.id, email: account.username },
          'ADMIN_LOGIN',
          'admin',
          account.id,
          `Admin "${account.username}" berhasil login ke dashboard.`
        );
      },
      { areas: ['logs'] }
    );

    res.setHeader(
      'Set-Cookie',
      buildSessionCookie(req, ADMIN_SESSION_COOKIE, sessionToken, 86400)
    );
    res.json({
      ok: true,
      admin: {
        uid: account.id,
        username: account.username,
        email: `${account.username} (Admin)`,
        role: account.role,
        authMethod: 'session',
      },
    });
  });

  router.post('/admin/logout', (req, res) => {
    res.setHeader(
      'Set-Cookie',
      buildSessionCookie(req, ADMIN_SESSION_COOKIE, '', 0)
    );
    res.json({ ok: true });
  });

  router.get('/admin/session', async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    const { admin, reason } = await resolveAdminWithReason(req);
    res.json({ authenticated: Boolean(admin), admin, reason });
  });

  // ================= ADMIN AUTHENTICATED ROUTES =================
  router.use('/admin', verifyAdminRequest);

  router.get('/admin/me', (req: AuthenticatedRequest, res: Response) => {
    res.json({ admin: req.admin });
  });

  router.post('/admin/change-password', async (req: AuthenticatedRequest, res: Response) => {
    const currentPassword =
      typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    const confirmPassword =
      typeof req.body?.confirmPassword === 'string' ? req.body.confirmPassword : '';

    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'Password saat ini dan password baru wajib diisi.' });
      return;
    }
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
      return;
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      res.status(400).json({ error: 'Konfirmasi password baru tidak cocok.' });
      return;
    }

    try {
      const updatedAccount = await db.withTransaction(
        (draft) => {
          const account = draft.admin_accounts.find(
            (a) =>
              a.active &&
              (a.id === req.admin?.uid ||
                (req.admin?.username && a.username.toLowerCase() === req.admin.username.toLowerCase()))
          );
          if (!account) {
            throw Object.assign(
              new Error('Akun password admin tidak ditemukan untuk sesi ini.'),
              { statusCode: 400 }
            );
          }
          if (!verifyPassword(currentPassword, account.passwordSalt, account.passwordHash)) {
            throw Object.assign(new Error('Password saat ini tidak sesuai.'), { statusCode: 401 });
          }
          const { salt, hash } = hashPassword(newPassword);
          account.passwordSalt = salt;
          account.passwordHash = hash;
          account.updatedAt = new Date().toISOString();

          appendAuditLog(
            draft,
            req.admin!,
            'ADMIN_CHANGE_PASSWORD',
            'admin',
            account.id,
            `Admin "${account.username}" memperbarui password login.`
          );
          return account;
        },
        { areas: ['logs'] }
      );

      const refreshedToken = signAdminSessionToken({
        uid: updatedAccount.id,
        username: updatedAccount.username,
        role: updatedAccount.role,
      });
      res.setHeader(
        'Set-Cookie',
        buildSessionCookie(req, ADMIN_SESSION_COOKIE, refreshedToken, 86400)
      );
      res.json({ ok: true, message: 'Password admin berhasil diperbarui.' });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({
        error: err?.message || 'Gagal mengganti password admin.',
      });
    }
  });

  router.get('/admin/overview', (req: AuthenticatedRequest, res: Response) => {
    const snap = db.getSnapshot();
    const range = String(req.query.range || '30d');
    const customStart = req.query.start ? Date.parse(String(req.query.start)) : NaN;
    const customEnd = req.query.end ? Date.parse(String(req.query.end)) : NaN;

    const now = new Date();
    let startMs = 0;
    let endMs = now.getTime();

    if (range === 'today') {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      startMs = startOfDay.getTime();
    } else if (range === '7d') {
      startMs = now.getTime() - 7 * 86400000;
    } else if (range === '30d') {
      startMs = now.getTime() - 30 * 86400000;
    } else if (range === 'month') {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      startMs = startOfMonth.getTime();
    } else if (range === 'custom' && Number.isFinite(customStart)) {
      startMs = customStart;
      if (Number.isFinite(customEnd)) {
        endMs = customEnd + 86400000 - 1;
      }
    }

    const ordersInRange = snap.orders.filter((o) => {
      const t = Date.parse(o.createdAt);
      return t >= startMs && t <= endMs;
    });

    const paidOrders = ordersInRange.filter(
      (o) => o.paymentStatus === 'paid' && o.orderStatus !== 'cancelled'
    );
    const totalSales = paidOrders.reduce((acc, o) => acc + o.totalAmount, 0);

    // Chart buckets (Daily for last 14 days in range, Weekly, Monthly)
    const dailyMap = new Map<string, { label: string; revenue: number; orders: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
      dailyMap.set(key, { label, revenue: 0, orders: 0 });
    }
    for (const o of ordersInRange) {
      const key = o.createdAt.slice(0, 10);
      const bucket = dailyMap.get(key);
      if (bucket) {
        bucket.orders += 1;
        if (o.paymentStatus === 'paid' && o.orderStatus !== 'cancelled') bucket.revenue += o.totalAmount;
      }
    }

    const monthlyMap = new Map<string, { label: string; revenue: number; orders: number }>();
    for (const o of snap.orders) {
      const key = o.createdAt.slice(0, 7);
      const existing = monthlyMap.get(key) || { label: key, revenue: 0, orders: 0 };
      existing.orders += 1;
      if (o.paymentStatus === 'paid' && o.orderStatus !== 'cancelled') existing.revenue += o.totalAmount;
      monthlyMap.set(key, existing);
    }

    const weeklyMap = new Map<string, { label: string; revenue: number; orders: number }>();
    for (let w = 5; w >= 0; w--) {
      const endW = now.getTime() - w * 7 * 86400000;
      const startW = endW - 7 * 86400000;
      const label = `M-${6 - w}`;
      let revenue = 0;
      let orders = 0;
      for (const o of snap.orders) {
        const t = Date.parse(o.createdAt);
        if (t >= startW && t < endW) {
          orders += 1;
          if (o.paymentStatus === 'paid' && o.orderStatus !== 'cancelled') revenue += o.totalAmount;
        }
      }
      weeklyMap.set(label, { label, revenue, orders });
    }

    const topupFeeStats = computeTopupFeeStats(snap.reseller_topups, {
      range:
        range === 'today' || range === '7d' || range === '30d' || range === 'month' || range === 'custom'
          ? range
          : '30d',
      startDate: req.query.start ? String(req.query.start) : undefined,
      endDate: req.query.end ? String(req.query.end) : undefined,
    });

    const resellerActiveCount = snap.reseller_profiles.filter((r) => r.status === 'active').length;
    const resellerRejectedCount = snap.reseller_profiles.filter((r) => r.status === 'rejected').length;
    const resellerSuspendedCount = snap.reseller_profiles.filter(
      (r) => r.status === 'suspended' || r.status === 'banned'
    ).length;
    const resellerPendingCount = snap.reseller_applications.filter(
      (a) =>
        a.status === 'pending_approval' ||
        a.status === 'pending_verification' ||
        a.status === 'unpaid'
    ).length;

    const qrisReady =
      snap.store_settings.qrisEnabled && isQrisImageAvailable(snap.store_settings.qrisImageUrl);

    res.json({
      stats: {
        totalSales,
        totalTransactions: ordersInRange.length,
        newOrders: ordersInRange.filter((o) => o.orderStatus === 'pending_payment').length,
        waitingPayment: ordersInRange.filter((o) => o.paymentStatus === 'unpaid').length,
        pendingVerification: ordersInRange.filter((o) => o.paymentStatus === 'pending_verification').length,
        paidCount: paidOrders.length,
        processingCount: ordersInRange.filter((o) => o.orderStatus === 'processing').length,
        completedCount: ordersInRange.filter((o) => o.orderStatus === 'completed').length,
        cancelledCount: ordersInRange.filter((o) => o.orderStatus === 'cancelled').length,
        activeProducts: snap.products.filter((p) => p.active).length,
        lowStockProducts: snap.products.filter((p) => p.active && p.stock <= 5).length,
        customerCount: snap.customers.length,
        resellerCount: resellerActiveCount,
        resellerActiveCount,
        resellerRejectedCount,
        resellerSuspendedCount,
        pendingResellerApps: resellerPendingCount,
        resellerPendingCount,
        pendingTopupVerificationCount: topupFeeStats.pendingVerificationCount,
        totalFeeCollected: topupFeeStats.totalFeeCollected,
        qrisEnabled: snap.store_settings.qrisEnabled,
        qrisReady,
        hasDemoData:
          snap.products.some((p) => p.isDemo) ||
          snap.categories.some((c) => c.isDemo) ||
          snap.discount_codes.some((d) => d.isDemo),
      },
      topupFeeStats,
      charts: {
        daily: Array.from(dailyMap.values()),
        weekly: Array.from(weeklyMap.values()),
        monthly: Array.from(monthlyMap.values()).slice(-6),
      },
      recentConfirmations: snap.payment_confirmations.slice(0, 5),
      recentOrders: snap.orders.slice(0, 6).map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        totalAmount: o.totalAmount,
        paymentStatus: o.paymentStatus,
        orderStatus: o.orderStatus,
        createdAt: o.createdAt,
      })),
      recentAuditLogs: snap.audit_logs.slice(0, 8),
    });
  });

  // ================= ADMIN PRODUCTS CRUD =================
  router.get('/admin/products', (_req, res) => {
    const snap = db.getSnapshot();
    const products = snap.products.map((p) => ({
      ...p,
      variants: snap.product_variants.filter((v) => v.productId === p.id),
    }));
    res.json({ products, categories: snap.categories });
  });

  router.post('/admin/products', async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    const name = sanitizeText(body.name || '', 160);
    if (!name) {
      res.status(400).json({ error: 'Nama produk wajib diisi.' });
      return;
    }

    const price = Number(body.price);
    const stock = Math.max(0, Math.floor(Number(body.stock || 0)));
    if (!Number.isFinite(price) || price < 0) {
      res.status(400).json({ error: 'Harga produk tidak valid.' });
      return;
    }

    const created = await db.withTransaction(
      (draft) => {
        const now = new Date().toISOString();
        const id = `prod-${crypto.randomUUID().slice(0, 8)}`;
        const baseSlug = slugify(name) || id;
        const slug = draft.products.some((p) => p.slug === baseSlug) ? `${baseSlug}-${id.slice(-4)}` : baseSlug;

        const availabilityStatus = (
          ['available', 'limited', 'out_of_stock'].includes(body.availabilityStatus)
            ? body.availabilityStatus
            : stock <= 0
              ? 'out_of_stock'
              : stock <= 5
                ? 'limited'
                : 'available'
        ) as Product['availabilityStatus'];

        const publicationStatus = (
          ['draft', 'published', 'inactive'].includes(body.publicationStatus)
            ? body.publicationStatus
            : body.active === false
              ? 'inactive'
              : 'published'
        ) as Product['publicationStatus'];

        const isActive = body.active !== undefined ? Boolean(body.active) : publicationStatus === 'published';

        const product: Product = {
          id,
          name,
          slug,
          description: sanitizeText(body.description || '', 4000),
          additionalInfo: sanitizeText(body.additionalInfo || '', 1000),
          subscriptionDuration: sanitizeText(body.subscriptionDuration || '1 Bulan', 80),
          benefits: Array.isArray(body.benefits)
            ? body.benefits.map((b: unknown) => sanitizeText(b, 300)).filter(Boolean)
            : [],
          activationGuide: sanitizeText(body.activationGuide || '', 2000),
          availabilityStatus,
          categoryId: sanitizeText(body.categoryId || draft.categories[0]?.id || '', 128),
          price: Math.round(price),
          discountPrice:
            body.discountPrice !== null && body.discountPrice !== '' && Number(body.discountPrice) >= 0
              ? Math.round(Number(body.discountPrice))
              : null,
          resellerPrice:
            body.resellerPrice !== null &&
            body.resellerPrice !== '' &&
            body.resellerPrice !== undefined &&
            Number(body.resellerPrice) >= 0
              ? Math.round(Number(body.resellerPrice))
              : calculateResellerPrice(Math.round(price)),
          resellerPriceEnabled: body.resellerPriceEnabled !== false,
          stock,
          soldCount: 0,
          rating: 5.0,
          reviewCount: 0,
          badge: (['', 'Best Seller', 'New', 'Promo'].includes(body.badge) ? body.badge : '') as Product['badge'],
          imageUrl: sanitizeText(body.imageUrl || CAT_AI_CLEAN_IMAGE, 500),
          galleryUrls: Array.isArray(body.galleryUrls)
            ? body.galleryUrls.map((u: unknown) => sanitizeText(u, 500)).filter(Boolean)
            : [],
          featured: Boolean(body.featured),
          active: isActive,
          requiresShipping: Boolean(body.requiresShipping === true),
          labels: Array.isArray(body.labels)
            ? body.labels.map((l: unknown) => sanitizeText(l, 60)).filter(Boolean)
            : [],
          publicationStatus,
          featuredOrder:
            body.featuredOrder !== undefined && Number.isFinite(Number(body.featuredOrder))
              ? Math.round(Number(body.featuredOrder))
              : undefined,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
        };
        draft.products.unshift(product);

        if (Array.isArray(body.variants)) {
          for (const v of body.variants) {
            if (!v?.name) continue;
            const variant: ProductVariant = {
              id: `var-${crypto.randomUUID().slice(0, 8)}`,
              productId: id,
              name: sanitizeText(v.name, 80),
              priceDelta: Math.round(Number(v.priceDelta || 0)),
              stock: Math.max(0, Math.floor(Number(v.stock || 0))),
              active: v.active !== false,
            };
            draft.product_variants.push(variant);
          }
        }

        draft.inventory_logs.unshift({
          id: `inv-${crypto.randomUUID()}`,
          productId: id,
          productName: name,
          delta: stock,
          previousStock: 0,
          newStock: stock,
          reason: 'Produk baru dibuat oleh admin',
          actor: req.admin!.email,
          createdAt: now,
        });

        appendAuditLog(draft, req.admin!, 'CREATE_PRODUCT', 'product', id, `Menambahkan produk "${name}"`);
        return product;
      },
      { areas: ['storefront', 'products', 'overview', 'logs'], summary: `Produk baru "${name}" dibuat` }
    );

    res.status(201).json({ product: created });
  });

  router.put('/admin/products/:id', async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    const productId = req.params.id;
    try {
      const updated = await db.withTransaction(
        (draft) => {
          const prod = draft.products.find((p) => p.id === productId);
          if (!prod) {
            throw Object.assign(new Error('Produk tidak ditemukan.'), { statusCode: 404 });
          }

          const now = new Date().toISOString();
          const prevPrice = prod.price;
          const prevStock = prod.stock;
          const prevActive = prod.active;
          const prevPub = prod.publicationStatus || (prod.active ? 'published' : 'inactive');
          const nextStock =
            body.stock !== undefined ? Math.max(0, Math.floor(Number(body.stock))) : prod.stock;

          if (body.name !== undefined) {
            const cleanName = sanitizeText(body.name, 160);
            if (!cleanName) {
              throw Object.assign(new Error('Nama produk tidak boleh kosong.'), { statusCode: 400 });
            }
            prod.name = cleanName;
          }
          if (body.slug !== undefined) {
            const nextSlug = slugify(String(body.slug));
            if (!nextSlug) {
              throw Object.assign(new Error('Slug produk tidak valid.'), { statusCode: 400 });
            }
            if (draft.products.some((p) => p.id !== prod.id && p.slug === nextSlug)) {
              throw Object.assign(new Error(`Slug "${nextSlug}" sudah digunakan produk lain.`), {
                statusCode: 400,
              });
            }
            prod.slug = nextSlug;
          }
          if (body.description !== undefined) prod.description = sanitizeText(body.description, 4000);
          if (body.additionalInfo !== undefined) prod.additionalInfo = sanitizeText(body.additionalInfo, 1000);
          if (body.subscriptionDuration !== undefined) {
            prod.subscriptionDuration = sanitizeText(body.subscriptionDuration, 80);
          }
          if (Array.isArray(body.benefits)) {
            prod.benefits = body.benefits.map((b: unknown) => sanitizeText(b, 300)).filter(Boolean);
          }
          if (body.activationGuide !== undefined) {
            prod.activationGuide = sanitizeText(body.activationGuide, 2000);
          }
          if (
            body.availabilityStatus &&
            ['available', 'limited', 'out_of_stock'].includes(body.availabilityStatus)
          ) {
            prod.availabilityStatus = body.availabilityStatus;
          }
          if (body.categoryId) prod.categoryId = sanitizeText(body.categoryId, 128);
          if (body.price !== undefined) {
            const nextPrice = Number(body.price);
            if (!Number.isFinite(nextPrice) || nextPrice < 0) {
              throw Object.assign(new Error('Harga produk tidak valid.'), { statusCode: 400 });
            }
            prod.price = Math.round(nextPrice);
          }
          if (body.discountPrice !== undefined) {
            prod.discountPrice =
              body.discountPrice !== null && body.discountPrice !== '' && Number(body.discountPrice) >= 0
                ? Math.round(Number(body.discountPrice))
                : null;
          }
          if (body.resellerPrice !== undefined) {
            prod.resellerPrice =
              body.resellerPrice !== null && body.resellerPrice !== '' && Number(body.resellerPrice) >= 0
                ? Math.round(Number(body.resellerPrice))
                : null;
          }
          if (body.resellerPriceEnabled !== undefined) {
            prod.resellerPriceEnabled = Boolean(body.resellerPriceEnabled);
          }
          prod.stock = nextStock;
          if (body.badge !== undefined && ['', 'Best Seller', 'New', 'Promo'].includes(body.badge)) {
            prod.badge = body.badge;
          }
          if (body.imageUrl !== undefined) prod.imageUrl = sanitizeText(body.imageUrl, 500);
          if (Array.isArray(body.galleryUrls)) {
            prod.galleryUrls = body.galleryUrls.map((u: unknown) => sanitizeText(u, 500)).filter(Boolean);
          }
          if (Array.isArray(body.labels)) {
            prod.labels = body.labels.map((l: unknown) => sanitizeText(l, 60)).filter(Boolean);
          }
          if (
            body.publicationStatus &&
            ['draft', 'published', 'inactive'].includes(body.publicationStatus)
          ) {
            prod.publicationStatus = body.publicationStatus;
          }
          if (body.featuredOrder !== undefined && Number.isFinite(Number(body.featuredOrder))) {
            prod.featuredOrder = Math.round(Number(body.featuredOrder));
          }
          if (body.featured !== undefined) prod.featured = Boolean(body.featured);
          if (body.active !== undefined) prod.active = Boolean(body.active);
          if (prod.active && prod.publicationStatus !== 'inactive') {
            prod.archived = false;
          }
          if (body.requiresShipping !== undefined) prod.requiresShipping = Boolean(body.requiresShipping);
          prod.isDemo = false;
          prod.updatedAt = now;

          if (Array.isArray(body.variants)) {
            draft.product_variants = draft.product_variants.filter((v) => v.productId !== prod.id);
            for (const v of body.variants) {
              if (!v?.name) continue;
              draft.product_variants.push({
                id: v.id || `var-${crypto.randomUUID().slice(0, 8)}`,
                productId: prod.id,
                name: sanitizeText(v.name, 80),
                priceDelta: Math.round(Number(v.priceDelta || 0)),
                stock: Math.max(0, Math.floor(Number(v.stock || 0))),
                active: v.active !== false,
              });
            }
          }

          if (nextStock !== prevStock) {
            draft.inventory_logs.unshift({
              id: `inv-${crypto.randomUUID()}`,
              productId: prod.id,
              productName: prod.name,
              delta: nextStock - prevStock,
              previousStock: prevStock,
              newStock: nextStock,
              reason: 'Pembaruan stok oleh admin',
              actor: req.admin!.email,
              createdAt: now,
            });
          }

          const changes: string[] = [];
          if (prevPrice !== prod.price) changes.push(`harga ${formatIDR(prevPrice)} -> ${formatIDR(prod.price)}`);
          if (prevStock !== prod.stock) changes.push(`stok ${prevStock} -> ${prod.stock}`);
          if (prevActive !== prod.active || prevPub !== prod.publicationStatus) {
            changes.push(`status ${prevPub} -> ${prod.publicationStatus || (prod.active ? 'published' : 'inactive')}`);
          }
          const detailSuffix = changes.length > 0 ? ` (${changes.join(', ')})` : '';
          appendAuditLog(
            draft,
            req.admin!,
            'UPDATE_PRODUCT',
            'product',
            prod.id,
            `Memperbarui produk "${prod.name}"${detailSuffix}`
          );
          return {
            ...prod,
            variants: draft.product_variants.filter((v) => v.productId === prod.id),
          };
        },
        { areas: ['storefront', 'products', 'overview', 'logs'], summary: 'Produk diperbarui' }
      );

      res.json({ product: updated });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal memperbarui produk.' });
    }
  });

  router.delete('/admin/products/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const outcome = await db.withTransaction(
        (draft) => {
          const idx = draft.products.findIndex((p) => p.id === req.params.id);
          if (idx === -1) {
            throw Object.assign(new Error('Produk tidak ditemukan.'), { statusCode: 404 });
          }
          const target = draft.products[idx];
          const hasOrderHistory = draft.order_items.some((item) => item.productId === target.id);

          if (hasOrderHistory) {
            const now = new Date().toISOString();
            target.active = false;
            target.publicationStatus = 'inactive';
            target.featured = false;
            target.archived = true;
            target.updatedAt = now;
            for (const v of draft.product_variants) {
              if (v.productId === target.id) v.active = false;
            }
            appendAuditLog(
              draft,
              req.admin!,
              'ARCHIVE_PRODUCT',
              'product',
              target.id,
              `Mengarsipkan produk "${target.name}" karena sudah memiliki riwayat transaksi`
            );
            return {
              ok: true,
              archived: true,
              product: target,
              message: `Produk "${target.name}" memiliki riwayat pesanan sehingga diarsipkan (Nonaktif) untuk menjaga integritas transaksi.`,
            };
          }

          const [removed] = draft.products.splice(idx, 1);
          draft.product_variants = draft.product_variants.filter((v) => v.productId !== removed.id);
          appendAuditLog(
            draft,
            req.admin!,
            'DELETE_PRODUCT',
            'product',
            removed.id,
            `Menghapus permanen produk "${removed.name}"`
          );
          return {
            ok: true,
            archived: false,
            message: `Produk "${removed.name}" berhasil dihapus permanen.`,
          };
        },
        { areas: ['storefront', 'products', 'overview', 'logs'], summary: 'Produk dihapus atau diarsipkan' }
      );
      res.json(outcome);
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal menghapus produk.' });
    }
  });

  // ================= ADMIN CATEGORIES CRUD =================
  router.get('/admin/categories', (_req, res) => {
    const snap = db.getSnapshot();
    res.json({ categories: snap.categories.sort((a, b) => a.sortOrder - b.sortOrder) });
  });

  router.post('/admin/categories', async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    const name = sanitizeText(body.name || '', 80);
    if (!name) {
      res.status(400).json({ error: 'Nama kategori wajib diisi.' });
      return;
    }

    const cat = await db.withTransaction(
      (draft) => {
        const now = new Date().toISOString();
        const id = `cat-${crypto.randomUUID().slice(0, 8)}`;
        const baseSlug = slugify(body.slug || name) || id;
        const slug = draft.categories.some((c) => c.slug === baseSlug)
          ? `${baseSlug}-${id.slice(-4)}`
          : baseSlug;
        const category: Category = {
          id,
          name,
          slug,
          description: sanitizeText(body.description || '', 400),
          imageUrl: sanitizeText(body.imageUrl || CAT_AI_CLEAN_IMAGE, 500),
          sortOrder: Number(body.sortOrder || draft.categories.length + 1),
          active: body.active !== false,
          isDemo: false,
          createdAt: now,
          updatedAt: now,
        };
        draft.categories.push(category);
        appendAuditLog(draft, req.admin!, 'CREATE_CATEGORY', 'category', id, `Menambah kategori "${name}"`);
        return category;
      },
      { areas: ['storefront', 'categories', 'products', 'overview', 'logs'], summary: `Kategori "${name}" dibuat` }
    );

    res.status(201).json({ category: cat });
  });

  router.put('/admin/categories/:id', async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    try {
      const cat = await db.withTransaction(
        (draft) => {
          const existing = draft.categories.find((c) => c.id === req.params.id);
          if (!existing) throw Object.assign(new Error('Kategori tidak ditemukan.'), { statusCode: 404 });
          if (body.name !== undefined) {
            const cleanName = sanitizeText(body.name, 80);
            if (!cleanName) throw Object.assign(new Error('Nama kategori wajib diisi.'), { statusCode: 400 });
            existing.name = cleanName;
          }
          if (body.slug !== undefined) {
            const nextSlug = slugify(String(body.slug));
            if (!nextSlug) throw Object.assign(new Error('Slug kategori tidak valid.'), { statusCode: 400 });
            if (draft.categories.some((c) => c.id !== existing.id && c.slug === nextSlug)) {
              throw Object.assign(new Error(`Slug "${nextSlug}" sudah digunakan kategori lain.`), {
                statusCode: 400,
              });
            }
            existing.slug = nextSlug;
          }
          if (body.description !== undefined) existing.description = sanitizeText(body.description, 400);
          if (body.imageUrl !== undefined) existing.imageUrl = sanitizeText(body.imageUrl, 500);
          if (body.sortOrder !== undefined) existing.sortOrder = Number(body.sortOrder);
          if (body.active !== undefined) existing.active = Boolean(body.active);
          existing.isDemo = false;
          existing.updatedAt = new Date().toISOString();
          appendAuditLog(
            draft,
            req.admin!,
            'UPDATE_CATEGORY',
            'category',
            existing.id,
            `Memperbarui kategori "${existing.name}" (urutan #${existing.sortOrder}, ${existing.active ? 'Aktif' : 'Nonaktif'})`
          );
          return existing;
        },
        { areas: ['storefront', 'categories', 'products', 'overview', 'logs'], summary: 'Kategori diperbarui' }
      );
      res.json({ category: cat });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal memperbarui kategori.' });
    }
  });

  router.delete('/admin/categories/:id', async (req: AuthenticatedRequest, res: Response) => {
    const reassignTo = String(req.query.reassignTo || '').trim();
    try {
      const outcome = await db.withTransaction(
        (draft) => {
          const idx = draft.categories.findIndex((c) => c.id === req.params.id);
          if (idx === -1) throw Object.assign(new Error('Kategori tidak ditemukan.'), { statusCode: 404 });

          const linkedProducts = draft.products.filter((p) => p.categoryId === req.params.id);
          let reassignedCount = 0;

          if (linkedProducts.length > 0) {
            if (!reassignTo || reassignTo === req.params.id) {
              throw Object.assign(
                new Error('Kategori masih memiliki produk. Pilih kategori tujuan pemindahan produk terlebih dahulu.'),
                { statusCode: 400 }
              );
            }
            const targetCat = draft.categories.find((c) => c.id === reassignTo);
            if (!targetCat) {
              throw Object.assign(new Error('Kategori tujuan pemindahan tidak ditemukan.'), {
                statusCode: 400,
              });
            }
            const now = new Date().toISOString();
            for (const p of linkedProducts) {
              p.categoryId = targetCat.id;
              p.updatedAt = now;
              reassignedCount += 1;
            }
          }

          const [removed] = draft.categories.splice(idx, 1);
          const detail =
            reassignedCount > 0
              ? `Menghapus kategori "${removed.name}" dan memindahkan ${reassignedCount} produk ke kategori ${reassignTo}`
              : `Menghapus kategori "${removed.name}"`;
          appendAuditLog(draft, req.admin!, 'DELETE_CATEGORY', 'category', removed.id, detail);
          return { ok: true, reassignedCount };
        },
        { areas: ['storefront', 'categories', 'products', 'overview', 'logs'], summary: 'Kategori dihapus' }
      );
      res.json(outcome);
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal menghapus kategori.' });
    }
  });

  // ================= ADMIN ORDERS & PAYMENT VERIFICATION =================
  router.get('/admin/orders', (req: AuthenticatedRequest, res: Response) => {
    const snap = db.getSnapshot();
    const search = String(req.query.search || '').trim().toLowerCase();
    const paymentStatus = String(req.query.paymentStatus || 'all');
    const orderStatus = String(req.query.orderStatus || 'all');
    const buyerType = String(req.query.buyerType || 'all');

    let list = snap.orders;
    if (search) {
      list = list.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(search) ||
          o.customerName.toLowerCase().includes(search) ||
          o.customerWhatsapp.includes(search)
      );
    }
    if (paymentStatus !== 'all') {
      list = list.filter((o) => o.paymentStatus === paymentStatus);
    }
    if (orderStatus !== 'all') {
      list = list.filter((o) => o.orderStatus === orderStatus);
    }
    if (buyerType === 'reseller') {
      list = list.filter((o) => o.buyerType === 'reseller' || Boolean(o.buyerUserId));
    } else if (buyerType === 'customer') {
      list = list.filter((o) => o.buyerType === 'customer' || !o.buyerUserId);
    }

    const enriched = list.map((o) => ({
      ...o,
      items: snap.order_items.filter((i) => i.orderId === o.id),
      payment: snap.payments.find((p) => p.orderId === o.id),
      confirmations: snap.payment_confirmations.filter((c) => c.orderId === o.id),
    }));

    res.json({ orders: enriched });
  });

  router.patch('/admin/orders/:id/status', async (req: AuthenticatedRequest, res: Response) => {
    const { orderStatus, internalNotes, trackingNumber } = req.body || {};
    const validStatuses: OrderStatus[] = [
      'pending_payment',
      'processing',
      'shipped',
      'completed',
      'cancelled',
    ];

    try {
      const rtMeta: RealtimeMutationMeta = {
        areas: ['orders', 'payments', 'overview', 'logs'],
      };

      const updated = await db.withTransaction((draft) => {
        const order = draft.orders.find((o) => o.id === req.params.id);
        if (!order) throw Object.assign(new Error('Pesanan tidak ditemukan.'), { statusCode: 404 });

        const now = new Date().toISOString();
        const prevStatus = order.orderStatus;

        if (orderStatus && validStatuses.includes(orderStatus)) {
          // Restore stock once when transitioning into cancelled
          if (orderStatus === 'cancelled' && prevStatus !== 'cancelled') {
            const items = draft.order_items.filter((i) => i.orderId === order.id);
            for (const item of items) {
              const prod = draft.products.find((p) => p.id === item.productId);
              if (prod) {
                const before = prod.stock;
                prod.stock += item.quantity;
                prod.updatedAt = now;
                draft.inventory_logs.unshift({
                  id: `inv-${crypto.randomUUID()}`,
                  productId: prod.id,
                  productName: prod.name,
                  variantId: item.variantId,
                  delta: item.quantity,
                  previousStock: before,
                  newStock: prod.stock,
                  reason: `Pembatalan pesanan ${order.orderNumber}`,
                  orderId: order.id,
                  actor: req.admin!.email,
                  createdAt: now,
                });
              }
              if (item.variantId) {
                const v = draft.product_variants.find((pv) => pv.id === item.variantId);
                if (v) v.stock += item.quantity;
              }
            }

            // Refund WALLET payment atomically ONCE when order is cancelled
            if (
              order.paymentMethod === 'WALLET' &&
              order.paymentStatus === 'paid' &&
              !order.walletRefunded &&
              order.buyerUserId
            ) {
              const rp = draft.reseller_profiles.find((r) => r.userId === order.buyerUserId);
              if (rp) {
                const wallet = ensureResellerWallet(draft, rp, now);
                const before = wallet.balance;
                const after = before + order.totalAmount;
                wallet.balance = after;
                wallet.updatedAt = now;
                const cancelReason =
                  sanitizeText(req.body?.refundReason || req.body?.internalNotes || '', 300) ||
                  `Pembatalan pesanan ${order.orderNumber}`;
                recordWalletTransaction(draft, {
                  resellerId: rp.id,
                  userId: rp.userId,
                  type: 'refund',
                  amount: order.totalAmount,
                  balanceBefore: before,
                  balanceAfter: after,
                  referenceType: 'order',
                  referenceId: order.id,
                  description: `Refund Saldo Pesanan ${order.orderNumber}`,
                  reason: cancelReason,
                  actorId: req.admin!.uid,
                  actorName: req.admin!.email,
                  now,
                });
                order.walletRefunded = true;
                order.paymentStatus = 'refunded';
                order.refundReason = cancelReason;
                order.refundedAt = now;
                order.refundedByAdminId = req.admin!.uid;
                const pay = draft.payments.find((p) => p.orderId === order.id);
                if (pay) {
                  pay.status = 'refunded';
                  pay.updatedAt = now;
                }
              }
            }
          }
          order.orderStatus = orderStatus;
        }

        if (internalNotes !== undefined) {
          order.internalNotes = sanitizeText(internalNotes, 1000);
        }
        if (trackingNumber !== undefined) {
          order.trackingNumber = sanitizeText(trackingNumber, 200) || undefined;
        }
        order.updatedAt = now;

        rtMeta.targetUserId = order.buyerUserId;
        rtMeta.targetResellerId = order.attributedResellerId;
        rtMeta.orderId = order.id;
        rtMeta.receiptTokenHash = order.receiptTokenHash;
        rtMeta.summary = `Status pesanan ${order.orderNumber} diperbarui ke ${order.orderStatus}`;
        if (orderStatus === 'cancelled' && prevStatus !== 'cancelled') {
          rtMeta.areas.push('products');
          if (order.walletRefunded) {
            rtMeta.areas.push('reseller_wallet', 'resellers');
          }
        }

        appendAuditLog(
          draft,
          req.admin!,
          'UPDATE_ORDER_STATUS',
          'order',
          order.id,
          `Status pesanan ${order.orderNumber} diubah dari ${prevStatus} menjadi ${order.orderStatus}`
        );
        return order;
      }, rtMeta);
      res.json({ order: updated });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal memperbarui status pesanan.' });
    }
  });

  // Explicit single-refund endpoint for WALLET orders
  router.post('/admin/orders/:id/refund', async (req: AuthenticatedRequest, res: Response) => {
    const cleanReason = sanitizeText(req.body?.reason || '', 400);
    if (!cleanReason || cleanReason.length < 3) {
      res.status(400).json({ error: 'Alasan pengembalian dana wajib diisi.' });
      return;
    }

    try {
      const rtMeta: RealtimeMutationMeta = {
        areas: ['orders', 'payments', 'products', 'resellers', 'reseller_wallet', 'overview', 'logs'],
      };

      const result = await db.withTransaction((draft) => {
        const order = draft.orders.find((o) => o.id === req.params.id);
        if (!order) {
          throw Object.assign(new Error('Pesanan tidak ditemukan.'), { statusCode: 404 });
        }
        if (order.paymentMethod !== 'WALLET') {
          throw Object.assign(
            new Error('Refund otomatis ke saldo hanya berlaku untuk pesanan yang dibayar via Reseller Wallet.'),
            { statusCode: 400 }
          );
        }
        if (order.walletRefunded || order.paymentStatus === 'refunded') {
          throw Object.assign(
            new Error('Dana pesanan ini sudah pernah dikembalikan (refund) sebelumnya.'),
            { statusCode: 409 }
          );
        }
        if (order.paymentStatus !== 'paid') {
          throw Object.assign(
            new Error('Hanya pesanan dengan status lunas yang dapat di-refund ke wallet.'),
            { statusCode: 400 }
          );
        }

        const rp = order.buyerUserId
          ? draft.reseller_profiles.find((r) => r.userId === order.buyerUserId)
          : undefined;
        if (!rp) {
          throw Object.assign(new Error('Akun wallet reseller untuk pesanan ini tidak ditemukan.'), {
            statusCode: 404,
          });
        }

        const now = new Date().toISOString();
        if (order.orderStatus !== 'cancelled') {
          const items = draft.order_items.filter((i) => i.orderId === order.id);
          for (const item of items) {
            const prod = draft.products.find((p) => p.id === item.productId);
            if (prod) {
              const beforeStock = prod.stock;
              prod.stock += item.quantity;
              prod.updatedAt = now;
              draft.inventory_logs.unshift({
                id: `inv-${crypto.randomUUID()}`,
                productId: prod.id,
                productName: prod.name,
                variantId: item.variantId,
                delta: item.quantity,
                previousStock: beforeStock,
                newStock: prod.stock,
                reason: `Refund pesanan ${order.orderNumber}`,
                orderId: order.id,
                actor: req.admin!.email,
                createdAt: now,
              });
            }
            if (item.variantId) {
              const v = draft.product_variants.find((pv) => pv.id === item.variantId);
              if (v) v.stock += item.quantity;
            }
          }
        }

        const wallet = ensureResellerWallet(draft, rp, now);
        const before = wallet.balance;
        const after = before + order.totalAmount;
        wallet.balance = after;
        wallet.updatedAt = now;

        const refundTx = recordWalletTransaction(draft, {
          resellerId: rp.id,
          userId: rp.userId,
          type: 'refund',
          amount: order.totalAmount,
          balanceBefore: before,
          balanceAfter: after,
          referenceType: 'order',
          referenceId: order.id,
          description: `Refund Pesanan ${order.orderNumber} ke Reseller Wallet`,
          reason: cleanReason,
          actorId: req.admin!.uid,
          actorName: req.admin!.email,
          now,
        });

        order.walletRefunded = true;
        order.paymentStatus = 'refunded';
        order.orderStatus = 'cancelled';
        order.refundReason = cleanReason;
        order.refundedAt = now;
        order.refundedByAdminId = req.admin!.uid;
        order.updatedAt = now;

        const pay = draft.payments.find((p) => p.orderId === order.id);
        if (pay) {
          pay.status = 'refunded';
          pay.updatedAt = now;
        }

        rtMeta.targetUserId = rp.userId;
        rtMeta.targetResellerId = rp.id;
        rtMeta.orderId = order.id;
        rtMeta.receiptTokenHash = order.receiptTokenHash;
        rtMeta.summary = `Refund ${order.orderNumber} ke wallet @${rp.username}`;

        appendAuditLog(
          draft,
          req.admin!,
          'REFUND_ORDER_TO_WALLET',
          'order',
          order.id,
          `Mengembalikan dana ${formatIDR(order.totalAmount)} untuk ${order.orderNumber} ke wallet @${rp.username} (${cleanReason})`
        );

        return { order, wallet, refundTx };
      }, rtMeta);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal memproses refund ke wallet.' });
    }
  });

  router.post('/admin/orders/:id/rotate-token', async (req: AuthenticatedRequest, res: Response) => {
    const action = req.body?.action === 'disable' ? 'disable' : 'rotate';
    try {
      const rtMeta: RealtimeMutationMeta = {
        areas: ['orders', 'logs'],
      };

      const result = await db.withTransaction((draft) => {
        const order = draft.orders.find((o) => o.id === req.params.id);
        if (!order) throw Object.assign(new Error('Pesanan tidak ditemukan.'), { statusCode: 404 });

        const now = new Date().toISOString();
        rtMeta.orderId = order.id;
        rtMeta.targetUserId = order.buyerUserId;
        rtMeta.receiptTokenHash = order.receiptTokenHash;

        if (action === 'disable') {
          order.receiptActive = false;
          order.updatedAt = now;
          appendAuditLog(draft, req.admin!, 'DISABLE_RECEIPT_TOKEN', 'order', order.id, `Menonaktifkan token resi ${order.orderNumber}`);
          return { receiptActive: false, receiptTokenMasked: order.receiptTokenMasked };
        }

        const newToken = generateReceiptToken();
        order.receiptTokenHash = hashReceiptToken(newToken);
        order.receiptTokenMasked = maskReceiptToken(newToken);
        order.receiptActive = true;
        order.updatedAt = now;
        appendAuditLog(draft, req.admin!, 'ROTATE_RECEIPT_TOKEN', 'order', order.id, `Mengganti token resi ${order.orderNumber}`);
        return {
          receiptActive: true,
          receiptToken: newToken,
          receiptTokenMasked: order.receiptTokenMasked,
        };
      }, rtMeta);
      res.json(result);
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal memperbarui token resi.' });
    }
  });

  router.get('/admin/payments/confirmations', (_req, res) => {
    const snap = db.getSnapshot();
    const list = snap.payment_confirmations.map((c) => ({
      ...c,
      order: snap.orders.find((o) => o.id === c.orderId),
      payment: snap.payments.find((p) => p.orderId === c.orderId),
    }));
    res.json({ confirmations: list });
  });

  router.post('/admin/payments/:orderId/verify', async (req: AuthenticatedRequest, res: Response) => {
    const { decision, rejectionReason } = req.body || {};
    if (decision !== 'approve' && decision !== 'reject') {
      res.status(400).json({ error: 'Keputusan verifikasi tidak valid.' });
      return;
    }
    if (decision === 'reject' && !sanitizeText(rejectionReason || '', 500)) {
      res.status(400).json({ error: 'Alasan penolakan wajib diisi.' });
      return;
    }

    try {
      const rtMeta: RealtimeMutationMeta = {
        areas: ['orders', 'payments', 'products', 'resellers', 'overview', 'logs'],
      };

      const updated = await db.withTransaction((draft) => {
        const order = draft.orders.find((o) => o.id === req.params.orderId);
        if (!order) throw Object.assign(new Error('Pesanan tidak ditemukan.'), { statusCode: 404 });

        const payment = draft.payments.find((p) => p.orderId === order.id);
        const now = new Date().toISOString();

        if (decision === 'approve') {
          const wasPaid = order.paymentStatus === 'paid';
          order.paymentStatus = 'paid';
          if (order.orderStatus === 'pending_payment') {
            order.orderStatus = 'processing';
          }
          order.rejectionReason = undefined;
          order.updatedAt = now;

          if (payment) {
            payment.status = 'paid';
            payment.verifiedByAdminId = req.admin!.uid;
            payment.verifiedByAdminEmail = req.admin!.email;
            payment.verifiedAt = now;
            payment.rejectionReason = undefined;
            payment.updatedAt = now;
          }

          if (!wasPaid) {
            const items = draft.order_items.filter((i) => i.orderId === order.id);
            for (const item of items) {
              const prod = draft.products.find((p) => p.id === item.productId);
              if (prod) {
                prod.soldCount = (prod.soldCount || 0) + item.quantity;
              }
            }
          }

          appendAuditLog(
            draft,
            req.admin!,
            'VERIFY_PAYMENT_APPROVED',
            'payment',
            order.id,
            `Menyetujui pembayaran QRIS untuk ${order.orderNumber}`
          );
        } else {
          const reason = sanitizeText(rejectionReason, 500);
          order.paymentStatus = 'rejected';
          order.rejectionReason = reason;
          order.updatedAt = now;

          if (payment) {
            payment.status = 'rejected';
            payment.verifiedByAdminId = req.admin!.uid;
            payment.verifiedByAdminEmail = req.admin!.email;
            payment.verifiedAt = now;
            payment.rejectionReason = reason;
            payment.updatedAt = now;
          }

          appendAuditLog(
            draft,
            req.admin!,
            'VERIFY_PAYMENT_REJECTED',
            'payment',
            order.id,
            `Menolak pembayaran ${order.orderNumber}: ${reason}`
          );
        }

        rtMeta.targetUserId = order.buyerUserId;
        rtMeta.targetResellerId = order.attributedResellerId;
        rtMeta.orderId = order.id;
        rtMeta.receiptTokenHash = order.receiptTokenHash;
        rtMeta.summary = `Pembayaran ${order.orderNumber} ${decision === 'approve' ? 'disetujui' : 'ditolak'}`;

        return order;
      }, rtMeta);
      res.json({ order: updated });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal memverifikasi pembayaran.' });
    }
  });

  // ================= ADMIN DISCOUNT & PROMO MANAGEMENT =================
  router.get('/admin/discounts', (_req, res) => {
    const snap = db.getSnapshot();
    res.json({
      discounts: snap.discount_codes,
      usages: snap.discount_usages,
    });
  });

  router.post('/admin/discounts', async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    const code = sanitizeText(body.code || '', 40).toUpperCase().replace(/\s+/g, '');
    const promoName = sanitizeText(body.promoName || '', 120);
    if (!code || !promoName) {
      res.status(400).json({ error: 'Nama promo dan kode diskon wajib diisi.' });
      return;
    }

    try {
      const created = await db.withTransaction(
        (draft) => {
          if (draft.discount_codes.some((d) => d.code.toUpperCase() === code)) {
            throw Object.assign(new Error(`Kode "${code}" sudah ada.`), { statusCode: 400 });
          }
          const now = new Date().toISOString();
          const eligibleTier =
            body.eligibleTier === 'customer' || body.eligibleTier === 'reseller'
              ? body.eligibleTier
              : 'all';
          const discount: DiscountCode = {
            id: `disc-${crypto.randomUUID().slice(0, 8)}`,
            promoName,
            code,
            description: sanitizeText(body.description || '', 400),
            type: body.type === 'fixed' ? 'fixed' : 'percentage',
            value: Math.max(0, Number(body.value || 0)),
            minPurchase: Math.max(0, Number(body.minPurchase || 0)),
            maxDiscount:
              body.maxDiscount !== null && body.maxDiscount !== '' && Number(body.maxDiscount) > 0
                ? Math.round(Number(body.maxDiscount))
                : null,
            startDate: body.startDate || now,
            endDate: body.endDate || '2027-12-31T23:59:59.000Z',
            maxTotalUsage: Math.max(0, Math.floor(Number(body.maxTotalUsage || 0))),
            maxPerCustomer: Math.max(0, Math.floor(Number(body.maxPerCustomer || 0))),
            usedCount: 0,
            applicableProductIds: Array.isArray(body.applicableProductIds) ? body.applicableProductIds : [],
            applicableCategoryIds: Array.isArray(body.applicableCategoryIds) ? body.applicableCategoryIds : [],
            eligibleTier,
            active: body.active !== false,
            isDemo: false,
            createdAt: now,
            updatedAt: now,
          };
          draft.discount_codes.unshift(discount);
          appendAuditLog(draft, req.admin!, 'CREATE_DISCOUNT', 'discount', discount.id, `Membuat kode diskon ${code}`);
          return discount;
        },
        { areas: ['storefront', 'discounts', 'logs'], summary: `Kode promo ${code} dibuat` }
      );
      res.status(201).json({ discount: created });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal membuat kode diskon.' });
    }
  });

  router.put('/admin/discounts/:id', async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    try {
      const updated = await db.withTransaction(
        (draft) => {
          const disc = draft.discount_codes.find((d) => d.id === req.params.id);
          if (!disc) throw Object.assign(new Error('Kode diskon tidak ditemukan.'), { statusCode: 404 });
          if (body.promoName) disc.promoName = sanitizeText(body.promoName, 120);
          if (body.description !== undefined) disc.description = sanitizeText(body.description, 400);
          if (body.type === 'fixed' || body.type === 'percentage') disc.type = body.type;
          if (body.value !== undefined) disc.value = Math.max(0, Number(body.value));
          if (body.minPurchase !== undefined) disc.minPurchase = Math.max(0, Number(body.minPurchase));
          if (body.maxDiscount !== undefined) {
            disc.maxDiscount =
              body.maxDiscount !== null && body.maxDiscount !== '' && Number(body.maxDiscount) > 0
                ? Math.round(Number(body.maxDiscount))
                : null;
          }
          if (body.startDate) disc.startDate = body.startDate;
          if (body.endDate) disc.endDate = body.endDate;
          if (body.maxTotalUsage !== undefined) disc.maxTotalUsage = Math.max(0, Math.floor(Number(body.maxTotalUsage)));
          if (body.maxPerCustomer !== undefined) disc.maxPerCustomer = Math.max(0, Math.floor(Number(body.maxPerCustomer)));
          if (Array.isArray(body.applicableProductIds)) disc.applicableProductIds = body.applicableProductIds;
          if (Array.isArray(body.applicableCategoryIds)) disc.applicableCategoryIds = body.applicableCategoryIds;
          if (
            body.eligibleTier === 'all' ||
            body.eligibleTier === 'customer' ||
            body.eligibleTier === 'reseller'
          ) {
            disc.eligibleTier = body.eligibleTier;
          }
          if (body.active !== undefined) disc.active = Boolean(body.active);
          disc.isDemo = false;
          disc.updatedAt = new Date().toISOString();
          appendAuditLog(draft, req.admin!, 'UPDATE_DISCOUNT', 'discount', disc.id, `Memperbarui kode diskon ${disc.code}`);
          return disc;
        },
        { areas: ['storefront', 'discounts', 'logs'], summary: 'Kode promo diperbarui' }
      );
      res.json({ discount: updated });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal memperbarui kode diskon.' });
    }
  });

  router.delete('/admin/discounts/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db.withTransaction(
        (draft) => {
          const idx = draft.discount_codes.findIndex((d) => d.id === req.params.id);
          if (idx === -1) throw Object.assign(new Error('Kode diskon tidak ditemukan.'), { statusCode: 404 });
          const [removed] = draft.discount_codes.splice(idx, 1);
          appendAuditLog(draft, req.admin!, 'DELETE_DISCOUNT', 'discount', removed.id, `Menghapus kode diskon ${removed.code}`);
        },
        { areas: ['storefront', 'discounts', 'logs'], summary: 'Kode promo dihapus' }
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal menghapus kode diskon.' });
    }
  });

  // ================= ADMIN BANNERS, SITE CONTENT, SETTINGS, SHIPPING =================
  router.get('/admin/cms', (_req, res) => {
    const snap = db.getSnapshot();
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      banners: snap.banners,
      siteContent: snap.site_contents,
      storeSettings: snap.store_settings,
      shippingSettings: snap.shipping_settings,
      navigationMenus: (snap.navigation_menus || []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    });
  });

  router.post('/admin/banners', async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    const banner = await db.withTransaction(
      (draft) => {
        const b: Banner = {
          id: `banner-${crypto.randomUUID().slice(0, 8)}`,
          headline: sanitizeText(body.headline || 'Promo Spesial', 160),
          subheadline: body.subheadline !== undefined ? sanitizeText(body.subheadline, 200) : undefined,
          description: sanitizeText(body.description || '', 500),
          imageUrl: sanitizeText(body.imageUrl || HERO_CLEAN_IMAGE, 500),
          ctaLabel: sanitizeText(body.ctaLabel || 'Lihat Promo', 60),
          ctaLink: sanitizeText(body.ctaLink || '/produk', 300),
          startDate: body.startDate || undefined,
          endDate: body.endDate || undefined,
          active: body.active !== false,
          isDemo: false,
          updatedAt: new Date().toISOString(),
        };
        draft.banners.unshift(b);
        appendAuditLog(draft, req.admin!, 'CREATE_BANNER', 'banner', b.id, `Membuat banner "${b.headline}"`);
        return b;
      },
      { areas: ['storefront', 'cms', 'logs'], summary: 'Banner promo dibuat' }
    );
    res.status(201).json({ banner });
  });

  router.put('/admin/banners/:id', async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    try {
      const banner = await db.withTransaction(
        (draft) => {
          const b = draft.banners.find((item) => item.id === req.params.id);
          if (!b) throw Object.assign(new Error('Banner tidak ditemukan.'), { statusCode: 404 });
          if (body.headline !== undefined) b.headline = sanitizeText(body.headline, 160);
          if (body.subheadline !== undefined) b.subheadline = sanitizeText(body.subheadline, 200);
          if (body.description !== undefined) b.description = sanitizeText(body.description, 500);
          if (body.imageUrl !== undefined) b.imageUrl = sanitizeText(body.imageUrl, 500);
          if (body.ctaLabel !== undefined) b.ctaLabel = sanitizeText(body.ctaLabel, 60);
          if (body.ctaLink !== undefined) b.ctaLink = sanitizeText(body.ctaLink, 300);
          if (body.startDate !== undefined) b.startDate = body.startDate || undefined;
          if (body.endDate !== undefined) b.endDate = body.endDate || undefined;
          if (body.active !== undefined) b.active = Boolean(body.active);
          b.isDemo = false;
          b.updatedAt = new Date().toISOString();
          appendAuditLog(draft, req.admin!, 'UPDATE_BANNER', 'banner', b.id, `Memperbarui banner "${b.headline}"`);
          return b;
        },
        { areas: ['storefront', 'cms', 'logs'], summary: 'Banner promo diperbarui' }
      );
      res.json({ banner });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal memperbarui banner.' });
    }
  });

  router.delete('/admin/banners/:id', async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db.withTransaction(
        (draft) => {
          const idx = draft.banners.findIndex((b) => b.id === req.params.id);
          if (idx === -1) throw Object.assign(new Error('Banner tidak ditemukan.'), { statusCode: 404 });
          const [removed] = draft.banners.splice(idx, 1);
          appendAuditLog(
            draft,
            req.admin!,
            'DELETE_BANNER',
            'banner',
            removed.id,
            `Menghapus banner "${removed.headline}"`
          );
        },
        { areas: ['storefront', 'cms', 'logs'], summary: 'Banner promo dihapus' }
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal menghapus banner.' });
    }
  });

  router.put('/admin/content', async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    const result = await db.withTransaction(
      (draft) => {
        const c = draft.site_contents;
        if (body.announcementEnabled !== undefined) c.announcementEnabled = Boolean(body.announcementEnabled);
        if (body.announcementText !== undefined) c.announcementText = sanitizeText(body.announcementText, 240);
        if (body.homepageStatus === 'published' || body.homepageStatus === 'inactive') {
          c.homepageStatus = body.homepageStatus;
        }
        if (body.homepageSections && typeof body.homepageSections === 'object') {
          c.homepageSections = body.homepageSections;
        }
        if (body.heroHeadline !== undefined) c.heroHeadline = sanitizeText(body.heroHeadline, 160);
        if (body.heroSubheadline !== undefined) c.heroSubheadline = sanitizeText(body.heroSubheadline, 200);
        if (body.heroDescription !== undefined) c.heroDescription = sanitizeText(body.heroDescription, 600);
        if (body.heroImageUrl !== undefined) c.heroImageUrl = sanitizeText(body.heroImageUrl, 500);
        if (body.heroPrimaryCtaLabel !== undefined) c.heroPrimaryCtaLabel = sanitizeText(body.heroPrimaryCtaLabel, 60);
        if (body.heroSecondaryCtaLabel !== undefined) c.heroSecondaryCtaLabel = sanitizeText(body.heroSecondaryCtaLabel, 60);
        if (Array.isArray(body.advantages)) {
          c.advantages = body.advantages
            .filter((a: any) => a && typeof a === 'object')
            .map((a: any, i: number) => ({
              id: sanitizeText(a.id || `adv-${i + 1}`, 60) || `adv-${i + 1}`,
              title: sanitizeText(a.title || '', 120),
              description: sanitizeText(a.description || '', 400),
              iconName: sanitizeText(a.iconName || 'ShieldCheck', 40) || 'ShieldCheck',
            }))
            .filter((a: any) => a.title);
        }
        if (Array.isArray(body.faqs)) {
          c.faqs = body.faqs
            .filter((f: any) => f && typeof f === 'object')
            .map((f: any, i: number) => ({
              id: sanitizeText(f.id || `faq-${i + 1}`, 60) || `faq-${i + 1}`,
              question: sanitizeText(f.question || '', 300),
              answer: sanitizeText(f.answer || '', 2000),
            }))
            .filter((f: any) => f.question && f.answer);
        }
        if (body.aboutTitle !== undefined) c.aboutTitle = sanitizeText(body.aboutTitle, 160);
        if (body.aboutDescription !== undefined) c.aboutDescription = sanitizeText(body.aboutDescription, 2000);
        if (body.footerDescription !== undefined) c.footerDescription = sanitizeText(body.footerDescription, 400);
        if (body.footerCopyright !== undefined) c.footerCopyright = sanitizeText(body.footerCopyright, 160);
        if (body.socialLinks && typeof body.socialLinks === 'object') {
          c.socialLinks = {
            instagram: body.socialLinks.instagram ? sanitizeText(body.socialLinks.instagram, 300) : '',
            tiktok: body.socialLinks.tiktok ? sanitizeText(body.socialLinks.tiktok, 300) : '',
            telegram: body.socialLinks.telegram ? sanitizeText(body.socialLinks.telegram, 300) : '',
            youtube: body.socialLinks.youtube ? sanitizeText(body.socialLinks.youtube, 300) : '',
            email: body.socialLinks.email ? sanitizeText(body.socialLinks.email, 254) : '',
          };
        }
        if (body.privacyPolicy !== undefined) c.privacyPolicy = sanitizeText(body.privacyPolicy, 8000);
        if (body.termsConditions !== undefined) c.termsConditions = sanitizeText(body.termsConditions, 8000);
        if (body.returnPolicy !== undefined) c.returnPolicy = sanitizeText(body.returnPolicy, 8000);
        if (Array.isArray(body.navigationMenus)) {
          draft.navigation_menus = body.navigationMenus
            .filter((m: any) => m && m.label && m.href)
            .map(
              (m: any, idx: number): NavigationMenuItem => ({
                id: sanitizeText(m.id || `nav-${crypto.randomUUID().slice(0, 6)}`, 60),
                label: sanitizeText(m.label, 60),
                href: sanitizeText(m.href, 300),
                location: m.location === 'footer' ? 'footer' : 'header',
                group: m.group === 'portal' ? 'portal' : 'main',
                openInNewTab: Boolean(m.openInNewTab),
                sortOrder: Number.isFinite(Number(m.sortOrder)) ? Number(m.sortOrder) : idx + 1,
                active: m.active !== false,
              })
            );
        }
        c.updatedAt = new Date().toISOString();
        appendAuditLog(
          draft,
          req.admin!,
          'UPDATE_SITE_CONTENT',
          'site_content',
          'default',
          `Memperbarui konten website publik (Hero: "${c.heroHeadline.slice(0, 48)}", Status Homepage: ${c.homepageStatus || 'published'})`
        );
        return { siteContent: c, navigationMenus: draft.navigation_menus || [] };
      },
      { areas: ['storefront', 'cms', 'logs'], summary: 'Konten website diperbarui' }
    );
    res.json(result);
  });

  router.put('/admin/navigation', async (req: AuthenticatedRequest, res: Response) => {
    const rawItems = req.body?.navigationMenus;
    if (!Array.isArray(rawItems)) {
      res.status(400).json({ error: 'Array navigationMenus wajib disertakan.' });
      return;
    }

    const updated = await db.withTransaction(
      (draft) => {
        draft.navigation_menus = rawItems
          .filter((m: any) => m && m.label && m.href)
          .map(
            (m: any, idx: number): NavigationMenuItem => ({
              id: sanitizeText(m.id || `nav-${crypto.randomUUID().slice(0, 6)}`, 60),
              label: sanitizeText(m.label, 60),
              href: sanitizeText(m.href, 300),
              location: m.location === 'footer' ? 'footer' : 'header',
              group: m.group === 'portal' ? 'portal' : 'main',
              openInNewTab: Boolean(m.openInNewTab),
              sortOrder: Number.isFinite(Number(m.sortOrder)) ? Number(m.sortOrder) : idx + 1,
              active: m.active !== false,
            })
          );
        appendAuditLog(
          draft,
          req.admin!,
          'UPDATE_NAVIGATION_MENUS',
          'navigation',
          'default',
          `Memperbarui ${draft.navigation_menus.length} item menu navigasi header/footer`
        );
        return draft.navigation_menus;
      },
      { areas: ['storefront', 'cms', 'logs'], summary: 'Menu navigasi diperbarui' }
    );

    res.json({ navigationMenus: updated });
  });

  router.put('/admin/settings', async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    const settings = await db.withTransaction(
      (draft) => {
        const s = draft.store_settings;
        const touched: string[] = [];
        if (body.storeName !== undefined) {
          s.storeName = sanitizeText(body.storeName, 100);
          touched.push('storeName');
        }
        if (body.seoTitle !== undefined) {
          s.seoTitle = sanitizeText(body.seoTitle, 160);
          touched.push('seoTitle');
        }
        if (body.seoDescription !== undefined) {
          s.seoDescription = sanitizeText(body.seoDescription, 320);
          touched.push('seoDescription');
        }
        if (body.tagline !== undefined) {
          s.tagline = sanitizeText(body.tagline, 200);
          touched.push('tagline');
        }
        if (body.logoUrl !== undefined) {
          s.logoUrl = sanitizeText(body.logoUrl, 500);
          touched.push('logoUrl');
        }
        if (body.faviconUrl !== undefined) {
          s.faviconUrl = sanitizeText(body.faviconUrl, 500);
          touched.push('faviconUrl');
        }
        if (body.whatsappNumber !== undefined) {
          const norm = normalizeWhatsappNumber(body.whatsappNumber);
          if (norm) {
            s.whatsappNumber = norm;
            touched.push('whatsappNumber');
          }
        }
        if (body.email !== undefined) {
          s.email = sanitizeText(body.email, 254);
          touched.push('email');
        }
        if (body.address !== undefined) {
          s.address = sanitizeText(body.address, 400);
          touched.push('address');
        }
        if (body.operatingHours !== undefined) {
          s.operatingHours = sanitizeText(body.operatingHours, 120);
          touched.push('operatingHours');
        }
        if (body.taxPercent !== undefined) {
          s.taxPercent = Math.max(0, Math.min(50, Number(body.taxPercent)));
          touched.push('taxPercent');
        }
        if (body.maintenanceMode !== undefined) {
          s.maintenanceMode = Boolean(body.maintenanceMode);
          touched.push('maintenanceMode');
        }
        if (body.qrisEnabled !== undefined) s.qrisEnabled = Boolean(body.qrisEnabled);
        if (body.qrisImageUrl !== undefined) s.qrisImageUrl = sanitizeText(body.qrisImageUrl, 500);
        if (body.qrisMerchantName !== undefined) s.qrisMerchantName = sanitizeText(body.qrisMerchantName, 120);
        if (body.qrisNmid !== undefined) s.qrisNmid = sanitizeText(body.qrisNmid, 60);
        if (Array.isArray(body.qrisInstructions)) {
          s.qrisInstructions = body.qrisInstructions.map((i: unknown) => sanitizeText(i, 300)).filter(Boolean);
        }
        if (body.reviewsEnabled !== undefined) {
          s.reviewsEnabled = Boolean(body.reviewsEnabled);
          touched.push('reviewsEnabled');
        }
        s.updatedAt = new Date().toISOString();
        appendAuditLog(
          draft,
          req.admin!,
          body.qrisImageUrl !== undefined ? 'UPDATE_QRIS_OR_PAYMENT_SETTINGS' : 'UPDATE_STORE_SETTINGS',
          'store_settings',
          'default',
          `Memperbarui pengaturan toko (${touched.join(', ') || 'pembayaran'})`
        );
        return s;
      },
      { areas: ['storefront', 'cms', 'payment_settings', 'overview', 'logs'], summary: 'Pengaturan toko diperbarui' }
    );
    res.json({ storeSettings: settings });
  });

  router.put('/admin/shipping/:id', async (req: AuthenticatedRequest, res: Response) => {
    const body = req.body || {};
    try {
      const updated = await db.withTransaction(
        (draft) => {
          const s = draft.shipping_settings.find((item) => item.id === req.params.id);
          if (!s) throw Object.assign(new Error('Metode pengiriman tidak ditemukan.'), { statusCode: 404 });
          if (body.name !== undefined) s.name = sanitizeText(body.name, 100);
          if (body.description !== undefined) s.description = sanitizeText(body.description, 300);
          if (body.cost !== undefined) s.cost = Math.max(0, Math.round(Number(body.cost)));
          if (body.requiresAddress !== undefined) s.requiresAddress = Boolean(body.requiresAddress);
          if (body.active !== undefined) s.active = Boolean(body.active);
          appendAuditLog(draft, req.admin!, 'UPDATE_SHIPPING', 'shipping', s.id, `Memperbarui pengiriman "${s.name}"`);
          return s;
        },
        { areas: ['storefront', 'payment_settings', 'cms', 'logs'], summary: 'Pengaturan pengiriman diperbarui' }
      );
      res.json({ shippingSetting: updated });
    } catch (err: any) {
      res.status(err?.statusCode || 500).json({ error: err?.message || 'Gagal memperbarui pengiriman.' });
    }
  });

  // ================= ADMIN ASSET UPLOAD (PRODUCTS / BANNERS / QRIS) =================
  router.post(
    '/admin/upload',
    handleSingleFileUpload('file'),
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
          res.status(400).json({ error: 'Tidak ada file yang diunggah atau file kosong.' });
          return;
        }
        const magic = validateUploadedFileMagicBytes(req.file.buffer, ['jpg', 'png', 'webp']);
        if (magic.ok === false) {
          res.status(400).json({ error: magic.error });
          return;
        }
        const category =
          sanitizeText(req.body?.folder || 'assets', 20).replace(/[^a-z0-9_-]/gi, '') || 'assets';
        const targetDir = path.resolve(process.cwd(), 'uploads', category);
        fs.mkdirSync(targetDir, { recursive: true });
        const fileName = `${category}-${crypto.randomUUID()}.${magic.ext}`;
        fs.writeFileSync(path.join(targetDir, fileName), req.file.buffer);
        const url = `/uploads/${category}/${fileName}`;

        await db.withTransaction(
          (draft) => {
            appendAuditLog(
              draft,
              req.admin!,
              'UPLOAD_ASSET',
              category,
              fileName,
              `Mengunggah aset baru (${url})`
            );
          },
          { areas: ['logs'] }
        );

        res.status(201).json({
          ok: true,
          url,
          mimeType: magic.mime,
          size: req.file.size,
        });
      } catch (err: any) {
        res.status(500).json({
          error: err?.message || 'Gagal menyimpan file di server.',
        });
      }
    }
  );

  // ================= ADMIN CUSTOMERS, INVENTORY & AUDIT LOGS =================
  router.get('/admin/customers', (_req, res) => {
    const snap = db.getSnapshot();
    const enriched = snap.customers.map((c) => ({
      ...c,
      orders: snap.orders
        .filter((o) => o.customerId === c.id || o.customerWhatsapp === c.whatsapp)
        .map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          totalAmount: o.totalAmount,
          paymentStatus: o.paymentStatus,
          orderStatus: o.orderStatus,
          createdAt: o.createdAt,
        })),
    }));
    res.json({ customers: enriched });
  });

  router.get('/admin/logs', (_req, res) => {
    const snap = db.getSnapshot();
    res.json({
      auditLogs: snap.audit_logs,
      inventoryLogs: snap.inventory_logs,
    });
  });

  // ================= ADMIN SAFE CLEAR DEMO DATA =================
  router.post('/admin/demo-data/clear', async (req: AuthenticatedRequest, res: Response) => {
    const removedCount = await db.withTransaction(
      (draft) => {
        const demoProdIds = new Set(draft.products.filter((p) => p.isDemo).map((p) => p.id));
        const before = draft.products.length + draft.categories.length + draft.banners.length + draft.discount_codes.length;
        draft.products = draft.products.filter((p) => !p.isDemo);
        draft.product_variants = draft.product_variants.filter((v) => !demoProdIds.has(v.productId));
        draft.categories = draft.categories.filter((c) => !c.isDemo);
        draft.banners = draft.banners.filter((b) => !b.isDemo);
        draft.discount_codes = draft.discount_codes.filter((d) => !d.isDemo);
        const after = draft.products.length + draft.categories.length + draft.banners.length + draft.discount_codes.length;
        appendAuditLog(
          draft,
          req.admin!,
          'CLEAR_DEMO_DATA',
          'system',
          'demo',
          `Menghapus ${before - after} item data demo tanpa memengaruhi transaksi nyata`
        );
        return before - after;
      },
      {
        areas: ['storefront', 'products', 'categories', 'discounts', 'cms', 'overview', 'logs'],
        summary: 'Data demo dibersihkan',
      }
    );
    res.json({ ok: true, removedCount });
  });

  // Mount admin reseller management, leaderboard, payment/QRIS, and wallet/topup management
  mountAdminResellerAndPaymentRoutes(router, resellerDeps);
  mountAdminWalletAndTopupRoutes(router, resellerDeps);

  return router;
}
