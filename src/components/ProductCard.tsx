import { useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Star } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  formatIDR,
  resolveProductEffectiveNormalPrice,
  resolveProductResellerUnitPrice,
} from '../shared/pricing';
import type { Product } from '../shared/types';
import { SafeImage } from './SafeImage';
import { NavyButton, spawnNavyRipple } from './Interactive';

interface ProductCardProps {
  product: Product;
  categoryName?: string;
}

export function ProductCard({ product, categoryName }: ProductCardProps) {
  const { addToCart, storefront, isResellerActive } = useStore();
  const navigate = useNavigate();
  const cardRef = useRef<HTMLElement>(null);
  const reviewsEnabled = storefront?.storeSettings?.reviewsEnabled !== false;

  const hasDiscount =
    typeof product.discountPrice === 'number' &&
    product.discountPrice >= 0 &&
    product.discountPrice < product.price;
  const normalEffectivePrice = resolveProductEffectiveNormalPrice(product, 0);
  const resellerEnabled = product.resellerPriceEnabled !== false;
  const resellerPrice = resolveProductResellerUnitPrice(product, 0);
  const displayPrice = isResellerActive ? resellerPrice : normalEffectivePrice;
  const showStrikeOriginal = displayPrice < product.price;

  const outOfStock = product.stock <= 0 || product.availabilityStatus === 'out_of_stock';
  const isLimited = !outOfStock && (product.availabilityStatus === 'limited' || product.stock <= 5);

  const openDetailWithContinuity = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = cardRef.current?.getBoundingClientRect();
    navigate(`/produk/${product.slug}`, {
      state: rect
        ? {
            originRect: {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            },
          }
        : undefined,
    });
  };

  return (
    <article
      ref={cardRef}
      data-spotlight="true"
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        spawnNavyRipple(e, 'navy');
      }}
      className="group product-card-interactive rounded-xl flex flex-col"
    >
      <Link
        to={`/produk/${product.slug}`}
        onClick={openDetailWithContinuity}
        className="relative aspect-[4/3] bg-[#F8FAFC] overflow-hidden block border-b border-[#E5EAF0]"
      >
        <SafeImage
          src={product.imageUrl}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
        {product.badge && (
          <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-white/95 border border-[#E5EAF0] text-[11px] font-semibold text-[#102A43] shadow-sm">
            {product.badge}
          </span>
        )}
      </Link>

      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-[#718096] flex-wrap">
            <span className="truncate font-medium text-[#244B75]">
              {categoryName || 'Aplikasi Digital'}
            </span>
            {product.subscriptionDuration && (
              <>
                <span aria-hidden="true">·</span>
                <span>{product.subscriptionDuration}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span
              className={
                outOfStock
                  ? 'text-rose-600 font-medium'
                  : isLimited
                    ? 'text-amber-600 font-medium'
                    : 'text-emerald-700 font-medium'
              }
            >
              {outOfStock ? 'Habis' : isLimited ? `Sisa ${product.stock}` : 'Tersedia'}
            </span>
          </div>

          <Link
            to={`/produk/${product.slug}`}
            onClick={openDetailWithContinuity}
            className="block text-base font-semibold text-[#102A43] group-hover:text-[#244B75] transition-colors line-clamp-2 leading-snug"
          >
            {product.name}
          </Link>

          {reviewsEnabled && product.reviewCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-[#718096]">
              <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span className="font-mono-num font-medium text-[#253449]">
                {product.rating.toFixed(1)}
              </span>
              <span>({product.reviewCount} ulasan)</span>
            </div>
          )}
        </div>

        <div className="space-y-3 pt-3 border-t border-[#E5EAF0]">
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-2.5 flex-wrap">
              <span className="text-lg font-bold font-mono-num text-[#102A43]">
                {formatIDR(displayPrice)}
              </span>
              {(showStrikeOriginal || hasDiscount) && displayPrice < product.price && (
                <span className="text-xs font-mono-num text-[#718096] line-through">
                  {formatIDR(product.price)}
                </span>
              )}
            </div>
            {resellerEnabled ? (
              isResellerActive ? (
                <p className="text-[11px] font-medium text-[#244B75]">
                  Harga Khusus Reseller Aktif
                </p>
              ) : (
                <p className="text-[11px] text-[#718096]">
                  Harga Reseller:{' '}
                  <span className="font-mono-num font-medium text-[#253449]">
                    {formatIDR(resellerPrice)}
                  </span>
                </p>
              )
            ) : (
              <p className="text-[11px] text-[#718096]">Harga standar berlaku</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Link
              to={`/produk/${product.slug}`}
              onClick={openDetailWithContinuity}
              onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
              className="btn-navy-outline px-3 py-2 rounded-lg text-center text-xs font-semibold whitespace-nowrap"
            >
              Detail
            </Link>
            <NavyButton
              type="button"
              variant="primary"
              disabled={outOfStock}
              onClick={() => addToCart(product, 1)}
              aria-label={`Tambah ${product.name} ke keranjang`}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg disabled:bg-[#E5EAF0] disabled:text-[#718096] disabled:shadow-none text-xs font-semibold whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>{outOfStock ? 'Habis' : 'Keranjang'}</span>
            </NavyButton>
          </div>
        </div>
      </div>
    </article>
  );
}
