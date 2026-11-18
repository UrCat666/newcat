import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  History,
  Plus,
  QrCode,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatIDR } from '../../shared/pricing';
import type { QrisHistoryEntry, ShippingSetting, StoreSettings } from '../../shared/types';
import { NavyButton } from '../Interactive';

const MAX_QRIS_BYTES = 5 * 1024 * 1024;
const ALLOWED_QRIS_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function withVersionQuery(url: string, version?: number): string {
  if (!url) return '';
  if (url.includes('?')) return url;
  return `${url}?v=${version || 1}`;
}

export function AdminPaymentSettingsTab() {
  const { getAuthHeader, showToast, refreshStorefront, subscribeRealtime } = useStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [togglingSwitch, setTogglingSwitch] = useState(false);

  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null);
  const [qrisReady, setQrisReady] = useState(false);
  const [shippingSettings, setShippingSettings] = useState<ShippingSetting[]>([]);
  const [qrisHistory, setQrisHistory] = useState<QrisHistoryEntry[]>([]);
  const [changeNote, setChangeNote] = useState('');
  const [confirmRemoveQris, setConfirmRemoveQris] = useState(false);
  const [savingShippingId, setSavingShippingId] = useState<string | null>(null);

  // QRIS staging (preview-before-save) & upload progress
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (stagedPreviewUrl) {
        URL.revokeObjectURL(stagedPreviewUrl);
      }
    };
  }, [stagedPreviewUrl]);

  const clearStagedFile = useCallback(() => {
    setStagedFile(null);
    setStagedPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
    setUploadProgress(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const loadPaymentSettings = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const headers = await getAuthHeader();
        const res = await fetch('/api/admin/payment-settings', {
          headers,
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) {
          const json = await res.json();
          setStoreSettings(json.storeSettings);
          setQrisReady(Boolean(json.qrisReady));
          setShippingSettings(json.shippingSettings || []);
          setQrisHistory(json.qrisHistory || []);
        } else if (!silent) {
          showToast('Gagal memuat pengaturan pembayaran.', 'error');
        }
      } catch {
        if (!silent) {
          showToast('Koneksi bermasalah saat memuat pengaturan pembayaran.', 'error');
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
    loadPaymentSettings();
  }, [loadPaymentSettings]);

  useEffect(() => {
    return subscribeRealtime(['payment_settings'], () => {
      loadPaymentSettings(true);
    });
  }, [subscribeRealtime, loadPaymentSettings]);

  const handleSelectQrisFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadError(null);

    const hasAllowedExt = /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!ALLOWED_QRIS_MIMES.has(file.type) && !hasAllowedExt) {
      const msg = 'Format gambar QRIS hanya mendukung JPG, JPEG, PNG, atau WEBP.';
      setUploadError(msg);
      showToast(msg, 'error');
      return;
    }
    if (file.size <= 0) {
      const msg = 'File gambar QRIS kosong atau rusak.';
      setUploadError(msg);
      showToast(msg, 'error');
      return;
    }
    if (file.size > MAX_QRIS_BYTES) {
      const msg = 'Ukuran file gambar QRIS maksimal 5MB.';
      setUploadError(msg);
      showToast(msg, 'error');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setStagedPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return previewUrl;
    });
    setStagedFile(file);
    setUploadProgress(null);
  };

  const uploadViaXhr = async (
    file: File,
    headers: Record<string, string>
  ): Promise<{ url: string }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/upload', true);
      xhr.withCredentials = true;
      for (const [k, v] of Object.entries(headers)) {
        if (v) xhr.setRequestHeader(k, v);
      }

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && ev.total > 0) {
          const pct = Math.min(95, Math.round((ev.loaded / ev.total) * 100));
          setUploadProgress(pct);
        }
      };

      xhr.onload = () => {
        let parsed: any = null;
        try {
          parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          parsed = null;
        }
        if (xhr.status >= 200 && xhr.status < 300 && parsed?.url) {
          setUploadProgress(100);
          resolve({ url: String(parsed.url) });
        } else {
          reject(
            new Error(
              parsed?.error ||
                `Gagal mengunggah gambar QRIS (HTTP ${xhr.status || 500}). QRIS sebelumnya tetap dipertahankan.`
            )
          );
        }
      };

      xhr.onerror = () => {
        reject(
          new Error('Koneksi terputus saat mengunggah gambar QRIS. QRIS sebelumnya tetap aman.')
        );
      };

      const form = new FormData();
      form.append('folder', 'qris');
      form.append('file', file);
      xhr.send(form);
    });
  };

  const handleCommitStagedQris = async () => {
    if (!stagedFile) return;
    setSaving(true);
    setUploadError(null);
    setUploadProgress(5);
    try {
      const headers = await getAuthHeader();
      const uploaded = await uploadViaXhr(stagedFile, headers);

      const saveHeaders = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const putRes = await fetch('/api/admin/payment-settings', {
        method: 'PUT',
        headers: saveHeaders,
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({
          ...(storeSettings || {}),
          qrisImageUrl: uploaded.url,
          qrisEnabled: true,
          changeNote: changeNote.trim() || 'Mengunggah / mengganti gambar QRIS baru.',
        }),
      });
      const putJson = await putRes.json().catch(() => null);
      if (!putRes.ok || !putJson) {
        const msg =
          putJson?.error ||
          'Gagal menerapkan gambar QRIS baru ke konfigurasi toko. QRIS sebelumnya tetap dipertahankan.';
        setUploadError(msg);
        showToast(msg, 'error');
        return;
      }

      setStoreSettings(putJson.storeSettings);
      setQrisHistory(putJson.qrisHistory || []);
      setQrisReady(Boolean(putJson.qrisReady));
      setChangeNote('');
      clearStagedFile();
      showToast('Gambar QRIS baru berhasil disimpan dan langsung aktif di checkout.', 'success');
      await refreshStorefront();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan saat mengunggah gambar QRIS.';
      setUploadError(msg);
      setUploadProgress(null);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeSettings) return;
    setSaving(true);
    setUploadError(null);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/admin/payment-settings', {
        method: 'PUT',
        headers,
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({
          ...storeSettings,
          changeNote: changeNote.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        showToast(json?.error || 'Gagal menyimpan pengaturan pembayaran.', 'error');
        return;
      }
      setStoreSettings(json.storeSettings);
      setQrisHistory(json.qrisHistory || []);
      setQrisReady(Boolean(json.qrisReady));
      setChangeNote('');
      showToast('Pengaturan pembayaran & QRIS berhasil disimpan.', 'success');
      await refreshStorefront();
    } catch {
      showToast('Gagal menghubungi server saat menyimpan pengaturan pembayaran.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleQrisAction = async (
    endpoint: 'disable' | 'remove' | 'restore-official',
    successMessage: string
  ) => {
    setSaving(true);
    setUploadError(null);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`/api/admin/qris/${endpoint}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        showToast(json?.error || 'Gagal memproses tindakan QRIS.', 'error');
        return;
      }
      setStoreSettings(json.storeSettings);
      setQrisHistory(json.qrisHistory || []);
      setQrisReady(Boolean(json.qrisReady));
      clearStagedFile();
      setConfirmRemoveQris(false);
      showToast(successMessage, 'success');
      await refreshStorefront();
    } catch {
      showToast('Gagal menghubungi server saat memproses tindakan QRIS.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateShipping = async (item: ShippingSetting) => {
    setSavingShippingId(item.id);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch(`/api/admin/shipping/${item.id}`, {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify(item),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        showToast(`Metode pengiriman digital "${item.name}" diperbarui.`, 'success');
        await loadPaymentSettings(true);
        await refreshStorefront({ silent: true });
      } else {
        showToast(json?.error || 'Gagal memperbarui metode pengiriman digital.', 'error');
      }
    } catch {
      showToast('Koneksi bermasalah saat menyimpan metode pengiriman.', 'error');
    } finally {
      setSavingShippingId(null);
    }
  };

  const handleToggleQrisSwitch = async () => {
    if (!storeSettings || togglingSwitch) return;
    const nextEnabled = !storeSettings.qrisEnabled;
    setTogglingSwitch(true);
    setUploadError(null);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/admin/payment-settings/qris', {
        method: 'PATCH',
        headers,
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json) {
        showToast(json?.error || 'Gagal mengubah status switch QRIS.', 'error');
        return;
      }
      setStoreSettings(json.storeSettings);
      setQrisHistory(json.qrisHistory || []);
      setQrisReady(Boolean(json.qrisReady));
      showToast(
        nextEnabled
          ? 'Pembayaran QRIS diaktifkan (Status: ACTIVE).'
          : 'Pembayaran QRIS dinonaktifkan (Status: INACTIVE).',
        'success'
      );
      await refreshStorefront({ silent: true });
    } catch {
      showToast('Gagal menghubungi server saat mengubah switch QRIS.', 'error');
    } finally {
      setTogglingSwitch(false);
    }
  };

  if (loading || !storeSettings) {
    return (
      <div className="h-72 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
    );
  }

  const qrisSwitchOn = Boolean(storeSettings.qrisEnabled);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-lg font-bold text-[#102A43]">
          PAYMENT SETTINGS
        </h2>
        <p className="text-xs text-[#718096]">
          Kontrol instan aktivasi QRIS untuk checkout produk digital dan top up Reseller Wallet, serta konfigurasi gambar QRIS resmi Catrizz_Store.
        </p>
      </div>

      {/* Prominent Simple QRIS PAYMENT SWITCH Card */}
      <section
        aria-label="QRIS Payment Switch"
        data-testid="qris-payment-switch-card"
        className="surface-card rounded-2xl p-6 border border-[#244B75]/20 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E5EAF0] pb-4">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#244B75]">
              PAYMENT SETTINGS
            </p>
            <div className="flex items-center gap-3">
              <h3 className="font-display text-lg font-bold text-[#102A43]">
                QRIS PAYMENT
              </h3>
              <span
                data-testid="qris-switch-status-badge"
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-xs font-mono-num font-bold ${
                  qrisSwitchOn
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    qrisSwitchOn ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
                Status: {qrisSwitchOn ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>
            <p className="text-xs text-[#718096]">
              {qrisSwitchOn
                ? 'QRIS sedang aktif. Pembeli dan reseller dapat membuat checkout QRIS maupun top up wallet baru.'
                : 'QRIS sedang nonaktif. Pesanan QRIS baru & top up baru diblokir, sedangkan saldo wallet reseller dan pesanan yang sudah dibuat tetap berjalan normal.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono-num font-bold text-[#253449]">
              {qrisSwitchOn ? 'ON' : 'OFF'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={qrisSwitchOn}
              aria-label="Toggle QRIS Payment"
              data-testid="qris-payment-switch"
              disabled={togglingSwitch}
              onClick={handleToggleQrisSwitch}
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors cursor-pointer disabled:opacity-50 ${
                qrisSwitchOn
                  ? 'bg-emerald-600 border-emerald-700'
                  : 'bg-slate-300 border-slate-400'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                  qrisSwitchOn ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] p-3">
            <p className="text-[#718096]">Metode Pembayaran</p>
            <p className="font-mono-num font-bold text-[#102A43] mt-0.5">QRIS</p>
          </div>
          <div className="rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] p-3">
            <p className="text-[#718096]">Status</p>
            <p
              className={`font-mono-num font-bold mt-0.5 ${
                qrisSwitchOn ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {qrisSwitchOn ? 'ACTIVE' : 'INACTIVE'}
            </p>
          </div>
          <div className="rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] p-3">
            <p className="text-[#718096]">Terakhir Diubah</p>
            <p className="font-mono-num font-semibold text-[#102A43] mt-0.5">
              {storeSettings.updatedAt
                ? new Date(storeSettings.updatedAt).toLocaleString('id-ID', {
                    timeZone: 'Asia/Jakarta',
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })
                : '-'}
            </p>
          </div>
          <div className="rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] p-3">
            <p className="text-[#718096]">Admin Pengubah</p>
            <p className="font-semibold text-[#244B75] truncate mt-0.5">
              {storeSettings.qrisUpdatedByAdminEmail || 'Admin Catrizzz Store'}
            </p>
          </div>
        </div>
      </section>

      <form
        onSubmit={handleSaveSettings}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
      >
        {/* Left: QRIS Preview, Staging & Lifecycle Actions */}
        <div
          data-spotlight="true"
          className="lg:col-span-5 surface-card spotlight-surface rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold text-[#102A43] flex items-center gap-2">
              <QrCode className="w-4 h-4 text-[#244B75]" />
              QRIS Pembayaran Aktif
            </h3>
            <span
              className={`px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                qrisReady
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              {qrisReady
                ? 'Aktif & Siap'
                : storeSettings.qrisImageUrl
                  ? 'Dinonaktifkan'
                  : 'QRIS Dihapus'}
            </span>
          </div>

          {uploadError && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Staged Preview-Before-Save Panel */}
          {stagedFile && stagedPreviewUrl && (
            <div className="p-4 rounded-xl bg-[#EAF2FA]/60 border border-[#244B75]/30 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-[#102A43] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#244B75]" />
                  Preview QRIS Baru (Belum Disimpan)
                </p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={clearStagedFile}
                  aria-label="Batalkan pilihan QRIS baru"
                  className="p-1 rounded-md text-[#718096] hover:text-[#102A43] cursor-pointer disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-white rounded-xl p-2.5 border border-[#E5EAF0] flex items-center justify-center">
                <img
                  src={stagedPreviewUrl}
                  alt="Preview QRIS Baru"
                  className="w-full max-w-[200px] h-auto object-contain rounded-lg"
                />
              </div>

              <div className="text-[11px] text-[#253449] flex items-center justify-between gap-2">
                <span className="truncate font-medium">{stagedFile.name}</span>
                <span className="font-mono-num text-[#718096] shrink-0">
                  {(stagedFile.size / 1024).toFixed(1)} KB
                </span>
              </div>

              {uploadProgress !== null && (
                <div className="space-y-1">
                  <div className="h-1.5 w-full rounded-full bg-white overflow-hidden border border-[#E5EAF0]">
                    <div
                      className="h-full bg-[#102A43] transition-all duration-200"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-[11px] font-mono-num text-[#244B75] text-right">
                    Mengunggah {uploadProgress}%...
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <NavyButton
                  type="button"
                  disabled={saving}
                  data-magnetic="true"
                  onClick={handleCommitStagedQris}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Menyimpan QRIS...' : 'Simpan & Terapkan QRIS'}
                </NavyButton>
                <NavyButton
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={clearStagedFile}
                  className="px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Batalkan
                </NavyButton>
              </div>
            </div>
          )}

          {storeSettings.qrisImageUrl ? (
            <div className="bg-white rounded-xl p-3 border border-[#E5EAF0] shadow-[inset_0_1px_2px_rgba(16,42,67,0.04)] flex items-center justify-center">
              <img
                src={withVersionQuery(storeSettings.qrisImageUrl, storeSettings.qrisVersion)}
                alt={`QRIS ${storeSettings.qrisMerchantName}`}
                className="w-full max-w-[260px] h-auto object-contain rounded-lg"
              />
            </div>
          ) : (
            <div className="p-8 rounded-xl bg-[#F8FAFC] border border-dashed border-[#E5EAF0] text-center space-y-2">
              <QrCode className="w-8 h-8 text-[#718096] mx-auto" />
              <p className="text-xs font-medium text-[#102A43]">
                Belum ada gambar QRIS aktif
              </p>
              <p className="text-[11px] text-[#718096]">
                Unggah gambar QRIS baru (JPG/PNG/WEBP, maks. 5MB) atau pulihkan QRIS resmi Catrizz_Store.
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <label className="btn-navy-primary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              {storeSettings.qrisImageUrl ? 'Ganti Gambar QRIS' : 'Upload QRIS Baru'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleSelectQrisFile}
              />
            </label>

            {storeSettings.qrisEnabled && (
              <NavyButton
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() =>
                  handleQrisAction('disable', 'Pembayaran QRIS berhasil dinonaktifkan.')
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5 text-amber-600" />
                Nonaktifkan
              </NavyButton>
            )}

            {storeSettings.qrisImageUrl && (
              <button
                type="button"
                disabled={saving}
                onClick={() => setConfirmRemoveQris(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus QRIS
              </button>
            )}

            <NavyButton
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() =>
                handleQrisAction(
                  'restore-official',
                  'QRIS resmi Catrizz_Store berhasil dipulihkan.'
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#244B75]" />
              Pulihkan QRIS Resmi
            </NavyButton>
          </div>
          <p className="text-[11px] text-[#718096]">
            Format didukung: JPG, JPEG, PNG, WEBP (maks. 5MB). Pilih file untuk melihat preview sebelum diterapkan.
          </p>
        </div>

        {/* Right: Payment Configuration */}
        <div
          data-spotlight="true"
          className="lg:col-span-7 surface-card spotlight-surface rounded-2xl p-6 space-y-5"
        >
          <h3 className="text-base font-semibold text-[#102A43]">
            Konfigurasi Merchant, Kontak &amp; Promo Reseller
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <label className="block space-y-1.5 font-semibold text-[#253449]">
              Nama Merchant QRIS
              <input
                type="text"
                value={storeSettings.qrisMerchantName}
                onChange={(e) =>
                  setStoreSettings({ ...storeSettings, qrisMerchantName: e.target.value })
                }
                className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
              />
            </label>
            <label className="block space-y-1.5 font-semibold text-[#253449]">
              NMID QRIS
              <input
                type="text"
                value={storeSettings.qrisNmid}
                onChange={(e) =>
                  setStoreSettings({ ...storeSettings, qrisNmid: e.target.value })
                }
                className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
              />
            </label>
            <label className="block space-y-1.5 font-semibold text-[#253449]">
              WhatsApp Verifikasi Admin (628...)
              <input
                type="text"
                value={storeSettings.whatsappNumber}
                onChange={(e) =>
                  setStoreSettings({ ...storeSettings, whatsappNumber: e.target.value })
                }
                className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
              />
            </label>
            <label className="block space-y-1.5 font-semibold text-[#253449]">
              Pajak / Biaya Layanan (%)
              <input
                type="number"
                min={0}
                max={50}
                step="0.5"
                value={storeSettings.taxPercent}
                onChange={(e) =>
                  setStoreSettings({ ...storeSettings, taxPercent: Number(e.target.value) })
                }
                className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
              />
            </label>
          </div>

          <div className="space-y-2.5 p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
            <label className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[#102A43] cursor-pointer">
              <input
                type="checkbox"
                checked={storeSettings.qrisEnabled}
                onChange={(e) =>
                  setStoreSettings({ ...storeSettings, qrisEnabled: e.target.checked })
                }
                className="accent-[#102A43] w-4 h-4"
              />
              Aktifkan Pembayaran QRIS pada Checkout &amp; Pendaftaran Reseller
            </label>

            <label className="flex items-center gap-2.5 text-xs sm:text-sm font-medium text-[#102A43] cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(storeSettings.allowResellerStackPromo)}
                onChange={(e) =>
                  setStoreSettings({
                    ...storeSettings,
                    allowResellerStackPromo: e.target.checked,
                  })
                }
                className="accent-[#102A43] w-4 h-4"
              />
              Izinkan Reseller Menggabungkan Diskon 20% dengan Kode Promo Kupon
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#253449]">
                Instruksi Pembayaran QRIS
              </span>
              <button
                type="button"
                onClick={() =>
                  setStoreSettings({
                    ...storeSettings,
                    qrisInstructions: [...storeSettings.qrisInstructions, ''],
                  })
                }
                className="text-xs font-semibold text-[#244B75] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Langkah
              </button>
            </div>
            <div className="space-y-2">
              {storeSettings.qrisInstructions.map((step, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <span className="text-xs font-mono-num text-[#718096] w-5">
                    {idx + 1}.
                  </span>
                  <input
                    type="text"
                    value={step}
                    onChange={(e) => {
                      const next = [...storeSettings.qrisInstructions];
                      next[idx] = e.target.value;
                      setStoreSettings({ ...storeSettings, qrisInstructions: next });
                    }}
                    className="input-navy flex-1 rounded-xl px-3 py-2 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setStoreSettings({
                        ...storeSettings,
                        qrisInstructions: storeSettings.qrisInstructions.filter(
                          (_, i) => i !== idx
                        ),
                      })
                    }
                    aria-label={`Hapus langkah ${idx + 1}`}
                    className="p-2 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <label className="block space-y-1 text-xs font-semibold text-[#253449]">
            Catatan Perubahan (Opsional — untuk Riwayat QRIS)
            <input
              type="text"
              value={changeNote}
              onChange={(e) => setChangeNote(e.target.value)}
              placeholder="Contoh: Penyesuaian instruksi QRIS atau merchant"
              className="input-navy w-full rounded-xl px-3 py-2 text-xs font-normal"
            />
          </label>

          <div className="pt-2 flex justify-end">
            <NavyButton
              type="submit"
              disabled={saving}
              data-magnetic="true"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Menyimpan...' : 'Simpan Pengaturan Pembayaran'}
            </NavyButton>
          </div>
        </div>
      </form>

      {/* Digital Delivery Methods */}
      <div
        data-spotlight="true"
        className="surface-card spotlight-surface rounded-2xl p-6 space-y-4"
      >
        <h3 className="text-base font-semibold text-[#102A43]">
          Pengaturan Metode Pengiriman Digital
        </h3>
        <div className="space-y-3">
          {shippingSettings.map((s, idx) => (
            <div
              key={s.id}
              className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs"
            >
              <div className="md:col-span-5 space-y-1">
                <input
                  type="text"
                  value={s.name}
                  onChange={(e) => {
                    const next = [...shippingSettings];
                    next[idx] = { ...s, name: e.target.value };
                    setShippingSettings(next);
                  }}
                  className="input-navy w-full rounded-lg px-2.5 py-1.5 font-semibold"
                />
                <p className="text-[11px] text-[#718096]">{s.description}</p>
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] text-[#718096] mb-1">Biaya (Rp)</label>
                <input
                  type="number"
                  min={0}
                  value={s.cost}
                  onChange={(e) => {
                    const next = [...shippingSettings];
                    next[idx] = { ...s, cost: Number(e.target.value) };
                    setShippingSettings(next);
                  }}
                  className="input-navy w-full rounded-lg px-2.5 py-1.5 font-mono-num"
                />
              </div>
              <div className="md:col-span-2 flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-[#253449] font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={s.active}
                    onChange={(e) => {
                      const next = [...shippingSettings];
                      next[idx] = { ...s, active: e.target.checked };
                      setShippingSettings(next);
                    }}
                    className="accent-[#102A43]"
                  />
                  Aktif ({s.cost === 0 ? 'Gratis' : formatIDR(s.cost)})
                </label>
              </div>
              <div className="md:col-span-2 text-right">
                <NavyButton
                  type="button"
                  variant="outline"
                  disabled={savingShippingId === s.id}
                  onClick={() => handleUpdateShipping(shippingSettings[idx])}
                  className="px-3.5 py-1.5 rounded-lg font-semibold cursor-pointer disabled:opacity-60"
                >
                  {savingShippingId === s.id ? 'Menyimpan...' : 'Simpan'}
                </NavyButton>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* QRIS Change History */}
      <div
        data-spotlight="true"
        className="surface-card spotlight-surface rounded-2xl p-6 space-y-4"
      >
        <h3 className="text-base font-semibold text-[#102A43] flex items-center gap-2">
          <History className="w-4 h-4 text-[#244B75]" />
          Riwayat Perubahan QRIS
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E5EAF0] text-[#718096]">
              <tr>
                <th className="py-3 pr-4">Waktu</th>
                <th className="py-3 pr-4">Aksi</th>
                <th className="py-3 pr-4">Merchant / NMID</th>
                <th className="py-3 pr-4">Admin</th>
                <th className="py-3">Catatan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAF0]">
              {qrisHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[#718096]">
                    Belum ada riwayat perubahan QRIS tercatat.
                  </td>
                </tr>
              ) : (
                qrisHistory.map((h) => (
                  <tr key={h.id} className="hover:bg-[#F8FAFC]">
                    <td className="py-3 pr-4 font-mono-num text-[#718096] whitespace-nowrap">
                      {new Date(h.createdAt).toLocaleString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="px-2 py-0.5 rounded bg-[#EAF2FA] text-[#102A43] font-mono-num font-semibold uppercase text-[11px]">
                        {h.action}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-[#253449]">
                      {h.merchantName}{' '}
                      <span className="text-[#718096] font-mono-num">({h.nmid})</span>
                    </td>
                    <td className="py-3 pr-4 text-[#244B75] font-medium">{h.changedBy}</td>
                    <td className="py-3 text-[#253449]">{h.note || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmRemoveQris && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-semibold text-[#102A43]">Hapus Gambar QRIS Aktif?</h3>
            <p className="text-sm text-[#253449]">
              Penghapusan gambar QRIS akan menonaktifkan metode pembayaran QRIS baru sampai gambar baru diunggah atau QRIS resmi dipulihkan.
            </p>
            <div className="flex justify-end gap-2">
              <NavyButton
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => setConfirmRemoveQris(false)}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer"
              >
                Batal
              </NavyButton>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  handleQrisAction('remove', 'Gambar QRIS aktif berhasil dihapus.')
                }
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                {saving ? 'Menghapus...' : 'Ya, Hapus QRIS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
