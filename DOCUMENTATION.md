# Dokumentasi Teknis & Panduan Pengelola — Catrizzz Store

**Catrizzz Store** adalah aplikasi web e-commerce full-stack berbahasa Indonesia dengan tema **Minimalist Blue Glow**, dukungan katalog dinamis, checkout transaksional berbasis server, pembayaran **QRIS resmi**, konfirmasi WhatsApp terformat otomatis, resi digital ber-token kriptografis (`/resi/:token`), serta Dashboard Admin yang dilindungi **Firebase Authentication (Google Sign-In)** dan kontrol peran server.

---

## 1. Struktur Folder Proyek

```text
/
├── public/
│   ├── assets/aistudio/          # Gambar QRIS resmi toko (Catrizz_Store / NMID ID1024365593051)
│   ├── robots.txt                # Konfigurasi crawler mesin pencari
│   └── sitemap.xml               # Peta situs publik
├── server/
│   ├── auth.ts                   # Verifikasi Firebase ID Token & allowlist administrator
│   ├── db.ts                     # Penyimpanan transaksional mutex-serialized (data/store.db.json)
│   ├── routes.ts                 # API publik & API admin terautentikasi (/api/*)
│   ├── security.ts               # Token resi 256-bit, HMAC-SHA256, sanitasi, validasi magic-byte, rate limit
│   ├── security.test.ts          # Unit test keamanan server
│   ├── routes.test.ts            # Integration test endpoint API (checkout, diskon, resi, auth guard)
│   └── seedData.ts               # Data awal toko, konten CMS, FAQ, pengiriman, dan produk/promo demo
├── src/
│   ├── assets/images/            # Aset gambar produk, hero, dan banner promo
│   ├── components/
│   │   ├── admin/                # Tab dashboard admin (Overview, Catalog, Orders, Promos, CMS/QRIS, Logs)
│   │   ├── CartDrawer.tsx        # Drawer keranjang belanja slide-over
│   │   ├── ErrorBoundary.tsx     # Fallback error UI yang ramah pengguna
│   │   ├── Footer.tsx            # Footer publik toko & tautan kebijakan
│   │   ├── Navbar.tsx            # Navigasi utama responsif + pencarian cepat + lencana keranjang
│   │   ├── ProductCard.tsx       # Kartu produk dengan format IDR & pengaman stok
│   │   ├── SafeImage.tsx         # Komponen gambar dengan fallback elegan saat URL gagal dimuat
│   │   ├── StatusBadge.tsx       # Badge status pembayaran & status pesanan
│   │   └── ToastContainer.tsx    # Notifikasi toast non-blocking
│   ├── context/
│   │   └── StoreContext.tsx      # State global toko, sinkronisasi keranjang, dan sesi Firebase Auth admin
│   ├── lib/
│   │   └── firebase.ts           # Inisialisasi Firebase SDK & Google Sign-In
│   ├── pages/
│   │   ├── AdminPage.tsx         # Gerbang login Google Admin & kontrol panel
│   │   ├── CartPage.tsx          # Halaman keranjang belanja lengkap
│   │   ├── CatalogPage.tsx       # Halaman semua produk dengan pencarian, filter, sortir, paginasi
│   │   ├── CheckReceiptPage.tsx  # Halaman cek resi publik (/cek-resi)
│   │   ├── CheckoutPage.tsx      # Checkout aman + validasi voucher server-side
│   │   ├── HomePage.tsx          # Landing page, hero, promo, kategori, produk unggulan, FAQ
│   │   ├── PaymentPage.tsx       # Halaman pembayaran QRIS resmi & form konfirmasi + WhatsApp
│   │   ├── PolicyPage.tsx        # Halaman Kebijakan Privasi, Syarat & Ketentuan, Pengembalian, 404
│   │   ├── ProductDetailPage.tsx # Detail produk, varian, galeri, dan tambah ke keranjang
│   │   └── ReceiptDetailPage.tsx # Resi digital publik dengan timeline status, cetak, & unduh PDF
│   ├── shared/
│   │   ├── pricing.ts            # Perhitungan harga IDR, diskon, pajak, masking privasi, & URL WhatsApp
│   │   ├── pricing.test.ts       # Unit test kalkulasi harga & diskon
│   │   └── types.ts              # Definisi tipe TypeScript bersama client & server
│   ├── utils/
│   │   └── pdfReceipt.ts         # Generator PDF resi client-side menggunakan jsPDF
│   ├── App.tsx                   # Routing utama aplikasi & ErrorBoundary
│   ├── index.css                 # Desain Minimalist Blue Glow (Tailwind CSS v4 + print styles)
│   └── main.tsx                  # Entry point React
├── server.ts                     # Server Express + Vite middleware (port 3000)
├── firebase-applet-config.json   # Konfigurasi proyek Firebase & Firestore database ID
├── firestore.rules               # Aturan keamanan Zero-Trust Firestore yang telah dideploy
├── firebase-blueprint.json       # Skema entitas database Firestore
├── eslint.config.js              # Konfigurasi ESLint untuk validasi firestore.rules
├── metadata.json                 # Metadata aplikasi AI Studio
└── package.json                  # Dependensi & skrip npm
```

---

## 2. Arsitektur Keamanan & Transaksi

1. **Server-Authoritative Pricing & Stock**:
   - Harga barang, diskon produk, kode kupon, biaya pengiriman, pajak, dan total akhir selalu dihitung ulang di server (`POST /api/checkout`). Nilai yang dimodifikasi di sisi klien diabaikan.
   - Stok produk/varian diperiksa dan dikurangi secara atomik di dalam transaksi mutex (`db.withTransaction`).
   - Checkout mendukung `idempotencyKey` sehingga klik ganda tidak menghasilkan pesanan duplikat.
2. **Alur Pembayaran QRIS & Verifikasi Manual**:
   - Konfirmasi pembayaran oleh pelanggan (`POST /api/payments/confirm`) selalu menyetel status ke `pending_verification` (**tidak pernah** otomatis menjadi `paid`).
   - Bukti pembayaran (`.jpg`, `.png`, `.pdf`, maks 5 MB) divalidasi menggunakan pemeriksaan *magic bytes* buffer sebelum disimpan di `uploads/proofs/`.
   - Hanya admin terverifikasi yang dapat menyetujui (`paid`) atau menolak (`rejected`) pembayaran melalui `POST /api/admin/payments/:orderId/verify`.
3. **Resi Digital Ber-token Kriptografis**:
   - Setiap pesanan mendapatkan kode akses acak 256-bit (`CTRZ-...`). Server hanya menyimpan hash HMAC-SHA256 (`receiptTokenHash`) dan membandingkan menggunakan `crypto.timingSafeEqual`.
   - Halaman `/resi/:token` menyamarkan data sensitif (nomor WhatsApp & alamat pengiriman di-mask) dan endpoint `/api/receipts/*` dilindungi rate limiter.

---

## 3. Setup Firebase, Firestore Rules & Akun Admin Pertama

### A. Konfigurasi Firebase
- Konfigurasi Firebase client tersimpan di `firebase-applet-config.json` (Project ID: `deep-bonsai-407pf`, Auth Domain: `deep-bonsai-407pf.firebaseapp.com`).
- Aturan keamanan Zero-Trust berada di `firestore.rules` dan sudah diverifikasi melalui `@firebase/eslint-plugin-security-rules`.

### B. Cara Menetapkan & Mengakses Akun Admin Pertama
Panel `/admin` menggunakan **Firebase Authentication (Google Sign-In)** tanpa kata sandi statis di frontend:
1. Secara bawaan, email administrator utama telah di-bootstrap di `server/auth.ts` (`risqicatur82@gmail.com`) dan di `firestore.rules`.
2. Untuk menambahkan akun Google admin lainnya pada saat deployment:
   - Setel environment variable `BOOTSTRAP_ADMIN_EMAILS="email1@gmail.com,email2@gmail.com"` sebelum menjalankan server, **atau**
   - Tambahkan email yang terverifikasi ke dalam `admin_roles` dan aturan `firestore.rules`.
3. Pastikan metode login **Google** aktif di Firebase Console -> Authentication -> Sign-in method, serta domain deployment Anda ditambahkan ke daftar *Authorized domains*.
4. Buka `/admin` lalu klik **Masuk dengan Google**. Server akan memverifikasi ID Token menggunakan `firebase-admin/auth` (`email_verified === true` dan email masuk allowlist).

### C. Persistensi Server Produksi
- Secara default pada container runtime, server menyimpan state ke file lokal `data/store.db.json` dengan penulisan atomik (`tmp` + `rename`) dan unggahan bukti ke `uploads/`.
- Jika ingin menghubungkan `firebase-admin` langsung ke Firestore dari backend di server eksternal, sediakan kredensial service account pada environment variable `FIREBASE_SERVICE_ACCOUNT_KEY` dan pastikan folder `data/` serta `uploads/` dipasang pada persistent volume/storage saat deploy.

---

## 4. Konfigurasi QRIS Resmi

- Gambar QRIS resmi toko sudah tertanam di `/public/assets/aistudio/WhatsApp_Image_2026-10-25_at_04.49.38_4f360b50.jpeg` (Merchant: `Catrizz_Store`, NMID: `ID1024365593051`).
- **Penting**: Jangan memodifikasi atau memotong gambar QRIS secara manual agar kode QR tetap valid untuk dipindai oleh semua aplikasi e-wallet/m-banking.
- Admin dapat mengganti gambar QRIS, nama merchant, NMID, instruksi langkah pembayaran, maupun mengaktifkan/menonaktifkan metode QRIS kapan saja melalui tab **CMS, QRIS & Toko -> Pembayaran & QRIS** di `/admin`.

---

## 5. Variabel Lingkungan (`.env`)

Salin `.env.example` menjadi `.env` saat menjalankan di luar environment terkelola:

| Variabel | Fungsi |
| --- | --- |
| `APP_URL` | URL publik aplikasi (dipakai untuk tautan resi di pesan WhatsApp & metadata). Default: `http://localhost:3000`. |
| `BOOTSTRAP_ADMIN_EMAILS` | Daftar email Google (dipisahkan koma) yang diberi izin masuk ke `/admin`. |
| `RECEIPT_TOKEN_PEPPER` | Secret string panjang dan acak untuk HMAC-SHA256 hash token resi di server. **Wajib diganti di produksi.** |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Opsional JSON string / path Service Account Firebase Admin untuk akses backend di produksi. |
| `GEMINI_API_KEY` | Disediakan oleh environment AI Studio jika fitur AI diaktifkan di masa mendatang. |

---

## 6. Menjalankan Lokal & Deployment

### Pengembangan Lokal
```bash
npm install
npm run dev
```
Aplikasi berjalan di `http://localhost:3000` (Express backend + Vite middleware).

### Verifikasi Build & Pengujian
```bash
# Unit & Integration Tests
npx --yes tsx --test src/shared/pricing.test.ts server/security.test.ts server/routes.test.ts

# Type-check & Build Produksi
npm run lint
npm run build

# Validasi Firestore Rules
npx eslint firestore.rules
```

### Deployment Produksi
```bash
npm run build
NODE_ENV=production npx tsx server.ts
```
*(Catatan: Jika menggunakan `node server.ts` secara langsung tanpa `tsx`, pastikan environment Node mendukung TypeScript transpilation atau kompilasi `server.ts` ke JS terlebih dahulu.)*

---

## 7. Daftar Fitur yang Sudah Diimplementasikan & Data yang Perlu Diisi Pengelola

### Fitur Tersedia
- **Storefront Publik**: Beranda (Hero, Banner Promo, Keunggulan Toko, Kategori, Produk Unggulan, Tentang Kami, FAQ), Katalog Lengkap (`/produk`) dengan pencarian/filter/urutkan/paginasi, Halaman Detail Produk (`/produk/:slug`) dengan varian dan galeri.
- **Keranjang & Checkout**: Slide-over drawer + halaman `/keranjang` yang persisten, kalkulasi ongkos kirim & diskon kupon tervalidasi di server (`/checkout`).
- **Pembayaran QRIS & WhatsApp**: Halaman `/pembayaran/:orderId` dengan QRIS resmi `Catrizz_Store`, tombol unduh QRIS, upload bukti bayar (JPG/PNG/PDF), status `Menunggu Verifikasi`, dan generator pesan WhatsApp otomatis ke `6287738172871`.
- **Resi Publik Aman**: `/cek-resi` dan `/resi/:token` dengan pelacakan timeline status real-time, privasi tersamar, cetak halaman, dan ekspor PDF (`jspdf`).
- **Admin Dashboard (`/admin`)**: Overview KPI & grafik harian/mingguan/bulanan, CRUD Produk/Varian/Kategori, Verifikasi Pembayaran (Setujui/Tolak dengan alasan) & rotasi/nonaktifkan token resi, Manajemen Kode Promo, Editor CMS/Banner/QRIS/Pengiriman, serta Direktori Pelanggan, Log Audit, dan Log Inventaris.
- **Pembersihan Data Demo Aman**: Tombol *Hapus Data Demo* pada tab Overview hanya menghapus item berlabel demo tanpa menyentuh transaksi nyata.

### Data yang Dapat Disesuaikan Pengelola di `/admin`
- Katalog produk asli, harga, stok, varian, dan foto produk (atau hapus produk demo lewat tombol *Hapus Data Demo*).
- Nomor WhatsApp toko (default: `6287738172871`), jam operasional, alamat/kota toko, dan tarif pengiriman.
- Konten kebijakan toko (Privasi, Syarat & Ketentuan, Kebijakan Pengembalian) serta kode kupon promo (`CATRIZZZ20`, `HEMAT10000`, atau promo baru).
