import type {
  DiscountCode,
  DiscountUsage,
  LeaderboardRange,
  Order,
  OrderItemSnapshot,
  Product,
  ProductVariant,
  ResellerLeaderboardEntry,
  ResellerProfile,
  ResellerTopup,
  ShippingSetting,
  WalletTransaction,
} from './types';

export const RESELLER_REGISTRATION_FEE = 0;
export const RESELLER_DISCOUNT_MULTIPLIER = 0.8;
export const TOPUP_FEE_PERCENTAGE = 10;
export const DEFAULT_TOPUP_MIN = 10000;
export const DEFAULT_TOPUP_MAX = 10000000;
export const TOPUP_PRESET_AMOUNTS = [10000, 20000, 50000, 100000, 200000, 500000];

export function calculateResellerPrice(normalPrice: number): number {
  const safe = Number.isFinite(normalPrice) ? Math.max(0, normalPrice) : 0;
  return Math.max(0, Math.round(safe * RESELLER_DISCOUNT_MULTIPLIER));
}

export function resolveProductEffectiveNormalPrice(
  product: Pick<Product, 'price' | 'discountPrice'>,
  variantPriceDelta = 0
): number {
  const delta = Number.isFinite(variantPriceDelta) ? variantPriceDelta : 0;
  const hasSale =
    typeof product.discountPrice === 'number' &&
    product.discountPrice >= 0 &&
    product.discountPrice < product.price;
  return Math.max(0, Math.round((hasSale ? (product.discountPrice as number) : product.price) + delta));
}

export function resolveProductResellerUnitPrice(
  product: Pick<Product, 'price' | 'discountPrice' | 'resellerPrice' | 'resellerPriceEnabled'>,
  variantPriceDelta = 0
): number {
  const delta = Number.isFinite(variantPriceDelta) ? variantPriceDelta : 0;
  const normalEffective = resolveProductEffectiveNormalPrice(product, delta);
  if (product.resellerPriceEnabled === false) {
    return normalEffective;
  }
  if (typeof product.resellerPrice === 'number' && Number.isFinite(product.resellerPrice) && product.resellerPrice >= 0) {
    return Math.max(0, Math.round(product.resellerPrice + delta));
  }
  const originalWithDelta = Math.max(0, Math.round(product.price + delta));
  return Math.min(normalEffective, calculateResellerPrice(originalWithDelta));
}

export function calculateTopupFee(
  amount: number,
  feePercentage = TOPUP_FEE_PERCENTAGE
): {
  amount: number;
  feePercentage: number;
  feeAmount: number;
  totalPayment: number;
  walletCredit: number;
} {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
  const safePct = Number.isFinite(feePercentage)
    ? Math.max(0, Math.min(100, feePercentage))
    : 0;
  const feeAmount = Math.round((safeAmount * safePct) / 100);
  return {
    amount: safeAmount,
    feePercentage: safePct,
    feeAmount,
    totalPayment: safeAmount + feeAmount,
    walletCredit: safeAmount,
  };
}

export type TopupRevenueRange = 'today' | '7d' | '30d' | 'month' | 'all' | 'custom';

export interface TopupFeeStats {
  range: TopupRevenueRange;
  totalSaldoWallet: number;
  totalFeeCollected: number;
  totalQrisPayments: number;
  totalTransactions: number;
  pendingPaymentCount: number;
  pendingVerificationCount: number;
  approvedCount: number;
  rejectedCount: number;
}

export function computeTopupFeeStats(
  topups: ResellerTopup[],
  options?: {
    range?: TopupRevenueRange;
    startDate?: string;
    endDate?: string;
    now?: Date;
  }
): TopupFeeStats {
  const range: TopupRevenueRange = options?.range || 'all';
  const now = options?.now || new Date();
  let startMs: number | null = null;
  let endMs: number | null = null;

  if (range === 'custom') {
    if (options?.startDate) {
      const parsed = Date.parse(`${options.startDate}T00:00:00.000Z`);
      if (Number.isFinite(parsed)) startMs = parsed - 7 * 3600 * 1000;
    }
    if (options?.endDate) {
      const parsed = Date.parse(`${options.endDate}T23:59:59.999Z`);
      if (Number.isFinite(parsed)) endMs = parsed - 7 * 3600 * 1000;
    }
  } else if (range !== 'all') {
    startMs = getRangeStartMs(range, now);
    endMs = now.getTime() + 60_000;
  }

  const inRange = topups.filter((t) => {
    const ts = Date.parse(t.createdAt);
    if (!Number.isFinite(ts)) return false;
    if (startMs !== null && ts < startMs) return false;
    if (endMs !== null && ts > endMs) return false;
    return true;
  });

  const approved = inRange.filter((t) => t.status === 'approved');
  return {
    range,
    totalSaldoWallet: approved.reduce((sum, t) => sum + (t.walletCredit ?? t.amount ?? 0), 0),
    totalFeeCollected: approved.reduce((sum, t) => sum + (t.feeAmount || 0), 0),
    totalQrisPayments: approved.reduce(
      (sum, t) => sum + (t.totalPayment ?? (t.amount || 0) + (t.feeAmount || 0)),
      0
    ),
    totalTransactions: inRange.length,
    pendingPaymentCount: inRange.filter((t) => t.status === 'pending_payment').length,
    pendingVerificationCount: inRange.filter((t) => t.status === 'pending_verification').length,
    approvedCount: approved.length,
    rejectedCount: inRange.filter((t) => t.status === 'rejected').length,
  };
}

export function reconcileWalletLedger(transactions: WalletTransaction[]): number {
  let sum = 0;
  for (const tx of transactions) {
    if (
      tx.type === 'topup' ||
      tx.type === 'topup_bonus' ||
      tx.type === 'refund' ||
      tx.type === 'manual_credit'
    ) {
      sum += Math.abs(Math.round(tx.amount));
    } else if (tx.type === 'purchase' || tx.type === 'manual_debit') {
      sum -= Math.abs(Math.round(tx.amount));
    } else if (tx.type === 'adjustment') {
      sum += Math.round(tx.amount);
    }
  }
  return sum;
}

export function formatIDR(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  if (safe < 0) {
    return `-Rp${Math.abs(safe).toLocaleString('id-ID')}`;
  }
  return `Rp${safe.toLocaleString('id-ID')}`;
}

export function normalizeWhatsappNumber(input: string): string {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) {
    return `62${digits.slice(1)}`;
  }
  if (digits.startsWith('8')) {
    return `62${digits}`;
  }
  return digits;
}

export function isValidWhatsappNumber(input: string): boolean {
  const normalized = normalizeWhatsappNumber(input);
  return /^628[1-9][0-9]{7,12}$/.test(normalized);
}

export function maskWhatsappNumber(input: string): string {
  const digits = normalizeWhatsappNumber(input);
  if (digits.length < 7) return '****';
  const head = digits.slice(0, 5);
  const tail = digits.slice(-3);
  return `+${head}****${tail}`;
}

export function maskAddress(address?: string): string | undefined {
  if (!address || !address.trim()) return undefined;
  const trimmed = address.trim();
  if (trimmed.length <= 16) return `${trimmed.slice(0, 4)}***`;
  return `${trimmed.slice(0, 14)}... (disamarkan untuk privasi)`;
}

export interface PricedLineItem {
  product: Product;
  variant?: ProductVariant;
  quantity: number;
  originalUnitPrice: number;
  effectiveUnitPrice: number;
  lineSubtotal: number;
  productDiscountPerUnit: number;
  resellerDiscountPerUnit: number;
  pricingTier: 'normal' | 'reseller';
}

export interface CartComputationResult {
  items: PricedLineItem[];
  pricingTier: 'normal' | 'reseller';
  subtotalOriginal: number;
  productDiscountTotal: number;
  resellerDiscountTotal: number;
  subtotalAfterProductDiscount: number;
  requiresShippingAddress: boolean;
}

export function computeServerSideCart(
  requestedItems: Array<{ productId: string; variantId?: string; quantity: number }>,
  products: Product[],
  variants: ProductVariant[],
  options?: { isReseller?: boolean }
): { ok: true; data: CartComputationResult } | { ok: false; error: string } {
  if (!Array.isArray(requestedItems) || requestedItems.length === 0) {
    return { ok: false, error: 'Keranjang belanja tidak boleh kosong.' };
  }

  const isReseller = Boolean(options?.isReseller);
  const productMap = new Map(products.map((p) => [p.id, p]));
  const variantMap = new Map(variants.map((v) => [v.id, v]));
  const aggregated = new Map<string, { productId: string; variantId?: string; quantity: number }>();

  for (const raw of requestedItems) {
    const qty = Math.floor(Number(raw.quantity));
    if (!raw.productId || !Number.isFinite(qty) || qty < 1) {
      return { ok: false, error: 'Jumlah item pada keranjang tidak valid.' };
    }
    const key = `${raw.productId}::${raw.variantId || ''}`;
    const prev = aggregated.get(key);
    if (prev) {
      prev.quantity += qty;
    } else {
      aggregated.set(key, { productId: raw.productId, variantId: raw.variantId, quantity: qty });
    }
  }

  const pricedItems: PricedLineItem[] = [];
  let subtotalOriginal = 0;
  let productDiscountTotal = 0;
  let resellerDiscountTotal = 0;
  let subtotalAfterProductDiscount = 0;
  let requiresShippingAddress = false;

  for (const entry of aggregated.values()) {
    const product = productMap.get(entry.productId);
    if (!product || !product.active) {
      return { ok: false, error: 'Salah satu produk tidak ditemukan atau sedang nonaktif.' };
    }
    if (product.availabilityStatus === 'out_of_stock') {
      return { ok: false, error: `Produk "${product.name}" sedang tidak tersedia.` };
    }

    let variant: ProductVariant | undefined;
    let availableStock = product.stock;
    let delta = 0;

    if (entry.variantId) {
      variant = variantMap.get(entry.variantId);
      if (!variant || !variant.active || variant.productId !== product.id) {
        return { ok: false, error: `Varian untuk produk "${product.name}" tidak tersedia.` };
      }
      availableStock = Math.min(product.stock, variant.stock);
      delta = variant.priceDelta || 0;
    }

    if (availableStock < entry.quantity) {
      return {
        ok: false,
        error: `Stok "${product.name}"${variant ? ` (${variant.name})` : ''} tersisa ${availableStock}.`,
      };
    }

    const originalUnitPrice = Math.max(0, product.price + delta);
    const normalEffectivePrice = resolveProductEffectiveNormalPrice(product, delta);

    let effectiveUnitPrice = normalEffectivePrice;
    let productDiscountPerUnit = 0;
    let resellerDiscountPerUnit = 0;

    if (isReseller) {
      effectiveUnitPrice = resolveProductResellerUnitPrice(product, delta);
      resellerDiscountPerUnit = Math.max(0, originalUnitPrice - effectiveUnitPrice);
    } else {
      effectiveUnitPrice = normalEffectivePrice;
      productDiscountPerUnit = Math.max(0, originalUnitPrice - effectiveUnitPrice);
    }

    const lineSubtotal = effectiveUnitPrice * entry.quantity;

    subtotalOriginal += originalUnitPrice * entry.quantity;
    productDiscountTotal += productDiscountPerUnit * entry.quantity;
    resellerDiscountTotal += resellerDiscountPerUnit * entry.quantity;
    subtotalAfterProductDiscount += lineSubtotal;
    if (product.requiresShipping) {
      requiresShippingAddress = true;
    }

    pricedItems.push({
      product,
      variant,
      quantity: entry.quantity,
      originalUnitPrice,
      effectiveUnitPrice,
      lineSubtotal,
      productDiscountPerUnit,
      resellerDiscountPerUnit,
      pricingTier: isReseller ? 'reseller' : 'normal',
    });
  }

  return {
    ok: true,
    data: {
      items: pricedItems,
      pricingTier: isReseller ? 'reseller' : 'normal',
      subtotalOriginal,
      productDiscountTotal,
      resellerDiscountTotal,
      subtotalAfterProductDiscount,
      requiresShippingAddress,
    },
  };
}

export type DiscountValidationResult =
  | {
      valid: true;
      discount: DiscountCode;
      discountAmount: number;
      eligibleSubtotal: number;
      message: string;
    }
  | {
      valid: false;
      codeStatus:
        | 'invalid'
        | 'inactive'
        | 'not_started'
        | 'expired'
        | 'quota_exhausted'
        | 'customer_limit'
        | 'not_eligible'
        | 'min_purchase'
        | 'reseller_no_stack';
      message: string;
    };

export function validateDiscountCode(params: {
  rawCode: string;
  discountCodes: DiscountCode[];
  discountUsages: DiscountUsage[];
  pricedItems: PricedLineItem[];
  customerWhatsapp?: string;
  isReseller?: boolean;
  allowResellerStackPromo?: boolean;
  now?: Date;
}): DiscountValidationResult {
  if (params.isReseller && !params.allowResellerStackPromo) {
    return {
      valid: false,
      codeStatus: 'reseller_no_stack',
      message: 'Harga khusus reseller (diskon 20%) tidak dapat digabung dengan kode promo lain.',
    };
  }

  const normalizedCode = String(params.rawCode || '').trim().toUpperCase();
  if (!normalizedCode) {
    return { valid: false, codeStatus: 'invalid', message: 'Kode tidak valid.' };
  }

  const discount = params.discountCodes.find(
    (d) => d.code.trim().toUpperCase() === normalizedCode
  );
  if (!discount) {
    return { valid: false, codeStatus: 'invalid', message: 'Kode tidak valid.' };
  }
  if (!discount.active) {
    return { valid: false, codeStatus: 'inactive', message: 'Kode tidak valid atau sedang nonaktif.' };
  }
  if (discount.eligibleTier === 'reseller' && !params.isReseller) {
    return {
      valid: false,
      codeStatus: 'not_eligible',
      message: 'Kode promo ini khusus untuk akun reseller resmi.',
    };
  }
  if (discount.eligibleTier === 'customer' && params.isReseller) {
    return {
      valid: false,
      codeStatus: 'not_eligible',
      message: 'Kode promo ini hanya berlaku untuk pembeli reguler.',
    };
  }

  const nowMs = (params.now || new Date()).getTime();
  const startMs = Date.parse(discount.startDate);
  const endMs = Date.parse(discount.endDate);

  if (Number.isFinite(startMs) && nowMs < startMs) {
    return { valid: false, codeStatus: 'not_started', message: 'Kode diskon belum berlaku.' };
  }
  if (Number.isFinite(endMs) && nowMs > endMs) {
    return { valid: false, codeStatus: 'expired', message: 'Kode sudah kedaluwarsa.' };
  }

  if (discount.maxTotalUsage > 0 && discount.usedCount >= discount.maxTotalUsage) {
    return { valid: false, codeStatus: 'quota_exhausted', message: 'Kuota kode sudah habis.' };
  }

  const normalizedWa = normalizeWhatsappNumber(params.customerWhatsapp || '');
  if (normalizedWa && discount.maxPerCustomer > 0) {
    const usedByCustomer = params.discountUsages.filter(
      (u) =>
        u.discountCodeId === discount.id &&
        normalizeWhatsappNumber(u.customerWhatsapp) === normalizedWa
    ).length;
    if (usedByCustomer >= discount.maxPerCustomer) {
      return {
        valid: false,
        codeStatus: 'customer_limit',
        message: 'Batas penggunaan kode untuk nomor WhatsApp ini sudah tercapai.',
      };
    }
  }

  const hasProductScope = discount.applicableProductIds && discount.applicableProductIds.length > 0;
  const hasCategoryScope = discount.applicableCategoryIds && discount.applicableCategoryIds.length > 0;

  let eligibleSubtotal = 0;
  for (const item of params.pricedItems) {
    const matchesProduct = !hasProductScope || discount.applicableProductIds.includes(item.product.id);
    const matchesCategory =
      !hasCategoryScope || discount.applicableCategoryIds.includes(item.product.categoryId);
    if (matchesProduct && matchesCategory) {
      eligibleSubtotal += item.lineSubtotal;
    }
  }

  if (eligibleSubtotal <= 0) {
    return { valid: false, codeStatus: 'not_eligible', message: 'Produk tidak memenuhi syarat.' };
  }

  if (eligibleSubtotal < discount.minPurchase) {
    return {
      valid: false,
      codeStatus: 'min_purchase',
      message: `Minimal pembelian belum tercapai (min. ${formatIDR(discount.minPurchase)}).`,
    };
  }

  let rawDiscount = 0;
  if (discount.type === 'percentage') {
    rawDiscount = Math.round((eligibleSubtotal * discount.value) / 100);
    if (typeof discount.maxDiscount === 'number' && discount.maxDiscount > 0) {
      rawDiscount = Math.min(rawDiscount, discount.maxDiscount);
    }
  } else {
    rawDiscount = Math.round(discount.value);
  }

  const discountAmount = Math.max(0, Math.min(rawDiscount, eligibleSubtotal));

  return {
    valid: true,
    discount,
    discountAmount,
    eligibleSubtotal,
    message: `Kode berhasil digunakan! Hemat ${formatIDR(discountAmount)}.`,
  };
}

export function calculateOrderTotals(params: {
  subtotalAfterProductDiscount: number;
  couponDiscount: number;
  shippingSetting?: ShippingSetting;
  taxPercent: number;
}): {
  shippingCost: number;
  taxAmount: number;
  totalAmount: number;
} {
  const baseAfterCoupon = Math.max(0, params.subtotalAfterProductDiscount - params.couponDiscount);
  const shippingCost = params.shippingSetting ? Math.max(0, Math.round(params.shippingSetting.cost)) : 0;
  const taxRate = Math.max(0, Number(params.taxPercent) || 0);
  const taxAmount = Math.round((baseAfterCoupon * taxRate) / 100);
  const totalAmount = Math.max(0, baseAfterCoupon + shippingCost + taxAmount);
  return { shippingCost, taxAmount, totalAmount };
}

export function getRangeStartMs(range: LeaderboardRange, now: Date = new Date()): number | null {
  if (range === 'all') return null;
  const jakartaDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = jakartaDate.split('-').map(Number);
  const startOfTodayJakartaMs = Date.UTC(y, m - 1, d, 0, 0, 0) - 7 * 3600 * 1000;

  if (range === 'today') return startOfTodayJakartaMs;
  if (range === '7d') return startOfTodayJakartaMs - 6 * 24 * 3600 * 1000;
  if (range === '30d') return startOfTodayJakartaMs - 29 * 24 * 3600 * 1000;
  if (range === 'month') {
    return Date.UTC(y, m - 1, 1, 0, 0, 0) - 7 * 3600 * 1000;
  }
  return null;
}

export function computeResellerLeaderboard(params: {
  resellers: ResellerProfile[];
  orders: Order[];
  orderItems: OrderItemSnapshot[];
  range: LeaderboardRange;
  now?: Date;
}): ResellerLeaderboardEntry[] {
  const startMs = getRangeStartMs(params.range, params.now);
  const nowMs = (params.now || new Date()).getTime();

  const itemsByOrder = new Map<string, OrderItemSnapshot[]>();
  for (const item of params.orderItems) {
    const arr = itemsByOrder.get(item.orderId) || [];
    arr.push(item);
    itemsByOrder.set(item.orderId, arr);
  }

  const validAttributedOrders = params.orders.filter((ord) => {
    if (!ord.attributedResellerId) return false;
    // Strictly count paid and non-cancelled orders only!
    if (ord.paymentStatus !== 'paid' || ord.orderStatus === 'cancelled') return false;
    const ts = Date.parse(ord.createdAt);
    if (startMs !== null && Number.isFinite(ts) && ts < startMs) return false;
    if (Number.isFinite(ts) && ts > nowMs + 60_000) return false;
    return true;
  });

  const rows: Omit<ResellerLeaderboardEntry, 'rank'>[] = params.resellers.map((reseller) => {
    const ordersForReseller = validAttributedOrders.filter(
      (o) => o.attributedResellerId === reseller.id
    );
    let totalAttributedSales = 0;
    let attributedProductQty = 0;
    const productTally = new Map<string, { name: string; qty: number }>();

    for (const ord of ordersForReseller) {
      totalAttributedSales += ord.totalAmount;
      const ordItems = itemsByOrder.get(ord.id) || [];
      for (const item of ordItems) {
        attributedProductQty += item.quantity;
        const prev = productTally.get(item.productId) || {
          name: item.productNameSnapshot,
          qty: 0,
        };
        prev.qty += item.quantity;
        productTally.set(item.productId, prev);
      }
    }

    let topProductName = '-';
    let topProductQty = 0;
    for (const entry of productTally.values()) {
      if (entry.qty > topProductQty) {
        topProductQty = entry.qty;
        topProductName = entry.name;
      }
    }

    return {
      resellerId: reseller.id,
      userId: reseller.userId,
      name: reseller.name,
      username: reseller.username,
      referralCode: reseller.referralCode,
      status: reseller.status,
      joinedAt: reseller.joinedAt,
      totalAttributedSales,
      attributedOrderCount: ordersForReseller.length,
      attributedProductQty,
      topProductName,
      topProductQty,
    };
  });

  rows.sort((a, b) => {
    if (b.totalAttributedSales !== a.totalAttributedSales) {
      return b.totalAttributedSales - a.totalAttributedSales;
    }
    if (b.attributedOrderCount !== a.attributedOrderCount) {
      return b.attributedOrderCount - a.attributedOrderCount;
    }
    if (b.attributedProductQty !== a.attributedProductQty) {
      return b.attributedProductQty - a.attributedProductQty;
    }
    return a.name.localeCompare(b.name);
  });

  return rows.map((row, idx) => ({
    rank: idx + 1,
    ...row,
  }));
}

export function buildWhatsAppConfirmationMessage(params: {
  orderNumber: string;
  customerName: string;
  customerWhatsapp: string;
  items: OrderItemSnapshot[];
  totalAmount: number;
  confirmationTime: string;
  receiptUrl: string;
  receiptToken: string;
}): string {
  const productLines = params.items
    .map(
      (item) =>
        `- ${item.productNameSnapshot}${item.variantNameSnapshot ? ` (${item.variantNameSnapshot})` : ''} x${item.quantity} (${formatIDR(item.lineSubtotal)})`
    )
    .join('\n');

  return `Halo Admin Catrizzz Store, saya sudah melakukan pembayaran dan ingin mengonfirmasi pesanan saya.

DETAIL TRANSAKSI

Nomor Pesanan: ${params.orderNumber}
Nama Pembeli: ${params.customerName}
Nomor WhatsApp: ${params.customerWhatsapp}
Produk:
${productLines}
Total Pembayaran: ${formatIDR(params.totalAmount)}
Metode Pembayaran: QRIS
Waktu Konfirmasi: ${params.confirmationTime}

Status: MENUNGGU VERIFIKASI ADMIN

LINK RESI:
${params.receiptUrl}

Kode Akses Resi:
${params.receiptToken}

Mohon bantu verifikasi pembayaran saya.

Terima kasih.`;
}

export function buildWhatsAppConfirmationUrl(
  storeWhatsappNumber: string,
  message: string
): string {
  const target = normalizeWhatsappNumber(storeWhatsappNumber) || '6287738172871';
  return `https://wa.me/${target}?text=${encodeURIComponent(message)}`;
}

export function buildTopupWhatsAppMessage(params: {
  topupNumber: string;
  resellerId: string;
  resellerName: string;
  resellerUsername: string;
  resellerWhatsapp: string;
  amount: number;
  feeAmount: number;
  totalPayment: number;
  walletCredit: number;
  feePercentage?: number;
  confirmationTime: string;
}): string {
  const pct =
    typeof params.feePercentage === 'number'
      ? params.feePercentage
      : TOPUP_FEE_PERCENTAGE;
  return `Halo Admin Catrizzz Store, saya ingin mengonfirmasi top up saldo reseller.

DETAIL TOP UP RESELLER

ID Top Up: ${params.topupNumber}
ID Reseller: ${params.resellerId}
Nama Reseller: ${params.resellerName}
Username: @${params.resellerUsername}
Nomor WhatsApp: ${params.resellerWhatsapp}

Nominal Saldo Masuk Wallet: ${formatIDR(params.walletCredit)}
Biaya Tambahan Top Up (${pct}%): +${formatIDR(params.feeAmount)}
Total Pembayaran QRIS: ${formatIDR(params.totalPayment)}
Metode Pembayaran: QRIS

Waktu Konfirmasi: ${params.confirmationTime}
Status: MENUNGGU VERIFIKASI ADMIN

Mohon bantu verifikasi pembayaran top up saya agar saldo sebesar ${formatIDR(params.walletCredit)} dapat segera masuk ke wallet reseller.

Terima kasih.`;
}
