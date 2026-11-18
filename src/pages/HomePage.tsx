import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronDown,
  MessageCircle,
  Package,
  QrCode,
  Receipt,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Zap,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/ProductCard';
import { SafeImage } from '../components/SafeImage';
import { NavyButton, spawnNavyRipple } from '../components/Interactive';

const ADVANTAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ShoppingBag,
  QrCode,
  ShieldCheck,
  Receipt,
  MessageCircle,
  Package,
  Zap,
};

export function HomePage() {
  const {
    storefront,
    loadingStorefront,
    storefrontError,
    refreshStorefront,
    isResellerActive,
  } = useStore();
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  useEffect(() => {
    const s = storefront?.storeSettings;
    if (s) {
      document.title = s.seoTitle || `${s.storeName} — ${s.tagline || 'Platform Aplikasi Premium'}`;
    } else {
      document.title = 'Catrizzz Store — Platform Aplikasi Premium & Produk Digital Terpercaya';
    }
  }, [storefront?.storeSettings]);

  if (loadingStorefront && !storefront) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-12">
        <div className="h-[400px] rounded-2xl bg-[#F8FAFC] animate-pulse border border-[#E5EAF0]" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  if (storefrontError && !storefront) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-[#102A43]">Koneksi Bermasalah</h1>
        <p className="text-sm text-[#718096]">{storefrontError}</p>
        <NavyButton
          type="button"
          onClick={() => refreshStorefront()}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
        >
          Coba Lagi
        </NavyButton>
      </main>
    );
  }

  const content = storefront?.siteContent;
  const sections = content?.homepageSections;
  const isHomepageInactive = content?.homepageStatus === 'inactive' && !storefront?.previewMode;

  if (isHomepageInactive) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-24 text-center space-y-5 bg-white">
        <h1 className="font-display text-3xl font-bold text-[#102A43]">
          Halaman Utama Sedang Diperbarui
        </h1>
        <p className="text-sm text-[#718096] leading-relaxed">
          Katalog aplikasi premium, kategori, dan layanan verifikasi resi tetap tersedia untuk Anda akses langsung.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link to="/produk" className="btn-navy-primary px-5 py-2.5 rounded-xl text-sm font-semibold">
            Lihat Semua Produk
          </Link>
          <Link to="/cek-resi" className="btn-navy-outline px-5 py-2.5 rounded-xl text-sm font-semibold">
            Cek Resi Transaksi
          </Link>
        </div>
      </main>
    );
  }

  const categories = storefront?.categories || [];
  const featuredProducts = storefront?.featuredProducts || [];
  const banners = storefront?.banners || [];
  const activeBanner = banners[0];
  const extraBanners = banners.slice(1);
  const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]));

  const maxCatItems = sections?.categoriesSection?.maxItems || 8;
  const visibleCategories = categories.slice(0, maxCatItems);

  const renderPrimaryCta = (href: string, label: string) => {
    if (/^https?:\/\//i.test(href)) {
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          data-spotlight="true"
          data-magnetic="true"
          onPointerDown={(e) => spawnNavyRipple(e, 'light')}
          className="btn-navy-primary inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold whitespace-nowrap"
        >
          <span>{label}</span>
          <ArrowRight className="w-4 h-4" />
        </a>
      );
    }
    return (
      <Link
        to={href}
        data-spotlight="true"
        data-magnetic="true"
        onPointerDown={(e) => spawnNavyRipple(e, 'light')}
        className="btn-navy-primary inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold whitespace-nowrap"
      >
        <span>{label}</span>
        <ArrowRight className="w-4 h-4" />
      </Link>
    );
  };

  const orderedMiddleSections = [
    {
      key: 'categories',
      enabled: sections?.categoriesSection?.enabled !== false && visibleCategories.length > 0,
      sortOrder: sections?.categoriesSection?.sortOrder ?? 1,
    },
    {
      key: 'featured',
      enabled: sections?.featuredSection?.enabled !== false,
      sortOrder: sections?.featuredSection?.sortOrder ?? 2,
    },
    {
      key: 'banners',
      enabled: sections?.bannersSection?.enabled !== false,
      sortOrder: sections?.bannersSection?.sortOrder ?? 3,
    },
    {
      key: 'advantages',
      enabled: sections?.advantagesSection?.enabled !== false,
      sortOrder: sections?.advantagesSection?.sortOrder ?? 4,
    },
  ].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <main className="pb-12 bg-white">
      {/* HERO SECTION */}
      {sections?.hero?.enabled !== false && (
        <section
          className={`border-b border-[#E5EAF0] ${
            sections?.hero?.backgroundStyle === 'soft_navy' ? 'bg-[#F8FAFC]' : 'section-layer-white'
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <div className="space-y-3">
                <p className="text-xs sm:text-sm font-semibold text-[#244B75] tracking-wide uppercase">
                  {content?.heroSubheadline || 'Catrizzz Store · Akses Instan, Legal & Bergaransi Penuh'}
                </p>
                <h1 className="font-display text-3xl sm:text-5xl font-bold text-[#102A43] tracking-tight leading-[1.1] text-balance">
                  {content?.heroHeadline || 'APLIKASI PREMIUM & PRODUK DIGITAL TERPERCAYA'}
                </h1>
                <p className="text-sm sm:text-base text-[#253449] leading-relaxed max-w-xl">
                  {content?.heroDescription ||
                    'Platform jual beli aplikasi premium, layanan berlangganan AI, hiburan streaming, desain kreatif, dan lisensi digital dengan pembayaran QRIS resmi serta resi transaksi terenkripsi.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {renderPrimaryCta(
                  sections?.hero?.primaryCtaLink || '/produk',
                  content?.heroPrimaryCtaLabel || 'Jelajahi Aplikasi'
                )}
                {sections?.hero?.secondaryCtaLink?.startsWith('#') ||
                !sections?.hero?.secondaryCtaLink ? (
                  <a
                    href={sections?.hero?.secondaryCtaLink || '#produk-unggulan'}
                    onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
                    className="btn-navy-outline inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold whitespace-nowrap"
                  >
                    {content?.heroSecondaryCtaLabel || 'Lihat Produk Unggulan'}
                  </a>
                ) : (
                  <Link
                    to={sections.hero.secondaryCtaLink}
                    onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
                    className="btn-navy-outline inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold whitespace-nowrap"
                  >
                    {content?.heroSecondaryCtaLabel || 'Lihat Produk Unggulan'}
                  </Link>
                )}
                <Link
                  to={isResellerActive ? '/reseller/dashboard' : '/join-reseller'}
                  onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
                  className="ripple-host inline-flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold text-[#244B75] hover:bg-[#EAF2FA] transition-colors whitespace-nowrap"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{isResellerActive ? 'Dashboard Reseller' : 'Gabung Reseller -20%'}</span>
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div
                data-spotlight="true"
                className="surface-card spotlight-surface h-full min-h-[260px] lg:min-h-[380px] rounded-2xl overflow-hidden bg-[#F8FAFC] shadow-[0_22px_50px_-18px_rgba(16,42,67,0.18)]"
              >
                <SafeImage
                  src={content?.heroImageUrl}
                  alt={content?.heroHeadline || 'Catrizzz Store Showcase'}
                  eager
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </section>
      )}

      {orderedMiddleSections.map((sec) => {
        if (!sec.enabled) return null;

        if (sec.key === 'categories') {
          return (
            <section key="categories" id="kategori" className="section-layer-subtle py-16">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-6">
                <div className="flex items-end justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#102A43]">
                      {sections?.categoriesSection?.title || 'Kategori Produk'}
                    </h2>
                    <p className="text-sm text-[#718096]">
                      {sections?.categoriesSection?.subtitle ||
                        'Temukan aplikasi premium dan layanan berlangganan pilihan sesuai kebutuhan Anda.'}
                    </p>
                  </div>
                  <Link
                    to="/produk"
                    className="text-sm font-semibold text-[#102A43] hover:text-[#244B75] inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <span>Semua Katalog</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {visibleCategories.map((cat) => (
                    <Link
                      key={cat.id}
                      to={`/produk?categoryId=${encodeURIComponent(cat.id)}`}
                      data-spotlight="true"
                      onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
                      className="group product-card-interactive rounded-xl flex flex-col"
                    >
                      <div className="aspect-[16/10] bg-[#F8FAFC] overflow-hidden border-b border-[#E5EAF0]">
                        <SafeImage
                          src={cat.imageUrl}
                          alt={cat.name}
                          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                        />
                      </div>
                      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-base font-semibold text-[#102A43] group-hover:text-[#244B75] transition-colors">
                              {cat.name}
                            </h3>
                            <span className="text-xs font-mono-num text-[#718096]">
                              {cat.productCount || 0} produk
                            </span>
                          </div>
                          <p className="text-xs text-[#718096] line-clamp-2">{cat.description}</p>
                        </div>
                        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#244B75] group-hover:text-[#102A43]">
                          Lihat Produk
                          <ArrowRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          );
        }

        if (sec.key === 'featured') {
          return (
            <section
              key="featured"
              id="produk-unggulan"
              className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 space-y-6"
            >
              <div className="flex items-end justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#102A43]">
                    {sections?.featuredSection?.title || 'Produk Unggulan'}
                  </h2>
                  <p className="text-sm text-[#718096]">
                    {sections?.featuredSection?.subtitle ||
                      'Produk digital terfavorit Catrizzz Store dengan stok terjamin dan harga transparan.'}
                  </p>
                </div>
                <Link
                  to="/produk"
                  className="text-sm font-semibold text-[#102A43] hover:text-[#244B75] inline-flex items-center gap-1 whitespace-nowrap"
                >
                  <span>Lihat Semua</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>

              {featuredProducts.length === 0 ? (
                <div className="surface-card rounded-2xl p-10 text-center space-y-3">
                  <p className="text-sm text-[#718096]">
                    Belum ada produk unggulan yang aktif saat ini.
                  </p>
                  <Link
                    to="/produk"
                    className="btn-navy-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold"
                  >
                    Buka Katalog Lengkap
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {featuredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      categoryName={categoryNameMap.get(product.categoryId)}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        }

        if (sec.key === 'banners') {
          return (
            <section key="banners" className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 space-y-6">
              <div
                data-spotlight="true"
                className="surface-card spotlight-surface rounded-2xl bg-[#F8FAFC] overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch"
              >
                <div className="lg:col-span-7 p-8 sm:p-10 flex flex-col justify-center space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#244B75]">
                    {sections?.bannersSection?.title || 'Program Kemitraan Reseller Resmi'}
                  </p>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#102A43] text-balance">
                    {activeBanner?.headline ||
                      'Dapatkan Diskon Reseller 20% Permanen untuk Semua Produk'}
                  </h2>
                  <p className="text-sm sm:text-base text-[#253449] leading-relaxed">
                    {activeBanner?.subheadline || activeBanner?.description ? (
                      activeBanner.subheadline || activeBanner.description
                    ) : (
                      <>
                        Daftar reseller secara{' '}
                        <strong className="text-[#102A43]">GRATIS (Rp0)</strong> tanpa biaya
                        registrasi maupun keanggotaan, dapatkan kode referral pribadi setelah
                        disetujui admin, dan nikmati harga khusus reseller otomatis 20% lebih hemat
                        untuk setiap pembelian.
                      </>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Link
                      to={
                        activeBanner?.ctaLink ||
                        (isResellerActive ? '/reseller/dashboard' : '/join-reseller')
                      }
                      data-magnetic="true"
                      onPointerDown={(e) => spawnNavyRipple(e, 'light')}
                      className="btn-navy-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                    >
                      <span>
                        {activeBanner?.ctaLabel ||
                          (isResellerActive ? 'Buka Dashboard Reseller' : 'Daftar Reseller Sekarang')}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link
                      to="/produk"
                      onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
                      className="btn-navy-outline inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                    >
                      Lihat Katalog
                    </Link>
                  </div>
                </div>
                <div className="lg:col-span-5 min-h-[220px] bg-white border-t lg:border-t-0 lg:border-l border-[#E5EAF0]">
                  <SafeImage
                    src={activeBanner?.imageUrl || content?.heroImageUrl}
                    alt={activeBanner?.headline || 'Program Reseller Catrizzz Store'}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              {extraBanners.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {extraBanners.map((b) => (
                    <div
                      key={b.id}
                      className="surface-card rounded-2xl overflow-hidden grid grid-cols-1 sm:grid-cols-12 items-stretch"
                    >
                      <div className="sm:col-span-7 p-6 flex flex-col justify-between gap-3">
                        <div className="space-y-1.5">
                          <h3 className="font-display text-lg font-bold text-[#102A43]">
                            {b.headline}
                          </h3>
                          {b.subheadline && (
                            <p className="text-xs text-[#718096] leading-relaxed">{b.subheadline}</p>
                          )}
                        </div>
                        <Link
                          to={b.ctaLink || '/produk'}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#244B75] hover:text-[#102A43]"
                        >
                          <span>{b.ctaLabel || 'Lihat Penawaran'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                      <div className="sm:col-span-5 min-h-[140px] bg-[#F8FAFC] border-t sm:border-t-0 sm:border-l border-[#E5EAF0]">
                        <SafeImage
                          src={b.imageUrl}
                          alt={b.headline}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        }

        return (
          <section
            key="advantages"
            id="tentang-kami"
            className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 space-y-12"
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              <div className="lg:col-span-5 space-y-4">
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#102A43]">
                  {sections?.advantagesSection?.title ||
                    content?.aboutTitle ||
                    'Mengapa Memilih Catrizzz Store?'}
                </h2>
                <p className="text-sm sm:text-base text-[#253449] leading-relaxed">
                  {sections?.advantagesSection?.subtitle ||
                    content?.aboutDescription ||
                    'Catrizzz Store menyediakan langganan aplikasi premium, tools produktivitas AI, desain kreatif, dan hiburan digital dengan harga transparan, pembayaran QRIS resmi, dan dukungan garansi penuh.'}
                </p>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(content?.advantages || []).map((adv) => {
                  const IconComp = ADVANTAGE_ICONS[adv.iconName] || ShieldCheck;
                  return (
                    <div
                      key={adv.id}
                      data-spotlight="true"
                      className="surface-card spotlight-surface rounded-xl p-5 space-y-2.5"
                    >
                      <div className="w-9 h-9 rounded-lg bg-[#EAF2FA] text-[#102A43] flex items-center justify-center">
                        <IconComp className="w-4 h-4" />
                      </div>
                      <h3 className="text-sm font-semibold text-[#102A43]">{adv.title}</h3>
                      <p className="text-xs text-[#718096] leading-relaxed">{adv.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {(content?.faqs || []).length > 0 && (
              <div className="surface-card rounded-2xl p-6 sm:p-8 space-y-4">
                <h2 className="font-display text-xl font-bold text-[#102A43]">
                  Pertanyaan yang Sering Diajukan
                </h2>
                <div className="divide-y divide-[#E5EAF0]">
                  {content!.faqs.map((faq) => {
                    const isOpen = openFaqId === faq.id;
                    return (
                      <div key={faq.id} className="py-3.5">
                        <button
                          type="button"
                          onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                          aria-expanded={isOpen}
                          className="w-full flex items-center justify-between gap-4 text-left text-sm font-semibold text-[#102A43] hover:text-[#244B75] cursor-pointer"
                        >
                          <span>{faq.question}</span>
                          <ChevronDown
                            className={`w-4 h-4 text-[#718096] transition-transform ${
                              isOpen ? 'rotate-180' : ''
                            }`}
                          />
                        </button>
                        {isOpen && (
                          <p className="mt-2.5 text-sm text-[#253449] leading-relaxed">
                            {faq.answer}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
