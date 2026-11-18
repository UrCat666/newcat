import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Minus, Plus, ShoppingBag, Sparkles, Trash2 } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatIDR } from '../shared/pricing';
import { SafeImage } from '../components/SafeImage';
import { NavyButton } from '../components/Interactive';

export function CartPage() {
  const {
    cart,
    enrichedCart,
    allCatalogProducts,
    loadingStorefront,
    cartSubtotal,
    cartSubtotalNormal,
    cartResellerSavings,
    isResellerActive,
    updateCartQuantity,
    removeFromCart,
  } = useStore();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Keranjang Belanja — Catrizzz Store';
  }, []);

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8 bg-white">
      <div className="space-y-1">
        <h1 className="font-display text-3xl font-bold text-[#102A43]">Keranjang Belanja</h1>
        <p className="text-sm text-[#718096]">
          Periksa kembali produk dan jumlah pesanan Anda sebelum melanjutkan ke checkout.
        </p>
      </div>

      {(loadingStorefront || allCatalogProducts.length === 0) && cart.length > 0 && enrichedCart.length === 0 ? (
        <div className="h-64 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
      ) : enrichedCart.length === 0 ? (
        <div className="surface-card rounded-2xl p-14 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#EAF2FA] border border-[#E5EAF0] flex items-center justify-center mx-auto text-[#102A43]">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-[#102A43]">Keranjang Masih Kosong</h2>
            <p className="text-sm text-[#718096]">
              Tambahkan produk ke keranjang untuk mulai berbelanja di Catrizzz Store.
            </p>
          </div>
          <Link
            to="/produk"
            className="btn-navy-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            Lihat Katalog Produk
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-4">
            {enrichedCart.map((item) => (
              <div
                key={`${item.productId}-${item.variantId || 'default'}`}
                className="surface-card rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center"
              >
                <SafeImage
                  src={item.product.imageUrl}
                  alt={item.product.name}
                  className="w-24 h-20 rounded-xl object-cover shrink-0 bg-[#F8FAFC] border border-[#E5EAF0]"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <Link
                    to={`/produk/${item.product.slug}`}
                    className="text-base font-semibold text-[#102A43] hover:text-[#244B75]"
                  >
                    {item.product.name}
                  </Link>
                  {item.variantName && (
                    <p className="text-xs text-[#244B75] font-medium">Varian: {item.variantName}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-[#718096]">
                    <span className="font-mono-num font-semibold text-[#102A43]">
                      {formatIDR(item.unitPrice)}
                    </span>
                    {item.pricingTier === 'reseller' && (
                      <span className="font-mono-num line-through text-[#718096]">
                        {formatIDR(item.originalUnitPrice)}
                      </span>
                    )}
                    <span>·</span>
                    <span>Stok tersedia: {item.maxStock}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 self-end sm:self-center">
                  <div className="inline-flex items-center border border-[#E5EAF0] rounded-xl bg-[#F8FAFC]">
                    <button
                      type="button"
                      onClick={() =>
                        updateCartQuantity(item.productId, item.variantId, item.quantity - 1)
                      }
                      aria-label={`Kurangi jumlah ${item.product.name}`}
                      className="w-9 h-9 flex items-center justify-center text-[#253449] hover:text-[#102A43] hover:bg-[#EAF2FA] rounded-l-xl cursor-pointer"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-3 text-sm font-mono-num font-semibold text-[#102A43]">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateCartQuantity(item.productId, item.variantId, item.quantity + 1)
                      }
                      disabled={item.quantity >= item.maxStock}
                      aria-label={`Tambah jumlah ${item.product.name}`}
                      className="w-9 h-9 flex items-center justify-center text-[#253449] hover:text-[#102A43] hover:bg-[#EAF2FA] rounded-r-xl disabled:opacity-40 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-right min-w-[96px]">
                    <span className="text-sm font-bold font-mono-num text-[#102A43]">
                      {formatIDR(item.lineSubtotal)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeFromCart(item.productId, item.variantId)}
                    aria-label={`Hapus ${item.product.name}`}
                    className="p-2 text-[#718096] hover:text-rose-600 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <aside className="lg:col-span-4 surface-subtle rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-[#102A43]">Ringkasan Keranjang</h2>
            <div className="space-y-2.5 text-sm">
              {isResellerActive && cartResellerSavings > 0 && (
                <>
                  <div className="flex justify-between text-[#718096]">
                    <span>Harga Normal</span>
                    <span className="font-mono-num line-through">
                      {formatIDR(cartSubtotalNormal)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#244B75] font-medium">
                    <span className="inline-flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      Diskon Reseller (20%)
                    </span>
                    <span className="font-mono-num">-{formatIDR(cartResellerSavings)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-[#253449] pt-1 border-t border-[#E5EAF0]">
                <span>Subtotal Produk</span>
                <span className="font-mono-num text-[#102A43] font-bold">
                  {formatIDR(cartSubtotal)}
                </span>
              </div>
              <p className="text-xs text-[#718096]">
                Kode promo &amp; metode pengiriman digital dikonfirmasi pada langkah checkout.
              </p>
            </div>
            <NavyButton
              type="button"
              onClick={() => navigate('/checkout')}
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
            >
              Lanjut ke Checkout
              <ArrowRight className="w-4 h-4" />
            </NavyButton>
          </aside>
        </div>
      )}
    </main>
  );
}
