import { useNavigate } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Sparkles, Trash2, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatIDR } from '../shared/pricing';
import { SafeImage } from './SafeImage';
import { NavyButton, spawnNavyRipple } from './Interactive';

export function CartDrawer() {
  const {
    cartOpen,
    setCartOpen,
    enrichedCart,
    cartSubtotal,
    cartResellerSavings,
    isResellerActive,
    updateCartQuantity,
    removeFromCart,
  } = useStore();
  const navigate = useNavigate();

  if (!cartOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keranjang Belanja"
      className="no-print fixed inset-0 z-50 flex justify-end bg-[#102A43]/30 backdrop-blur-[2px]"
    >
      <div
        className="fixed inset-0"
        aria-hidden="true"
        onClick={() => setCartOpen(false)}
      />
      <aside className="relative z-10 w-full max-w-md bg-white border-l border-[#E5EAF0] h-full flex flex-col shadow-2xl">
        <div className="px-6 py-4 border-b border-[#E5EAF0] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#102A43]" />
            <h2 className="text-base font-semibold text-[#102A43]">Keranjang Belanja</h2>
          </div>
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
            aria-label="Tutup keranjang"
            className="ripple-host w-9 h-9 rounded-xl flex items-center justify-center text-[#718096] hover:text-[#102A43] hover:bg-[#EAF2FA] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isResellerActive && enrichedCart.length > 0 && (
            <div className="rounded-xl bg-[#EAF2FA] border border-[#244B75]/20 px-4 py-3 flex items-center gap-2.5 text-xs text-[#102A43]">
              <Sparkles className="w-4 h-4 shrink-0 text-[#244B75]" />
              <span>
                Harga Reseller (-20%) otomatis aktif untuk akun Anda. Hemat{' '}
                <strong className="font-mono-num">{formatIDR(cartResellerSavings)}</strong>.
              </span>
            </div>
          )}

          {enrichedCart.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#EAF2FA] border border-[#E5EAF0] flex items-center justify-center mx-auto text-[#102A43]">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[#102A43]">Keranjang Anda masih kosong</p>
                <p className="text-xs text-[#718096]">
                  Pilih produk digital favorit Anda untuk melanjutkan ke pembayaran QRIS.
                </p>
              </div>
              <NavyButton
                type="button"
                onClick={() => {
                  setCartOpen(false);
                  navigate('/produk');
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
              >
                Jelajahi Produk
              </NavyButton>
            </div>
          ) : (
            enrichedCart.map((item) => (
              <div
                key={`${item.productId}-${item.variantId || 'default'}`}
                className="flex gap-4 p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]"
              >
                <SafeImage
                  src={item.product.imageUrl}
                  alt={item.product.name}
                  className="w-20 h-20 rounded-lg object-cover shrink-0 bg-white border border-[#E5EAF0]"
                />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#102A43] truncate">
                      {item.product.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.productId, item.variantId)}
                      aria-label={`Hapus ${item.product.name} dari keranjang`}
                      className="text-[#718096] hover:text-rose-600 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {item.variantName && (
                    <p className="text-xs text-[#244B75] font-medium">Varian: {item.variantName}</p>
                  )}
                  <p className="text-xs text-[#718096]">Kuota tersedia: {item.maxStock}</p>
                  <div className="flex items-center justify-between pt-1">
                    <div className="inline-flex items-center border border-[#E5EAF0] rounded-lg bg-white">
                      <button
                        type="button"
                        onClick={() =>
                          updateCartQuantity(item.productId, item.variantId, item.quantity - 1)
                        }
                        aria-label={`Kurangi jumlah ${item.product.name}`}
                        className="w-8 h-8 flex items-center justify-center text-[#253449] hover:text-[#102A43] hover:bg-[#EAF2FA] rounded-l-lg cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-2.5 text-xs font-mono-num text-[#102A43] font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateCartQuantity(item.productId, item.variantId, item.quantity + 1)
                        }
                        disabled={item.quantity >= item.maxStock}
                        aria-label={`Tambah jumlah ${item.product.name}`}
                        className="w-8 h-8 flex items-center justify-center text-[#253449] hover:text-[#102A43] hover:bg-[#EAF2FA] rounded-r-lg disabled:opacity-40 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-bold font-mono-num text-[#102A43]">
                        {formatIDR(item.lineSubtotal)}
                      </span>
                      {item.pricingTier === 'reseller' && (
                        <p className="text-[11px] font-mono-num text-[#718096] line-through">
                          {formatIDR(item.originalUnitPrice * item.quantity)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {enrichedCart.length > 0 && (
          <div className="p-6 border-t border-[#E5EAF0] bg-[#F8FAFC] space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[#718096]">Subtotal Sementara</span>
              <span className="text-lg font-bold font-mono-num text-[#102A43]">
                {formatIDR(cartSubtotal)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => {
                  setCartOpen(false);
                  navigate('/keranjang');
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
              >
                Lihat Keranjang
              </NavyButton>
              <NavyButton
                type="button"
                variant="primary"
                onClick={() => {
                  setCartOpen(false);
                  navigate('/checkout');
                }}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
              >
                Checkout
              </NavyButton>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
