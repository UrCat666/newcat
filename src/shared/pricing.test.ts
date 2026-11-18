import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTopupWhatsAppMessage,
  buildWhatsAppConfirmationMessage,
  buildWhatsAppConfirmationUrl,
  calculateOrderTotals,
  calculateResellerPrice,
  calculateTopupFee,
  computeResellerLeaderboard,
  computeServerSideCart,
  computeTopupFeeStats,
  formatIDR,
  isValidWhatsappNumber,
  maskWhatsappNumber,
  normalizeWhatsappNumber,
  reconcileWalletLedger,
  RESELLER_REGISTRATION_FEE,
  resolveProductResellerUnitPrice,
  TOPUP_FEE_PERCENTAGE,
  validateDiscountCode,
} from './pricing';
import type {
  DiscountCode,
  Order,
  OrderItemSnapshot,
  Product,
  ProductVariant,
  ResellerProfile,
  ResellerTopup,
  WalletTransaction,
} from './types';

const nowIso = '2026-11-14T00:00:00.000Z';

const sampleProducts: Product[] = [
  {
    id: 'prod-1',
    name: 'ChatGPT Plus Workspace',
    slug: 'chatgpt-plus-workspace',
    description: 'Langganan AI produktivitas',
    additionalInfo: '',
    subscriptionDuration: '1 Bulan',
    availabilityStatus: 'available',
    categoryId: 'cat-ai',
    price: 500000,
    discountPrice: 400000,
    stock: 5,
    soldCount: 10,
    rating: 4.9,
    reviewCount: 12,
    badge: 'Best Seller',
    imageUrl: '/img1.jpg',
    galleryUrls: [],
    featured: true,
    active: true,
    requiresShipping: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'prod-2',
    name: 'Canva Pro Out Of Stock',
    slug: 'canva-pro-out',
    description: 'Digital',
    additionalInfo: '',
    subscriptionDuration: '1 Tahun',
    availabilityStatus: 'out_of_stock',
    categoryId: 'cat-digital',
    price: 50000,
    discountPrice: null,
    stock: 20,
    soldCount: 5,
    rating: 4.8,
    reviewCount: 4,
    badge: 'New',
    imageUrl: '/img2.jpg',
    galleryUrls: [],
    featured: false,
    active: true,
    requiresShipping: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

const sampleVariants: ProductVariant[] = [
  {
    id: 'var-1',
    productId: 'prod-1',
    name: 'Private 1 Bulan',
    priceDelta: 25000,
    stock: 3,
    active: true,
  },
];

const sampleDiscounts: DiscountCode[] = [
  {
    id: 'disc-1',
    promoName: 'Promo Catrizzz 20%',
    code: 'CATRIZZZ20',
    description: 'Diskon 20% maks Rp25.000',
    type: 'percentage',
    value: 20,
    minPurchase: 50000,
    maxDiscount: 25000,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2027-12-31T23:59:59.000Z',
    maxTotalUsage: 100,
    maxPerCustomer: 2,
    usedCount: 0,
    applicableProductIds: [],
    applicableCategoryIds: [],
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'disc-expired',
    promoName: 'Expired',
    code: 'EXPIRED50',
    description: 'Old',
    type: 'percentage',
    value: 50,
    minPurchase: 0,
    maxDiscount: null,
    startDate: '2025-01-01T00:00:00.000Z',
    endDate: '2025-12-31T00:00:00.000Z',
    maxTotalUsage: 10,
    maxPerCustomer: 1,
    usedCount: 0,
    applicableProductIds: [],
    applicableCategoryIds: [],
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
  {
    id: 'disc-full',
    promoName: 'Habis',
    code: 'KUOTAHABIS',
    description: 'Full',
    type: 'fixed',
    value: 10000,
    minPurchase: 0,
    maxDiscount: null,
    startDate: '2026-01-01T00:00:00.000Z',
    endDate: '2027-12-31T00:00:00.000Z',
    maxTotalUsage: 5,
    maxPerCustomer: 1,
    usedCount: 5,
    applicableProductIds: [],
    applicableCategoryIds: [],
    active: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  },
];

test('formatIDR formats Indonesian Rupiah accurately', () => {
  assert.equal(formatIDR(10000), 'Rp10.000');
  assert.equal(formatIDR(0), 'Rp0');
});

test('WhatsApp normalization, validation, and masking work correctly', () => {
  assert.equal(normalizeWhatsappNumber('0877-3817-2871'), '6287738172871');
  assert.equal(isValidWhatsappNumber('087738172871'), true);
  assert.equal(isValidWhatsappNumber('12345'), false);
  assert.equal(maskWhatsappNumber('6287738172871'), '+62877****871');
});

test('computeServerSideCart uses database prices and enforces variant stock & availabilityStatus', () => {
  const res = computeServerSideCart(
    [{ productId: 'prod-1', variantId: 'var-1', quantity: 2 }],
    sampleProducts,
    sampleVariants
  );
  assert.equal(res.ok, true);
  if (res.ok) {
    assert.equal(res.data.subtotalAfterProductDiscount, 850000);
    assert.equal(res.data.productDiscountTotal, 200000);
    assert.equal(res.data.requiresShippingAddress, false);
  }

  const overStock = computeServerSideCart(
    [{ productId: 'prod-1', variantId: 'var-1', quantity: 4 }],
    sampleProducts,
    sampleVariants
  );
  assert.equal(overStock.ok, false);

  const outOfStockStatus = computeServerSideCart(
    [{ productId: 'prod-2', quantity: 1 }],
    sampleProducts,
    sampleVariants
  );
  assert.equal(outOfStockStatus.ok, false);
});

test('validateDiscountCode enforces cap, expiry, quota, and min purchase', () => {
  const cart = computeServerSideCart(
    [{ productId: 'prod-1', quantity: 1 }],
    sampleProducts,
    sampleVariants
  );
  assert.equal(cart.ok, true);
  if (!cart.ok) return;

  const valid = validateDiscountCode({
    rawCode: 'catrizzz20',
    discountCodes: sampleDiscounts,
    discountUsages: [],
    pricedItems: cart.data.items,
    now: new Date('2026-11-14T12:00:00.000Z'),
  });
  assert.equal(valid.valid, true);
  if (valid.valid) {
    // 20% of 400.000 = 80.000, capped at 25.000
    assert.equal(valid.discountAmount, 25000);
  }

  const expired = validateDiscountCode({
    rawCode: 'EXPIRED50',
    discountCodes: sampleDiscounts,
    discountUsages: [],
    pricedItems: cart.data.items,
    now: new Date('2026-11-14T12:00:00.000Z'),
  });
  assert.equal(expired.valid, false);
  if (!expired.valid) assert.equal(expired.codeStatus, 'expired');

  const full = validateDiscountCode({
    rawCode: 'KUOTAHABIS',
    discountCodes: sampleDiscounts,
    discountUsages: [],
    pricedItems: cart.data.items,
    now: new Date('2026-11-14T12:00:00.000Z'),
  });
  assert.equal(full.valid, false);
  if (!full.valid) assert.equal(full.codeStatus, 'quota_exhausted');
});

test('calculateOrderTotals and WhatsApp message builder produce accurate output', () => {
  const totals = calculateOrderTotals({
    subtotalAfterProductDiscount: 400000,
    couponDiscount: 25000,
    shippingSetting: {
      id: 'ship-1',
      name: 'Reguler',
      description: 'JNE',
      type: 'physical',
      cost: 15000,
      requiresAddress: true,
      active: true,
    },
    taxPercent: 0,
  });
  assert.equal(totals.totalAmount, 390000);

  const msg = buildWhatsAppConfirmationMessage({
    orderNumber: 'CTR-20261114-0001',
    customerName: 'Budi Santoso',
    customerWhatsapp: '6281234567890',
    items: [
      {
        id: 'i1',
        orderId: 'o1',
        productId: 'prod-1',
        productNameSnapshot: 'Headset Pro',
        productImageSnapshot: '/img1.jpg',
        unitPriceSnapshot: 400000,
        originalUnitPriceSnapshot: 500000,
        quantity: 1,
        lineSubtotal: 400000,
      },
    ],
    totalAmount: 390000,
    confirmationTime: '14 Nov 2026 15:00 WIB',
    receiptUrl: 'https://catrizzz.store/resi/CTRZ-abc',
    receiptToken: 'CTRZ-abc',
  });
  assert.match(msg, /CTR-20261114-0001/);
  assert.match(msg, /Rp390\.000/);
  assert.match(msg, /MENUNGGU VERIFIKASI ADMIN/);

  const url = buildWhatsAppConfirmationUrl('6287738172871', msg);
  assert.ok(url.startsWith('https://wa.me/6287738172871?text='));
});

test('calculateResellerPrice applies exact 20% discount from Normal Price and blocks promo stacking by default', () => {
  assert.equal(RESELLER_REGISTRATION_FEE, 0);
  assert.equal(calculateResellerPrice(100000), 80000);
  assert.equal(calculateResellerPrice(50000), 40000);
  assert.equal(calculateResellerPrice(25000), 20000);

  const resellerCart = computeServerSideCart(
    [{ productId: 'prod-1', quantity: 1 }],
    sampleProducts,
    sampleVariants,
    { isReseller: true }
  );
  assert.equal(resellerCart.ok, true);
  if (resellerCart.ok) {
    assert.equal(resellerCart.data.pricingTier, 'reseller');
    // Normal price is 500.000 -> Reseller price is 400.000 (20% off Normal Price)
    assert.equal(resellerCart.data.subtotalOriginal, 500000);
    assert.equal(resellerCart.data.subtotalAfterProductDiscount, 400000);
    assert.equal(resellerCart.data.resellerDiscountTotal, 100000);
  }

  if (resellerCart.ok) {
    const blockedPromo = validateDiscountCode({
      rawCode: 'CATRIZZZ20',
      discountCodes: sampleDiscounts,
      discountUsages: [],
      pricedItems: resellerCart.data.items,
      isReseller: true,
      allowResellerStackPromo: false,
      now: new Date('2026-11-14T12:00:00.000Z'),
    });
    assert.equal(blockedPromo.valid, false);
    if (!blockedPromo.valid) {
      assert.equal(blockedPromo.codeStatus, 'reseller_no_stack');
    }

    const allowedPromo = validateDiscountCode({
      rawCode: 'CATRIZZZ20',
      discountCodes: sampleDiscounts,
      discountUsages: [],
      pricedItems: resellerCart.data.items,
      isReseller: true,
      allowResellerStackPromo: true,
      now: new Date('2026-11-14T12:00:00.000Z'),
    });
    assert.equal(allowedPromo.valid, true);
  }
});

test('computeResellerLeaderboard counts ONLY paid and non-cancelled attributed orders', () => {
  const resellers: ResellerProfile[] = [
    {
      id: 'rsl-1',
      userId: 'usr-1',
      username: 'andi',
      name: 'Andi Reseller',
      referralCode: 'CAT-ANDI-1111',
      status: 'active',
      applicationId: 'app-1',
      joinedAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'rsl-2',
      userId: 'usr-2',
      username: 'budi',
      name: 'Budi Reseller',
      referralCode: 'CAT-BUDI-2222',
      status: 'active',
      applicationId: 'app-2',
      joinedAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const orders: Order[] = [
    {
      id: 'ord-paid-1',
      orderNumber: 'CTR-20261114-0001',
      idempotencyKey: 'k1',
      attributedResellerId: 'rsl-2',
      customerId: 'c1',
      customerName: 'Pembeli 1',
      customerWhatsapp: '6281111111111',
      shippingMethodId: 'ship-1',
      shippingMethodName: 'Digital',
      subtotal: 100000,
      productDiscountTotal: 0,
      couponDiscount: 0,
      shippingCost: 0,
      taxAmount: 0,
      totalAmount: 100000,
      paymentStatus: 'paid',
      orderStatus: 'completed',
      receiptTokenHash: 'h1',
      receiptTokenMasked: 'CTRZ-1',
      receiptActive: true,
      createdAt: '2026-11-14T09:00:00.000Z',
      updatedAt: '2026-11-14T09:00:00.000Z',
    },
    {
      // Pending verification must NOT count!
      id: 'ord-pending',
      orderNumber: 'CTR-20261114-0002',
      idempotencyKey: 'k2',
      attributedResellerId: 'rsl-1',
      customerId: 'c2',
      customerName: 'Pembeli 2',
      customerWhatsapp: '6282222222222',
      shippingMethodId: 'ship-1',
      shippingMethodName: 'Digital',
      subtotal: 900000,
      productDiscountTotal: 0,
      couponDiscount: 0,
      shippingCost: 0,
      taxAmount: 0,
      totalAmount: 900000,
      paymentStatus: 'pending_verification',
      orderStatus: 'pending_payment',
      receiptTokenHash: 'h2',
      receiptTokenMasked: 'CTRZ-2',
      receiptActive: true,
      createdAt: '2026-11-14T10:00:00.000Z',
      updatedAt: '2026-11-14T10:00:00.000Z',
    },
    {
      // Paid but cancelled must NOT count!
      id: 'ord-cancelled',
      orderNumber: 'CTR-20261114-0003',
      idempotencyKey: 'k3',
      attributedResellerId: 'rsl-1',
      customerId: 'c3',
      customerName: 'Pembeli 3',
      customerWhatsapp: '6283333333333',
      shippingMethodId: 'ship-1',
      shippingMethodName: 'Digital',
      subtotal: 500000,
      productDiscountTotal: 0,
      couponDiscount: 0,
      shippingCost: 0,
      taxAmount: 0,
      totalAmount: 500000,
      paymentStatus: 'paid',
      orderStatus: 'cancelled',
      receiptTokenHash: 'h3',
      receiptTokenMasked: 'CTRZ-3',
      receiptActive: true,
      createdAt: '2026-11-14T10:30:00.000Z',
      updatedAt: '2026-11-14T10:30:00.000Z',
    },
  ];

  const items: OrderItemSnapshot[] = [
    {
      id: 'oi-1',
      orderId: 'ord-paid-1',
      productId: 'prod-1',
      productNameSnapshot: 'ChatGPT Plus Workspace',
      productImageSnapshot: '/img.jpg',
      unitPriceSnapshot: 100000,
      originalUnitPriceSnapshot: 100000,
      quantity: 2,
      lineSubtotal: 100000,
    },
  ];

  const leaderboard = computeResellerLeaderboard({
    resellers,
    orders,
    orderItems: items,
    range: 'all',
    now: new Date('2026-11-14T12:00:00.000Z'),
  });

  assert.equal(leaderboard.length, 2);
  assert.equal(leaderboard[0].resellerId, 'rsl-2');
  assert.equal(leaderboard[0].rank, 1);
  assert.equal(leaderboard[0].totalAttributedSales, 100000);
  assert.equal(leaderboard[0].attributedOrderCount, 1);
  assert.equal(leaderboard[0].topProductName, 'ChatGPT Plus Workspace');

  assert.equal(leaderboard[1].resellerId, 'rsl-1');
  assert.equal(leaderboard[1].totalAttributedSales, 0);
  assert.equal(leaderboard[1].attributedOrderCount, 0);
});

test('calculateTopupFee computes exact 10% fee: totalPayment = amount + feeAmount and walletCredit = amount', () => {
  assert.equal(TOPUP_FEE_PERCENTAGE, 10);
  assert.deepEqual(calculateTopupFee(10000), {
    amount: 10000,
    feePercentage: 10,
    feeAmount: 1000,
    totalPayment: 11000,
    walletCredit: 10000,
  });
  assert.deepEqual(calculateTopupFee(20000), {
    amount: 20000,
    feePercentage: 10,
    feeAmount: 2000,
    totalPayment: 22000,
    walletCredit: 20000,
  });
  assert.deepEqual(calculateTopupFee(50000), {
    amount: 50000,
    feePercentage: 10,
    feeAmount: 5000,
    totalPayment: 55000,
    walletCredit: 50000,
  });
  assert.deepEqual(calculateTopupFee(100000), {
    amount: 100000,
    feePercentage: 10,
    feeAmount: 10000,
    totalPayment: 110000,
    walletCredit: 100000,
  });
  assert.deepEqual(calculateTopupFee(200000), {
    amount: 200000,
    feePercentage: 10,
    feeAmount: 20000,
    totalPayment: 220000,
    walletCredit: 200000,
  });
  assert.deepEqual(calculateTopupFee(125500), {
    amount: 125500,
    feePercentage: 10,
    feeAmount: 12550,
    totalPayment: 138050,
    walletCredit: 125500,
  });
  assert.deepEqual(calculateTopupFee(100000, 15), {
    amount: 100000,
    feePercentage: 15,
    feeAmount: 15000,
    totalPayment: 115000,
    walletCredit: 100000,
  });
});

test('computeTopupFeeStats aggregates approved walletCredit, 10% fee revenue, and total QRIS payments across date ranges', () => {
  const sampleTopups: ResellerTopup[] = [
    {
      id: 't1',
      topupNumber: 'TOP-1',
      resellerId: 'r1',
      userId: 'u1',
      resellerName: 'A',
      resellerUsername: 'a',
      resellerWhatsapp: '6281111111111',
      amount: 100000,
      feePercentage: 10,
      feeAmount: 10000,
      totalPayment: 110000,
      walletCredit: 100000,
      method: 'QRIS',
      status: 'approved',
      credited: true,
      createdAt: '2026-11-16T08:00:00.000Z',
      updatedAt: '2026-11-16T08:05:00.000Z',
    },
    {
      id: 't2',
      topupNumber: 'TOP-2',
      resellerId: 'r1',
      userId: 'u1',
      resellerName: 'A',
      resellerUsername: 'a',
      resellerWhatsapp: '6281111111111',
      amount: 50000,
      feePercentage: 10,
      feeAmount: 5000,
      totalPayment: 55000,
      walletCredit: 50000,
      method: 'QRIS',
      status: 'pending_verification',
      credited: false,
      createdAt: '2026-11-16T09:00:00.000Z',
      updatedAt: '2026-11-16T09:05:00.000Z',
    },
    {
      id: 't3',
      topupNumber: 'TOP-3',
      resellerId: 'r2',
      userId: 'u2',
      resellerName: 'B',
      resellerUsername: 'b',
      resellerWhatsapp: '6282222222222',
      amount: 200000,
      feePercentage: 10,
      feeAmount: 20000,
      totalPayment: 220000,
      walletCredit: 200000,
      method: 'QRIS',
      status: 'approved',
      credited: true,
      createdAt: '2026-10-10T08:00:00.000Z',
      updatedAt: '2026-10-10T08:05:00.000Z',
    },
  ];

  const allStats = computeTopupFeeStats(sampleTopups, { range: 'all' });
  assert.equal(allStats.totalSaldoWallet, 300000);
  assert.equal(allStats.totalFeeCollected, 30000);
  assert.equal(allStats.totalQrisPayments, 330000);
  assert.equal(allStats.approvedCount, 2);
  assert.equal(allStats.pendingVerificationCount, 1);

  const novOnly = computeTopupFeeStats(sampleTopups, {
    range: 'custom',
    startDate: '2026-11-16',
    endDate: '2026-11-16',
  });
  assert.equal(novOnly.totalSaldoWallet, 100000);
  assert.equal(novOnly.totalFeeCollected, 10000);
  assert.equal(novOnly.totalQrisPayments, 110000);
  assert.equal(novOnly.totalTransactions, 2);
});

test('resolveProductResellerUnitPrice respects custom resellerPrice and resellerPriceEnabled=false', () => {
  const customProduct: Product = {
    ...sampleProducts[0],
    id: 'prod-custom',
    price: 200000,
    discountPrice: null,
    resellerPrice: 135000,
    resellerPriceEnabled: true,
  };
  assert.equal(resolveProductResellerUnitPrice(customProduct), 135000);
  assert.equal(resolveProductResellerUnitPrice(customProduct, 15000), 150000);

  const disabledProduct: Product = {
    ...sampleProducts[0],
    id: 'prod-disabled-rsl',
    price: 200000,
    discountPrice: 180000,
    resellerPrice: 120000,
    resellerPriceEnabled: false,
  };
  // Disabled reseller price falls back to normal effective price (discountPrice 180000)
  assert.equal(resolveProductResellerUnitPrice(disabledProduct), 180000);

  const cartRes = computeServerSideCart(
    [
      { productId: 'prod-custom', quantity: 1 },
      { productId: 'prod-disabled-rsl', quantity: 2 },
    ],
    [customProduct, disabledProduct],
    [],
    { isReseller: true }
  );
  assert.equal(cartRes.ok, true);
  if (cartRes.ok) {
    assert.equal(cartRes.data.subtotalAfterProductDiscount, 135000 + 360000);
  }
});

test('reconcileWalletLedger and buildTopupWhatsAppMessage verify wallet credit + 10% fee QRIS WA copy', () => {
  const txs: WalletTransaction[] = [
    {
      id: 'w1',
      txNumber: 'WTX-1',
      resellerId: 'rsl-1',
      userId: 'usr-1',
      type: 'topup',
      amount: 100000,
      balanceBefore: 0,
      balanceAfter: 100000,
      referenceType: 'topup',
      referenceId: 'top-1',
      description: 'Top up saldo Rp100.000 (QRIS Rp110.000 termasuk biaya 10%)',
      createdAt: nowIso,
    },
    {
      id: 'w2',
      txNumber: 'WTX-2',
      resellerId: 'rsl-1',
      userId: 'usr-1',
      type: 'purchase',
      amount: 40000,
      balanceBefore: 100000,
      balanceAfter: 60000,
      referenceType: 'order',
      referenceId: 'ord-1',
      description: 'Belanja produk',
      createdAt: nowIso,
    },
    {
      id: 'w3',
      txNumber: 'WTX-3',
      resellerId: 'rsl-1',
      userId: 'usr-1',
      type: 'refund',
      amount: 40000,
      balanceBefore: 60000,
      balanceAfter: 100000,
      referenceType: 'order',
      referenceId: 'ord-1',
      description: 'Refund pesanan',
      createdAt: nowIso,
    },
  ];
  assert.equal(reconcileWalletLedger(txs), 100000);

  const msg = buildTopupWhatsAppMessage({
    topupNumber: 'TOP-20261116-0001',
    resellerId: 'rsl-123',
    resellerName: 'Siti Aminah',
    resellerUsername: 'sitiaminah',
    resellerWhatsapp: '628123456789',
    amount: 100000,
    feeAmount: 10000,
    totalPayment: 110000,
    walletCredit: 100000,
    feePercentage: 10,
    confirmationTime: '16 Nov 2026 10:00 WIB',
  });
  assert.match(msg, /TOP-20261116-0001/);
  assert.match(msg, /Nominal Saldo Masuk Wallet: Rp100\.000/);
  assert.match(msg, /Biaya Tambahan Top Up \(10%\): \+Rp10\.000/);
  assert.match(msg, /Total Pembayaran QRIS: Rp110\.000/);
  assert.match(msg, /MENUNGGU VERIFIKASI ADMIN/);
});

