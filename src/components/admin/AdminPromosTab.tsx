import React, { useCallback, useEffect, useState } from 'react';
import { Edit, Plus, Trash2, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatIDR } from '../../shared/pricing';
import type { DiscountCode, DiscountUsage } from '../../shared/types';
import { NavyButton } from '../Interactive';

export function AdminPromosTab() {
  const { getAuthHeader, showToast, subscribeRealtime } = useStore();
  const [discounts, setDiscounts] = useState<DiscountCode[]>([]);
  const [usages, setUsages] = useState<DiscountUsage[]>([]);
  const [editing, setEditing] = useState<Partial<DiscountCode> | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DiscountCode | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadDiscounts = useCallback(async () => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/api/admin/discounts', {
        headers,
        credentials: 'include',
        cache: 'no-store',
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json) {
        setDiscounts(json.discounts || []);
        setUsages(json.usages || []);
      } else {
        showToast(json?.error || 'Gagal memuat kode diskon.', 'error');
      }
    } catch {
      showToast('Koneksi bermasalah saat memuat data diskon.', 'error');
    }
  }, [getAuthHeader, showToast]);

  useEffect(() => {
    loadDiscounts();
  }, [loadDiscounts]);

  useEffect(() => {
    return subscribeRealtime(['discounts', 'cms', 'storefront'], () => {
      loadDiscounts();
    });
  }, [subscribeRealtime, loadDiscounts]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const isEdit = Boolean(editing.id);
      const res = await fetch(
        isEdit ? `/api/admin/discounts/${editing.id}` : '/api/admin/discounts',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify(editing),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal menyimpan kode diskon.', 'error');
        return;
      }
      showToast('Kode diskon berhasil disimpan.', 'success');
      setEditing(null);
      await loadDiscounts();
    } catch {
      showToast('Gagal menghubungi server saat menyimpan kode diskon.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`/api/admin/discounts/${deleteTarget.id}`, {
        method: 'DELETE',
        headers,
        credentials: 'include',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal menghapus kode diskon.', 'error');
        return;
      }
      showToast(`Kode diskon ${deleteTarget.code} berhasil dihapus.`, 'success');
      setDeleteTarget(null);
      await loadDiscounts();
    } catch {
      showToast('Gagal menghubungi server saat menghapus kode diskon.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-[#102A43]">
            Manajemen Diskon &amp; Promo
          </h2>
          <p className="text-xs text-[#718096]">
            Kelola kode voucher persentase atau nominal tetap beserta kuota dan masa berlaku.
          </p>
        </div>
        <NavyButton
          type="button"
          onClick={() =>
            setEditing({
              promoName: '',
              code: '',
              description: '',
              type: 'percentage',
              value: 20,
              minPurchase: 50000,
              maxDiscount: 25000,
              startDate: new Date().toISOString().slice(0, 10),
              endDate: '2027-12-31',
              maxTotalUsage: 100,
              maxPerCustomer: 1,
              eligibleTier: 'all',
              active: true,
            })
          }
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Buat Kode Diskon
        </NavyButton>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {discounts.map((d) => (
          <div key={d.id} className="surface-card rounded-2xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono-num text-base font-bold text-[#244B75]">{d.code}</p>
                <p className="text-sm font-semibold text-[#102A43]">{d.promoName}</p>
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setEditing({ ...d })}
                  aria-label={`Edit ${d.code}`}
                  className="p-2 rounded-lg bg-[#EAF2FA] text-[#102A43] cursor-pointer"
                >
                  <Edit className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(d)}
                  aria-label={`Hapus ${d.code}`}
                  className="p-2 rounded-lg bg-rose-50 text-rose-700 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            <p className="text-xs text-[#718096]">{d.description}</p>
            <div className="grid grid-cols-2 gap-2 text-xs text-[#253449] pt-2 border-t border-[#E5EAF0]">
              <span>
                Nilai: {d.type === 'percentage' ? `${d.value}%` : formatIDR(d.value)}
              </span>
              <span>Min. Belanja: {formatIDR(d.minPurchase)}</span>
              <span>
                Kuota:{' '}
                <span className="font-mono-num">
                  {d.usedCount}/{d.maxTotalUsage || '∞'}
                </span>
              </span>
              <span>
                Target:{' '}
                {d.eligibleTier === 'reseller'
                  ? 'Khusus Reseller'
                  : d.eligibleTier === 'customer'
                    ? 'Pelanggan Publik'
                    : 'Semua Pembeli'}
              </span>
              <span className={d.active ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>
                Status: {d.active ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {usages.length > 0 && (
        <div className="surface-card rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-[#102A43]">
            Riwayat Penggunaan Kode Diskon
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#E5EAF0] text-[#718096]">
                <tr>
                  <th className="py-2">Kode</th>
                  <th className="py-2">Order ID</th>
                  <th className="py-2">WhatsApp</th>
                  <th className="py-2">Potongan</th>
                  <th className="py-2">Waktu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EAF0]">
                {usages.map((u) => (
                  <tr key={u.id}>
                    <td className="py-2 font-mono-num font-semibold text-[#244B75]">
                      {u.code}
                    </td>
                    <td className="py-2 font-mono-num text-[#102A43]">{u.orderNumber}</td>
                    <td className="py-2 font-mono-num text-[#253449]">+{u.customerWhatsapp}</td>
                    <td className="py-2 font-mono-num text-emerald-700 font-semibold">
                      -{formatIDR(u.discountAmount)}
                    </td>
                    <td className="py-2 text-[#718096]">
                      {new Date(u.createdAt).toLocaleDateString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <form
            onSubmit={handleSave}
            className="surface-card rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#102A43]">
                {editing.id ? 'Edit Kode Diskon' : 'Buat Kode Diskon Baru'}
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-[#718096] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="block space-y-1 font-semibold text-[#253449]">
                Nama Promo
                <input
                  type="text"
                  required
                  value={editing.promoName || ''}
                  onChange={(e) => setEditing({ ...editing, promoName: e.target.value })}
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="block space-y-1 font-semibold text-[#253449]">
                Kode Diskon
                <input
                  type="text"
                  required
                  disabled={Boolean(editing.id)}
                  value={editing.code || ''}
                  onChange={(e) =>
                    setEditing({ ...editing, code: e.target.value.toUpperCase() })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num uppercase font-normal"
                />
              </label>
              <label className="block space-y-1 font-semibold text-[#253449]">
                Tipe Diskon
                <select
                  value={editing.type || 'percentage'}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      type: e.target.value as 'percentage' | 'fixed',
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                >
                  <option value="percentage">Persentase (%)</option>
                  <option value="fixed">Nominal Tetap (Rp)</option>
                </select>
              </label>
              <label className="block space-y-1 font-semibold text-[#253449]">
                Nilai Diskon
                <input
                  type="number"
                  required
                  min={1}
                  value={editing.value ?? 0}
                  onChange={(e) => setEditing({ ...editing, value: Number(e.target.value) })}
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
                />
              </label>
              <label className="block space-y-1 font-semibold text-[#253449]">
                Minimum Pembelian (Rp)
                <input
                  type="number"
                  min={0}
                  value={editing.minPurchase ?? 0}
                  onChange={(e) =>
                    setEditing({ ...editing, minPurchase: Number(e.target.value) })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
                />
              </label>
              <label className="block space-y-1 font-semibold text-[#253449]">
                Maksimum Potongan (Rp)
                <input
                  type="number"
                  min={0}
                  value={editing.maxDiscount ?? ''}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      maxDiscount: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
                />
              </label>
              <label className="block space-y-1 font-semibold text-[#253449]">
                Maks Penggunaan Total
                <input
                  type="number"
                  min={0}
                  value={editing.maxTotalUsage ?? 100}
                  onChange={(e) =>
                    setEditing({ ...editing, maxTotalUsage: Number(e.target.value) })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
                />
              </label>
              <label className="block space-y-1 font-semibold text-[#253449]">
                Maks per Pelanggan
                <input
                  type="number"
                  min={0}
                  value={editing.maxPerCustomer ?? 1}
                  onChange={(e) =>
                    setEditing({ ...editing, maxPerCustomer: Number(e.target.value) })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num font-normal"
                />
              </label>
              <label className="block space-y-1 font-semibold text-[#253449]">
                Tanggal Mulai
                <input
                  type="date"
                  value={(editing.startDate || '').slice(0, 10)}
                  onChange={(e) => setEditing({ ...editing, startDate: e.target.value })}
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="block space-y-1 font-semibold text-[#253449]">
                Tanggal Berakhir
                <input
                  type="date"
                  value={(editing.endDate || '').slice(0, 10)}
                  onChange={(e) => setEditing({ ...editing, endDate: e.target.value })}
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <label className="block space-y-1 font-semibold text-[#253449]">
                Target Pengguna Kode
                <select
                  value={editing.eligibleTier || 'all'}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      eligibleTier: e.target.value as 'all' | 'customer' | 'reseller',
                    })
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                >
                  <option value="all">Semua Pembeli</option>
                  <option value="customer">Khusus Pelanggan Publik</option>
                  <option value="reseller">Khusus Reseller</option>
                </select>
              </label>
              <label className="block space-y-1 font-semibold text-[#253449]">
                Deskripsi
                <input
                  type="text"
                  value={editing.description || ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                />
              </label>
            </div>

            <label className="inline-flex items-center gap-2 text-xs font-medium text-[#253449] cursor-pointer">
              <input
                type="checkbox"
                checked={editing.active !== false}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                className="accent-[#102A43]"
              />
              Kode Aktif
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setEditing(null)}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer"
              >
                Batal
              </NavyButton>
              <NavyButton
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold cursor-pointer"
              >
                {saving ? 'Menyimpan...' : 'Simpan Kode'}
              </NavyButton>
            </div>
          </form>
        </div>
      )}
      {deleteTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-semibold text-[#102A43]">Hapus Kode Diskon?</h3>
            <p className="text-sm text-[#253449]">
              Kode diskon <span className="font-mono-num font-bold text-[#102A43]">{deleteTarget.code}</span> akan dihapus permanen dan tidak lagi dapat digunakan di checkout.
            </p>
            <div className="flex justify-end gap-2">
              <NavyButton
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
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
                {deleting ? 'Menghapus...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
