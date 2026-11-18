import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Layers } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { SafeImage } from '../components/SafeImage';
import { spawnNavyRipple } from '../components/Interactive';

export function CategoriesPage() {
  const { storefront, loadingStorefront } = useStore();
  const categories = storefront?.categories || [];

  useEffect(() => {
    document.title = 'Kategori Aplikasi & Produk Digital — Catrizzz Store';
  }, []);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12 space-y-8 bg-white">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#E5EAF0] pb-6">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#244B75] uppercase tracking-wider">
            <Layers className="w-4 h-4" />
            <span>Kategori Katalog</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-[#102A43]">
            Kategori Aplikasi &amp; Produk Digital
          </h1>
          <p className="text-sm text-[#718096] max-w-2xl">
            Pilih kategori layanan premium sesuai kebutuhan produktivitas, AI, desain kreatif, hingga hiburan digital Anda.
          </p>
        </div>
        <Link
          to="/produk"
          className="btn-navy-outline inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap self-start md:self-auto"
        >
          <span>Lihat Semua Produk</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {loadingStorefront && categories.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-64 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse"
            />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="surface-card rounded-2xl p-12 text-center space-y-3">
          <p className="text-sm text-[#718096]">Belum ada kategori produk aktif saat ini.</p>
          <Link
            to="/produk"
            className="btn-navy-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            Buka Katalog Produk
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              to={`/produk?categoryId=${encodeURIComponent(cat.id)}`}
              data-spotlight="true"
              onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
              className="group product-card-interactive rounded-2xl flex flex-col"
            >
              <div className="aspect-[16/10] bg-[#F8FAFC] overflow-hidden border-b border-[#E5EAF0]">
                <SafeImage
                  src={cat.imageUrl}
                  alt={cat.name}
                  className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-bold text-[#102A43] group-hover:text-[#244B75] transition-colors">
                      {cat.name}
                    </h2>
                    <span className="text-xs font-mono-num font-semibold text-[#244B75]">
                      {cat.productCount || 0} produk
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-[#718096] leading-relaxed">
                    {cat.description}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#102A43] group-hover:text-[#244B75]">
                  Jelajahi Kategori
                  <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
