# Security Specification — Catrizzz Store

## 1. Data Invariants
1. **Admin RBAC Isolation**: Only verified administrators (`email_verified == true` matching bootstrapped admin email or active `admin_roles/{uid}`) may read or write sensitive collections (`orders`, `order_items`, `payments`, `payment_confirmations`, `discount_codes`, `discount_usages`, `customers`, `inventory_logs`, `audit_logs`, `admin_roles`).
2. **No Self-Promotion**: Visitors and regular users cannot create or elevate records in `admin_roles` or inject `role`/`isAdmin` fields on `/users/{userId}`.
3. **Price & Payment Integrity**: Public clients cannot create or mutate `orders`, `payments`, or `payment_confirmations` directly in Firestore; all order calculations, stock decrements, receipt token generation, and payment state transitions are mediated by the verified backend server or admin.
4. **PII Protection**: Customer phone numbers, email addresses, and shipping addresses in `orders`, `customers`, and `payment_confirmations` are strictly non-readable by public or non-admin users.
5. **Immutable Audit & Inventory Logs**: `audit_logs` and `inventory_logs` cannot be modified or deleted by any non-admin client, and audit trails are append-only.
6. **Document ID & Payload Size Hardening**: Every single-document match uses `isValidId()` (`^[a-zA-Z0-9_\-]+$`, max 128 chars), strict `keys().hasAll(...)` + `keys().hasOnly(...)`, and explicit string `.size()` bounds.

## 2. The "Dirty Dozen" Attack Payloads (All Must Return PERMISSION_DENIED)
1. **Unauthenticated Product Mutation**: Anonymous client attempts `setDoc(doc(db, 'products', 'p1'), { name: 'Hacked', price: 1 })`.
2. **Non-Admin Payment Paid Spoof**: Authenticated non-admin user attempts `updateDoc(doc(db, 'payments', 'pay1'), { status: 'paid' })`.
3. **Admin Role Self-Escalation**: Authenticated non-admin attempts `setDoc(doc(db, 'admin_roles', uid), { uid, email, role: 'super_admin', active: true })`.
4. **Unverified Email Admin Spoof**: Token with matching admin email but `email_verified: false` attempts reading `/orders/ord1`.
5. **Public Order List Scraping**: Unauthenticated or non-admin user calls `getDocs(collection(db, 'orders'))`.
6. **Public Customer PII Read**: Non-admin user calls `getDoc(doc(db, 'customers', 'cust1'))`.
7. **Shadow Field Injection on User Profile**: User attempts `setDoc(doc(db, 'users', uid), { uid, email, isAdmin: true, createdAt, updatedAt })`.
8. **Audit Log Tampering**: Non-admin (or even client attempting `delete` on `audit_logs`) tries `deleteDoc(doc(db, 'audit_logs', 'log1'))`.
9. **Oversized ID Poisoning**: Client attempts write to `/products/<2000-char-id>`.
10. **Discount Code Direct Read/Scraping**: Unauthenticated client calls `getDocs(collection(db, 'discount_codes'))` to harvest private promos.
11. **Payment Confirmation Direct Client Create**: Non-admin client tries `setDoc(doc(db, 'payment_confirmations', 'pc1'), { paidAmount: 1 })` bypassing backend file/order validation.
12. **User Profile Ownership Hijack**: Authenticated User A tries `setDoc(doc(db, 'users', 'userB'), { uid: 'userB', ... })`.
