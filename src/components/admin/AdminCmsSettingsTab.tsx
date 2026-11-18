import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Edit,
  Globe,
  Image as ImageIcon,
  Layout,
  Menu,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Shield,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import type {
  Banner,
  NavigationMenuItem,
  SiteContent,
  StoreAdvantage,
  StoreFaq,
  StoreSettings,
} from '../../shared/types';
import { SafeImage } from '../SafeImage';
import { NavyButton } from '../Interactive';

const DEFAULT_BANNER_IMG = '/src/assets/images/hero_clean_digital_1794609262378.jpg';

const ICON_OPTIONS = [
  'Zap',
  'QrCode',
  'ShieldCheck',
  'Receipt',
  'MessageCircle',
  'ShoppingBag',
  'Package',
];

type CmsSubTab = 'profile' | 'homepage' | 'banners' | 'content' | 'navigation';

export function AdminCmsSettingsTab() {
  const { getAuthHeader, showToast, refreshStorefront, subscribeRealtime } = useStore();

  const [subTab, setSubTab] = useState<CmsSubTab>('profile');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingTarget, setSavingTarget] = useState<string | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [content, setContent] = useState<SiteContent | null>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [navigationMenus, setNavigationMenus] = useState<NavigationMenuItem[]>([]);

  // Banner modal & delete dialog
  const [editingBanner, setEditingBanner] = useState<Partial<Banner> | null>(null);
  const [deleteBannerTarget, setDeleteBannerTarget] = useState<Banner | null>(null);
  const [deletingBanner, setDeletingBanner] = useState(false);

  const loadCms = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setLoadError(null);
      }
      try {
        const headers = await getAuthHeader();
        const res = await fetch('/api/admin/cms', {
          headers,
          credentials: 'include',
          cache: 'no-store',
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json) {
          throw new Error(json?.error || 'Gagal memuat data konten & profil toko.');
        }
        setSettings(json.storeSettings);
        setContent(json.siteContent);
        setBanners(json.banners || []);
        setNavigationMenus(json.navigationMenus || []);
      } catch (err) {
        if (!silent) {
          const msg = err instanceof Error ? err.message : 'Gagal memuat data CMS.';
          setLoadError(msg);
          showToast(msg, 'error');
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
    loadCms();
  }, [loadCms]);

  useEffect(() => {
    return subscribeRealtime(['cms', 'storefront'], () => {
      loadCms(true);
    });
  }, [subscribeRealtime, loadCms]);

  const uploadImage = async (file: File, folder: string, fieldKey: string): Promise<string | null> => {
    setUploadingField(fieldKey);
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
        showToast(json?.error || 'Gagal mengunggah gambar ke server.', 'error');
        return null;
      }
      showToast('Gambar berhasil diunggah. Jangan lupa klik Simpan untuk menerapkannya.', 'info');
      return String(json.url);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat mengunggah gambar.',
        'error'
      );
      return null;
    } finally {
      setUploadingField(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSavingTarget('settings');
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          storeName: settings.storeName,
          tagline: settings.tagline,
          seoTitle: settings.seoTitle,
          seoDescription: settings.seoDescription,
          logoUrl: settings.logoUrl,
          faviconUrl: settings.faviconUrl,
          whatsappNumber: settings.whatsappNumber,
          email: settings.email,
          address: settings.address,
          operatingHours: settings.operatingHours,
          taxPercent: settings.taxPercent,
          maintenanceMode: Boolean(settings.maintenanceMode),
          reviewsEnabled: Boolean(settings.reviewsEnabled),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.storeSettings) {
        showToast(json?.error || 'Gagal menyimpan pengaturan toko.', 'error');
        return;
      }
      setSettings(json.storeSettings);
      showToast('Profil toko, kontak & pengaturan SEO berhasil disimpan permanen.', 'success');
      await refreshStorefront({ silent: true });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menghubungi server saat menyimpan pengaturan.',
        'error'
      );
    } finally {
      setSavingTarget(null);
    }
  };

  const handleSaveContent = async (e: React.FormEvent, targetKey: string) => {
    e.preventDefault();
    if (!content) return;
    setSavingTarget(targetKey);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/admin/content', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(content),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.siteContent) {
        showToast(json?.error || 'Gagal menyimpan konten website.', 'error');
        return;
      }
      setContent(json.siteContent);
      showToast('Konten website publik berhasil disimpan permanen ke database.', 'success');
      await refreshStorefront({ silent: true });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menghubungi server saat menyimpan konten.',
        'error'
      );
    } finally {
      setSavingTarget(null);
    }
  };

  const handleSaveNavigation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTarget('navigation');
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/admin/navigation', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({ navigationMenus }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.navigationMenus) {
        showToast(json?.error || 'Gagal menyimpan menu navigasi.', 'error');
        return;
      }
      setNavigationMenus(json.navigationMenus);
      showToast('Menu navigasi header & footer berhasil diperbarui.', 'success');
      await refreshStorefront({ silent: true });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menghubungi server saat menyimpan navigasi.',
        'error'
      );
    } finally {
      setSavingTarget(null);
    }
  };

  const handleSaveBanner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBanner) return;
    setSavingTarget('banner');
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const isEdit = Boolean(editingBanner.id);
      const res = await fetch(
        isEdit ? `/api/admin/banners/${editingBanner.id}` : '/api/admin/banners',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(editingBanner),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.banner) {
        showToast(json?.error || 'Gagal menyimpan banner promo.', 'error');
        return;
      }
      showToast(
        isEdit ? 'Banner promo berhasil diperbarui.' : 'Banner promo baru berhasil dibuat.',
        'success'
      );
      setEditingBanner(null);
      await loadCms(true);
      await refreshStorefront({ silent: true });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menghubungi server saat menyimpan banner.',
        'error'
      );
    } finally {
      setSavingTarget(null);
    }
  };

  const handleConfirmDeleteBanner = async () => {
    if (!deleteBannerTarget) return;
    setDeletingBanner(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`/api/admin/banners/${deleteBannerTarget.id}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal menghapus banner promo.', 'error');
        return;
      }
      showToast(`Banner "${deleteBannerTarget.headline}" berhasil dihapus.`, 'success');
      setDeleteBannerTarget(null);
      await loadCms(true);
      await refreshStorefront({ silent: true });
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Gagal menghapus banner promo.',
        'error'
      );
    } finally {
      setDeletingBanner(false);
    }
  };

  const updateHomepageSection = (
    key: string,
    patch: Partial<{
      enabled: boolean;
      sortOrder: number;
      title: string;
      subtitle: string;
      maxItems: number;
      primaryCtaLink: string;
      secondaryCtaLink: string;
      backgroundStyle: 'white' | 'soft_navy';
    }>
  ) => {
    if (!content) return;
    const prev = content.homepageSections || {};
    setContent({
      ...content,
      homepageSections: {
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          ...patch,
        },
      },
    });
  };

  if (loading && (!settings || !content)) {
    return (
      <div className="h-72 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
    );
  }

  if (loadError && (!settings || !content)) {
    return (
      <div className="surface-card rounded-2xl p-6 border border-rose-200 bg-rose-50/60 space-y-3">
        <div className="flex items-center gap-2 text-rose-800 text-sm font-semibold">
          <AlertCircle className="w-4 h-4" />
          <span>{loadError}</span>
        </div>
        <NavyButton
          type="button"
          onClick={() => loadCms()}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Muat Ulang
        </NavyButton>
      </div>
    );
  }

  if (!settings || !content) return null;

  const subTabs: Array<{ id: CmsSubTab; label: string; icon: React.ReactNode }> = [
    { id: 'profile', label: 'Profil Toko & SEO', icon: <Settings className="w-3.5 h-3.5" /> },
    { id: 'homepage', label: 'Hero & Beranda', icon: <Layout className="w-3.5 h-3.5" /> },
    { id: 'banners', label: `Banner (${banners.length})`, icon: <ImageIcon className="w-3.5 h-3.5" /> },
    { id: 'content', label: 'FAQ, Footer & Kebijakan', icon: <Shield className="w-3.5 h-3.5" /> },
    { id: 'navigation', label: 'Menu Navigasi', icon: <Menu className="w-3.5 h-3.5" /> },
  ];

  const heroSec = content.homepageSections?.hero || {};
  const catSec = content.homepageSections?.categoriesSection || {};
  const featSec = content.homepageSections?.featuredSection || {};
  const banSec = content.homepageSections?.bannersSection || {};
  const advSec = content.homepageSections?.advantagesSection || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#102A43]">
            Konten Website, Profil Toko &amp; SEO
          </h2>
          <p className="text-xs text-[#718096]">
            Setiap perubahan profil toko, hero, banner, FAQ, navigasi, logo, dan kebijakan tersimpan permanen ke database.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
          {subTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                subTab === t.id
                  ? 'bg-[#102A43] text-white'
                  : 'text-[#718096] hover:text-[#102A43]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* 1. PROFIL TOKO, KONTAK & SEO */}
      {subTab === 'profile' && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 surface-card rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-semibold text-[#102A43] flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#244B75]" />
                Identitas, Kontak &amp; Metadata SEO
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="block space-y-1 font-semibold text-[#253449]">
                  Nama Toko
                  <input
                    type="text"
                    required
                    value={settings.storeName}
                    onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449]">
                  Tagline Toko
                  <input
                    type="text"
                    value={settings.tagline || ''}
                    onChange={(e) => setSettings({ ...settings, tagline: e.target.value })}
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449] sm:col-span-2">
                  Judul SEO (Browser Title &amp; OpenGraph)
                  <input
                    type="text"
                    value={settings.seoTitle || ''}
                    onChange={(e) => setSettings({ ...settings, seoTitle: e.target.value })}
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449] sm:col-span-2">
                  Deskripsi Meta SEO
                  <textarea
                    rows={2}
                    value={settings.seoDescription || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, seoDescription: e.target.value })
                    }
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449]">
                  WhatsApp Resmi Admin (628...)
                  <input
                    type="text"
                    value={settings.whatsappNumber}
                    onChange={(e) =>
                      setSettings({ ...settings, whatsappNumber: e.target.value })
                    }
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449]">
                  Email Layanan Pelanggan
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449]">
                  Jam Operasional
                  <input
                    type="text"
                    value={settings.operatingHours}
                    onChange={(e) =>
                      setSettings({ ...settings, operatingHours: e.target.value })
                    }
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449]">
                  Pajak / Biaya Layanan (%)
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step="0.5"
                    value={settings.taxPercent}
                    onChange={(e) =>
                      setSettings({ ...settings, taxPercent: Number(e.target.value) })
                    }
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449] sm:col-span-2">
                  Lokasi / Alamat Layanan
                  <input
                    type="text"
                    value={settings.address}
                    onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>
              </div>

              <div className="pt-2 space-y-2 border-t border-[#E5EAF0]">
                <label className="flex items-center gap-2.5 text-xs font-medium text-[#102A43] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(settings.maintenanceMode)}
                    onChange={(e) =>
                      setSettings({ ...settings, maintenanceMode: e.target.checked })
                    }
                    className="accent-[#102A43] w-4 h-4"
                  />
                  Aktifkan Mode Pemeliharaan Toko (Menampilkan banner pemberitahuan di situs publik)
                </label>
                <label className="flex items-center gap-2.5 text-xs font-medium text-[#102A43] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.reviewsEnabled !== false}
                    onChange={(e) =>
                      setSettings({ ...settings, reviewsEnabled: e.target.checked })
                    }
                    className="accent-[#102A43] w-4 h-4"
                  />
                  Tampilkan Rating &amp; Ulasan Produk pada Katalog Publik
                </label>
              </div>
            </div>

            <div className="lg:col-span-5 surface-card rounded-2xl p-6 space-y-5">
              <h3 className="text-base font-semibold text-[#102A43] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#244B75]" />
                Logo Toko &amp; Favicon
              </h3>

              {/* Logo Upload */}
              <div className="space-y-2 p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-[#253449]">Logo Toko</span>
                  {settings.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, logoUrl: '' })}
                      className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                    >
                      Hapus Logo
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {settings.logoUrl ? (
                    <SafeImage
                      src={settings.logoUrl}
                      alt="Logo Toko"
                      className="w-12 h-12 rounded-xl object-cover border border-[#E5EAF0] bg-white shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-[#102A43] text-white font-bold flex items-center justify-center text-sm shrink-0">
                      {settings.storeName.slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      value={settings.logoUrl || ''}
                      placeholder="URL Logo (atau unggah)"
                      onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
                      className="input-navy flex-1 rounded-xl px-3 py-2 text-xs"
                    />
                    <label className="btn-navy-outline inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingField === 'logo' ? '...' : 'Upload'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingField === 'logo'}
                        className="sr-only"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (!f) return;
                          const url = await uploadImage(f, 'branding', 'logo');
                          if (url) setSettings((prev) => (prev ? { ...prev, logoUrl: url } : prev));
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Favicon Upload */}
              <div className="space-y-2 p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-[#253449]">Favicon Browser</span>
                  {settings.faviconUrl && (
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, faviconUrl: '' })}
                      className="text-[11px] font-semibold text-rose-600 hover:underline cursor-pointer"
                    >
                      Reset Default
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {settings.faviconUrl ? (
                    <SafeImage
                      src={settings.faviconUrl}
                      alt="Favicon"
                      className="w-10 h-10 rounded-lg object-cover border border-[#E5EAF0] bg-white shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-[#EAF2FA] text-[#102A43] font-bold flex items-center justify-center text-xs shrink-0">
                      ICO
                    </div>
                  )}
                  <div className="flex-1 flex gap-2">
                    <input
                      type="text"
                      value={settings.faviconUrl || ''}
                      placeholder="URL Favicon (PNG/WEBP)"
                      onChange={(e) => setSettings({ ...settings, faviconUrl: e.target.value })}
                      className="input-navy flex-1 rounded-xl px-3 py-2 text-xs"
                    />
                    <label className="btn-navy-outline inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingField === 'favicon' ? '...' : 'Upload'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingField === 'favicon'}
                        className="sr-only"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          e.target.value = '';
                          if (!f) return;
                          const url = await uploadImage(f, 'branding', 'favicon');
                          if (url)
                            setSettings((prev) => (prev ? { ...prev, faviconUrl: url } : prev));
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <NavyButton
                  type="submit"
                  disabled={savingTarget === 'settings'}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-60"
                >
                  <Save className="w-4 h-4" />
                  {savingTarget === 'settings' ? 'Menyimpan...' : 'Simpan Profil Toko & SEO'}
                </NavyButton>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* 2. HERO, PENGUMUMAN & BAGIAN BERANDA */}
      {subTab === 'homepage' && (
        <form onSubmit={(e) => handleSaveContent(e, 'homepage')} className="space-y-6">
          <div className="surface-card rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5EAF0] pb-4">
              <div>
                <h3 className="text-base font-semibold text-[#102A43]">
                  Hero Banner &amp; Pengumuman Utama
                </h3>
                <p className="text-xs text-[#718096]">
                  Atur headline, subjudul, gambar hero, tombol CTA, dan bar pengumuman di bagian paling atas situs.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold text-[#102A43]">
                Status Beranda:
                <select
                  value={content.homepageStatus || 'published'}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      homepageStatus: e.target.value as 'published' | 'inactive',
                    })
                  }
                  className="input-navy rounded-xl px-3 py-1.5 text-xs font-semibold"
                >
                  <option value="published">Published (Tampil Publik)</option>
                  <option value="inactive">Nonaktif (Mode Pembaruan)</option>
                </select>
              </label>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] space-y-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-[#102A43] cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(content.announcementEnabled)}
                  onChange={(e) =>
                    setContent({ ...content, announcementEnabled: e.target.checked })
                  }
                  className="accent-[#102A43] w-4 h-4"
                />
                Tampilkan Announcement Bar di Atas Navbar
              </label>
              <input
                type="text"
                value={content.announcementText || ''}
                onChange={(e) => setContent({ ...content, announcementText: e.target.value })}
                placeholder="Teks pengumuman promo..."
                className="input-navy w-full rounded-xl px-3.5 py-2 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="block space-y-1 font-semibold text-[#253449] sm:col-span-2">
                  Sub-Headline Hero
                  <input
                    type="text"
                    value={content.heroSubheadline}
                    onChange={(e) => setContent({ ...content, heroSubheadline: e.target.value })}
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449] sm:col-span-2">
                  Headline Hero Utama
                  <input
                    type="text"
                    required
                    value={content.heroHeadline}
                    onChange={(e) => setContent({ ...content, heroHeadline: e.target.value })}
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449] sm:col-span-2">
                  Deskripsi Hero
                  <textarea
                    rows={3}
                    value={content.heroDescription}
                    onChange={(e) => setContent({ ...content, heroDescription: e.target.value })}
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449]">
                  Label CTA Utama
                  <input
                    type="text"
                    value={content.heroPrimaryCtaLabel}
                    onChange={(e) =>
                      setContent({ ...content, heroPrimaryCtaLabel: e.target.value })
                    }
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449]">
                  Link CTA Utama
                  <input
                    type="text"
                    value={heroSec.primaryCtaLink || '/produk'}
                    onChange={(e) =>
                      updateHomepageSection('hero', { primaryCtaLink: e.target.value })
                    }
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449]">
                  Label CTA Sekunder
                  <input
                    type="text"
                    value={content.heroSecondaryCtaLabel}
                    onChange={(e) =>
                      setContent({ ...content, heroSecondaryCtaLabel: e.target.value })
                    }
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>

                <label className="block space-y-1 font-semibold text-[#253449]">
                  Link CTA Sekunder
                  <input
                    type="text"
                    value={heroSec.secondaryCtaLink || '#produk-unggulan'}
                    onChange={(e) =>
                      updateHomepageSection('hero', { secondaryCtaLink: e.target.value })
                    }
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>
              </div>

              <div className="lg:col-span-5 space-y-3">
                <span className="text-xs font-semibold text-[#253449] block">
                  Gambar Showcase Hero
                </span>
                <div className="aspect-[16/10] rounded-xl overflow-hidden border border-[#E5EAF0] bg-[#F8FAFC]">
                  <SafeImage
                    src={content.heroImageUrl}
                    alt="Preview Hero"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={content.heroImageUrl}
                    onChange={(e) => setContent({ ...content, heroImageUrl: e.target.value })}
                    className="input-navy flex-1 rounded-xl px-3 py-2 text-xs"
                  />
                  <label className="btn-navy-outline inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingField === 'hero' ? '...' : 'Upload'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingField === 'hero'}
                      className="sr-only"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        const url = await uploadImage(f, 'cms', 'hero');
                        if (url) setContent((prev) => (prev ? { ...prev, heroImageUrl: url } : prev));
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Homepage Sections Configuration */}
            <div className="pt-4 border-t border-[#E5EAF0] space-y-3">
              <h4 className="text-sm font-semibold text-[#102A43]">
                Judul &amp; Tampilan Bagian Beranda
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#102A43]">Bagian Kategori</span>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={catSec.enabled !== false}
                        onChange={(e) =>
                          updateHomepageSection('categoriesSection', { enabled: e.target.checked })
                        }
                        className="accent-[#102A43]"
                      />
                      Tampilkan
                    </label>
                  </div>
                  <input
                    type="text"
                    value={catSec.title || 'Kategori Produk'}
                    onChange={(e) =>
                      updateHomepageSection('categoriesSection', { title: e.target.value })
                    }
                    placeholder="Judul bagian"
                    className="input-navy w-full rounded-lg px-3 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={catSec.subtitle || ''}
                    onChange={(e) =>
                      updateHomepageSection('categoriesSection', { subtitle: e.target.value })
                    }
                    placeholder="Subjudul bagian"
                    className="input-navy w-full rounded-lg px-3 py-1.5 text-xs"
                  />
                </div>

                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#102A43]">Bagian Produk Unggulan</span>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={featSec.enabled !== false}
                        onChange={(e) =>
                          updateHomepageSection('featuredSection', { enabled: e.target.checked })
                        }
                        className="accent-[#102A43]"
                      />
                      Tampilkan
                    </label>
                  </div>
                  <input
                    type="text"
                    value={featSec.title || 'Produk Unggulan'}
                    onChange={(e) =>
                      updateHomepageSection('featuredSection', { title: e.target.value })
                    }
                    placeholder="Judul bagian"
                    className="input-navy w-full rounded-lg px-3 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={featSec.subtitle || ''}
                    onChange={(e) =>
                      updateHomepageSection('featuredSection', { subtitle: e.target.value })
                    }
                    placeholder="Subjudul bagian"
                    className="input-navy w-full rounded-lg px-3 py-1.5 text-xs"
                  />
                </div>

                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#102A43]">Bagian Banner Promo</span>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={banSec.enabled !== false}
                        onChange={(e) =>
                          updateHomepageSection('bannersSection', { enabled: e.target.checked })
                        }
                        className="accent-[#102A43]"
                      />
                      Tampilkan
                    </label>
                  </div>
                  <input
                    type="text"
                    value={banSec.title || 'Program Kemitraan Reseller Resmi'}
                    onChange={(e) =>
                      updateHomepageSection('bannersSection', { title: e.target.value })
                    }
                    placeholder="Label atas banner"
                    className="input-navy w-full rounded-lg px-3 py-1.5 text-xs"
                  />
                </div>

                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[#102A43]">Bagian Keunggulan &amp; Tentang</span>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={advSec.enabled !== false}
                        onChange={(e) =>
                          updateHomepageSection('advantagesSection', { enabled: e.target.checked })
                        }
                        className="accent-[#102A43]"
                      />
                      Tampilkan
                    </label>
                  </div>
                  <input
                    type="text"
                    value={content.aboutTitle}
                    onChange={(e) => setContent({ ...content, aboutTitle: e.target.value })}
                    placeholder="Judul keunggulan"
                    className="input-navy w-full rounded-lg px-3 py-1.5 text-xs"
                  />
                  <input
                    type="text"
                    value={content.aboutDescription}
                    onChange={(e) =>
                      setContent({ ...content, aboutDescription: e.target.value })
                    }
                    placeholder="Deskripsi singkat toko"
                    className="input-navy w-full rounded-lg px-3 py-1.5 text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <NavyButton
                type="submit"
                disabled={savingTarget === 'homepage'}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {savingTarget === 'homepage' ? 'Menyimpan...' : 'Simpan Perubahan Beranda'}
              </NavyButton>
            </div>
          </div>
        </form>
      )}

      {/* 3. BANNER PROMO CRUD */}
      {subTab === 'banners' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#718096]">
              Kelola banner promosi beranda dan gambar unggah permanen.
            </p>
            <NavyButton
              type="button"
              onClick={() =>
                setEditingBanner({
                  headline: '',
                  subheadline: '',
                  description: '',
                  imageUrl: DEFAULT_BANNER_IMG,
                  ctaLabel: 'Lihat Promo',
                  ctaLink: '/produk',
                  active: true,
                })
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Tambah Banner Baru
            </NavyButton>
          </div>

          {banners.length === 0 ? (
            <div className="surface-card rounded-2xl p-8 text-center text-sm text-[#718096]">
              Belum ada banner promo kustom. Klik &ldquo;Tambah Banner Baru&rdquo; untuk membuat banner beranda.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {banners.map((b) => (
                <div
                  key={b.id}
                  className="surface-card rounded-2xl overflow-hidden flex flex-col sm:flex-row"
                >
                  <div className="sm:w-44 h-36 sm:h-auto bg-[#F8FAFC] border-b sm:border-b-0 sm:border-r border-[#E5EAF0] shrink-0">
                    <SafeImage
                      src={b.imageUrl}
                      alt={b.headline}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            b.active
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {b.active ? 'Aktif' : 'Nonaktif'}
                        </span>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingBanner({ ...b })}
                            aria-label={`Edit banner ${b.headline}`}
                            className="p-1.5 rounded-lg bg-[#EAF2FA] text-[#102A43] cursor-pointer"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteBannerTarget(b)}
                            aria-label={`Hapus banner ${b.headline}`}
                            className="p-1.5 rounded-lg bg-rose-50 text-rose-700 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <h4 className="font-semibold text-sm text-[#102A43]">{b.headline}</h4>
                      {(b.subheadline || b.description) && (
                        <p className="text-xs text-[#718096] line-clamp-2">
                          {b.subheadline || b.description}
                        </p>
                      )}
                    </div>
                    <p className="text-[11px] font-mono-num text-[#244B75]">
                      CTA: {b.ctaLabel} ({b.ctaLink})
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. KEUNGGULAN, FAQ, FOOTER, SOSIAL MEDIA & KEBIJAKAN */}
      {subTab === 'content' && (
        <form onSubmit={(e) => handleSaveContent(e, 'content')} className="space-y-6">
          {/* Advantages */}
          <div className="surface-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#102A43]">Keunggulan Toko</h3>
              <button
                type="button"
                onClick={() =>
                  setContent({
                    ...content,
                    advantages: [
                      ...(content.advantages || []),
                      {
                        id: `adv-${Date.now().toString().slice(-5)}`,
                        title: 'Layanan Baru',
                        description: 'Deskripsi keunggulan...',
                        iconName: 'ShieldCheck',
                      } satisfies StoreAdvantage,
                    ],
                  })
                }
                className="text-xs font-semibold text-[#244B75] hover:underline cursor-pointer"
              >
                + Tambah Keunggulan
              </button>
            </div>
            <div className="space-y-3">
              {(content.advantages || []).map((adv, idx) => (
                <div
                  key={adv.id || idx}
                  className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-start text-xs"
                >
                  <select
                    value={adv.iconName}
                    onChange={(e) => {
                      const next = [...content.advantages];
                      next[idx] = { ...adv, iconName: e.target.value };
                      setContent({ ...content, advantages: next });
                    }}
                    className="input-navy sm:col-span-2 rounded-lg px-2 py-2"
                  >
                    {ICON_OPTIONS.map((ic) => (
                      <option key={ic} value={ic}>
                        {ic}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={adv.title}
                    onChange={(e) => {
                      const next = [...content.advantages];
                      next[idx] = { ...adv, title: e.target.value };
                      setContent({ ...content, advantages: next });
                    }}
                    placeholder="Judul keunggulan"
                    className="input-navy sm:col-span-4 rounded-lg px-2.5 py-2 font-semibold"
                  />
                  <input
                    type="text"
                    value={adv.description}
                    onChange={(e) => {
                      const next = [...content.advantages];
                      next[idx] = { ...adv, description: e.target.value };
                      setContent({ ...content, advantages: next });
                    }}
                    placeholder="Deskripsi"
                    className="input-navy sm:col-span-5 rounded-lg px-2.5 py-2"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setContent({
                        ...content,
                        advantages: content.advantages.filter((_, i) => i !== idx),
                      })
                    }
                    className="sm:col-span-1 p-2 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer flex justify-center"
                    aria-label="Hapus keunggulan"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* FAQs */}
          <div className="surface-card rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[#102A43]">Pertanyaan Umum (FAQ)</h3>
              <button
                type="button"
                onClick={() =>
                  setContent({
                    ...content,
                    faqs: [
                      ...(content.faqs || []),
                      {
                        id: `faq-${Date.now().toString().slice(-5)}`,
                        question: '',
                        answer: '',
                      } satisfies StoreFaq,
                    ],
                  })
                }
                className="text-xs font-semibold text-[#244B75] hover:underline cursor-pointer"
              >
                + Tambah FAQ
              </button>
            </div>
            <div className="space-y-3">
              {(content.faqs || []).map((faq, idx) => (
                <div
                  key={faq.id || idx}
                  className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] space-y-2 text-xs"
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={faq.question}
                      onChange={(e) => {
                        const next = [...content.faqs];
                        next[idx] = { ...faq, question: e.target.value };
                        setContent({ ...content, faqs: next });
                      }}
                      placeholder="Pertanyaan"
                      className="input-navy flex-1 rounded-lg px-3 py-2 font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setContent({
                          ...content,
                          faqs: content.faqs.filter((_, i) => i !== idx),
                        })
                      }
                      className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                      aria-label="Hapus FAQ"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={faq.answer}
                    onChange={(e) => {
                      const next = [...content.faqs];
                      next[idx] = { ...faq, answer: e.target.value };
                      setContent({ ...content, faqs: next });
                    }}
                    placeholder="Jawaban lengkap"
                    className="input-navy w-full rounded-lg px-3 py-2"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Footer, Social & Legal Policies */}
          <div className="surface-card rounded-2xl p-6 space-y-4 text-xs">
            <h3 className="text-base font-semibold text-[#102A43]">
              Footer, Sosial Media &amp; Halaman Kebijakan
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1 font-semibold text-[#253449] sm:col-span-2">
                Deskripsi Singkat Footer
                <textarea
                  rows={2}
                  value={content.footerDescription}
                  onChange={(e) =>
                    setContent({ ...content, footerDescription: e.target.value })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>

              <label className="block space-y-1 font-semibold text-[#253449]">
                Teks Hak Cipta Footer
                <input
                  type="text"
                  value={content.footerCopyright}
                  onChange={(e) => setContent({ ...content, footerCopyright: e.target.value })}
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>

              <label className="block space-y-1 font-semibold text-[#253449]">
                Instagram URL
                <input
                  type="text"
                  value={content.socialLinks?.instagram || ''}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      socialLinks: { ...(content.socialLinks || {}), instagram: e.target.value },
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>

              <label className="block space-y-1 font-semibold text-[#253449]">
                TikTok URL
                <input
                  type="text"
                  value={content.socialLinks?.tiktok || ''}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      socialLinks: { ...(content.socialLinks || {}), tiktok: e.target.value },
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>

              <label className="block space-y-1 font-semibold text-[#253449]">
                Telegram URL
                <input
                  type="text"
                  value={content.socialLinks?.telegram || ''}
                  onChange={(e) =>
                    setContent({
                      ...content,
                      socialLinks: { ...(content.socialLinks || {}), telegram: e.target.value },
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>

              <label className="block space-y-1 font-semibold text-[#253449] sm:col-span-2">
                Kebijakan Privasi
                <textarea
                  rows={3}
                  value={content.privacyPolicy}
                  onChange={(e) => setContent({ ...content, privacyPolicy: e.target.value })}
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>

              <label className="block space-y-1 font-semibold text-[#253449] sm:col-span-2">
                Syarat &amp; Ketentuan
                <textarea
                  rows={3}
                  value={content.termsConditions}
                  onChange={(e) => setContent({ ...content, termsConditions: e.target.value })}
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>

              <label className="block space-y-1 font-semibold text-[#253449] sm:col-span-2">
                Kebijakan Pengembalian &amp; Garansi
                <textarea
                  rows={3}
                  value={content.returnPolicy}
                  onChange={(e) => setContent({ ...content, returnPolicy: e.target.value })}
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <NavyButton
                type="submit"
                disabled={savingTarget === 'content'}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {savingTarget === 'content' ? 'Menyimpan...' : 'Simpan Konten, FAQ & Kebijakan'}
              </NavyButton>
            </div>
          </div>
        </form>
      )}

      {/* 5. MENU NAVIGASI HEADER & FOOTER */}
      {subTab === 'navigation' && (
        <form onSubmit={handleSaveNavigation} className="surface-card rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-[#102A43]">
                Menu Navigasi Header &amp; Footer
              </h3>
              <p className="text-xs text-[#718096]">
                Atur tautan navigasi publik yang muncul pada Navbar atas dan kolom Footer.
              </p>
            </div>
            <NavyButton
              type="button"
              variant="outline"
              onClick={() =>
                setNavigationMenus((prev) => [
                  ...prev,
                  {
                    id: `nav-${Date.now().toString().slice(-5)}`,
                    label: 'Menu Baru',
                    href: '/produk',
                    location: 'header',
                    group: 'main',
                    openInNewTab: false,
                    sortOrder: prev.length + 1,
                    active: true,
                  },
                ])
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Tambah Tautan
            </NavyButton>
          </div>

          <div className="space-y-2.5 text-xs">
            {navigationMenus.map((item, idx) => (
              <div
                key={item.id}
                className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center"
              >
                <input
                  type="text"
                  required
                  value={item.label}
                  onChange={(e) => {
                    const next = [...navigationMenus];
                    next[idx] = { ...item, label: e.target.value };
                    setNavigationMenus(next);
                  }}
                  placeholder="Label menu"
                  className="input-navy md:col-span-3 rounded-lg px-2.5 py-1.5 font-semibold"
                />
                <input
                  type="text"
                  required
                  value={item.href}
                  onChange={(e) => {
                    const next = [...navigationMenus];
                    next[idx] = { ...item, href: e.target.value };
                    setNavigationMenus(next);
                  }}
                  placeholder="/produk atau https://..."
                  className="input-navy md:col-span-3 rounded-lg px-2.5 py-1.5 font-mono-num"
                />
                <select
                  value={item.location}
                  onChange={(e) => {
                    const next = [...navigationMenus];
                    next[idx] = {
                      ...item,
                      location: e.target.value as 'header' | 'footer',
                    };
                    setNavigationMenus(next);
                  }}
                  className="input-navy md:col-span-2 rounded-lg px-2 py-1.5"
                >
                  <option value="header">Header (Navbar)</option>
                  <option value="footer">Footer</option>
                </select>
                <select
                  value={item.group || 'main'}
                  onChange={(e) => {
                    const next = [...navigationMenus];
                    next[idx] = { ...item, group: e.target.value as 'main' | 'portal' };
                    setNavigationMenus(next);
                  }}
                  className="input-navy md:col-span-2 rounded-lg px-2 py-1.5"
                >
                  <option value="main">Grup Utama</option>
                  <option value="portal">Grup Portal/Kebijakan</option>
                </select>
                <div className="md:col-span-2 flex items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.active}
                      onChange={(e) => {
                        const next = [...navigationMenus];
                        next[idx] = { ...item, active: e.target.checked };
                        setNavigationMenus(next);
                      }}
                      className="accent-[#102A43]"
                    />
                    Aktif
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setNavigationMenus((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                    aria-label={`Hapus menu ${item.label}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <NavyButton
              type="submit"
              disabled={savingTarget === 'navigation'}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {savingTarget === 'navigation' ? 'Menyimpan...' : 'Simpan Menu Navigasi'}
            </NavyButton>
          </div>
        </form>
      )}

      {/* Banner Create/Edit Modal */}
      {editingBanner && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <form
            onSubmit={handleSaveBanner}
            className="surface-card rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#102A43]">
                {editingBanner.id ? 'Edit Banner Promo' : 'Tambah Banner Promo'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingBanner(null)}
                className="text-[#718096] hover:text-[#102A43] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block space-y-1 font-semibold text-[#253449]">
                Headline Banner
                <input
                  type="text"
                  required
                  value={editingBanner.headline || ''}
                  onChange={(e) =>
                    setEditingBanner({ ...editingBanner, headline: e.target.value })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>

              <label className="block space-y-1 font-semibold text-[#253449]">
                Subheadline / Deskripsi Singkat
                <textarea
                  rows={2}
                  value={editingBanner.subheadline || editingBanner.description || ''}
                  onChange={(e) =>
                    setEditingBanner({
                      ...editingBanner,
                      subheadline: e.target.value,
                      description: e.target.value,
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 font-semibold text-[#253449]">
                  Teks Tombol (CTA)
                  <input
                    type="text"
                    value={editingBanner.ctaLabel || ''}
                    onChange={(e) =>
                      setEditingBanner({ ...editingBanner, ctaLabel: e.target.value })
                    }
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>
                <label className="block space-y-1 font-semibold text-[#253449]">
                  Link Tujuan CTA
                  <input
                    type="text"
                    value={editingBanner.ctaLink || '/produk'}
                    onChange={(e) =>
                      setEditingBanner({ ...editingBanner, ctaLink: e.target.value })
                    }
                    className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                  />
                </label>
              </div>

              <div className="space-y-1.5">
                <span className="font-semibold text-[#253449] block">Gambar Banner</span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editingBanner.imageUrl || ''}
                    onChange={(e) =>
                      setEditingBanner({ ...editingBanner, imageUrl: e.target.value })
                    }
                    className="input-navy flex-1 rounded-xl px-3 py-2 text-xs font-normal"
                  />
                  <label className="btn-navy-outline inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer">
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingField === 'banner' ? '...' : 'Upload'}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploadingField === 'banner'}
                      className="sr-only"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = '';
                        if (!f) return;
                        const url = await uploadImage(f, 'banners', 'banner');
                        if (url)
                          setEditingBanner((prev) => (prev ? { ...prev, imageUrl: url } : prev));
                      }}
                    />
                  </label>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 font-medium text-[#253449] cursor-pointer">
                <input
                  type="checkbox"
                  checked={editingBanner.active !== false}
                  onChange={(e) =>
                    setEditingBanner({ ...editingBanner, active: e.target.checked })
                  }
                  className="accent-[#102A43]"
                />
                Tampilkan Banner di Beranda
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setEditingBanner(null)}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer"
              >
                Batal
              </NavyButton>
              <NavyButton
                type="submit"
                disabled={savingTarget === 'banner'}
                className="px-5 py-2 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                {savingTarget === 'banner' ? 'Menyimpan...' : 'Simpan Banner'}
              </NavyButton>
            </div>
          </form>
        </div>
      )}

      {/* Banner Delete Confirmation Dialog */}
      {deleteBannerTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-semibold text-[#102A43]">Hapus Banner Promo?</h3>
            <p className="text-sm text-[#253449]">
              Banner <span className="font-semibold text-[#102A43]">&ldquo;{deleteBannerTarget.headline}&rdquo;</span> akan dihapus permanen dari database dan beranda toko.
            </p>
            <div className="flex justify-end gap-2">
              <NavyButton
                type="button"
                variant="outline"
                disabled={deletingBanner}
                onClick={() => setDeleteBannerTarget(null)}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer"
              >
                Batal
              </NavyButton>
              <button
                type="button"
                disabled={deletingBanner}
                onClick={handleConfirmDeleteBanner}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                {deletingBanner ? 'Menghapus...' : 'Hapus Permanen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
