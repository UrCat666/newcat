import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { WebSocket } from 'ws';

const TEMP_DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'catrizzz-routes-test-'));
const TEMP_DB_FILE = path.join(TEMP_DB_DIR, 'store.db.json');
process.env.STORE_DB_PATH = TEMP_DB_FILE;

let server: http.Server;
let baseUrl = '';

before(async () => {
  const { createApiRouter } = await import('./routes');
  const { attachRealtimeServer } = await import('./realtime');

  const app = express();
  app.use(express.json());
  app.use('/api', createApiRouter());
  server = http.createServer(app);
  attachRealtimeServer(server);

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

const createdUploadFiles: string[] = [];

after(async () => {
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const relPath of createdUploadFiles) {
    const cleanRel = relPath.startsWith('/') ? relPath.slice(1) : relPath;
    const abs = path.resolve(process.cwd(), cleanRel);
    if (fs.existsSync(abs)) {
      try {
        fs.unlinkSync(abs);
      } catch {
        // ignore test cleanup errors
      }
    }
  }
  try {
    fs.rmSync(TEMP_DB_DIR, { recursive: true, force: true });
  } catch {
    // ignore temp cleanup errors
  }
});

test('GET /api/admin/session returns 200 without cookie while protected routes reject with 401', async () => {
  const sessionRes = await fetch(`${baseUrl}/api/admin/session`);
  assert.equal(sessionRes.status, 200);
  const sessionJson = (await sessionRes.json()) as { authenticated: boolean; admin: unknown };
  assert.equal(sessionJson.authenticated, false);
  assert.equal(sessionJson.admin, null);

  const meRes = await fetch(`${baseUrl}/api/admin/me`);
  assert.equal(meRes.status, 401);

  const res = await fetch(`${baseUrl}/api/admin/overview`);
  assert.equal(res.status, 401);
});

test('POST /api/discounts/validate validates CATRIZZZ20 and rejects invalid code', async () => {
  const sfRes = await fetch(`${baseUrl}/api/storefront`);
  assert.equal(sfRes.status, 200);
  const sf = (await sfRes.json()) as {
    featuredProducts: Array<{ id: string; variants?: Array<{ id: string }> }>;
  };
  assert.ok(sf.featuredProducts.length > 0);
  const product = sf.featuredProducts[0];
  const variantId = product.variants?.[0]?.id;

  const validRes = await fetch(`${baseUrl}/api/discounts/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'CATRIZZZ20',
      items: [{ productId: product.id, variantId, quantity: 1 }],
      customerWhatsapp: '081234567890',
    }),
  });
  assert.equal(validRes.status, 200);
  const validJson = (await validRes.json()) as { valid: boolean; discountAmount: number };
  assert.equal(validJson.valid, true);
  assert.ok(validJson.discountAmount > 0);

  const invalidRes = await fetch(`${baseUrl}/api/discounts/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: 'KODE_NGACO_999',
      items: [{ productId: product.id, variantId, quantity: 1 }],
    }),
  });
  const invalidJson = (await invalidRes.json()) as { valid: boolean };
  assert.equal(invalidJson.valid, false);
});

test('Checkout -> Payment Confirm -> Receipt Lookup enforces server pricing, pending_verification, and privacy masking', async () => {
  const sfRes = await fetch(`${baseUrl}/api/storefront`);
  const sf = (await sfRes.json()) as {
    featuredProducts: Array<{ id: string; stock: number; variants?: Array<{ id: string }> }>;
    shippingSettings: Array<{ id: string; requiresAddress: boolean }>;
  };

  const prod = sf.featuredProducts.find((p) => p.stock >= 2)!;
  const variantId = prod.variants?.[0]?.id;
  const ship = sf.shippingSettings[0];
  const idempotencyKey = `test-idem-${Date.now()}`;

  // Attempt client price tampering: server must ignore forged unitPrice/totalAmount
  const checkoutPayload = {
    idempotencyKey,
    customerName: 'Budi Santoso',
    customerWhatsapp: '081298765432',
    shippingMethodId: ship.id,
    shippingAddress: ship.requiresAddress ? 'Jl. Melati No. 12, Jakarta Selatan' : '',
    couponCode: 'CATRIZZZ20',
    unitPrice: 1,
    totalAmount: 1,
    items: [{ productId: prod.id, variantId, quantity: 1 }],
  };

  const coRes = await fetch(`${baseUrl}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(checkoutPayload),
  });
  assert.equal(coRes.status, 201);
  const coJson = (await coRes.json()) as {
    duplicate: boolean;
    orderId: string;
    orderNumber: string;
    receiptToken: string;
    totalAmount: number;
  };
  assert.equal(coJson.duplicate, false);
  assert.ok(coJson.orderNumber.startsWith('CTR-'));
  assert.ok(coJson.receiptToken.startsWith('CTRZ-'));
  assert.ok(coJson.totalAmount > 1000, 'Server must ignore client-forged totalAmount=1');

  // Re-sending the same idempotencyKey must NOT create a duplicate order
  const dupRes = await fetch(`${baseUrl}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(checkoutPayload),
  });
  assert.equal(dupRes.status, 200);
  const dupJson = (await dupRes.json()) as { duplicate: boolean; orderId: string };
  assert.equal(dupJson.duplicate, true);
  assert.equal(dupJson.orderId, coJson.orderId);

  // Payment confirmation must set pending_verification (never auto-paid) and return wa.me URL
  const confirmForm = new FormData();
  confirmForm.append('orderId', coJson.orderId);
  confirmForm.append('payerName', 'Budi Santoso');
  confirmForm.append('payerWhatsapp', '081298765432');
  confirmForm.append('paidAmount', String(coJson.totalAmount));
  confirmForm.append('receiptToken', coJson.receiptToken);

  const confirmRes = await fetch(`${baseUrl}/api/payments/confirm`, {
    method: 'POST',
    body: confirmForm,
  });
  assert.equal(confirmRes.status, 201);
  const confirmJson = (await confirmRes.json()) as {
    paymentStatus: string;
    whatsappUrl: string;
  };
  assert.equal(confirmJson.paymentStatus, 'pending_verification');
  assert.ok(confirmJson.whatsappUrl.startsWith('https://wa.me/6287738172871?text='));

  // Receipt lookup rejects invalid token and accepts real CTRZ token with masked WhatsApp
  const badLookup = await fetch(`${baseUrl}/api/receipts/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'CTRZ-INVALID-TOKEN' }),
  });
  assert.equal(badLookup.status, 404);

  const recRes = await fetch(
    `${baseUrl}/api/receipts/${encodeURIComponent(coJson.receiptToken)}`
  );
  assert.equal(recRes.status, 200);
  const recJson = (await recRes.json()) as {
    receipt: { orderNumber: string; maskedWhatsapp: string; paymentStatus: string; shippingCost: number };
  };
  assert.equal(recJson.receipt.orderNumber, coJson.orderNumber);
  assert.equal(recJson.receipt.paymentStatus, 'pending_verification');
  assert.equal(recJson.receipt.shippingCost, 0);
  assert.ok(recJson.receipt.maskedWhatsapp.includes('*'));
});

test('Admin login -> cookie auth -> product CRUD -> change password -> logout lifecycle', async () => {
  // 1. Invalid password fails with 401
  const badLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Catrizzz', password: 'WrongPassword!' }),
  });
  assert.equal(badLogin.status, 401);

  // 2. Valid initial credentials succeed and set HttpOnly cookie
  const goodLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Catrizzz', password: process.env.INITIAL_ADMIN_PASSWORD || 'Catrizzz666' }),
  });
  assert.equal(goodLogin.status, 200);
  const rawSetCookie = goodLogin.headers.get('set-cookie') || '';
  assert.ok(rawSetCookie.includes('catrizzz_admin_session='));
  const sessionCookie = rawSetCookie.split(';')[0];

  // 3. Authenticated overview & digital product creation work with cookie
  const ovRes = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Cookie: sessionCookie },
  });
  assert.equal(ovRes.status, 200);
  const ovJson = (await ovRes.json()) as { stats: { activeProducts: number }; recentAuditLogs: unknown[] };
  assert.ok(ovJson.stats.activeProducts >= 1);
  assert.ok(Array.isArray(ovJson.recentAuditLogs));

  const createRes = await fetch(`${baseUrl}/api/admin/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({
      name: 'Spotify Premium Family Invite Test',
      price: 35000,
      stock: 15,
      subscriptionDuration: '1 Bulan',
      availabilityStatus: 'available',
      benefits: ['Bebas iklan', 'Download offline'],
      activationGuide: 'Kirim email Spotify di catatan.',
    }),
  });
  assert.equal(createRes.status, 201);
  const createdJson = (await createRes.json()) as { product: { id: string } };

  const delRes = await fetch(`${baseUrl}/api/admin/products/${createdJson.product.id}`, {
    method: 'DELETE',
    headers: { Cookie: sessionCookie },
  });
  assert.equal(delRes.status, 200);

  // 4. Change password invalidates old password and accepts new password
  const cpRes = await fetch(`${baseUrl}/api/admin/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: sessionCookie },
    body: JSON.stringify({
      currentPassword: process.env.INITIAL_ADMIN_PASSWORD || 'Catrizzz666',
      newPassword: 'CatrizzzNewPassword999',
      confirmPassword: 'CatrizzzNewPassword999',
    }),
  });
  assert.equal(cpRes.status, 200);

  const oldPwLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Catrizzz', password: process.env.INITIAL_ADMIN_PASSWORD || 'Catrizzz666' }),
  });
  assert.equal(oldPwLogin.status, 401);

  const newPwLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Catrizzz', password: 'CatrizzzNewPassword999' }),
  });
  assert.equal(newPwLogin.status, 200);
  const newCookie = (newPwLogin.headers.get('set-cookie') || '').split(';')[0];

  // 5. Logout clears session cookie
  const logoutRes = await fetch(`${baseUrl}/api/admin/logout`, {
    method: 'POST',
    headers: { Cookie: newCookie },
  });
  assert.equal(logoutRes.status, 200);
  const clearedCookie = logoutRes.headers.get('set-cookie') || '';
  assert.ok(clearedCookie.includes('Max-Age=0'));
});

test('2-role RBAC (No Customer Auth) + Guest Join Reseller + One-Time Activation + -20% Pricing + Leaderboard + QRIS Upload Lifecycle', async () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const username = `rsltest_${uniqueSuffix}`;
  const applicantWa = '081234560099';
  const applicantEmail = `${username}@example.com`;

  // 1. Customer auth routes must NOT exist (guests shop without registration/login)
  const removedReg = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'cust', password: 'Password123!' }),
  });
  assert.equal(removedReg.status, 404);

  const removedCustLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'cust', password: 'Password123!' }),
  });
  assert.equal(removedCustLogin.status, 404);

  // 2. Guest applies to join Reseller program (GRATIS / Rp0) WITH password -> status pending_approval
  const joinNoPw = await fetch(`${baseUrl}/api/reseller/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      applicantName: 'Tanpa Password',
      username: `nopw_${uniqueSuffix}`,
      applicantEmail: `nopw_${uniqueSuffix}@example.com`,
      applicantWhatsapp: '081234561111',
    }),
  });
  assert.equal(joinNoPw.status, 400);

  const joinRes = await fetch(`${baseUrl}/api/reseller/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      applicantName: 'Rani Test Reseller',
      username,
      applicantEmail,
      applicantWhatsapp: applicantWa,
      password: 'ResellerStrongPass#1',
      confirmPassword: 'ResellerStrongPass#1',
    }),
  });
  assert.equal(joinRes.status, 201);
  const joinJson = (await joinRes.json()) as {
    application: { id: string; applicationNumber: string; feeAmount: number; status: string };
    profileStatus: string;
  };
  assert.equal(joinJson.application.feeAmount, 0);
  assert.equal(joinJson.application.status, 'pending_approval');
  assert.equal(joinJson.profileStatus, 'pending_approval');
  assert.ok(joinJson.application.applicationNumber.startsWith('RSL-'));

  // Second test applicant for rejection & reason verification
  const rejUsername = `rslrej_${uniqueSuffix}`;
  const rejJoinRes = await fetch(`${baseUrl}/api/reseller/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      applicantName: 'Ditolak Test',
      username: rejUsername,
      applicantEmail: `${rejUsername}@example.com`,
      applicantWhatsapp: '081234560088',
      password: 'ResellerStrongPass#1',
      confirmPassword: 'ResellerStrongPass#1',
    }),
  });
  assert.equal(rejJoinRes.status, 201);
  const rejJoinJson = (await rejJoinRes.json()) as { application: { id: string } };

  // Partial conflict with same username must be rejected cleanly
  const conflictJoin = await fetch(`${baseUrl}/api/reseller/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      applicantName: 'Orang Lain',
      username,
      applicantEmail: `other_${uniqueSuffix}@example.com`,
      applicantWhatsapp: '081988887777',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    }),
  });
  assert.equal(conflictJoin.status, 400);

  // 3. Payment confirmation endpoint for reseller registration must reject with 400 (free registration)
  const rslForm = new FormData();
  rslForm.append('applicationNumber', joinJson.application.applicationNumber);
  const rslConfirmRes = await fetch(
    `${baseUrl}/api/reseller/applications/${joinJson.application.id}/confirm`,
    {
      method: 'POST',
      body: rslForm,
    }
  );
  assert.equal(rslConfirmRes.status, 400);

  // Public status lookup returns pending_approval with masked WhatsApp and passwordSet: true
  const statusLookup = await fetch(
    `${baseUrl}/api/reseller/applications/status?query=${encodeURIComponent(
      joinJson.application.applicationNumber
    )}`
  );
  assert.equal(statusLookup.status, 200);
  const statusJson = (await statusLookup.json()) as {
    application: { status: string; maskedWhatsapp: string; passwordSet: boolean };
  };
  assert.equal(statusJson.application.status, 'pending_approval');
  assert.ok(statusJson.application.maskedWhatsapp.includes('*'));
  assert.equal(statusJson.application.passwordSet, true);

  // Pending applicant cannot log in before admin approval (403)
  const pendingLogin = await fetch(`${baseUrl}/api/reseller/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: username, password: 'ResellerStrongPass#1' }),
  });
  assert.equal(pendingLogin.status, 403);

  // 4. Admin logs in, rejects second applicant with reason, and approves primary applicant
  const admLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Catrizzz', password: 'CatrizzzNewPassword999' }),
  });
  assert.equal(admLogin.status, 200);
  const adminCookie = (admLogin.headers.get('set-cookie') || '').split(';')[0];

  // Rejection requires mandatory reason
  const rejNoReason = await fetch(
    `${baseUrl}/api/admin/resellers/applications/${rejJoinJson.application.id}/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ decision: 'reject', rejectionReason: '' }),
    }
  );
  assert.equal(rejNoReason.status, 400);

  const rejWithReason = await fetch(
    `${baseUrl}/api/admin/resellers/applications/${rejJoinJson.application.id}/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        decision: 'reject',
        rejectionReason: 'Data akun belum memenuhi kriteria reseller',
      }),
    }
  );
  assert.equal(rejWithReason.status, 200);

  const rejectedLogin = await fetch(`${baseUrl}/api/reseller/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: rejUsername, password: 'ResellerStrongPass#1' }),
  });
  assert.equal(rejectedLogin.status, 403);
  const rejLoginJson = (await rejectedLogin.json()) as { error: string };
  assert.match(rejLoginJson.error, /Data akun belum memenuhi kriteria reseller/);

  const verifyAppRes = await fetch(
    `${baseUrl}/api/admin/resellers/applications/${joinJson.application.id}/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ decision: 'approve' }),
    }
  );
  assert.equal(verifyAppRes.status, 200);
  const verifyAppJson = (await verifyAppRes.json()) as {
    passwordAlreadySet: boolean;
    profile: { id: string; referralCode: string; status: string; statusHistory?: unknown[] };
  };
  assert.ok(verifyAppJson.profile.referralCode.startsWith('CAT-'));
  assert.equal(verifyAppJson.profile.status, 'active');
  assert.equal(verifyAppJson.passwordAlreadySet, true);
  assert.ok((verifyAppJson.profile.statusHistory?.length ?? 0) >= 2);

  // 5. Approved reseller logs in directly via /api/reseller/login using their registered password
  const rslLoginRes = await fetch(`${baseUrl}/api/reseller/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: username, password: 'ResellerStrongPass#1' }),
  });
  assert.equal(rslLoginRes.status, 200);
  const resellerCookie = (rslLoginRes.headers.get('set-cookie') || '').split(';')[0];
  assert.ok(resellerCookie.includes('catrizzz_user_session='));

  // Reseller can access /api/reseller/dashboard, STILL blocked from /api/admin/overview
  const rslDash = await fetch(`${baseUrl}/api/reseller/dashboard`, {
    headers: { Cookie: resellerCookie },
  });
  assert.equal(rslDash.status, 200);
  const rslAdminAttempt = await fetch(`${baseUrl}/api/admin/overview`, {
    headers: { Cookie: resellerCookie },
  });
  assert.equal(rslAdminAttempt.status, 401);

  // 6. Reseller checkout applies 20% off Normal Price automatically and blocks promo stacking
  const sfRes = await fetch(`${baseUrl}/api/storefront`);
  const sf = (await sfRes.json()) as {
    featuredProducts: Array<{ id: string; price: number; stock: number }>;
    shippingSettings: Array<{ id: string }>;
  };
  const targetProd = sf.featuredProducts.find((p) => p.stock >= 5)!;
  const expectedResellerPrice = Math.round(targetProd.price * 0.8);

  const promoBlocked = await fetch(`${baseUrl}/api/discounts/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: resellerCookie },
    body: JSON.stringify({
      code: 'CATRIZZZ20',
      items: [{ productId: targetProd.id, quantity: 1 }],
    }),
  });
  const promoBlockedJson = (await promoBlocked.json()) as { valid: boolean; codeStatus: string };
  assert.equal(promoBlockedJson.valid, false);
  assert.equal(promoBlockedJson.codeStatus, 'reseller_no_stack');

  const rslCheckoutRes = await fetch(`${baseUrl}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: resellerCookie },
    body: JSON.stringify({
      customerName: 'Rani Test Reseller',
      customerWhatsapp: applicantWa,
      shippingMethodId: sf.shippingSettings[0].id,
      items: [{ productId: targetProd.id, quantity: 1 }],
    }),
  });
  assert.equal(rslCheckoutRes.status, 201);
  const rslOrder = (await rslCheckoutRes.json()) as {
    totalAmount: number;
    pricingTier: string;
  };
  assert.equal(rslOrder.pricingTier, 'reseller');
  assert.equal(rslOrder.totalAmount, expectedResellerPrice);

  // 7. Guest checkout with ?ref= referralCode -> pending does NOT count in leaderboard until paid!
  const guestOrderRes = await fetch(`${baseUrl}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Pembeli Referral',
      customerWhatsapp: '081355556666',
      shippingMethodId: sf.shippingSettings[0].id,
      referralCode: verifyAppJson.profile.referralCode,
      items: [{ productId: targetProd.id, quantity: 1 }],
    }),
  });
  assert.equal(guestOrderRes.status, 201);
  const guestOrder = (await guestOrderRes.json()) as { orderId: string; totalAmount: number };

  const lbBeforeRes = await fetch(`${baseUrl}/api/admin/resellers?range=all`, {
    headers: { Cookie: adminCookie },
  });
  const lbBefore = (await lbBeforeRes.json()) as {
    leaderboard: Array<{ resellerId: string; attributedOrderCount: number }>;
  };
  const rowBefore = lbBefore.leaderboard.find(
    (r) => r.resellerId === verifyAppJson.profile.id
  );
  assert.equal(rowBefore?.attributedOrderCount, 0);

  // Admin verifies guest referral payment -> now leaderboard counts it!
  const approveGuestOrder = await fetch(
    `${baseUrl}/api/admin/payments/${guestOrder.orderId}/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ decision: 'approve' }),
    }
  );
  assert.equal(approveGuestOrder.status, 200);

  const lbAfterRes = await fetch(`${baseUrl}/api/admin/resellers?range=all`, {
    headers: { Cookie: adminCookie },
  });
  const lbAfter = (await lbAfterRes.json()) as {
    leaderboard: Array<{
      resellerId: string;
      attributedOrderCount: number;
      totalAttributedSales: number;
    }>;
  };
  const rowAfter = lbAfter.leaderboard.find(
    (r) => r.resellerId === verifyAppJson.profile.id
  );
  assert.equal(rowAfter?.attributedOrderCount, 1);
  assert.equal(rowAfter?.totalAttributedSales, guestOrder.totalAmount);

  // 8. Admin QRIS upload validation, active swap, checkout propagation, and restore-official
  const badUploadForm = new FormData();
  badUploadForm.append('folder', 'qris');
  badUploadForm.append(
    'file',
    new Blob([Buffer.from('not-an-image')], { type: 'text/plain' }),
    'fake.txt'
  );
  const badUploadRes = await fetch(`${baseUrl}/api/admin/upload`, {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: badUploadForm,
  });
  assert.equal(badUploadRes.status, 400);
  const badUploadJson = (await badUploadRes.json()) as { error: string };
  assert.ok(badUploadJson.error.length > 0);

  const qrisPng = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`qris-image-${uniqueSuffix}`),
  ]);
  const qrisUploadForm = new FormData();
  qrisUploadForm.append('folder', 'qris');
  qrisUploadForm.append('file', new Blob([qrisPng], { type: 'image/png' }), 'qris-new.png');
  const qrisUploadRes = await fetch(`${baseUrl}/api/admin/upload`, {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: qrisUploadForm,
  });
  assert.equal(qrisUploadRes.status, 201);
  const qrisUploadJson = (await qrisUploadRes.json()) as { url: string };
  assert.ok(qrisUploadJson.url.startsWith('/uploads/qris/'));
  createdUploadFiles.push(qrisUploadJson.url);

  const payUpdateRes = await fetch(`${baseUrl}/api/admin/payment-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      qrisImageUrl: qrisUploadJson.url,
      qrisEnabled: true,
      qrisMerchantName: 'Catrizzz Official Verified',
      qrisNmid: 'ID1024365593051',
      changeNote: 'Uji pembaruan QRIS dan nama merchant',
    }),
  });
  assert.equal(payUpdateRes.status, 200);
  const payUpdateJson = (await payUpdateRes.json()) as {
    storeSettings: { qrisImageUrl: string; qrisVersion: number };
    qrisHistory: Array<{ merchantName: string }>;
  };
  assert.equal(payUpdateJson.storeSettings.qrisImageUrl, qrisUploadJson.url);
  assert.equal(payUpdateJson.qrisHistory[0].merchantName, 'Catrizzz Official Verified');

  const orderPayPage = await fetch(`${baseUrl}/api/orders/${guestOrder.orderId}/payment`);
  const orderPayJson = (await orderPayPage.json()) as {
    qris: { imageUrl: string; merchantName: string; ready: boolean };
  };
  assert.equal(orderPayJson.qris.ready, true);
  assert.equal(orderPayJson.qris.imageUrl, qrisUploadJson.url);
  assert.equal(orderPayJson.qris.merchantName, 'Catrizzz Official Verified');

  // Restore official QRIS and verify propagation
  const restoreRes = await fetch(`${baseUrl}/api/admin/qris/restore-official`, {
    method: 'POST',
    headers: { Cookie: adminCookie },
  });
  assert.equal(restoreRes.status, 200);
  const restoreJson = (await restoreRes.json()) as {
    storeSettings: { qrisImageUrl: string; qrisMerchantName: string };
    qrisReady: boolean;
  };
  assert.equal(restoreJson.qrisReady, true);
  assert.equal(restoreJson.storeSettings.qrisMerchantName, 'Catrizz_Store');
});

test('QRIS Payment Switch (ON/OFF), Pre-Existing Order & WALLET Immunity, and WebSocket /ws Scoped Realtime Sync', async () => {
  const admLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Catrizzz', password: 'CatrizzzNewPassword999' }),
  });
  assert.equal(admLogin.status, 200);
  const adminCookie = (admLogin.headers.get('set-cookie') || '').split(';')[0];

  const sfRes = await fetch(`${baseUrl}/api/storefront`);
  const sf = (await sfRes.json()) as {
    featuredProducts: Array<{ id: string; stock: number; variants?: Array<{ id: string }> }>;
    shippingSettings: Array<{ id: string }>;
  };
  const prod = sf.featuredProducts.find((p) => p.stock >= 3)!;
  const ship = sf.shippingSettings[0];

  // 1. Create a pre-existing QRIS order BEFORE toggling QRIS OFF
  const preOrderRes = await fetch(`${baseUrl}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentMethod: 'QRIS',
      customerName: 'Preexisting Buyer',
      customerWhatsapp: '081233344455',
      shippingMethodId: ship.id,
      items: [{ productId: prod.id, variantId: prod.variants?.[0]?.id, quantity: 1 }],
    }),
  });
  assert.equal(preOrderRes.status, 201);
  const preOrder = (await preOrderRes.json()) as {
    orderId: string;
    receiptToken: string;
    totalAmount: number;
  };

  // Connect Admin WS, Guest WS, and Receipt-scoped WS
  const wsBase = baseUrl.replace(/^http/, 'ws');
  const adminMsgs: Array<{ type: string; areas?: string[]; summary?: string }> = [];
  const guestMsgs: Array<{ type: string; areas?: string[]; summary?: string }> = [];
  const receiptMsgs: Array<{ type: string; areas?: string[] }> = [];

  const openWs = (url: string, cookie?: string) =>
    new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(url, cookie ? { headers: { Cookie: cookie } } : undefined);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });

  const adminWs = await openWs(`${wsBase}/ws`, adminCookie);
  const guestWs = await openWs(`${wsBase}/ws`);
  const receiptWs = await openWs(
    `${wsBase}/ws?receiptToken=${encodeURIComponent(preOrder.receiptToken)}`
  );

  adminWs.on('message', (raw) => adminMsgs.push(JSON.parse(String(raw))));
  guestWs.on('message', (raw) => guestMsgs.push(JSON.parse(String(raw))));
  receiptWs.on('message', (raw) => receiptMsgs.push(JSON.parse(String(raw))));

  await new Promise((r) => setTimeout(r, 80));

  // 2. Toggle QRIS OFF via PATCH /api/admin/payment-settings/qris
  const offRes = await fetch(`${baseUrl}/api/admin/payment-settings/qris`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ qrisEnabled: false }),
  });
  assert.equal(offRes.status, 200);
  const offJson = (await offRes.json()) as {
    qrisEnabled: boolean;
    qrisReady: boolean;
    storeSettings: { qrisImageUrl: string; qrisMerchantName: string };
  };
  assert.equal(offJson.qrisEnabled, false);
  assert.equal(offJson.qrisReady, false);
  assert.equal(offJson.storeSettings.qrisMerchantName, 'Catrizz_Store');
  assert.ok(offJson.storeSettings.qrisImageUrl.length > 0);

  await new Promise((r) => setTimeout(r, 80));

  // Admin & Guest should receive storefront/payment_settings invalidation over /ws
  assert.ok(
    adminMsgs.some((m) => m.type === 'invalidate' && m.areas?.includes('payment_settings'))
  );
  assert.ok(
    guestMsgs.some((m) => m.type === 'invalidate' && m.areas?.includes('payment_settings'))
  );

  // 3. New QRIS checkout MUST fail with 503 and exact Indonesian error
  const blockedCheckout = await fetch(`${baseUrl}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentMethod: 'QRIS',
      customerName: 'Blocked Buyer',
      customerWhatsapp: '081244455566',
      shippingMethodId: ship.id,
      items: [{ productId: prod.id, variantId: prod.variants?.[0]?.id, quantity: 1 }],
    }),
  });
  assert.equal(blockedCheckout.status, 503);
  const blockedJson = (await blockedCheckout.json()) as { error: string; code: string };
  assert.equal(
    blockedJson.error,
    'Pembayaran QRIS sedang tidak tersedia. Silakan hubungi admin untuk informasi lebih lanjut.'
  );

  // 4. Create & approve reseller -> verify NEW topup blocked with 503 while QRIS OFF,
  // and pre-existing QRIS order confirmation STILL succeeds!
  const uSuffix = Date.now().toString().slice(-5);
  const rslJoin = await fetch(`${baseUrl}/api/reseller/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      applicantName: 'Switch Reseller',
      username: `swrsl_${uSuffix}`,
      applicantEmail: `swrsl_${uSuffix}@example.com`,
      applicantWhatsapp: `081255${uSuffix}`,
      password: 'SwitchPass#123',
      confirmPassword: 'SwitchPass#123',
    }),
  });
  assert.equal(rslJoin.status, 201);
  const rslJoinJson = (await rslJoin.json()) as { application: { id: string } };
  await fetch(`${baseUrl}/api/admin/resellers/applications/${rslJoinJson.application.id}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ decision: 'approve' }),
  });
  const rslLogin = await fetch(`${baseUrl}/api/reseller/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: `swrsl_${uSuffix}`, password: 'SwitchPass#123' }),
  });
  assert.equal(rslLogin.status, 200);
  const rslCookie = (rslLogin.headers.get('set-cookie') || '').split(';')[0];

  const blockedTopup = await fetch(`${baseUrl}/api/reseller/topups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: rslCookie },
    body: JSON.stringify({ amount: 100000 }),
  });
  assert.equal(blockedTopup.status, 503);
  const blockedTopupJson = (await blockedTopup.json()) as { error: string };
  assert.equal(
    blockedTopupJson.error,
    'Pembayaran QRIS sedang tidak tersedia. Silakan hubungi admin untuk informasi lebih lanjut.'
  );

  // Pre-existing QRIS order confirmation MUST succeed even while QRIS switch is OFF
  const confirmForm = new FormData();
  confirmForm.append('orderId', preOrder.orderId);
  confirmForm.append('payerName', 'Preexisting Buyer');
  confirmForm.append('payerWhatsapp', '081233344455');
  confirmForm.append('paidAmount', String(preOrder.totalAmount));
  confirmForm.append('receiptToken', preOrder.receiptToken);
  const preConfirm = await fetch(`${baseUrl}/api/payments/confirm`, {
    method: 'POST',
    body: confirmForm,
  });
  assert.equal(preConfirm.status, 201);

  // Admin verifies pre-existing order -> receipt-scoped WS MUST receive invalidation (guest MUST NOT receive private 'orders')
  const guestLenBeforeVerify = guestMsgs.length;
  const verifyPre = await fetch(`${baseUrl}/api/admin/payments/${preOrder.orderId}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ decision: 'approve' }),
  });
  assert.equal(verifyPre.status, 200);

  await new Promise((r) => setTimeout(r, 80));

  assert.ok(
    receiptMsgs.some((m) => m.type === 'invalidate' && m.areas?.includes('orders')),
    'Receipt-scoped WS must receive order verification update'
  );
  const newGuestOrderMsgs = guestMsgs
    .slice(guestLenBeforeVerify)
    .filter((m) => m.areas?.includes('orders') || m.areas?.includes('payments'));
  assert.equal(newGuestOrderMsgs.length, 0, 'Unauthenticated guest WS must NOT receive private order updates');

  // 5. Turn QRIS switch back ON and verify checkout + topup work again
  const onRes = await fetch(`${baseUrl}/api/admin/payment-settings/qris`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ qrisEnabled: true }),
  });
  assert.equal(onRes.status, 200);
  const onJson = (await onRes.json()) as { qrisEnabled: boolean; qrisReady: boolean };
  assert.equal(onJson.qrisEnabled, true);
  assert.equal(onJson.qrisReady, true);

  const unlockedTopup = await fetch(`${baseUrl}/api/reseller/topups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: rslCookie },
    body: JSON.stringify({ amount: 100000 }),
  });
  assert.equal(unlockedTopup.status, 201);

  adminWs.close();
  guestWs.close();
  receiptWs.close();
});

test('Admin auth enforces HTTPS iframe SameSite=None cookie, disabled account 403, and invalid Firebase token rejection', async () => {
  // 1. HTTPS forwarded proto produces SameSite=None; Secure; HttpOnly cookie
  const httpsLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-Proto': 'https',
    },
    body: JSON.stringify({ username: 'Catrizzz', password: 'CatrizzzNewPassword999' }),
  });
  assert.equal(httpsLogin.status, 200);
  const setCookie = httpsLogin.headers.get('set-cookie') || '';
  assert.ok(setCookie.includes('HttpOnly'));
  assert.ok(setCookie.includes('SameSite=None'));
  assert.ok(setCookie.includes('Secure'));

  // 2. Invalid Bearer token reports reason='invalid_token' on /api/admin/session and rejects 401 on /api/admin/me
  const invalidSess = await fetch(`${baseUrl}/api/admin/session`, {
    headers: { Authorization: 'Bearer not-a-valid-firebase-jwt' },
  });
  assert.equal(invalidSess.status, 200);
  const invalidSessJson = (await invalidSess.json()) as {
    authenticated: boolean;
    admin: unknown;
    reason: string;
  };
  assert.equal(invalidSessJson.authenticated, false);
  assert.equal(invalidSessJson.admin, null);
  assert.equal(invalidSessJson.reason, 'invalid_token');

  const invalidMe = await fetch(`${baseUrl}/api/admin/me`, {
    headers: { Authorization: 'Bearer not-a-valid-firebase-jwt' },
  });
  assert.equal(invalidMe.status, 401);

  // 3. Disabled admin account returns 403 Akun dinonaktifkan
  const { db } = await import('./db');
  const { hashPassword } = await import('./security');
  const { salt, hash } = hashPassword('DisabledPass#123');
  await db.withTransaction((draft) => {
    draft.admin_accounts.push({
      id: 'adm-disabled-test',
      username: 'DisabledAdminTest',
      displayName: 'Disabled Admin',
      passwordHash: hash,
      passwordSalt: salt,
      role: 'admin',
      active: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  const disabledRes = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'DisabledAdminTest', password: 'DisabledPass#123' }),
  });
  assert.equal(disabledRes.status, 403);
  const disabledJson = (await disabledRes.json()) as { error: string; code: string };
  assert.equal(disabledJson.code, 'disabled');
});

test('Permanent DB persistence: Product gallery/slug/soft-delete, Category reassign, Banners, CMS, Settings, Navigation & Audit Logs', async () => {
  const admLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'Catrizzz', password: 'CatrizzzNewPassword999' }),
  });
  assert.equal(admLogin.status, 200);
  const adminCookie = (admLogin.headers.get('set-cookie') || '').split(';')[0];

  // 1. Upload PNG for product / store logo
  const pngBuf = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`cms-logo-${Date.now()}`),
  ]);
  const uploadForm = new FormData();
  uploadForm.append('folder', 'branding');
  uploadForm.append('file', new Blob([pngBuf], { type: 'image/png' }), 'brand-logo.png');
  const uploadRes = await fetch(`${baseUrl}/api/admin/upload`, {
    method: 'POST',
    headers: { Cookie: adminCookie },
    body: uploadForm,
  });
  assert.equal(uploadRes.status, 201);
  const uploadJson = (await uploadRes.json()) as { url: string };
  assert.ok(uploadJson.url.startsWith('/uploads/branding/'));
  createdUploadFiles.push(uploadJson.url);

  // 2. Create two categories, create product with galleryUrls under source category, then update price/stock/slug
  const catSrcRes = await fetch(`${baseUrl}/api/admin/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ name: 'Kategori Sumber Uji', description: 'Source cat', sortOrder: 10, active: true }),
  });
  assert.equal(catSrcRes.status, 201);
  const catSrc = ((await catSrcRes.json()) as { category: { id: string } }).category;

  const catDstRes = await fetch(`${baseUrl}/api/admin/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ name: 'Kategori Tujuan Uji', description: 'Target cat', sortOrder: 11, active: true }),
  });
  assert.equal(catDstRes.status, 201);
  const catDst = ((await catDstRes.json()) as { category: { id: string } }).category;

  const prodOrderedRes = await fetch(`${baseUrl}/api/admin/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      name: 'Produk Uji Order Archive',
      categoryId: catSrc.id,
      price: 45000,
      stock: 10,
      imageUrl: uploadJson.url,
      galleryUrls: [uploadJson.url],
      active: true,
      publicationStatus: 'published',
    }),
  });
  assert.equal(prodOrderedRes.status, 201);
  const prodOrdered = ((await prodOrderedRes.json()) as { product: { id: string; slug: string } }).product;

  const prodUnusedRes = await fetch(`${baseUrl}/api/admin/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      name: 'Produk Uji Hard Delete',
      categoryId: catSrc.id,
      price: 25000,
      stock: 5,
      active: true,
      publicationStatus: 'published',
    }),
  });
  assert.equal(prodUnusedRes.status, 201);
  const prodUnused = ((await prodUnusedRes.json()) as { product: { id: string } }).product;

  // Update price, stock, and slug
  const customSlug = `produk-uji-archive-${Date.now()}`;
  const updRes = await fetch(`${baseUrl}/api/admin/products/${prodOrdered.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      price: 52000,
      stock: 8,
      slug: customSlug,
      galleryUrls: [uploadJson.url, '/src/assets/images/cat_ai_clean_1794609262401.jpg'],
    }),
  });
  assert.equal(updRes.status, 200);
  const updJson = (await updRes.json()) as { product: { price: number; stock: number; slug: string; galleryUrls: string[] } };
  assert.equal(updJson.product.price, 52000);
  assert.equal(updJson.product.stock, 8);
  assert.equal(updJson.product.slug, customSlug);
  assert.equal(updJson.product.galleryUrls.length, 2);

  // Verify audit log recorded before -> after summary
  const logsRes = await fetch(`${baseUrl}/api/admin/logs`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(logsRes.status, 200);
  const logsJson = (await logsRes.json()) as { auditLogs: Array<{ action: string; summary: string }> };
  assert.ok(
    logsJson.auditLogs.some(
      (l) => l.action === 'UPDATE_PRODUCT' && /45\.000\s*->\s*.*52\.000/.test(l.summary)
    ),
    'Audit log must record price delta for UPDATE_PRODUCT'
  );

  // 3. Reassign category when deleting source category
  const delCatNoReassign = await fetch(`${baseUrl}/api/admin/categories/${catSrc.id}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });
  assert.equal(delCatNoReassign.status, 400);

  const delCatReassign = await fetch(
    `${baseUrl}/api/admin/categories/${catSrc.id}?reassignTo=${encodeURIComponent(catDst.id)}`,
    {
      method: 'DELETE',
      headers: { Cookie: adminCookie },
    }
  );
  assert.equal(delCatReassign.status, 200);

  // Confirm products moved to catDst
  const adminProdsRes = await fetch(`${baseUrl}/api/admin/products`, {
    headers: { Cookie: adminCookie },
  });
  const adminProds = ((await adminProdsRes.json()) as { products: Array<{ id: string; categoryId: string }> }).products;
  assert.equal(adminProds.find((p) => p.id === prodOrdered.id)?.categoryId, catDst.id);

  // 4. Create checkout order referencing prodOrdered -> DELETE must archive instead of hard-deleting
  const sfInit = (await (await fetch(`${baseUrl}/api/storefront`)).json()) as {
    shippingSettings: Array<{ id: string }>;
  };
  const ordRes = await fetch(`${baseUrl}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerName: 'Uji Archive',
      customerWhatsapp: '081277788899',
      shippingMethodId: sfInit.shippingSettings[0].id,
      items: [{ productId: prodOrdered.id, quantity: 1 }],
    }),
  });
  assert.equal(ordRes.status, 201);
  const ordJson = (await ordRes.json()) as { receiptToken: string };

  const archiveRes = await fetch(`${baseUrl}/api/admin/products/${prodOrdered.id}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });
  assert.equal(archiveRes.status, 200);
  const archiveJson = (await archiveRes.json()) as { ok: boolean; archived: boolean };
  assert.equal(archiveJson.ok, true);
  assert.equal(archiveJson.archived, true);

  // Archived product hidden from public catalog, while receipt remains intact!
  const pubProdsJson = (await (await fetch(`${baseUrl}/api/products`)).json()) as {
    products: Array<{ id: string }>;
  };
  assert.equal(pubProdsJson.products.some((p) => p.id === prodOrdered.id), false);

  const recCheck = await fetch(`${baseUrl}/api/receipts/${encodeURIComponent(ordJson.receiptToken)}`);
  assert.equal(recCheck.status, 200);
  const recData = (await recCheck.json()) as { receipt: { items: Array<{ productId: string }> } };
  assert.equal(recData.receipt.items[0].productId, prodOrdered.id);

  // Unused product hard-deletes completely
  const hardDelRes = await fetch(`${baseUrl}/api/admin/products/${prodUnused.id}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });
  assert.equal(hardDelRes.status, 200);
  const hardDelJson = (await hardDelRes.json()) as { ok: boolean; archived: boolean };
  assert.equal(hardDelJson.archived, false);

  // 5. Store settings, CMS content, banners, and navigation persistence
  const settingsRes = await fetch(`${baseUrl}/api/admin/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      storeName: 'Catrizzz Digital Pro',
      seoTitle: 'Catrizzz SEO Title Persistent',
      seoDescription: 'Deskripsi SEO tersimpan permanen di database.',
      logoUrl: uploadJson.url,
      faviconUrl: uploadJson.url,
    }),
  });
  assert.equal(settingsRes.status, 200);

  const contentRes = await fetch(`${baseUrl}/api/admin/content`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      heroHeadline: 'Headline Persistent Baru',
      faqs: [{ id: 'faq-test', question: 'Apakah tersimpan?', answer: 'Ya, permanen di database.', sortOrder: 1 }],
    }),
  });
  assert.equal(contentRes.status, 200);

  const bannerCreateRes = await fetch(`${baseUrl}/api/admin/banners`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      headline: 'Banner Promo Uji DB',
      subheadline: 'Subheadline Banner Uji',
      ctaText: 'Buka Katalog',
      ctaLink: '/produk',
      imageUrl: uploadJson.url,
      active: true,
      sortOrder: 0,
    }),
  });
  assert.equal(bannerCreateRes.status, 201);
  const bannerCreated = ((await bannerCreateRes.json()) as { banner: { id: string } }).banner;

  const navRes = await fetch(`${baseUrl}/api/admin/navigation`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      navigationMenus: [
        { id: 'nav-custom-1', label: 'Beranda Uji', href: '/', location: 'header', group: 'main', sortOrder: 1, active: true },
      ],
    }),
  });
  assert.equal(navRes.status, 200);

  // Verify storefront & CMS endpoints both return all persisted changes
  const sfAfter = (await (await fetch(`${baseUrl}/api/storefront`)).json()) as {
    storeSettings: { storeName: string; seoTitle: string; seoDescription: string; logoUrl: string; faviconUrl: string };
    siteContent: { heroHeadline: string; faqs: Array<{ question: string }> };
    banners: Array<{ id: string; headline: string }>;
    navigationMenus: Array<{ id: string; label: string }>;
  };
  assert.equal(sfAfter.storeSettings.storeName, 'Catrizzz Digital Pro');
  assert.equal(sfAfter.storeSettings.seoTitle, 'Catrizzz SEO Title Persistent');
  assert.equal(sfAfter.storeSettings.seoDescription, 'Deskripsi SEO tersimpan permanen di database.');
  assert.equal(sfAfter.storeSettings.logoUrl, uploadJson.url);
  assert.equal(sfAfter.storeSettings.faviconUrl, uploadJson.url);
  assert.equal(sfAfter.siteContent.heroHeadline, 'Headline Persistent Baru');
  assert.equal(sfAfter.siteContent.faqs[0].question, 'Apakah tersimpan?');
  assert.ok(sfAfter.banners.some((b) => b.id === bannerCreated.id));
  assert.equal(sfAfter.navigationMenus[0].label, 'Beranda Uji');

  // Delete created banner & verify removed permanently
  const bannerDelRes = await fetch(`${baseUrl}/api/admin/banners/${bannerCreated.id}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });
  assert.equal(bannerDelRes.status, 200);
  const cmsAfterDel = (await (await fetch(`${baseUrl}/api/admin/cms`, { headers: { Cookie: adminCookie } })).json()) as {
    banners: Array<{ id: string }>;
  };
  assert.equal(cmsAfterDel.banners.some((b) => b.id === bannerCreated.id), false);
});

