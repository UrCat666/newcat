import React, { useCallback, useEffect, useState } from 'react';
import { Edit, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import {
  calculateResellerPrice,
  formatIDR,
  resolveProductEffectiveNormalPrice,
  resolveProductResellerUnitPrice,
} from '../../shared/pricing';
import type { Category, Product, ProductVariant } from '../../shared/types';
import { SafeImage } from '../SafeImage';
import { NavyButton } from '../Interactive';

const DEFAULT_CLEAN_IMG = '/src/assets/images/cat_ai_clean_1794609262401.jpg';

export function AdminCatalogTab({
  initialSubTab = 'products',
}: {
  initialSubTab?: 'products' | 'categories';
}) {
  const { getAuthHeader, showToast, refreshStorefront, subscribeRealtime } = useStore();
  const [subTab, setSubTab] = useState<'products' | 'categories'>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [variantsDraft, setVariantsDraft] = useState<Array<Partial<ProductVariant>>>([]);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'product' | 'category';
    id: string;
    name: string;
  } | null>(null);
  const [reassignCategoryId, setReassignCategoryId] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [newGalleryUrl, setNewGalleryUrl] = useState('');

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const headers = await getAuthHeader();
        const res = await fetch('/api/admin/products', {
          headers,
          credentials: 'include',
          cache: 'no-store',
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json) {
          setProducts(json.products || []);
          setCategories(json.categories || []);
        } else if (!silent) {
          showToast(json?.error || 'Gagal memuat katalog produk & kategori.', 'error');
        }
      } catch {
        if (!silent) {
          showToast('Koneksi bermasalah saat memuat katalog produk.', 'error');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [getAuthHeader, showToast]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return subscribeRealtime(['products', 'categories', 'overview'], () => {
      loadData(true);
    });
  }, [subscribeRealtime, loadData]);

  const handleUploadImage = async (file: File, folder: string): Promise<string | null> => {
    setUploadingImage(true);
    try {
      const headers = await getAuthHeader();
      const fd = new FormData();
      fd.append('folder', folder);
      fd.append('file', file);
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) {
        showToast(json?.error || 'Gagal mengunggah gambar.', 'error');
        return null;
      }
      return String(json.url);
    } catch {
      showToast('Koneksi bermasalah saat mengunggah gambar ke server.', 'error');
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const openProductModal = (prod?: Product) => {
    if (prod) {
      setEditingProduct({ ...prod });
      setVariantsDraft(prod.variants ? prod.variants.map((v) => ({ ...v })) : []);
    } else {
      setEditingProduct({
        name: '',
        description: '',
        additionalInfo: '',
        subscriptionDuration: '1 Bulan',
        benefits: [],
        activationGuide: '',
        availabilityStatus: 'available',
        categoryId: categories[0]?.id || '',
        price: 50000,
        discountPrice: null,
        resellerPrice: null,
        resellerPriceEnabled: true,
        stock: 20,
        badge: '',
        labels: [],
        publicationStatus: 'published',
        featuredOrder: 99,
        imageUrl: DEFAULT_CLEAN_IMG,
        galleryUrls: [],
        featured: false,
        active: true,
        requiresShipping: false,
      });
      setVariantsDraft([]);
    }
  };

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setSaving(true);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const payload = { ...editingProduct, variants: variantsDraft };
      const isEdit = Boolean(editingProduct.id);
      const res = await fetch(
        isEdit ? `/api/admin/products/${editingProduct.id}` : '/api/admin/products',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal menyimpan produk.', 'error');
        return;
      }
      showToast(
        isEdit ? 'Produk berhasil diperbarui.' : 'Produk berhasil ditambahkan.',
        'success'
      );
      setEditingProduct(null);
      setNewGalleryUrl('');
      await loadData();
      await refreshStorefront();
    } catch {
      showToast('Gagal menghubungi server saat menyimpan produk.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    setSaving(true);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const isEdit = Boolean(editingCategory.id);
      const res = await fetch(
        isEdit ? `/api/admin/categories/${editingCategory.id}` : '/api/admin/categories',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(editingCategory),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal menyimpan kategori.', 'error');
        return;
      }
      showToast('Kategori berhasil disimpan.', 'success');
      setEditingCategory(null);
      await loadData();
      await refreshStorefront();
    } catch {
      showToast('Gagal menghubungi server saat menyimpan kategori.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = await getAuthHeader();
      const qs =
        deleteTarget.type === 'category' && reassignCategoryId
          ? `?reassignTo=${encodeURIComponent(reassignCategoryId)}`
          : '';
      const url =
        deleteTarget.type === 'product'
          ? `/api/admin/products/${deleteTarget.id}`
          : `/api/admin/categories/${deleteTarget.id}${qs}`;
      const res = await fetch(url, { method: 'DELETE', headers, credentials: 'include' });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal menghapus item.', 'error');
        return;
      }
      showToast(
        json?.message ||
          (deleteTarget.type === 'product'
            ? 'Produk berhasil dihapus.'
            : 'Kategori berhasil dihapus.'),
        'success'
      );
      setDeleteTarget(null);
      setReassignCategoryId('');
      await loadData();
      await refreshStorefront();
    } catch {
      showToast('Gagal menghubungi server saat menghapus item.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const catMap = new Map(categories.map((c) => [c.id, c.name]));
  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 p-1 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
          <button
            type="button"
            onClick={() => setSubTab('products')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'products'
                ? 'bg-[#102A43] text-white'
                : 'text-[#718096] hover:text-[#102A43]'
            }`}
          >
            Manajemen Produk ({products.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('categories')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'categories'
                ? 'bg-[#102A43] text-white'
                : 'text-[#718096] hover:text-[#102A43]'
            }`}
          >
            Manajemen Kategori ({categories.length})
          </button>
        </div>

        <NavyButton
          type="button"
          onClick={() =>
            subTab === 'products'
              ? openProductModal()
              : setEditingCategory({
                  name: '',
                  description: '',
                  imageUrl: DEFAULT_CLEAN_IMG,
                  sortOrder: categories.length + 1,
                  active: true,
                })
          }
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {subTab === 'products' ? 'Tambah Produk' : 'Tambah Kategori'}
        </NavyButton>
      </div>

      {subTab === 'products' ? (
        <div className="space-y-4">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-[#718096] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari produk berdasarkan nama..."
              className="input-navy w-full rounded-xl pl-10 pr-3 py-2 text-sm"
            />
          </div>

          <div className="surface-card rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-[#E5EAF0] text-[#718096] text-xs">
                <tr>
                  <th className="p-4">Produk</th>
                  <th className="p-4">Kategori</th>
                  <th className="p-4">Harga</th>
                  <th className="p-4">Stok</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EAF0]">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-[#718096]">
                      Memuat produk...
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-[#718096]">
                      Tidak ada produk ditemukan.
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-[#F8FAFC]">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <SafeImage
                            src={p.imageUrl}
                            alt={p.name}
                            className="w-11 h-11 rounded-lg object-cover shrink-0 bg-[#F8FAFC] border border-[#E5EAF0]"
                          />
                          <div>
                            <p className="font-semibold text-[#102A43]">{p.name}</p>
                            <p className="text-xs text-[#718096]">
                              {p.subscriptionDuration ? `${p.subscriptionDuration} · ` : ''}
                              {p.badge || 'Reguler'}
                              {p.isDemo ? ' · Demo' : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-[#253449]">
                        {catMap.get(p.categoryId) || '-'}
                      </td>
                      <td className="p-4 font-mono-num">
                        {typeof p.discountPrice === 'number' && p.discountPrice < p.price ? (
                          <div>
                            <span className="text-[#102A43] font-bold">
                              {formatIDR(p.discountPrice)}
                            </span>
                            <span className="block text-[11px] text-[#718096] line-through">
                              {formatIDR(p.price)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[#102A43] font-semibold">
                            {formatIDR(p.price)}
                          </span>
                        )}
                        <span className="block text-[11px] text-[#244B75] mt-0.5">
                          {p.resellerPriceEnabled === false
                            ? 'Reseller: Harga Normal'
                            : `Reseller: ${formatIDR(resolveProductResellerUnitPrice(p))}`}
                        </span>
                      </td>
                      <td className="p-4 font-mono-num text-[#102A43] font-semibold">
                        {p.stock}
                      </td>
                      <td className="p-4 space-y-1">
                        <span
                          className={`block text-xs font-semibold ${
                            !p.active || p.publicationStatus === 'inactive'
                              ? 'text-[#718096]'
                              : p.publicationStatus === 'draft'
                                ? 'text-amber-700'
                                : p.availabilityStatus === 'out_of_stock' || p.stock <= 0
                                  ? 'text-rose-700'
                                  : p.availabilityStatus === 'limited'
                                    ? 'text-amber-700'
                                    : 'text-emerald-700'
                          }`}
                        >
                          {p.publicationStatus === 'draft'
                            ? 'Draft'
                            : !p.active || p.publicationStatus === 'inactive'
                              ? 'Nonaktif'
                              : p.availabilityStatus === 'out_of_stock' || p.stock <= 0
                                ? 'Habis'
                                : p.availabilityStatus === 'limited'
                                  ? 'Terbatas'
                                  : 'Terbit'}
                        </span>
                        {p.featured && (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-[#EAF2FA] text-[#102A43] text-[10px] font-semibold">
                            Unggulan #{p.featuredOrder ?? 99}
                          </span>
                        )}
                      </td>
                      <td className="p-4 text-right space-x-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openProductModal(p)}
                          aria-label={`Edit ${p.name}`}
                          className="p-2 rounded-lg bg-[#EAF2FA] hover:bg-[#dce9f6] text-[#102A43] cursor-pointer"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setDeleteTarget({ type: 'product', id: p.id, name: p.name })
                          }
                          aria-label={`Hapus ${p.name}`}
                          className="p-2 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((cat) => (
              <div key={cat.id} className="surface-card rounded-2xl p-4 flex items-center gap-4">
                <SafeImage
                  src={cat.imageUrl}
                  alt={cat.name}
                  className="w-16 h-16 rounded-xl object-cover shrink-0 bg-[#F8FAFC] border border-[#E5EAF0]"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#102A43] truncate">{cat.name}</p>
                  <p className="text-xs text-[#718096]">
                    Urutan #{cat.sortOrder} · {cat.active ? 'Aktif' : 'Nonaktif'}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingCategory({ ...cat })}
                    aria-label={`Edit kategori ${cat.name}`}
                    className="p-2 rounded-lg bg-[#EAF2FA] text-[#102A43] cursor-pointer"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDeleteTarget({ type: 'category', id: cat.id, name: cat.name })
                    }
                    aria-label={`Hapus kategori ${cat.name}`}
                    className="p-2 rounded-lg bg-rose-50 text-rose-700 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* Product Modal */}
      {editingProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <form
            onSubmit={saveProduct}
            className="surface-card rounded-2xl max-w-2xl w-full p-6 space-y-4 my-8 max-h-[90vh] overflow-y-auto shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#102A43]">
                {editingProduct.id ? 'Edit Produk' : 'Tambah Produk Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                aria-label="Tutup modal produk"
                className="text-[#718096] hover:text-[#102A43] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Nama Produk
                <input
                  type="text"
                  required
                  value={editingProduct.name || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, name: e.target.value })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>

              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Kategori
                <select
                  value={editingProduct.categoryId || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, categoryId: e.target.value })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Harga Normal (Rp)
                <input
                  type="number"
                  required
                  min={0}
                  value={editingProduct.price ?? 0}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, price: Number(e.target.value) })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
                />
              </label>

              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Harga Diskon (Opsional)
                <input
                  type="number"
                  min={0}
                  value={editingProduct.discountPrice ?? ''}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      discountPrice: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
                />
              </label>

              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Harga Reseller (Rp, Opsional)
                <input
                  type="number"
                  min={0}
                  value={editingProduct.resellerPrice ?? ''}
                  placeholder={`Default -20%: ${formatIDR(
                    Math.min(
                      resolveProductEffectiveNormalPrice({
                        price: Number(editingProduct.price || 0),
                        discountPrice: editingProduct.discountPrice,
                      }),
                      calculateResellerPrice(Number(editingProduct.price || 0))
                    )
                  )}`}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      resellerPrice: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
                />
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-[#253449] pt-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProduct.resellerPriceEnabled !== false}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      resellerPriceEnabled: e.target.checked,
                    })
                  }
                  className="accent-[#102A43]"
                />
                Aktifkan Harga Khusus Reseller
              </label>

              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Kuota / Stok Digital
                <input
                  type="number"
                  required
                  min={0}
                  value={editingProduct.stock ?? 0}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, stock: Number(e.target.value) })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
                />
              </label>

              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Status Ketersediaan
                <select
                  value={editingProduct.availabilityStatus || 'available'}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      availabilityStatus: e.target.value as Product['availabilityStatus'],
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                >
                  <option value="available">Tersedia</option>
                  <option value="limited">Kuota Terbatas</option>
                  <option value="out_of_stock">Stok Habis</option>
                </select>
              </label>

              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Durasi Langganan / Lisensi
                <input
                  type="text"
                  value={editingProduct.subscriptionDuration || ''}
                  placeholder="Contoh: 1 Bulan / 1 Tahun / Lifetime"
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      subscriptionDuration: e.target.value,
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>

              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Badge
                <select
                  value={editingProduct.badge || ''}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      badge: e.target.value as Product['badge'],
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                >
                  <option value="">Tanpa Badge</option>
                  <option value="Best Seller">Best Seller</option>
                  <option value="New">New</option>
                  <option value="Promo">Promo</option>
                </select>
              </label>

              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Status Publikasi
                <select
                  value={
                    editingProduct.publicationStatus ||
                    (editingProduct.active === false ? 'inactive' : 'published')
                  }
                  onChange={(e) => {
                    const pub = e.target.value as 'draft' | 'published' | 'inactive';
                    setEditingProduct({
                      ...editingProduct,
                      publicationStatus: pub,
                      active: pub === 'published',
                    });
                  }}
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                >
                  <option value="published">Published (Tampil di Toko)</option>
                  <option value="draft">Draft (Hanya Pratinjau Admin)</option>
                  <option value="inactive">Nonaktif (Disembunyikan)</option>
                </select>
              </label>

              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Urutan Produk Unggulan
                <input
                  type="number"
                  min={1}
                  value={editingProduct.featuredOrder ?? 99}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      featuredOrder: Number(e.target.value),
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
                />
              </label>

              <label className="block space-y-1 text-xs font-semibold text-[#253449] sm:col-span-2">
                Label Tambahan (pisahkan dengan koma, contoh: Garansi Resmi, Instant)
                <input
                  type="text"
                  value={(editingProduct.labels || []).join(', ')}
                  onChange={(e) =>
                    setEditingProduct({
                      ...editingProduct,
                      labels: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-[#253449] block">
                Foto Produk Utama
              </span>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={editingProduct.imageUrl || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, imageUrl: e.target.value })
                  }
                  className="input-navy flex-1 rounded-xl px-3 py-2 text-xs"
                />
                <label className="btn-navy-outline inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingImage ? 'Mengunggah...' : 'Upload'}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingImage}
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      const url = await handleUploadImage(f, 'products');
                      if (url) setEditingProduct((prev) => (prev ? { ...prev, imageUrl: url } : prev));
                    }}
                  />
                </label>
              </div>
            </div>

            {editingProduct.id && (
              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Slug URL Produk
                <input
                  type="text"
                  value={editingProduct.slug || ''}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, slug: e.target.value })
                  }
                  placeholder="contoh: chatgpt-plus-1-bulan"
                  className="input-navy w-full rounded-xl px-3 py-2 text-xs font-mono-num font-normal"
                />
              </label>
            )}

            {/* Gallery Foto Tambahan */}
            <div className="space-y-2 p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#253449]">
                  Galeri Foto Produk ({(editingProduct.galleryUrls || []).length})
                </span>
                <label className="btn-navy-outline inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer">
                  <Upload className="w-3 h-3" />
                  {uploadingImage ? 'Mengunggah...' : 'Upload Foto Galeri'}
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingImage}
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (!f) return;
                      const url = await handleUploadImage(f, 'products');
                      if (url) {
                        setEditingProduct((prev) =>
                          prev
                            ? {
                                ...prev,
                                galleryUrls: [...(prev.galleryUrls || []), url],
                              }
                            : prev
                        );
                      }
                    }}
                  />
                </label>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGalleryUrl}
                  onChange={(e) => setNewGalleryUrl(e.target.value)}
                  placeholder="Tambah URL foto galeri (/uploads/... atau https://...)"
                  className="input-navy flex-1 rounded-lg px-3 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = newGalleryUrl.trim();
                    if (!clean) return;
                    setEditingProduct((prev) =>
                      prev
                        ? {
                            ...prev,
                            galleryUrls: [...(prev.galleryUrls || []), clean],
                          }
                        : prev
                    );
                    setNewGalleryUrl('');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#102A43] text-white text-xs font-semibold cursor-pointer"
                >
                  Tambah
                </button>
              </div>

              {(editingProduct.galleryUrls || []).length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {(editingProduct.galleryUrls || []).map((gUrl, gIdx) => (
                    <div
                      key={`${gUrl}-${gIdx}`}
                      className="relative group w-16 h-16 rounded-lg overflow-hidden border border-[#E5EAF0] bg-white"
                    >
                      <SafeImage
                        src={gUrl}
                        alt={`Galeri ${gIdx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setEditingProduct((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  galleryUrls: (prev.galleryUrls || []).filter((_, i) => i !== gIdx),
                                }
                              : prev
                          )
                        }
                        aria-label={`Hapus foto galeri ${gIdx + 1}`}
                        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center opacity-90 hover:opacity-100 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Deskripsi Produk
              <textarea
                rows={3}
                value={editingProduct.description || ''}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, description: e.target.value })
                }
                className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
              />
            </label>

            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Keunggulan / Fitur (1 baris per poin)
              <textarea
                rows={3}
                value={(editingProduct.benefits || []).join('\n')}
                placeholder="Akses penuh fitur Pro&#10;Akun private bergaransi&#10;Aktivasi cepat 5-15 menit"
                onChange={(e) =>
                  setEditingProduct({
                    ...editingProduct,
                    benefits: e.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
                className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
              />
            </label>

            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Panduan Aktivasi
              <textarea
                rows={2}
                value={editingProduct.activationGuide || ''}
                placeholder="Contoh: Cantumkan email akun di catatan checkout, lalu tunggu undangan resmi."
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, activationGuide: e.target.value })
                }
                className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
              />
            </label>

            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Informasi Tambahan
              <input
                type="text"
                value={editingProduct.additionalInfo || ''}
                onChange={(e) =>
                  setEditingProduct({ ...editingProduct, additionalInfo: e.target.value })
                }
                className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
              />
            </label>

            {/* Variants / Paket Durasi */}
            <div className="space-y-2 pt-2 border-t border-[#E5EAF0]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#253449]">
                  Variasi Paket / Durasi
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setVariantsDraft((prev) => [
                      ...prev,
                      { name: 'Paket 1 Bulan', priceDelta: 0, stock: 10, active: true },
                    ])
                  }
                  className="text-xs font-semibold text-[#244B75] hover:underline cursor-pointer"
                >
                  + Tambah Paket
                </button>
              </div>
              {variantsDraft.map((v, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={v.name || ''}
                    placeholder="Nama varian"
                    onChange={(e) => {
                      const next = [...variantsDraft];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setVariantsDraft(next);
                    }}
                    className="input-navy col-span-5 rounded-lg px-2.5 py-1.5 text-xs"
                  />
                  <input
                    type="number"
                    value={v.priceDelta ?? 0}
                    placeholder="Selisih harga"
                    onChange={(e) => {
                      const next = [...variantsDraft];
                      next[idx] = { ...next[idx], priceDelta: Number(e.target.value) };
                      setVariantsDraft(next);
                    }}
                    className="input-navy col-span-3 rounded-lg px-2.5 py-1.5 text-xs font-mono-num"
                  />
                  <input
                    type="number"
                    min={0}
                    value={v.stock ?? 0}
                    placeholder="Stok"
                    onChange={(e) => {
                      const next = [...variantsDraft];
                      next[idx] = { ...next[idx], stock: Number(e.target.value) };
                      setVariantsDraft(next);
                    }}
                    className="input-navy col-span-3 rounded-lg px-2.5 py-1.5 text-xs font-mono-num"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setVariantsDraft((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="col-span-1 text-rose-600 flex justify-center cursor-pointer"
                    aria-label="Hapus varian"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-5 pt-2 text-xs text-[#253449]">
              <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingProduct.active !== false}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, active: e.target.checked })
                  }
                  className="accent-[#102A43]"
                />
                Produk Aktif
              </label>
              <label className="inline-flex items-center gap-2 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(editingProduct.featured)}
                  onChange={(e) =>
                    setEditingProduct({ ...editingProduct, featured: e.target.checked })
                  }
                  className="accent-[#102A43]"
                />
                Tampilkan di Unggulan
              </label>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#E5EAF0]">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setEditingProduct(null)}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer"
              >
                Batal
              </NavyButton>
              <NavyButton
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan Produk'}
              </NavyButton>
            </div>
          </form>
        </div>
      )}

      {/* Category Modal */}
      {editingCategory && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={saveCategory}
            className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#102A43]">
                {editingCategory.id ? 'Edit Kategori' : 'Tambah Kategori'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="text-[#718096] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Nama Kategori
              <input
                type="text"
                required
                value={editingCategory.name || ''}
                onChange={(e) =>
                  setEditingCategory({ ...editingCategory, name: e.target.value })
                }
                className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
              />
            </label>
            {editingCategory.id && (
              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Slug URL Kategori
                <input
                  type="text"
                  value={editingCategory.slug || ''}
                  onChange={(e) =>
                    setEditingCategory({ ...editingCategory, slug: e.target.value })
                  }
                  placeholder="contoh: streaming-hiburan"
                  className="input-navy w-full rounded-xl px-3 py-2 text-xs font-mono-num font-normal"
                />
              </label>
            )}
            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Deskripsi Singkat
              <textarea
                rows={2}
                value={editingCategory.description || ''}
                onChange={(e) =>
                  setEditingCategory({ ...editingCategory, description: e.target.value })
                }
                className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Urutan Tampilan
              <input
                type="number"
                value={editingCategory.sortOrder ?? 1}
                onChange={(e) =>
                  setEditingCategory({
                    ...editingCategory,
                    sortOrder: Number(e.target.value),
                  })
                }
                className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
              />
            </label>
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={editingCategory.imageUrl || ''}
                onChange={(e) =>
                  setEditingCategory({ ...editingCategory, imageUrl: e.target.value })
                }
                placeholder="URL Gambar Kategori"
                className="input-navy flex-1 rounded-xl px-3 py-2 text-xs"
              />
              <label className="btn-navy-outline px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer">
                Upload
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const url = await handleUploadImage(f, 'categories');
                    if (url) setEditingCategory({ ...editingCategory, imageUrl: url });
                  }}
                />
              </label>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#253449] cursor-pointer">
              <input
                type="checkbox"
                checked={editingCategory.active !== false}
                onChange={(e) =>
                  setEditingCategory({ ...editingCategory, active: e.target.checked })
                }
                className="accent-[#102A43]"
              />
              Kategori Aktif
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setEditingCategory(null)}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer"
              >
                Batal
              </NavyButton>
              <NavyButton
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold cursor-pointer"
              >
                Simpan
              </NavyButton>
            </div>
          </form>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-semibold text-[#102A43]">Konfirmasi Hapus</h3>
            <p className="text-sm text-[#253449]">
              Apakah Anda yakin ingin menghapus{' '}
              {deleteTarget.type === 'product' ? 'produk' : 'kategori'}{' '}
              <span className="font-semibold text-[#102A43]">"{deleteTarget.name}"</span>? Data historis transaksi lama tetap terjaga.
            </p>
            {deleteTarget.type === 'category' &&
              products.some((p) => p.categoryId === deleteTarget.id) && (
                <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                  Pindahkan produk dalam kategori ini ke:
                  <select
                    value={reassignCategoryId}
                    onChange={(e) => setReassignCategoryId(e.target.value)}
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  >
                    <option value="">-- Pilih Kategori Tujuan (Wajib jika masih ada produk) --</option>
                    {categories
                      .filter((c) => c.id !== deleteTarget.id)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
            <div className="flex justify-end gap-2">
              <NavyButton
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={() => {
                  setDeleteTarget(null);
                  setReassignCategoryId('');
                }}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer"
              >
                Batal
              </NavyButton>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                {deleting ? 'Memproses...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
