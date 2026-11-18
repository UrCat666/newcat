import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateActivationToken,
  generateOrderNumber,
  generateReceiptToken,
  generateResellerCode,
  hashActivationToken,
  hashPassword,
  hashReceiptToken,
  maskReceiptToken,
  parseCookieHeader,
  sanitizeText,
  sha256Buffer,
  signAdminSessionToken,
  signUserSessionToken,
  SlidingWindowRateLimiter,
  timingSafeEqualHex,
  validateUploadedFileMagicBytes,
  verifyAdminSessionToken,
  verifyPassword,
  verifyUserSessionToken,
} from './security';

test('receipt token generator produces unique 256-bit CTRZ tokens and verifiable hashes', () => {
  const t1 = generateReceiptToken();
  const t2 = generateReceiptToken();
  assert.ok(t1.startsWith('CTRZ-'));
  assert.ok(t1.length >= 46);
  assert.notEqual(t1, t2);

  const h1 = hashReceiptToken(t1);
  const h2 = hashReceiptToken(t2);
  assert.equal(h1.length, 64);
  assert.equal(timingSafeEqualHex(h1, hashReceiptToken(t1)), true);
  assert.equal(timingSafeEqualHex(h1, h2), false);
  assert.ok(maskReceiptToken(t1).includes('...'));
});

test('order number uses CTR-YYYYMMDD-XXXX format in Asia/Jakarta', () => {
  const orderNo = generateOrderNumber(7, new Date('2026-11-14T10:00:00.000Z'));
  assert.equal(orderNo, 'CTR-20261114-0007');
});

test('sanitizeText strips HTML tags and enforces maxLength', () => {
  assert.equal(sanitizeText('<script>alert(1)</script>Halo Budi', 50), 'alert(1)Halo Budi');
  assert.equal(sanitizeText('  abc  ', 2), 'ab');
});

test('validateUploadedFileMagicBytes rejects spoofed extensions and accepts real headers', () => {
  const jpgBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const pdfBuf = Buffer.from('%PDF-1.7\n...');
  const fakeBuf = Buffer.from('<html><script>evil()</script></html>');

  assert.equal(validateUploadedFileMagicBytes(jpgBuf, ['jpg', 'png', 'pdf']).ok, true);
  assert.equal(validateUploadedFileMagicBytes(pngBuf, ['jpg', 'png', 'pdf']).ok, true);
  assert.equal(validateUploadedFileMagicBytes(pdfBuf, ['jpg', 'png', 'pdf']).ok, true);
  assert.equal(validateUploadedFileMagicBytes(fakeBuf, ['jpg', 'png', 'pdf']).ok, false);
});

test('SlidingWindowRateLimiter blocks requests past limit and resets after window', () => {
  const limiter = new SlidingWindowRateLimiter(3, 10000);
  assert.equal(limiter.consume('ip1', 1000).allowed, true);
  assert.equal(limiter.consume('ip1', 2000).allowed, true);
  assert.equal(limiter.consume('ip1', 3000).allowed, true);
  assert.equal(limiter.consume('ip1', 4000).allowed, false);
  assert.equal(limiter.consume('ip1', 12000).allowed, true);
});

test('hashPassword & verifyPassword use per-account random salt and scrypt verification', () => {
  const first = hashPassword('StrongPass#123');
  const second = hashPassword('StrongPass#123');
  assert.notEqual(first.salt, second.salt);
  assert.notEqual(first.hash, second.hash);
  assert.equal(verifyPassword('StrongPass#123', first.salt, first.hash), true);
  assert.equal(verifyPassword('WrongPass', first.salt, first.hash), false);
});

test('signAdminSessionToken & verifyAdminSessionToken validate HMAC signature and expiry', () => {
  const token = signAdminSessionToken({
    uid: 'admin-1',
    username: 'Catrizzz',
    role: 'super_admin',
  });
  const verified = verifyAdminSessionToken(token);
  assert.ok(verified);
  assert.equal(verified?.username, 'Catrizzz');
  assert.equal(verified?.role, 'super_admin');

  const tampered = `${token.slice(0, -2)}xx`;
  assert.equal(verifyAdminSessionToken(tampered), null);

  const expired = signAdminSessionToken(
    { uid: 'admin-1', username: 'Catrizzz', role: 'super_admin' },
    -1000
  );
  assert.equal(verifyAdminSessionToken(expired), null);
});

test('parseCookieHeader extracts encoded cookie pairs safely', () => {
  const parsed = parseCookieHeader('foo=bar; catrizzz_admin_session=tok%2E123; theme=dark');
  assert.equal(parsed.foo, 'bar');
  assert.equal(parsed.catrizzz_admin_session, 'tok.123');
  assert.equal(parsed.theme, 'dark');
});

test('user session tokens are isolated from admin session tokens and reseller code generator avoids collisions', () => {
  const userToken = signUserSessionToken({ uid: 'usr-1', username: 'budi_user' });
  const verifiedUser = verifyUserSessionToken(userToken);
  assert.ok(verifiedUser);
  assert.equal(verifiedUser?.username, 'budi_user');

  // User token must NEVER validate as admin token
  assert.equal(verifyAdminSessionToken(userToken), null);

  const adminToken = signAdminSessionToken({ uid: 'adm-1', username: 'Catrizzz', role: 'super_admin' });
  assert.equal(verifyUserSessionToken(adminToken), null);

  const code = generateResellerCode('budi_99', new Set(['CAT-BUDI99-0001']));
  assert.ok(code.startsWith('CAT-BUDI99-'));

  const hashA = sha256Buffer(Buffer.from('proof-a'));
  const hashB = sha256Buffer(Buffer.from('proof-b'));
  assert.equal(hashA.length, 64);
  assert.notEqual(hashA, hashB);
});

test('activation token generator produces unique CTRZ-ACT tokens and deterministic HMAC hashes', () => {
  const act1 = generateActivationToken();
  const act2 = generateActivationToken();
  assert.ok(act1.startsWith('CTRZ-ACT-'));
  assert.notEqual(act1, act2);

  const h1 = hashActivationToken(act1);
  const h2 = hashActivationToken(act2);
  assert.equal(h1.length, 64);
  assert.equal(timingSafeEqualHex(h1, hashActivationToken(act1)), true);
  assert.equal(timingSafeEqualHex(h1, h2), false);

  const webpBuf = Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'ascii');
  assert.equal(validateUploadedFileMagicBytes(webpBuf, ['jpg', 'png', 'webp']).ok, true);
});
