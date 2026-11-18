import fs from 'node:fs';
import path from 'node:path';
import { hashPassword } from './security';
import type {
  AdminAccount,
  AdminRole,
  AuditLog,
  Banner,
  Category,
  CustomerRecord,
  DiscountCode,
  DiscountUsage,
  InventoryLog,
  NavigationMenuItem,
  Order,
  OrderItemSnapshot,
  Payment,
  PaymentConfirmation,
  Product,
  ProductVariant,
  QrisHistoryEntry,
  ResellerApplication,
  ResellerProfile,
  ResellerTopup,
  ResellerWallet,
  ShippingSetting,
  SiteContent,
  StoreSettings,
  UserAccount,
  WalletTransaction,
} from '../src/shared/types';
import {
  calculateResellerPrice,
  DEFAULT_TOPUP_MAX,
  DEFAULT_TOPUP_MIN,
  TOPUP_FEE_PERCENTAGE,
} from '../src/shared/pricing';

export const OFFICIAL_QRIS_PATH = '/assets/aistudio/WhatsApp_Image_2026-10-25_at_04.49.38_4f360b50.jpeg';
export const CURRENT_SCHEMA_VERSION = 6;

export const HERO_CLEAN_IMAGE = '/src/assets/images/hero_clean_digital_1794609262378.jpg';
export const CAT_AI_CLEAN_IMAGE = '/src/assets/images/cat_ai_clean_1794609262401.jpg';
export const CAT_STREAMING_CLEAN_IMAGE = '/src/assets/images/cat_streaming_clean_1794609262817.jpg';
export const CAT_CREATIVE_CLEAN_IMAGE = '/src/assets/images/cat_creative_clean_1794609264165.jpg';
export const CAT_SECURITY_CLEAN_IMAGE = '/src/assets/images/cat_security_clean_1794609264129.jpg';

export function hasOfficialQrisFile(): boolean {
  const diskPath = path.resolve(process.cwd(), 'public', OFFICIAL_QRIS_PATH.replace(/^\//, ''));
  return fs.existsSync(diskPath);
}

export interface DatabaseState {
  schemaVersion?: number;
  stateVersion?: number;
  store_settings: StoreSettings;
  site_contents: SiteContent;
  navigation_menus?: NavigationMenuItem[];
  categories: Category[];
  products: Product[];
  product_variants: ProductVariant[];
  banners: Banner[];
  discount_codes: DiscountCode[];
  discount_usages: DiscountUsage[];
  shipping_settings: ShippingSetting[];
  orders: Order[];
  order_items: OrderItemSnapshot[];
  payments: Payment[];
  payment_confirmations: PaymentConfirmation[];
  customers: CustomerRecord[];
  inventory_logs: InventoryLog[];
  audit_logs: AuditLog[];
  admin_roles: AdminRole[];
  admin_accounts: AdminAccount[];
  users: UserAccount[];
  reseller_applications: ResellerApplication[];
  reseller_profiles: ResellerProfile[];
  reseller_wallets: ResellerWallet[];
  wallet_transactions: WalletTransaction[];
  reseller_topups: ResellerTopup[];
  qris_history: QrisHistoryEntry[];
  order_sequence: number;
  reseller_app_sequence: number;
  topup_sequence: number;
  wallet_tx_sequence: number;
}

export function createDefaultNavigationMenus(): NavigationMenuItem[] {
  return [
    { id: 'nav-h-home', label: 'Beranda', href: '/', location: 'header', group: 'main', openInNewTab: false, sortOrder: 1, active: true },
    { id: 'nav-h-products', label: 'Produk', href: '/produk', location: 'header', group: 'main', openInNewTab: false, sortOrder: 2, active: true },
    { id: 'nav-h-categories', label: 'Kategori', href: '/kategori', location: 'header', group: 'main', openInNewTab: false, sortOrder: 3, active: true },
    { id: 'nav-h-reseller', label: 'Join Reseller', href: '/join-reseller', location: 'header', group: 'main', openInNewTab: false, sortOrder: 4, active: true },
    { id: 'nav-h-help', label: 'Bantuan', href: '/bantuan', location: 'header', group: 'main', openInNewTab: false, sortOrder: 5, active: true },
    { id: 'nav-f-home', label: 'Beranda', href: '/', location: 'footer', group: 'main', openInNewTab: false, sortOrder: 1, active: true },
    { id: 'nav-f-products', label: 'Semua Produk', href: '/produk', location: 'footer', group: 'main', openInNewTab: false, sortOrder: 2, active: true },
    { id: 'nav-f-categories', label: 'Kategori Aplikasi', href: '/kategori', location: 'footer', group: 'main', openInNewTab: false, sortOrder: 3, active: true },
    { id: 'nav-f-receipt', label: 'Cek Resi Transaksi', href: '/cek-resi', location: 'footer', group: 'main', openInNewTab: false, sortOrder: 4, active: true },
    { id: 'nav-f-help', label: 'Pusat Bantuan', href: '/bantuan', location: 'footer', group: 'main', openInNewTab: false, sortOrder: 5, active: true },
    { id: 'nav-p-privacy', label: 'Kebijakan Privasi', href: '/kebijakan-privasi', location: 'footer', group: 'portal', openInNewTab: false, sortOrder: 1, active: true },
    { id: 'nav-p-terms', label: 'Syarat dan Ketentuan', href: '/syarat-ketentuan', location: 'footer', group: 'portal', openInNewTab: false, sortOrder: 2, active: true },
    { id: 'nav-p-return', label: 'Kebijakan Pengembalian', href: '/kebijakan-pengembalian', location: 'footer', group: 'portal', openInNewTab: false, sortOrder: 3, active: true },
  ];
}

export function createDefaultHomepageSections(): NonNullable<SiteContent['homepageSections']> {
  return {
    hero: {
      enabled: true,
      primaryCtaLink: '/produk',
      secondaryCtaLink: '#produk-unggulan',
      backgroundStyle: 'white',
    },
    categoriesSection: {
      enabled: true,
      sortOrder: 1,
      title: 'Kategori Produk',
      subtitle: 'Temukan aplikasi premium dan layanan berlangganan pilihan sesuai kebutuhan Anda.',
      maxItems: 8,
    },
    featuredSection: {
      enabled: true,
      sortOrder: 2,
      title: 'Produk Unggulan',
      subtitle: 'Produk digital terfavorit Catrizzz Store dengan stok terjamin dan harga transparan.',
      maxItems: 8,
    },
    bannersSection: {
      enabled: true,
      sortOrder: 3,
      title: 'Program Kemitraan Reseller Resmi',
    },
    advantagesSection: {
      enabled: true,
      sortOrder: 4,
      title: 'Mengapa Memilih Catrizzz Store?',
      subtitle: 'Standar layanan digital terstruktur dengan transparansi harga, keamanan QRIS, dan garansi jelas.',
    },
  };
}

export function createInitialAdminAccount(now = new Date().toISOString()): AdminAccount {
  const username = process.env.INITIAL_ADMIN_USERNAME || 'Catrizzz';
  const initialSecret = process.env.INITIAL_ADMIN_PASSWORD || 'Catrizzz666';
  const { salt, hash } = hashPassword(initialSecret);
  return {
    id: 'adm-catrizzz-owner',
    username,
    displayName: 'Administrator Catrizzz Store',
    passwordHash: hash,
    passwordSalt: salt,
    role: 'super_admin',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function createInitialSeedState(): DatabaseState {
  const now = new Date().toISOString();
  const qrisAvailable = hasOfficialQrisFile();

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    stateVersion: 1,
    store_settings: {
      id: 'default',
      storeName: 'Catrizzz Store',
      seoTitle: 'Catrizzz Store — Platform Aplikasi Premium & Produk Digital Terpercaya',
      seoDescription:
        'Catrizzz Store — Platform jual beli aplikasi premium, layanan berlangganan, akun digital, dan lisensi resmi dengan checkout aman, QRIS resmi, dan pelacakan resi unik.',
      tagline: 'Platform Aplikasi Premium & Produk Digital Terpercaya',
      logoUrl: '',
      faviconUrl: '',
      whatsappNumber: '6287738172871',
      email: 'support@catrizzz.store',
      address: 'Layanan Digital · Indonesia',
      operatingHours: 'Setiap Hari, 08.00 - 22.00 WIB',
      currency: 'IDR',
      taxPercent: 0,
      maintenanceMode: false,
      qrisEnabled: qrisAvailable,
      qrisImageUrl: qrisAvailable ? OFFICIAL_QRIS_PATH : '',
      qrisMerchantName: 'Catrizz_Store',
      qrisNmid: 'ID1024365593051',
      qrisInstructions: [
        'Buka aplikasi mobile banking atau e-wallet yang mendukung QRIS.',
        'Pilih menu Scan QRIS.',
        'Scan QRIS resmi Catrizzz Store di atas.',
        'Periksa nama merchant pada aplikasi pembayaran (Catrizz_Store).',
        'Masukkan atau periksa nominal sesuai total transaksi yang ditampilkan.',
        'Selesaikan pembayaran di aplikasi Anda.',
        'Kembali ke halaman ini.',
        'Tekan tombol Konfirmasi Pembayaran dan unggah bukti transaksi agar akses digital segera diproses.',
      ],
      qrisVersion: 1,
      allowResellerStackPromo: false,
      topupMinAmount: DEFAULT_TOPUP_MIN,
      topupMaxAmount: DEFAULT_TOPUP_MAX,
      topupFeePercentage: TOPUP_FEE_PERCENTAGE,
      reviewsEnabled: true,
      updatedAt: now,
    },
    navigation_menus: createDefaultNavigationMenus(),
    site_contents: {
      id: 'default',
      homepageStatus: 'published',
      homepageSections: createDefaultHomepageSections(),
      announcementEnabled: true,
      announcementText:
        'Promo Spesial Aplikasi Premium — Gunakan kode CATRIZZZ20 untuk hemat 20% + pengiriman akses instan via WhatsApp.',
      heroHeadline: 'APLIKASI PREMIUM & PRODUK DIGITAL TERPERCAYA',
      heroSubheadline: 'Catrizzz Store · Akses Instan, Legal & Bergaransi Penuh',
      heroDescription:
        'Platform jual beli aplikasi premium, layanan langganan AI, hiburan streaming, desain kreatif, dan lisensi digital dengan pembayaran QRIS resmi serta resi transaksi terenkripsi.',
      heroImageUrl: HERO_CLEAN_IMAGE,
      heroPrimaryCtaLabel: 'Jelajahi Aplikasi',
      heroSecondaryCtaLabel: 'Lihat Produk Unggulan',
      advantages: [
        {
          id: 'adv-1',
          title: 'Aktivasi Cepat & Terpandu',
          description: 'Panduan aktivasi jelas dan pengiriman akses langsung ke WhatsApp atau Email Anda.',
          iconName: 'Zap',
        },
        {
          id: 'adv-2',
          title: 'Pembayaran QRIS Resmi',
          description: 'Mendukung seluruh aplikasi bank dan e-wallet Indonesia melalui QRIS Catrizz_Store.',
          iconName: 'QrCode',
        },
        {
          id: 'adv-3',
          title: 'Garansi Penuh Masa Aktif',
          description: 'Dukungan teknis responsif dan garansi sesuai durasi langganan yang Anda pilih.',
          iconName: 'ShieldCheck',
        },
        {
          id: 'adv-4',
          title: 'Bukti & Resi Terenkripsi',
          description: 'Setiap pembelian tercatat permanen dan dapat dilacak melalui token resi unik.',
          iconName: 'Receipt',
        },
        {
          id: 'adv-5',
          title: 'Admin WhatsApp Siaga',
          description: 'Verifikasi cepat serta bantuan aktivasi langsung oleh tim resmi Catrizzz Store.',
          iconName: 'MessageCircle',
        },
      ],
      faqs: [
        {
          id: 'faq-1',
          question: 'Bagaimana proses pengiriman aplikasi premium dan akun digital?',
          answer:
            'Setelah pembayaran QRIS Anda diverifikasi oleh admin, detail akses akun, invite email, atau lisensi digital akan langsung dikirimkan melalui WhatsApp atau Email yang Anda daftarkan saat checkout.',
        },
        {
          id: 'faq-2',
          question: 'Apakah pembayaran langsung berstatus lunas setelah konfirmasi?',
          answer:
            'Tidak. Demi keamanan transaksi, status menjadi Menunggu Verifikasi hingga admin memeriksa mutasi pembayaran Anda, lalu status pesanan diproses dan akses segera dikirim.',
        },
        {
          id: 'faq-3',
          question: 'Apakah semua produk digital memiliki garansi masa aktif?',
          answer:
            'Ya. Setiap layanan berlangganan dilengkapi garansi sesuai durasi paket (1 bulan, 3 bulan, atau 1 tahun) beserta panduan aktivasi lengkap.',
        },
      ],
      aboutTitle: 'Mengapa Memilih Catrizzz Store?',
      aboutDescription:
        'Catrizzz Store menyediakan langganan aplikasi premium, tools produktivitas AI, desain kreatif, dan hiburan digital dengan harga transparan, pembayaran QRIS resmi, dan dukungan garansi penuh.',
      footerDescription:
        'Platform aplikasi premium dan produk digital terpercaya. Pembayaran QRIS resmi, verifikasi cepat, dan resi transaksi terenkripsi.',
      footerCopyright: '© 2026 Catrizzz Store. Seluruh hak cipta dilindungi.',
      socialLinks: {
        instagram: 'https://instagram.com/catrizzz.store',
        tiktok: 'https://tiktok.com/@catrizzz.store',
        email: 'mailto:support@catrizzz.store',
      },
      privacyPolicy:
        'Catrizzz Store menjaga kerahasiaan data pelanggan termasuk nama, nomor WhatsApp, dan email aktivasi akun. Data hanya digunakan untuk pengiriman akses produk digital dan verifikasi pembayaran. Nomor WhatsApp disamarkan pada resi publik.',
      termsConditions:
        'Semua harga produk digital tertera dalam Rupiah (IDR). Pengiriman akses akun atau lisensi dilakukan setelah pembayaran QRIS diverifikasi oleh admin. Pelanggan wajib mengikuti panduan penggunaan agar garansi tetap berlaku.',
      returnPolicy:
        'Garansi penggantian akses atau pengembalian dana berlaku apabila produk digital mengalami kendala teknis dari penyedia dan dilaporkan melalui WhatsApp resmi toko dengan Order ID valid.',
      updatedAt: now,
    },
    categories: [
      {
        id: 'cat-ai',
        name: 'AI & Produktivitas',
        slug: 'ai-produktivitas',
        description: 'Langganan ChatGPT Plus, Claude Pro, Notion AI, dan tools kerja cerdas.',
        imageUrl: CAT_AI_CLEAN_IMAGE,
        sortOrder: 1,
        active: true,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cat-streaming',
        name: 'Streaming & Hiburan',
        slug: 'streaming-hiburan',
        description: 'Netflix 4K UHD, YouTube Premium, Spotify Premium, dan layanan hiburan.',
        imageUrl: CAT_STREAMING_CLEAN_IMAGE,
        sortOrder: 2,
        active: true,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cat-creative',
        name: 'Desain & Kreatif',
        slug: 'desain-kreatif',
        description: 'Canva Pro, CapCut Pro, dan Creative Cloud untuk kreator digital.',
        imageUrl: CAT_CREATIVE_CLEAN_IMAGE,
        sortOrder: 3,
        active: true,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cat-security',
        name: 'Keamanan & Developer',
        slug: 'keamanan-developer',
        description: 'VPN privat, lisensi IDE developer, cloud storage, dan utilitas sistem.',
        imageUrl: CAT_SECURITY_CLEAN_IMAGE,
        sortOrder: 4,
        active: true,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    products: [
      {
        id: 'prod-chatgpt-plus',
        name: 'ChatGPT Plus Workspace (Private)',
        slug: 'chatgpt-plus-workspace-private',
        description:
          'Akses penuh model GPT-4o, Deep Research, analisis file & gambar, serta prioritas kecepatan tanpa antrean. Akun privat eksklusif dengan riwayat chat aman untuk kebutuhan kerja maupun studi.',
        additionalInfo: 'Pengiriman digital instan · Garansi penuh selama masa aktif langganan.',
        subscriptionDuration: '1 Bulan',
        benefits: [
          'Akses GPT-4o, reasoning model terbaru, dan DALL-E generasi gambar',
          'Upload dokumen PDF, Excel, dan kode tanpa batas harian rendah',
          'Akun privat (bukan shared ramai-ramai), privasi prompt terjaga',
          'Full garansi selama masa berlangganan aktif',
        ],
        activationGuide:
          '1. Lakukan checkout & selesaikan pembayaran QRIS.\n2. Admin mengirimkan email & password akun atau aktivasi invite ke WhatsApp Anda.\n3. Login ke chatgpt.com dan langsung gunakan seluruh fitur Plus.',
        availabilityStatus: 'available',
        categoryId: 'cat-ai',
        price: 250000,
        discountPrice: null,
        resellerPrice: calculateResellerPrice(250000),
        resellerPriceEnabled: true,
        stock: 25,
        soldCount: 84,
        rating: 4.9,
        reviewCount: 41,
        badge: 'Best Seller',
        imageUrl: CAT_AI_CLEAN_IMAGE,
        galleryUrls: [CAT_AI_CLEAN_IMAGE, HERO_CLEAN_IMAGE],
        featured: true,
        active: true,
        requiresShipping: false,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'prod-netflix-4k',
        name: 'Netflix Premium 4K Ultra HD',
        slug: 'netflix-premium-4k-uhd',
        description:
          'Nikmati ribuan film, serial original, dan dokumenter dalam kualitas 4K HDR + Dolby Atmos tanpa iklan. Profil khusus lengkap dengan PIN pengaman sehingga riwayat tontonan Anda tidak tercampur.',
        additionalInfo: 'Support Smart TV, Laptop, iOS, & Android · Bebas VPN.',
        subscriptionDuration: '1 Bulan',
        benefits: [
          'Resolusi Ultra HD 4K + HDR jernih di semua perangkat resmi',
          '1 Profil Private lengkap dengan kunci PIN 4 digit',
          'Fitur unduh offline di aplikasi mobile dan tablet',
          'Garansi anti-hold & dukungan penggantian cepat via WhatsApp',
        ],
        activationGuide:
          '1. Pilih durasi langganan (1 Bulan / 3 Bulan / 1 Tahun).\n2. Setelah QRIS terverifikasi, admin mengirim detail login + profil & PIN Anda.\n3. Masuk ke aplikasi Netflix dan pilih profil sesuai instruksi.',
        availabilityStatus: 'available',
        categoryId: 'cat-streaming',
        price: 50000,
        discountPrice: null,
        resellerPrice: calculateResellerPrice(50000),
        resellerPriceEnabled: true,
        stock: 40,
        soldCount: 129,
        rating: 4.9,
        reviewCount: 62,
        badge: 'Best Seller',
        imageUrl: CAT_STREAMING_CLEAN_IMAGE,
        galleryUrls: [CAT_STREAMING_CLEAN_IMAGE],
        featured: true,
        active: true,
        requiresShipping: false,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'prod-canva-pro',
        name: 'Canva Pro Education / Team Invite',
        slug: 'canva-pro-invite',
        description:
          'Aktivasi Canva Pro langsung ke akun email pribadi Anda. Buka akses ratusan ribu template premium, Background Remover sekali klik, Magic Resize, Brand Kit, dan aset stok berlisensi.',
        additionalInfo: 'Legal via Invite Email Pribadi · Desain tersimpan permanen di akun Anda.',
        subscriptionDuration: '1 Tahun',
        benefits: [
          'Aktivasi langsung di email Canva pribadi Anda tanpa ganti akun',
          'Akses penuh Background Remover, Magic Studio AI, & Brand Kit',
          'Ekspor PNG transparan, SVG vektor, dan video resolusi tinggi',
          'Berlaku di web browser, Windows, Mac, Android, dan iOS',
        ],
        activationGuide:
          '1. Masukkan email akun Canva Anda pada kolom Email / Catatan saat checkout.\n2. Setelah pembayaran diverifikasi, klik tautan undangan tim resmi dari admin.\n3. Status Canva Anda otomatis berubah menjadi Pro.',
        availabilityStatus: 'available',
        categoryId: 'cat-creative',
        price: 100000,
        discountPrice: 90000,
        resellerPrice: calculateResellerPrice(100000),
        resellerPriceEnabled: true,
        stock: 50,
        soldCount: 95,
        rating: 5.0,
        reviewCount: 47,
        badge: 'Promo',
        imageUrl: CAT_CREATIVE_CLEAN_IMAGE,
        galleryUrls: [CAT_CREATIVE_CLEAN_IMAGE],
        featured: true,
        active: true,
        requiresShipping: false,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'prod-youtube-premium',
        name: 'YouTube Premium + YT Music (Via Invite)',
        slug: 'youtube-premium-yt-music',
        description:
          'Streaming video dan musik bebas iklan di seluruh perangkat, mendukung pemutaran latar belakang (background play) dan unduhan offline dengan akun Google Anda sendiri.',
        additionalInfo: 'Aktivasi via Google Family Invite · Tanpa minta password Gmail.',
        subscriptionDuration: '1 Bulan',
        benefits: [
          '100% bebas iklan di TV, HP, tablet, dan browser',
          'Termasuk akses penuh YouTube Music Premium',
          'Background play & Picture-in-Picture saat layar terkunci',
          'Aman menggunakan email pribadi tanpa membagikan kata sandi',
        ],
        activationGuide:
          '1. Cantumkan alamat Gmail aktif Anda di formulir checkout.\n2. Terima undangan Google Family yang dikirim ke email setelah pembayaran diverifikasi.\n3. Nikmati YouTube & YouTube Music bebas iklan seketika.',
        availabilityStatus: 'available',
        categoryId: 'cat-streaming',
        price: 40000,
        discountPrice: null,
        resellerPrice: calculateResellerPrice(40000),
        resellerPriceEnabled: true,
        stock: 32,
        soldCount: 73,
        rating: 4.8,
        reviewCount: 29,
        badge: 'New',
        imageUrl: CAT_STREAMING_CLEAN_IMAGE,
        galleryUrls: [CAT_STREAMING_CLEAN_IMAGE],
        featured: true,
        active: true,
        requiresShipping: false,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'prod-capcut-pro',
        name: 'CapCut Pro Creator Suite',
        slug: 'capcut-pro-creator-suite',
        description:
          'Edit video pendek dan konten sinematik tanpa watermark dengan akses penuh efek AI Pro, auto-caption akurat Bahasa Indonesia, transisi eksklusif, dan cloud backup.',
        additionalInfo: 'Support PC/Mac Desktop & Mobile · Kuota terbatas harian.',
        subscriptionDuration: '1 Bulan',
        benefits: [
          'Ekspor 4K 60fps tanpa watermark atau batasan efek',
          'Auto-caption AI, hapus latar belakang video, dan color grading Pro',
          'Sinkronisasi proyek lintas HP dan Laptop/PC',
        ],
        activationGuide:
          '1. Selesaikan checkout dan verifikasi pembayaran QRIS.\n2. Admin mengirimkan kredensial akses CapCut Pro melalui WhatsApp.\n3. Login di aplikasi CapCut Desktop/Mobile dan mulai berkarya.',
        availabilityStatus: 'limited',
        categoryId: 'cat-creative',
        price: 75000,
        discountPrice: 69000,
        resellerPrice: calculateResellerPrice(75000),
        resellerPriceEnabled: true,
        stock: 8,
        soldCount: 41,
        rating: 4.9,
        reviewCount: 19,
        badge: 'Promo',
        imageUrl: CAT_CREATIVE_CLEAN_IMAGE,
        galleryUrls: [CAT_CREATIVE_CLEAN_IMAGE],
        featured: false,
        active: true,
        requiresShipping: false,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'prod-nordvpn-pro',
        name: 'NordVPN & Developer Security Pack',
        slug: 'nordvpn-developer-security-pack',
        description:
          'Perlindungan koneksi terenkripsi 60+ negara dengan kecepatan tinggi, Threat Protection anti-iklan/malware, serta kompatibilitas multi-perangkat Windows, macOS, Linux, dan Mobile.',
        additionalInfo: 'Lisensi resmi multi-device · Dukungan setup hingga aktif.',
        subscriptionDuration: '1 Tahun',
        benefits: [
          'Server ultra-cepat di lebih dari 60 negara dengan WireGuard (NordLynx)',
          'Perlindungan Threat Protection & DNS terenkripsi',
          'Mendukung Windows, macOS, Linux, Android, dan iOS',
        ],
        activationGuide:
          '1. Lakukan checkout untuk paket 1 Bulan atau 1 Tahun.\n2. Terima kredensial aktivasi dari admin setelah verifikasi pembayaran.\n3. Login di aplikasi resmi NordVPN dan pilih server tujuan.',
        availabilityStatus: 'available',
        categoryId: 'cat-security',
        price: 150000,
        discountPrice: null,
        resellerPrice: calculateResellerPrice(150000),
        resellerPriceEnabled: true,
        stock: 18,
        soldCount: 27,
        rating: 4.8,
        reviewCount: 14,
        badge: 'New',
        imageUrl: CAT_SECURITY_CLEAN_IMAGE,
        galleryUrls: [CAT_SECURITY_CLEAN_IMAGE],
        featured: false,
        active: true,
        requiresShipping: false,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    product_variants: [
      {
        id: 'var-gpt-1m',
        productId: 'prod-chatgpt-plus',
        name: '1 Bulan Private',
        priceDelta: 0,
        stock: 15,
        active: true,
      },
      {
        id: 'var-gpt-3m',
        productId: 'prod-chatgpt-plus',
        name: '3 Bulan Hemat',
        priceDelta: 430000,
        stock: 10,
        active: true,
      },
      {
        id: 'var-nf-1m',
        productId: 'prod-netflix-4k',
        name: '1 Bulan Private Profile',
        priceDelta: 0,
        stock: 25,
        active: true,
      },
      {
        id: 'var-nf-3m',
        productId: 'prod-netflix-4k',
        name: '3 Bulan Private Profile',
        priceDelta: 75000,
        stock: 15,
        active: true,
      },
      {
        id: 'var-canva-1y',
        productId: 'prod-canva-pro',
        name: '1 Tahun Invite Email',
        priceDelta: 0,
        stock: 35,
        active: true,
      },
      {
        id: 'var-canva-life',
        productId: 'prod-canva-pro',
        name: 'Paket Tim Prioritas + Brand Kit',
        priceDelta: 50000,
        stock: 15,
        active: true,
      },
      {
        id: 'var-yt-1m',
        productId: 'prod-youtube-premium',
        name: '1 Bulan Invite',
        priceDelta: 0,
        stock: 20,
        active: true,
      },
      {
        id: 'var-yt-3m',
        productId: 'prod-youtube-premium',
        name: '3 Bulan Invite',
        priceDelta: 60000,
        stock: 12,
        active: true,
      },
    ],
    banners: [
      {
        id: 'banner-promo-1',
        headline: 'Upgrade Produktivitas & Hiburan Digital Anda',
        description:
          'Gunakan kode voucher CATRIZZZ20 saat checkout untuk menikmati potongan 20% hingga Rp25.000 dengan minimum pembelian Rp50.000. Pengiriman akses instan via WhatsApp & Email.',
        imageUrl: HERO_CLEAN_IMAGE,
        ctaLabel: 'Lihat Katalog Aplikasi',
        ctaLink: '/produk',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2027-12-31T23:59:59.000Z',
        active: true,
        isDemo: true,
        updatedAt: now,
      },
    ],
    discount_codes: [
      {
        id: 'disc-catrizzz20',
        promoName: 'Promo Pelanggan Catrizzz 20%',
        code: 'CATRIZZZ20',
        description: 'Potongan 20% maksimal Rp25.000 untuk minimal belanja Rp50.000.',
        type: 'percentage',
        value: 20,
        minPurchase: 50000,
        maxDiscount: 25000,
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2027-12-31T23:59:59.000Z',
        maxTotalUsage: 100,
        maxPerCustomer: 3,
        usedCount: 0,
        applicableProductIds: [],
        applicableCategoryIds: [],
        active: true,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'disc-hemat10000',
        promoName: 'Hemat Langsung Rp10.000',
        code: 'HEMAT10000',
        description: 'Potongan langsung Rp10.000 untuk minimal belanja Rp75.000.',
        type: 'fixed',
        value: 10000,
        minPurchase: 75000,
        maxDiscount: null,
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2027-12-31T23:59:59.000Z',
        maxTotalUsage: 200,
        maxPerCustomer: 5,
        usedCount: 0,
        applicableProductIds: [],
        applicableCategoryIds: [],
        active: true,
        isDemo: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
    discount_usages: [],
    shipping_settings: [
      {
        id: 'ship-digital-wa',
        name: 'Pengiriman Digital via WhatsApp (Instan)',
        description: 'Detail akun, lisensi, atau tautan aktivasi dikirim langsung ke WhatsApp Anda.',
        type: 'digital',
        cost: 0,
        requiresAddress: false,
        active: true,
      },
      {
        id: 'ship-digital-email',
        name: 'Aktivasi / Invite via Email & WhatsApp',
        description: 'Khusus layanan invite email pribadi (Canva, YouTube, dll.) + konfirmasi WhatsApp.',
        type: 'digital',
        cost: 0,
        requiresAddress: false,
        active: true,
      },
    ],
    orders: [],
    order_items: [],
    payments: [],
    payment_confirmations: [],
    customers: [],
    inventory_logs: [],
    audit_logs: [],
    admin_roles: [
      {
        uid: 'bootstrap-owner',
        email: 'risqicatur82@gmail.com',
        role: 'super_admin',
        active: true,
        createdAt: now,
      },
    ],
    admin_accounts: [createInitialAdminAccount(now)],
    users: [],
    reseller_applications: [],
    reseller_profiles: [],
    reseller_wallets: [],
    wallet_transactions: [],
    reseller_topups: [],
    qris_history: qrisAvailable
      ? [
          {
            id: 'qris-hist-initial',
            action: 'uploaded',
            newImageUrl: OFFICIAL_QRIS_PATH,
            merchantName: 'Catrizz_Store',
            nmid: 'ID1024365593051',
            changedBy: 'system',
            note: 'QRIS resmi awal toko aktif.',
            createdAt: now,
          },
        ]
      : [],
    order_sequence: 0,
    reseller_app_sequence: 0,
    topup_sequence: 0,
    wallet_tx_sequence: 0,
  };
}
