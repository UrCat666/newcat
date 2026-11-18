import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { hashPassword } from './security';

const TEMP_DB_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'catrizzz-wallet-test-'));
const TEMP_DB_FILE = path.join(TEMP_DB_DIR, 'store.db.json');
process.env.STORE_DB_PATH = TEMP_DB_FILE;

let db: typeof import('./db').db;
let server: http.Server;
let baseUrl = '';
const createdUploadFiles: string[] = [];

before(async () => {
  const routesMod = await import('./routes');
  const dbMod = await import('./db');
  db = dbMod.db;

  const app = express();
  app.use(express.json());
  app.use('/api', routesMod.createApiRouter());

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

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
        // ignore cleanup error
      }
    }
  }
  try {
    fs.rmSync(TEMP_DB_DIR, { recursive: true, force: true });
  } catch {
    // ignore temp cleanup errors
  }
});

function makeUniquePng(tag: string): Blob {
  const buf = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(`catrizzz-proof-${tag}-${Date.now()}-${Math.random()}`),
  ]);
  return new Blob([buf], { type: 'image/png' });
}

async function createApprovedActiveReseller(
  adminCookie: string,
  suffix: string
): Promise<{ resellerId: string; userId: string; username: string; cookie: string }> {
  const username = `walrsl_${suffix}`;
  const email = `${username}@example.com`;
  const wa = `081234${String(Math.floor(100000 + Math.random() * 899999))}`;

  const joinRes = await fetch(`${baseUrl}/api/reseller/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      applicantName: `Reseller ${suffix}`,
      username,
      applicantEmail: email,
      applicantWhatsapp: wa,
      password: 'WalletPass#123',
      confirmPassword: 'WalletPass#123',
    }),
  });
  assert.equal(joinRes.status, 201);
  const joinJson = (await joinRes.json()) as {
    application: { id: string; feeAmount: number; status: string };
  };
  assert.equal(joinJson.application.feeAmount, 0);
  assert.equal(joinJson.application.status, 'pending_approval');

  const verifyRes = await fetch(
    `${baseUrl}/api/admin/resellers/applications/${joinJson.application.id}/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ decision: 'approve' }),
    }
  );
  assert.equal(verifyRes.status, 200);
  const verifyJson = (await verifyRes.json()) as {
    passwordAlreadySet: boolean;
    profile: { id: string; userId: string };
  };
  assert.equal(verifyJson.passwordAlreadySet, true);

  const loginRes = await fetch(`${baseUrl}/api/reseller/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: username, password: 'WalletPass#123' }),
  });
  assert.equal(loginRes.status, 200);
  const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];

  return {
    resellerId: verifyJson.profile.id,
    userId: verifyJson.profile.userId,
    username,
    cookie,
  };
}

test('Reseller Wallet Lifecycle: 10% Top Up Fee (QRIS 110k -> Wallet 100k), Single-Credit Idempotency, Concurrent Purchase Lock & Super Admin Settings Guard', async () => {
  // Login as super_admin (default Catrizzz account)
  const admLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'Catrizzz',
      password: process.env.INITIAL_ADMIN_PASSWORD || 'Catrizzz666',
    }),
  });
  assert.equal(admLogin.status, 200);
  const adminCookie = (admLogin.headers.get('set-cookie') || '').split(';')[0];

  const rslA = await createApprovedActiveReseller(adminCookie, `a_${Date.now().toString().slice(-5)}`);
  const rslB = await createApprovedActiveReseller(adminCookie, `b_${Date.now().toString().slice(-5)}`);

  // 1. Create Rp100.000 top up for Reseller A -> feeAmount 10.000, totalPayment 110.000, walletCredit 100.000
  const createTopup = await fetch(`${baseUrl}/api/reseller/topups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: rslA.cookie },
    body: JSON.stringify({ amount: 100000 }),
  });
  assert.equal(createTopup.status, 201);
  const topupJson = (await createTopup.json()) as {
    topup: {
      id: string;
      amount: number;
      feePercentage: number;
      feeAmount: number;
      totalPayment: number;
      walletCredit: number;
      status: string;
    };
  };
  assert.equal(topupJson.topup.amount, 100000);
  assert.equal(topupJson.topup.feePercentage, 10);
  assert.equal(topupJson.topup.feeAmount, 10000);
  assert.equal(topupJson.topup.totalPayment, 110000);
  assert.equal(topupJson.topup.walletCredit, 100000);
  assert.equal(topupJson.topup.status, 'pending_payment');

  // Verify wallet balance is still 0 before confirmation & approval
  const walBefore = await fetch(`${baseUrl}/api/reseller/wallet`, {
    headers: { Cookie: rslA.cookie },
  });
  const walBeforeJson = (await walBefore.json()) as { wallet: { balance: number } };
  assert.equal(walBeforeJson.wallet.balance, 0);

  // 2. Upload proof -> pending_verification, balance & totalFeesPaid MUST still remain 0
  const proofForm = new FormData();
  proofForm.append('payerName', 'Reseller A');
  proofForm.append('payerWhatsapp', '081234567890');
  proofForm.append('proof', makeUniquePng('topup-a-100k'), 'topup.png');
  const confRes = await fetch(`${baseUrl}/api/reseller/topups/${topupJson.topup.id}/confirm`, {
    method: 'POST',
    headers: { Cookie: rslA.cookie },
    body: proofForm,
  });
  assert.equal(confRes.status, 200);
  const confJson = (await confRes.json()) as {
    topup: { status: string; proofUrl?: string };
    whatsappUrl: string;
  };
  assert.equal(confJson.topup.status, 'pending_verification');
  assert.ok(confJson.whatsappUrl.startsWith('https://wa.me/6287738172871?text='));
  if (confJson.topup.proofUrl) createdUploadFiles.push(confJson.topup.proofUrl);

  const walPending = await fetch(`${baseUrl}/api/reseller/wallet`, {
    headers: { Cookie: rslA.cookie },
  });
  const walPendingJson = (await walPending.json()) as {
    wallet: { balance: number; totalFeesPaid: number };
  };
  assert.equal(walPendingJson.wallet.balance, 0);
  assert.equal(walPendingJson.wallet.totalFeesPaid, 0);

  // Cross-reseller isolation: Reseller B CANNOT view or confirm Reseller A's top up!
  const crossGet = await fetch(`${baseUrl}/api/reseller/topups/${topupJson.topup.id}`, {
    headers: { Cookie: rslB.cookie },
  });
  assert.equal(crossGet.status, 404);

  // 3. Concurrent Admin Approve calls -> ONLY ONE succeeds and credits Rp100.000 ONCE (fee 10.000 goes to store revenue)
  const [app1, app2] = await Promise.all([
    fetch(`${baseUrl}/api/admin/topups/${topupJson.topup.id}/approve`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    }),
    fetch(`${baseUrl}/api/admin/topups/${topupJson.topup.id}/approve`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    }),
  ]);
  const statuses = [app1.status, app2.status].sort();
  assert.deepEqual(statuses, [200, 409]);

  // Verify balance is EXACTLY 100.000 (fee 10.000 does NOT enter wallet)
  const walAfter = await fetch(`${baseUrl}/api/reseller/wallet`, {
    headers: { Cookie: rslA.cookie },
  });
  const walAfterJson = (await walAfter.json()) as {
    wallet: { balance: number; totalTopup: number; totalFeesPaid: number };
  };
  assert.equal(walAfterJson.wallet.balance, 100000);
  assert.equal(walAfterJson.wallet.totalTopup, 100000);
  assert.equal(walAfterJson.wallet.totalFeesPaid, 10000);

  // Verify topupFeeStats in GET /api/admin/topups
  const adminTopupsRes = await fetch(`${baseUrl}/api/admin/topups?range=all`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(adminTopupsRes.status, 200);
  const adminTopupsJson = (await adminTopupsRes.json()) as {
    topupFeeStats: {
      totalSaldoWallet: number;
      totalFeeCollected: number;
      totalQrisPayments: number;
      approvedCount: number;
    };
  };
  assert.equal(adminTopupsJson.topupFeeStats.totalSaldoWallet, 100000);
  assert.equal(adminTopupsJson.topupFeeStats.totalFeeCollected, 10000);
  assert.equal(adminTopupsJson.topupFeeStats.totalQrisPayments, 110000);
  assert.equal(adminTopupsJson.topupFeeStats.approvedCount, 1);

  // 4. Create & reject a Rp50.000 topup -> balance and totalFeesPaid MUST remain 100.000 / 10.000
  const rejTopupRes = await fetch(`${baseUrl}/api/reseller/topups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: rslA.cookie },
    body: JSON.stringify({ amount: 50000 }),
  });
  const rejTopup = (await rejTopupRes.json()) as { topup: { id: string } };
  const rejProofForm = new FormData();
  rejProofForm.append('payerName', 'Reseller A');
  rejProofForm.append('payerWhatsapp', '081234567890');
  rejProofForm.append('proof', makeUniquePng('topup-a-reject'), 'reject.png');
  const rejConf = await fetch(`${baseUrl}/api/reseller/topups/${rejTopup.topup.id}/confirm`, {
    method: 'POST',
    headers: { Cookie: rslA.cookie },
    body: rejProofForm,
  });
  const rejConfJson = (await rejConf.json()) as { topup: { proofUrl?: string } };
  if (rejConfJson.topup.proofUrl) createdUploadFiles.push(rejConfJson.topup.proofUrl);

  const rejectAction = await fetch(`${baseUrl}/api/admin/topups/${rejTopup.topup.id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ reason: 'Bukti transfer tidak terbaca dengan jelas' }),
  });
  assert.equal(rejectAction.status, 200);

  const walAfterReject = await fetch(`${baseUrl}/api/reseller/wallet`, {
    headers: { Cookie: rslA.cookie },
  });
  const walAfterRejectJson = (await walAfterReject.json()) as {
    wallet: { balance: number; totalFeesPaid: number };
  };
  assert.equal(walAfterRejectJson.wallet.balance, 100000);
  assert.equal(walAfterRejectJson.wallet.totalFeesPaid, 10000);

  // 5. Create custom product priced at Rp80.000 (resellerPrice Rp60.000) for exact concurrency checkout test
  const createProd = await fetch(`${baseUrl}/api/admin/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      name: 'Wallet Concurrency Test App',
      price: 80000,
      resellerPrice: 60000,
      resellerPriceEnabled: true,
      stock: 10,
      subscriptionDuration: '1 Bulan',
      availabilityStatus: 'available',
    }),
  });
  assert.equal(createProd.status, 201);
  const { product: walletProd } = (await createProd.json()) as { product: { id: string } };

  const sfRes = await fetch(`${baseUrl}/api/storefront`);
  const sf = (await sfRes.json()) as { shippingSettings: Array<{ id: string }> };
  const shipId = sf.shippingSettings[0].id;

  // Reseller A has Rp100.000, product costs Rp60.000 (zero purchase fee).
  // Two concurrent WALLET purchases -> ONLY ONE can succeed (201), second MUST fail (400 INSUFFICIENT_WALLET_BALANCE)!
  const [buy1, buy2] = await Promise.all([
    fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: rslA.cookie },
      body: JSON.stringify({
        paymentMethod: 'WALLET',
        customerName: 'Reseller A',
        customerWhatsapp: '081234567890',
        shippingMethodId: shipId,
        items: [{ productId: walletProd.id, quantity: 1 }],
      }),
    }),
    fetch(`${baseUrl}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: rslA.cookie },
      body: JSON.stringify({
        paymentMethod: 'WALLET',
        customerName: 'Reseller A',
        customerWhatsapp: '081234567890',
        shippingMethodId: shipId,
        items: [{ productId: walletProd.id, quantity: 1 }],
      }),
    }),
  ]);
  const buyStatuses = [buy1.status, buy2.status].sort();
  assert.deepEqual(buyStatuses, [201, 400]);

  const successOrder = (buy1.status === 201 ? await buy1.json() : await buy2.json()) as {
    orderId: string;
    totalAmount: number;
    receiptToken: string;
    paymentMethod: string;
    paymentStatus: string;
  };
  const failOrder = (buy1.status === 400 ? await buy1.json() : await buy2.json()) as {
    code: string;
    error: string;
    shortfallAmount: number;
  };
  assert.equal(successOrder.totalAmount, 60000);
  assert.equal(successOrder.paymentMethod, 'WALLET');
  assert.equal(successOrder.paymentStatus, 'paid');
  assert.equal(failOrder.code, 'INSUFFICIENT_WALLET_BALANCE');
  assert.equal(failOrder.shortfallAmount, 20000); // needs 60k, only 40k left

  // Balance is 40.000 and totalFeesPaid stays 10.000
  const walAfterBuy = await fetch(`${baseUrl}/api/reseller/wallet`, {
    headers: { Cookie: rslA.cookie },
  });
  const walAfterBuyJson = (await walAfterBuy.json()) as {
    wallet: { balance: number; totalFeesPaid: number };
  };
  assert.equal(walAfterBuyJson.wallet.balance, 40000);
  assert.equal(walAfterBuyJson.wallet.totalFeesPaid, 10000);

  // Check receipt displays paymentMethod WALLET
  const receiptRes = await fetch(
    `${baseUrl}/api/receipts/${encodeURIComponent(successOrder.receiptToken)}`
  );
  const receiptJson = (await receiptRes.json()) as { receipt: { paymentMethod: string } };
  assert.equal(receiptJson.receipt.paymentMethod, 'WALLET');

  // 6. Refund WALLET order ONCE; second refund call MUST fail (409) without double-refund
  const refund1 = await fetch(`${baseUrl}/api/admin/orders/${successOrder.orderId}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ reason: 'Uji refund tunggal' }),
  });
  assert.equal(refund1.status, 200);

  const refund2 = await fetch(`${baseUrl}/api/admin/orders/${successOrder.orderId}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ reason: 'Double refund attempt' }),
  });
  assert.equal(refund2.status, 409);

  // Wallet balance should be restored to 100.000
  const walRestored = await fetch(`${baseUrl}/api/reseller/wallet`, {
    headers: { Cookie: rslA.cookie },
  });
  const walRestoredJson = (await walRestored.json()) as { wallet: { balance: number } };
  assert.equal(walRestoredJson.wallet.balance, 100000);

  // 7. Manual wallet adjustment audit + single topup ledger reconciliation check
  const adjRes = await fetch(`${baseUrl}/api/admin/resellers/${rslA.resellerId}/wallet/adjust`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      action: 'manual_credit',
      amount: 15000,
      reason: 'Kompensasi operasional reseller',
    }),
  });
  assert.equal(adjRes.status, 200);

  const ledgerRes = await fetch(`${baseUrl}/api/reseller/wallet/transactions`, {
    headers: { Cookie: rslA.cookie },
  });
  const ledgerJson = (await ledgerRes.json()) as {
    wallet: { balance: number };
    transactions: Array<{ type: string; amount: number }>;
  };
  assert.equal(ledgerJson.wallet.balance, 115000);
  // Expect ONLY single 'topup' (+100k) ledger entry (NO topup_bonus entry!)
  assert.ok(ledgerJson.transactions.some((tx) => tx.type === 'topup' && tx.amount === 100000));
  assert.equal(
    ledgerJson.transactions.some((tx) => tx.type === 'topup_bonus'),
    false
  );
  // Ledger entries: +100k topup, -60k purchase, +60k refund, +15k manual_credit = 115k
  const ledgerSum = ledgerJson.transactions.reduce((acc, tx) => {
    if (tx.type === 'purchase' || tx.type === 'manual_debit') return acc - tx.amount;
    return acc + tx.amount;
  }, 0);
  assert.equal(ledgerSum, ledgerJson.wallet.balance);

  // 8. Reseller status Banned/Suspended blocks wallet checkout & wallet endpoints + records statusHistory
  const banRes = await fetch(`${baseUrl}/api/admin/resellers/${rslA.resellerId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({ status: 'banned', reason: 'Pelanggaran uji otomatis' }),
  });
  assert.equal(banRes.status, 200);

  const bannedWallet = await fetch(`${baseUrl}/api/reseller/wallet`, {
    headers: { Cookie: rslA.cookie },
  });
  assert.equal(bannedWallet.status, 403);

  const bannedBuy = await fetch(`${baseUrl}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: rslA.cookie },
    body: JSON.stringify({
      paymentMethod: 'WALLET',
      customerName: 'Reseller A',
      customerWhatsapp: '081234567890',
      shippingMethodId: shipId,
      items: [{ productId: walletProd.id, quantity: 1 }],
    }),
  });
  assert.equal(bannedBuy.status, 403);

  // 9. Super Admin guard & audit enforcement on PUT /api/admin/topup-settings
  const noConfirmRes = await fetch(`${baseUrl}/api/admin/topup-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      minAmount: 10000,
      maxAmount: 10000000,
      feePercentage: 12,
      confirmFeeChange: false,
      reason: '',
    }),
  });
  assert.equal(noConfirmRes.status, 400);

  const superAdminChange = await fetch(`${baseUrl}/api/admin/topup-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      minAmount: 10000,
      maxAmount: 10000000,
      feePercentage: 12,
      confirmFeeChange: true,
      reason: 'Uji penyesuaian biaya layanan sementara',
    }),
  });
  assert.equal(superAdminChange.status, 200);

  // Restore feePercentage back to 10%
  const restoreFee = await fetch(`${baseUrl}/api/admin/topup-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
    body: JSON.stringify({
      minAmount: 10000,
      maxAmount: 10000000,
      feePercentage: 10,
      confirmFeeChange: true,
      reason: 'Kembalikan biaya top up standar 10%',
    }),
  });
  assert.equal(restoreFee.status, 200);

  // Insert a regular 'admin' sub-account -> must receive 403 when attempting to change feePercentage!
  const subAdminUsername = `subadm_${Date.now().toString().slice(-5)}`;
  const { hash, salt } = hashPassword('OperatorPass#123');
  await db.withTransaction((draft) => {
    draft.admin_accounts.push({
      id: `adm-sub-${Date.now()}`,
      username: subAdminUsername,
      displayName: 'Operator Admin',
      passwordHash: hash,
      passwordSalt: salt,
      role: 'admin',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  const subAdmLogin = await fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: subAdminUsername, password: 'OperatorPass#123' }),
  });
  assert.equal(subAdmLogin.status, 200);
  const subAdmCookie = (subAdmLogin.headers.get('set-cookie') || '').split(';')[0];

  const nonSuperFeeAttempt = await fetch(`${baseUrl}/api/admin/topup-settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: subAdmCookie },
    body: JSON.stringify({
      minAmount: 10000,
      maxAmount: 10000000,
      feePercentage: 5,
      confirmFeeChange: true,
      reason: 'Coba ubah biaya top up sebagai non-superadmin',
    }),
  });
  assert.equal(nonSuperFeeAttempt.status, 403);

  // Cleanup custom product
  await fetch(`${baseUrl}/api/admin/products/${walletProd.id}`, {
    method: 'DELETE',
    headers: { Cookie: adminCookie },
  });
});
