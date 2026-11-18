import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RotateCcw, Search, SlidersHorizontal, Tag, X } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { ProductCard } from '../components/ProductCard';
import { NavyButton, spawnNavyRipple } from '../components/Interactive';
import type { Category, Product } from '../shared/types';

export function CatalogPage() {
  const { referralCode, setReferralCodeManual, clearReferralCode, subscribeRealtime } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const search = searchParams.get('search') || '';
  const categoryId = searchParams.get('categoryId') || 'all';
  const availability = searchParams.get('availability') || 'all';
  const sort = searchParams.get('sort') || 'newest';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));

  const [localSearch, setLocalSearch] = useState(search);
  const [localMin, setLocalMin] = useState(minPrice);
  const [localMax, setLocalMax] = useState(maxPrice);

  useEffect(() => {
    document.title = 'Katalog Aplikasi & Produk Digital — Catrizzz Store';
    const refParam = searchParams.get('ref')?.trim();
    if (refParam) {
      setReferralCodeManual(refParam);
    }
  }, [searchParams, setReferralCodeManual]);

  useEffect(() => {
    setLocalSearch(search);
    setLocalMin(minPrice);
    setLocalMax(maxPrice);
  }, [search, minPrice, maxPrice]);

  useEffect(() => {
    const trimmed = localSearch.trim();
    if (trimmed === search) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(searchParams);
      if (trimmed) next.set('search', trimmed);
      else next.delete('search');
      next.set('page', '1');
      setSearchParams(next, { replace: true });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [localSearch, search, searchParams, setSearchParams]);

  const fetchCatalog = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const qs = new URLSearchParams();
        if (search) qs.set('search', search);
        if (categoryId && categoryId !== 'all') qs.set('categoryId', categoryId);
        if (availability !== 'all') qs.set('availability', availability);
        if (sort) qs.set('sort', sort);
        if (minPrice) qs.set('minPrice', minPrice);
        if (maxPrice) qs.set('maxPrice', maxPrice);
        qs.set('page', String(page));
        qs.set('limit', '12');

        const res = await fetch(`/api/products?${qs.toString()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error('Gagal memuat katalog aplikasi & produk digital.');
        const data = await res.json();
        setProducts(data.products || []);
        setCategories(data.categories || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat produk.');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [search, categoryId, availability, sort, minPrice, maxPrice, page]
  );

  useEffect(() => {
    fetchCatalog(false);
  }, [fetchCatalog]);

  useEffect(() => {
    return subscribeRealtime(['storefront', 'products', 'categories'], () => {
      fetchCatalog(true);
    });
  }, [subscribeRealtime, fetchCatalog]);

  const updateFilter = (updates: Record<string, string>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (!v || v === 'all') next.delete(k);
      else next.set(k, v);
    }
    if (!('page' in updates)) {
      next.set('page', '1');
    }
    setSearchParams(next);
  };

  const handleReset = () => {
    setLocalSearch('');
    setLocalMin('');
    setLocalMax('');
    setSearchParams({});
  };

  const categoryNameMap = new Map(categories.map((c) => [c.id, c.name]));

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8 bg-white">
      {referralCode && (
        <div className="rounded-xl bg-[#EAF2FA] border border-[#244B75]/20 px-4 py-3 flex items-center justify-between gap-3 text-xs text-[#102A43]">
          <div className="flex items-center gap-2">
            <Tag className="w-4 h-4 text-[#244B75] shrink-0" />
            <span>
              Tautan referral reseller aktif:{' '}
              <strong className="font-mono-num">{referralCode}</strong>. Pembelian Anda akan
              terhubung ke mitra reseller terkait.
            </span>
          </div>
          <button
            type="button"
            onClick={clearReferralCode}
            aria-label="Hapus kode referral"
            className="text-[#718096] hover:text-[#102A43] p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold text-[#102A43]">
            Katalog Aplikasi &amp; Produk Digital
          </h1>
          <p className="text-sm text-[#718096]">
            Menampilkan <span className="font-mono-num font-semibold text-[#102A43]">{total}</span>{' '}
            layanan &amp; aplikasi premium aktif dari Catrizzz Store.
          </p>
        </div>
        <NavyButton
          type="button"
          variant="outline"
          onClick={handleReset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold self-start md:self-auto cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset Filter
        </NavyButton>
      </div>

      {/* Category Quick Switcher */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => updateFilter({ categoryId: 'all' })}
            onPointerDown={(e) => spawnNavyRipple(e, categoryId === 'all' ? 'light' : 'navy')}
            className={`ripple-host px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
              categoryId === 'all'
                ? 'bg-[#102A43] border-[#102A43] text-white shadow-sm'
                : 'bg-[#F8FAFC] border-[#E5EAF0] text-[#253449] hover:bg-[#EAF2FA] hover:text-[#102A43]'
            }`}
          >
            Semua Kategori
          </button>
          {categories.map((c) => {
            const active = categoryId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => updateFilter({ categoryId: c.id })}
                onPointerDown={(e) => spawnNavyRipple(e, active ? 'light' : 'navy')}
                className={`ripple-host px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer ${
                  active
                    ? 'bg-[#102A43] border-[#102A43] text-white shadow-sm'
                    : 'bg-[#F8FAFC] border-[#E5EAF0] text-[#253449] hover:bg-[#EAF2FA] hover:text-[#102A43]'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Filter & Real-time Search Bar */}
      <section aria-label="Filter dan pencarian produk" className="surface-subtle rounded-2xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateFilter({ search: localSearch.trim() });
            }}
            className="md:col-span-5 flex gap-2"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#718096] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <label htmlFor="catalog-search" className="sr-only">
                Cari nama aplikasi atau produk digital
              </label>
              <input
                id="catalog-search"
                type="search"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Cari ChatGPT, Canva, Netflix, 1 Tahun..."
                className="w-full input-navy rounded-xl pl-10 pr-3 py-2.5 text-sm"
              />
            </div>
            <NavyButton type="submit" className="px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap cursor-pointer">
              Cari
            </NavyButton>
          </form>

          <div className="md:col-span-3">
            <label htmlFor="catalog-category" className="sr-only">
              Filter kategori
            </label>
            <select
              id="catalog-category"
              value={categoryId}
              onChange={(e) => updateFilter({ categoryId: e.target.value })}
              className="w-full input-navy rounded-xl px-3.5 py-2.5 text-sm"
            >
              <option value="all">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="catalog-availability" className="sr-only">
              Filter ketersediaan
            </label>
            <select
              id="catalog-availability"
              value={availability}
              onChange={(e) => updateFilter({ availability: e.target.value })}
              className="w-full input-navy rounded-xl px-3.5 py-2.5 text-sm"
            >
              <option value="all">Semua Status</option>
              <option value="in_stock">Tersedia</option>
              <option value="limited">Kuota Terbatas</option>
              <option value="out_of_stock">Habis</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="catalog-sort" className="sr-only">
              Urutkan produk
            </label>
            <select
              id="catalog-sort"
              value={sort}
              onChange={(e) => updateFilter({ sort: e.target.value })}
              className="w-full input-navy rounded-xl px-3.5 py-2.5 text-sm"
            >
              <option value="newest">Terbaru</option>
              <option value="best_seller">Terpopuler</option>
              <option value="rating">Rating Tertinggi</option>
              <option value="price_asc">Harga Terendah</option>
              <option value="price_desc">Harga Tertinggi</option>
            </select>
          </div>
        </div>

        {/* Price range filter */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateFilter({ minPrice: localMin, maxPrice: localMax });
          }}
          className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#E5EAF0]"
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#718096]">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#244B75]" />
            Rentang Harga (Rp):
          </span>
          <input
            type="number"
            min={0}
            value={localMin}
            onChange={(e) => setLocalMin(e.target.value)}
            placeholder="Min (cth: 30000)"
            aria-label="Harga minimum"
            className="w-36 input-navy rounded-lg px-3 py-1.5 text-xs font-mono-num"
          />
          <span className="text-[#718096]">-</span>
          <input
            type="number"
            min={0}
            value={localMax}
            onChange={(e) => setLocalMax(e.target.value)}
            placeholder="Maks (cth: 300000)"
            aria-label="Harga maksimum"
            className="w-36 input-navy rounded-lg px-3 py-1.5 text-xs font-mono-num"
          />
          <NavyButton
            type="submit"
            variant="outline"
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
          >
            Terapkan Harga
          </NavyButton>
        </form>
      </section>

      {/* Catalog Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="h-80 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="surface-card rounded-2xl p-10 text-center space-y-4">
          <p className="text-sm text-rose-600">{error}</p>
          <NavyButton
            type="button"
            onClick={() => fetchCatalog(false)}
            className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
          >
            Coba Lagi
          </NavyButton>
        </div>
      ) : products.length === 0 ? (
        <div className="surface-card rounded-2xl p-12 text-center space-y-3">
          <h2 className="text-lg font-semibold text-[#102A43]">Produk Tidak Ditemukan</h2>
          <p className="text-sm text-[#718096]">
            Tidak ada aplikasi atau produk digital yang cocok dengan filter Anda.
          </p>
          <NavyButton
            type="button"
            onClick={handleReset}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
          >
            Reset Semua Filter
          </NavyButton>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                categoryName={categoryNameMap.get(product.categoryId)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <nav aria-label="Paginasi katalog" className="flex items-center justify-center gap-2 pt-4">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => updateFilter({ page: String(p) })}
                  onPointerDown={(e) => spawnNavyRipple(e, p === page ? 'light' : 'navy')}
                  className={`ripple-host w-10 h-10 rounded-xl text-sm font-mono-num font-semibold transition-colors cursor-pointer ${
                    p === page
                      ? 'bg-[#102A43] text-white'
                      : 'bg-white border border-[#E5EAF0] text-[#253449] hover:bg-[#EAF2FA]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </nav>
          )}
        </>
      )}
    </main>
  );
}
