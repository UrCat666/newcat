import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  KeyRound,
  Minus,
  Plus,
  ShoppingCart,
  Sparkles,
  Star,
  X,
  Zap,
  ZoomIn,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  formatIDR,
  resolveProductEffectiveNormalPrice,
  resolveProductResellerUnitPrice,
} from '../shared/pricing';
import type { Category, Product } from '../shared/types';
import { SafeImage } from '../components/SafeImage';
import { ProductCard } from '../components/ProductCard';
import { NavyButton, spawnNavyRipple } from '../components/Interactive';

export function ProductDetailPage() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { addToCart, setCartOpen, storefront, isResellerActive, subscribeRealtime } = useStore();

  const originRect = (location.state as { originRect?: { top: number; left: number; width: number; height: number } } | null)
    ?.originRect;

  const [product, setProduct] = useState<Product | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeImage, setActiveImage] = useState('');
  const [zoomOpen, setZoomOpen] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(undefined);
  const [quantity, setQuantity] = useState(1);

  const loadProduct = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(slug || '')}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          throw new Error('Produk tidak ditemukan atau sudah tidak tersedia.');
        }
        const data = await res.json();
        const p: Product = data.product;
        setProduct(p);
        setCategory(data.category || null);
        setRelated(data.related || []);
        setActiveImage((prev) => (silent && prev ? prev : p.imageUrl));
        const activeVars = (p.variants || []).filter((v) => v.active);
        const defaultVar = activeVars.find((v) => v.stock > 0) || activeVars[0];
        setSelectedVariantId((prev) => {
          if (silent && prev && activeVars.some((v) => v.id === prev)) {
            return prev;
          }
          return defaultVar?.id;
        });
        if (!silent) {
          setQuantity(1);
        }
        document.title = `${p.name} — Catrizzz Store`;
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Produk tidak ditemukan.');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [slug]
  );

  useEffect(() => {
    loadProduct(false);
  }, [loadProduct]);

  useEffect(() => {
    return subscribeRealtime(['storefront', 'products', 'categories'], () => {
      loadProduct(true);
    });
  }, [subscribeRealtime, loadProduct]);

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-6 aspect-[4/3] rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
          <div className="lg:col-span-6 space-y-4">
            <div className="h-8 w-3/4 bg-[#F8FAFC] rounded animate-pulse" />
            <div className="h-6 w-1/3 bg-[#F8FAFC] rounded animate-pulse" />
            <div className="h-32 bg-[#F8FAFC] rounded animate-pulse" />
          </div>
        </div>
      </main>
    );
  }

  if (error || !product) {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center space-y-4">
        <h1 className="text-2xl font-bold text-[#102A43]">Produk Tidak Ditemukan</h1>
        <p className="text-sm text-[#718096]">{error}</p>
        <Link
          to="/produk"
          className="btn-navy-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Katalog
        </Link>
      </main>
    );
  }

  const gallery = Array.from(new Set([product.imageUrl, ...(product.galleryUrls || [])])).filter(Boolean);
  const activeVariants = (product.variants || []).filter((v) => v.active);
  const selectedVariant = activeVariants.find((v) => v.id === selectedVariantId);
  const priceDelta = selectedVariant?.priceDelta || 0;
  const originalPrice = Math.max(0, product.price + priceDelta);
  const hasDiscount =
    typeof product.discountPrice === 'number' &&
    product.discountPrice >= 0 &&
    product.discountPrice < product.price;
  const normalEffectivePrice = resolveProductEffectiveNormalPrice(product, priceDelta);
  const resellerEnabled = product.resellerPriceEnabled !== false;
  const resellerPrice = resolveProductResellerUnitPrice(product, priceDelta);
  const displayPrice = isResellerActive ? resellerPrice : normalEffectivePrice;

  const maxStock = selectedVariant
    ? Math.min(product.stock, selectedVariant.stock)
    : product.stock;
  const isOutOfStock = maxStock <= 0 || product.availabilityStatus === 'out_of_stock';
  const availabilityLabel = isOutOfStock
    ? 'Stok Habis'
    : product.availabilityStatus === 'limited' || maxStock <= 5
      ? `Kuota Terbatas (${maxStock} tersisa)`
      : `Tersedia (${maxStock} kuota)`;
  const availabilityColor = isOutOfStock
    ? 'text-rose-600'
    : product.availabilityStatus === 'limited' || maxStock <= 5
      ? 'text-amber-600'
      : 'text-emerald-700';
  const reviewsEnabled = storefront?.storeSettings?.reviewsEnabled !== false;

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    const ok = addToCart(product, quantity, selectedVariant?.id);
    if (ok) setCartOpen(true);
  };

  const handleBuyNow = () => {
    if (isOutOfStock) return;
    const ok = addToCart(product, quantity, selectedVariant?.id);
    if (ok) navigate('/checkout');
  };

  return (
    <motion.main
      initial={originRect ? { opacity: 0, scale: 0.96, y: 10 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-16 bg-white"
    >
      <div>
        <Link
          to="/produk"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#718096] hover:text-[#102A43] transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Kembali ke Semua Produk
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left Gallery */}
          <div className="lg:col-span-6 space-y-4">
            <div data-spotlight="true" className="relative aspect-[4/3] rounded-2xl overflow-hidden surface-card spotlight-surface group">
              <SafeImage
                src={activeImage || product.imageUrl}
                alt={product.name}
                eager
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
                aria-label="Perbesar gambar produk"
                className="ripple-host absolute bottom-3 right-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/95 border border-[#E5EAF0] text-xs font-semibold text-[#102A43] hover:bg-[#EAF2FA] shadow-sm transition-colors cursor-pointer"
              >
                <ZoomIn className="w-4 h-4" />
                Perbesar
              </button>
            </div>

            {gallery.length > 1 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {gallery.map((imgUrl, idx) => (
                  <button
                    key={imgUrl}
                    type="button"
                    onClick={() => setActiveImage(imgUrl)}
                    aria-label={`Lihat foto ${idx + 1}`}
                    className={`w-20 h-16 rounded-xl overflow-hidden border transition-all shrink-0 cursor-pointer ${
                      activeImage === imgUrl
                        ? 'border-[#102A43] ring-2 ring-[#244B75]/20'
                        : 'border-[#E5EAF0] opacity-75 hover:opacity-100'
                    }`}
                  >
                    <SafeImage
                      src={imgUrl}
                      alt={`${product.name} foto ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Contiguous Purchase Module */}
          <div className="lg:col-span-6 surface-card rounded-2xl p-6 sm:p-8 space-y-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#718096]">
                <span className="font-semibold text-[#244B75]">
                  {category?.name || 'Produk Digital'}
                </span>
                {product.subscriptionDuration && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-[#253449] font-medium">
                      <Clock className="w-3.5 h-3.5 text-[#244B75]" />
                      {product.subscriptionDuration}
                    </span>
                  </>
                )}
                {product.badge && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#102A43] font-semibold">{product.badge}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className={`font-medium ${availabilityColor}`}>{availabilityLabel}</span>
              </div>

              <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#102A43] text-balance">
                {product.name}
              </h1>

              {reviewsEnabled && product.reviewCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-[#718096]">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span className="font-mono-num font-semibold text-[#102A43]">
                    {product.rating.toFixed(1)}
                  </span>
                  <span>({product.reviewCount} ulasan · {product.soldCount} terjual)</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-bold font-mono-num text-[#102A43]">
                  {formatIDR(displayPrice)}
                </span>
                {displayPrice < originalPrice && (
                  <span className="text-base font-mono-num text-[#718096] line-through">
                    {formatIDR(originalPrice)}
                  </span>
                )}
              </div>
              {resellerEnabled ? (
                isResellerActive ? (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#244B75]">
                    <Sparkles className="w-3.5 h-3.5" />
                    Harga Khusus Reseller Aktif
                  </div>
                ) : (
                  <p className="text-xs text-[#718096]">
                    Harga Mitra Reseller:{' '}
                    <span className="font-mono-num font-semibold text-[#102A43]">
                      {formatIDR(resellerPrice)}
                    </span>
                    .{' '}
                    <Link to="/join-reseller" className="text-[#244B75] underline underline-offset-2 font-medium">
                      Daftar Reseller
                    </Link>
                  </p>
                )
              ) : (
                <p className="text-xs text-[#718096]">
                  Harga standar berlaku untuk produk digital ini.
                </p>
              )}
            </div>

            <p className="text-sm text-[#253449] leading-relaxed whitespace-pre-line">
              {product.description}
            </p>

            {product.benefits && product.benefits.length > 0 && (
              <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] space-y-2">
                <p className="text-xs font-semibold text-[#102A43]">Fitur &amp; Keunggulan</p>
                <ul className="space-y-1.5">
                  {product.benefits.map((benefit, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-xs text-[#253449]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {product.activationGuide && (
              <div className="p-3.5 rounded-xl bg-[#EAF2FA]/60 border border-[#244B75]/15 text-xs text-[#253449] flex items-start gap-2.5">
                <KeyRound className="w-4 h-4 text-[#102A43] shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-[#102A43] block mb-0.5">Panduan Aktivasi</span>
                  <span className="whitespace-pre-line">{product.activationGuide}</span>
                </div>
              </div>
            )}

            {product.additionalInfo && (
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] text-xs text-[#253449] flex items-start gap-2.5">
                <Zap className="w-4 h-4 text-[#244B75] shrink-0 mt-0.5" />
                <span>{product.additionalInfo}</span>
              </div>
            )}

            {/* Variants / Paket & Durasi */}
            {activeVariants.length > 0 && (
              <div className="space-y-2.5">
                <span className="text-xs font-semibold text-[#102A43] block">
                  Pilih Paket / Durasi
                </span>
                <div className="flex flex-wrap gap-2">
                  {activeVariants.map((v) => {
                    const selected = v.id === selectedVariantId;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        disabled={v.stock <= 0}
                        onClick={() => {
                          setSelectedVariantId(v.id);
                          setQuantity(1);
                        }}
                        onPointerDown={(e) => spawnNavyRipple(e, selected ? 'light' : 'navy')}
                        className={`ripple-host inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          selected
                            ? 'bg-[#102A43] border-[#102A43] text-white shadow-sm'
                            : 'bg-white border-[#E5EAF0] text-[#253449] hover:bg-[#EAF2FA] hover:border-[#244B75]/30'
                        } disabled:opacity-40`}
                      >
                        {selected && <Check className="w-3.5 h-3.5" />}
                        <span>{v.name}</span>
                        {v.priceDelta !== 0 && (
                          <span className={`font-mono-num ${selected ? 'text-[#EAF2FA]' : 'text-[#244B75]'}`}>
                            ({v.priceDelta > 0 ? '+' : ''}{formatIDR(v.priceDelta)})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity & Action Buttons */}
            <div className="space-y-4 pt-3 border-t border-[#E5EAF0]">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-[#253449]">Jumlah Pembelian</span>
                <div className="inline-flex items-center border border-[#E5EAF0] rounded-xl bg-white">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    aria-label="Kurangi jumlah"
                    className="w-10 h-10 flex items-center justify-center text-[#253449] hover:text-[#102A43] hover:bg-[#EAF2FA] rounded-l-xl cursor-pointer"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="px-4 text-sm font-mono-num font-semibold text-[#102A43]">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(Math.max(1, maxStock), q + 1))}
                    disabled={quantity >= maxStock}
                    aria-label="Tambah jumlah"
                    className="w-10 h-10 flex items-center justify-center text-[#253449] hover:text-[#102A43] hover:bg-[#EAF2FA] rounded-r-xl disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <NavyButton
                  type="button"
                  variant="outline"
                  disabled={isOutOfStock}
                  onClick={handleAddToCart}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 cursor-pointer"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Tambah ke Keranjang
                </NavyButton>
                <NavyButton
                  type="button"
                  variant="primary"
                  disabled={isOutOfStock}
                  onClick={handleBuyNow}
                  className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold disabled:opacity-40 cursor-pointer"
                >
                  {isOutOfStock ? 'Stok Sedang Habis' : 'Beli Sekarang'}
                </NavyButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Related Products */}
      {related.length > 0 && (
        <section className="space-y-6">
          <h2 className="font-display text-2xl font-bold text-[#102A43]">Produk Terkait</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {related.map((item) => (
              <ProductCard
                key={item.id}
                product={item}
                categoryName={category?.name}
              />
            ))}
          </div>
        </section>
      )}

      {/* Zoom Lightbox Modal */}
      {zoomOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pratinjau gambar produk diperbesar"
          className="fixed inset-0 z-50 bg-[#102A43]/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setZoomOpen(false)}
        >
          <button
            type="button"
            onClick={() => setZoomOpen(false)}
            aria-label="Tutup pratinjau gambar"
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white text-[#102A43] flex items-center justify-center shadow-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={activeImage || product.imageUrl}
            alt={product.name}
            className="max-w-full max-h-[85vh] rounded-2xl object-contain bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </motion.main>
  );
}
