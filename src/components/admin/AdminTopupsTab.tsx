import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Coins,
  ExternalLink,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Wallet,
  X,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import {
  formatIDR,
  type TopupFeeStats,
  type TopupRevenueRange,
} from '../../shared/pricing';
import type { ResellerTopup, TopupStatus } from '../../shared/types';
import { NavyButton } from '../Interactive';

interface TopupSummaryStats {
  pendingPaymentCount: number;
  pendingVerificationCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalSaldoWallet: number;
  totalFeeCollected: number;
  totalQrisPayments: number;
}

const TOPUP_STATUS_BADGE: Record<TopupStatus, { label: string; cls: string }> = {
  pending_payment: {
    label: 'Belum Upload Bukti',
    cls: 'bg-[#F8FAFC] text-[#253449] border-[#E5EAF0]',
  },
  pending_verification: {
    label: 'Menunggu Verifikasi',
    cls: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  approved: {
    label: 'Disetujui',
    cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  rejected: {
    label: 'Ditolak',
    cls: 'bg-rose-50 text-rose-700 border-rose-200',
  },
};

const REVENUE_RANGES: Array<{ id: TopupRevenueRange; label: string }> = [
  { id: 'today', label: 'Harian' },
  { id: '7d', label: 'Mingguan (7H)' },
  { id: 'month', label: 'Bulanan' },
  { id: '30d', label: '30 Hari' },
  { id: 'all', label: 'Semua' },
  { id: 'custom', label: 'Rentang Tanggal' },
];

export function AdminTopupsTab() {
  const { adminProfile, getAuthHeader, showToast, refreshResellerWallet, subscribeRealtime } =
    useStore();

  const [topups, setTopups] = useState<ResellerTopup[]>([]);
  const [summary, setSummary] = useState<TopupSummaryStats>({
    pendingPaymentCount: 0,
    pendingVerificationCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    totalSaldoWallet: 0,
    totalFeeCollected: 0,
    totalQrisPayments: 0,
  });
  const [feeStats, setFeeStats] = useState<TopupFeeStats>({
    range: 'all',
    totalSaldoWallet: 0,
    totalFeeCollected: 0,
    totalQrisPayments: 0,
    totalTransactions: 0,
    pendingPaymentCount: 0,
    pendingVerificationCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const [revenueRange, setRevenueRange] = useState<TopupRevenueRange>('all');

  // Table Filters
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [minAmountFilter, setMinAmountFilter] = useState('');
  const [maxAmountFilter, setMaxAmountFilter] = useState('');

  // Modals
  const [proofPreviewTopup, setProofPreviewTopup] = useState<ResellerTopup | null>(null);
  const [approveModalTopup, setApproveModalTopup] = useState<ResellerTopup | null>(null);
  const [rejectModalTopup, setRejectModalTopup] = useState<ResellerTopup | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Settings
  const [loadedMinAmount, setLoadedMinAmount] = useState(10000);
  const [loadedMaxAmount, setLoadedMaxAmount] = useState(10000000);
  const [loadedFeePct, setLoadedFeePct] = useState(10);

  const [minAmountDraft, setMinAmountDraft] = useState('10000');
  const [maxAmountDraft, setMaxAmountDraft] = useState('10000000');
  const [feePctDraft, setFeePctDraft] = useState('10');
  const [savingSettings, setSavingSettings] = useState(false);

  const [feeConfirmModalOpen, setFeeConfirmModalOpen] = useState(false);
  const [feeChangeConfirmed, setFeeChangeConfirmed] = useState(false);
  const [feeChangeReason, setFeeChangeReason] = useState('');

  const isSuperAdmin = adminProfile?.role === 'super_admin';

  const loadTopups = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const headers = await getAuthHeader();
        const qs = new URLSearchParams();
        qs.set('range', revenueRange);
        if (statusFilter !== 'all') qs.set('status', statusFilter);
        if (search.trim()) qs.set('search', search.trim());
        if (startDate) qs.set('startDate', startDate);
        if (endDate) qs.set('endDate', endDate);
        if (minAmountFilter) qs.set('minAmount', minAmountFilter);
        if (maxAmountFilter) qs.set('maxAmount', maxAmountFilter);

        const res = await fetch(`/api/admin/topups?${qs.toString()}`, {
          headers,
          credentials: 'include',
          cache: 'no-store',
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json) {
          setTopups(json.topups || []);
          if (json.summary) setSummary(json.summary);
          if (json.topupFeeStats) setFeeStats(json.topupFeeStats);
          if (json.topupConfig) {
            const minA = Number(json.topupConfig.minAmount ?? 10000);
            const maxA = Number(json.topupConfig.maxAmount ?? 10000000);
            const pct = Number(json.topupConfig.feePercentage ?? 10);
            setLoadedMinAmount(minA);
            setLoadedMaxAmount(maxA);
            setLoadedFeePct(pct);
            if (!silent) {
              setMinAmountDraft(String(minA));
              setMaxAmountDraft(String(maxA));
              setFeePctDraft(String(pct));
            }
          }
        } else if (!silent) {
          showToast(json?.error || 'Gagal memuat daftar top up reseller.', 'error');
        }
      } catch {
        if (!silent) {
          showToast('Koneksi bermasalah saat memuat daftar top up.', 'error');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [
      getAuthHeader,
      revenueRange,
      statusFilter,
      search,
      startDate,
      endDate,
      minAmountFilter,
      maxAmountFilter,
      showToast,
    ]
  );

  useEffect(() => {
    loadTopups();
  }, [loadTopups]);

  useEffect(() => {
    return subscribeRealtime(['topups', 'resellers', 'reseller_wallet', 'payment_settings'], () => {
      loadTopups(true);
    });
  }, [subscribeRealtime, loadTopups]);

  const handleApproveTopup = async (topup: ResellerTopup) => {
    setProcessingId(topup.id);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch(`/api/admin/topups/${topup.id}/approve`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal menyetujui top up.', 'error');
        return;
      }
      showToast(
        `Top up ${topup.topupNumber} disetujui. Saldo wallet +${formatIDR(topup.walletCredit)} masuk ke @${topup.resellerUsername} (Biaya layanan ${topup.feePercentage}%: ${formatIDR(topup.feeAmount)}).`,
        'success'
      );
      setApproveModalTopup(null);
      await loadTopups();
      await refreshResellerWallet();
    } catch {
      showToast('Koneksi bermasalah saat menyetujui top up.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalTopup) return;
    if (rejectionReason.trim().length < 3) {
      showToast('Alasan penolakan minimal 3 karakter.', 'error');
      return;
    }

    setProcessingId(rejectModalTopup.id);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch(`/api/admin/topups/${rejectModalTopup.id}/reject`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ reason: rejectionReason.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal menolak top up.', 'error');
        return;
      }
      showToast(`Permintaan top up ${rejectModalTopup.topupNumber} ditolak.`, 'success');
      setRejectModalTopup(null);
      setRejectionReason('');
      await loadTopups();
    } catch {
      showToast('Koneksi bermasalah saat menolak top up.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const submitTopupSettings = async (confirmFeeChange: boolean, reason?: string) => {
    const minAmount = Math.round(Number(minAmountDraft));
    const maxAmount = Math.round(Number(maxAmountDraft));
    const feePercentage = Number(feePctDraft);

    setSavingSettings(true);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/admin/topup-settings', {
        method: 'PUT',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          minAmount,
          maxAmount,
          feePercentage,
          confirmFeeChange,
          reason: reason?.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal menyimpan pengaturan top up.', 'error');
        return;
      }
      showToast('Pengaturan nominal & biaya layanan top up berhasil disimpan.', 'success');
      setFeeConfirmModalOpen(false);
      setFeeChangeConfirmed(false);
      setFeeChangeReason('');
      await loadTopups();
    } catch {
      showToast('Koneksi bermasalah saat menyimpan pengaturan top up.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveSettingsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const minAmount = Math.round(Number(minAmountDraft));
    const maxAmount = Math.round(Number(maxAmountDraft));
    const feePercentage = Number(feePctDraft);

    if (!Number.isFinite(minAmount) || minAmount < 1000) {
      showToast('Nominal minimal top up minimal Rp1.000.', 'error');
      return;
    }
    if (!Number.isFinite(maxAmount) || maxAmount < minAmount) {
      showToast('Nominal maksimal harus >= minimal top up.', 'error');
      return;
    }
    if (!Number.isFinite(feePercentage) || feePercentage < 0 || feePercentage > 100) {
      showToast('Persentase biaya tambahan top up harus antara 0% sampai 100%.', 'error');
      return;
    }

    if (feePercentage !== loadedFeePct) {
      if (!isSuperAdmin) {
        showToast(
          'Hanya Super Admin yang memiliki izin khusus untuk mengubah persentase biaya tambahan top up.',
          'error'
        );
        return;
      }
      setFeeChangeConfirmed(false);
      setFeeChangeReason('');
      setFeeConfirmModalOpen(true);
      return;
    }

    await submitTopupSettings(false);
  };

  const isPdfUrl = (url?: string, mime?: string) =>
    Boolean((mime && mime.includes('pdf')) || (url && url.toLowerCase().endsWith('.pdf')));

  return (
    <div className="space-y-6">
      {/* TOP UP FEE RESELLER SECTION */}
      <section
        aria-label="Ringkasan Biaya Tambahan Top Up Reseller"
        className="surface-card rounded-2xl p-5 sm:p-6 space-y-4 border border-[#244B75]/20 bg-gradient-to-br from-white via-white to-[#F8FAFC]"
      >
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E5EAF0] pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#102A43] text-white flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm sm:text-base font-bold tracking-wide text-[#102A43] uppercase">
                  BIAYA TAMBAHAN TOP UP RESELLER ({loadedFeePct}%)
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-[#EAF2FA] border border-[#244B75]/20 text-[#102A43] text-[11px] font-semibold">
                  Wallet Kredit = 100% Nominal Top Up
                </span>
              </div>
              <p className="text-xs text-[#718096] mt-0.5">
                Reseller membayar nominal top up + biaya layanan {loadedFeePct}% via QRIS. Saldo wallet bertambah tepat sebesar nominal top up, sementara biaya {loadedFeePct}% menjadi pendapatan Catrizzz Store.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
            {REVENUE_RANGES.map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setRevenueRange(btn.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  revenueRange === btn.id
                    ? 'bg-[#102A43] text-white'
                    : 'text-[#718096] hover:text-[#102A43]'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {revenueRange === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 bg-[#F8FAFC] border border-[#E5EAF0] rounded-xl p-3">
            <span className="text-xs font-semibold text-[#102A43]">Rentang Tanggal:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="Statistik dari tanggal"
              className="input-navy rounded-lg px-2.5 py-1.5 text-xs"
            />
            <span className="text-xs text-[#718096]">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="Statistik sampai tanggal"
              className="input-navy rounded-lg px-2.5 py-1.5 text-xs"
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            data-spotlight="true"
            className="surface-card spotlight-surface rounded-2xl p-4 space-y-1 border-l-4 border-l-emerald-600"
          >
            <p className="text-xs font-medium text-[#718096]">Pendapatan Fee Top Up ({loadedFeePct}%)</p>
            <p className="text-xl font-bold font-mono-num text-emerald-700">
              {formatIDR(feeStats.totalFeeCollected)}
            </p>
            <p className="text-[11px] text-[#718096]">Pendapatan layanan Catrizzz Store</p>
          </div>

          <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1">
            <p className="text-xs font-medium text-[#718096]">Total Saldo Masuk Wallet</p>
            <p className="text-xl font-bold font-mono-num text-[#102A43]">
              {formatIDR(feeStats.totalSaldoWallet)}
            </p>
            <p className="text-[11px] text-[#718096]">Masuk bersih ke wallet reseller</p>
          </div>

          <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1">
            <p className="text-xs font-medium text-[#718096]">Total Pembayaran QRIS</p>
            <p className="text-xl font-bold font-mono-num text-[#244B75]">
              {formatIDR(feeStats.totalQrisPayments)}
            </p>
            <p className="text-[11px] text-[#718096]">Nominal top up + fee {loadedFeePct}%</p>
          </div>

          <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-[#718096]">Transaksi Top Up</p>
              <span className="text-sm font-bold font-mono-num text-[#102A43]">
                {feeStats.totalTransactions}x
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-mono-num">
              <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                Pending: {feeStats.pendingVerificationCount}
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                Approve: {feeStats.approvedCount}
              </span>
              <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                Tolak: {feeStats.rejectedCount}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Overall Antrian & Summary KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1">
          <p className="text-xs text-[#718096]">Antrian Verifikasi</p>
          <p className="text-2xl font-bold font-mono-num text-amber-700">
            {summary.pendingVerificationCount}
          </p>
        </div>
        <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1">
          <p className="text-xs text-[#718096]">Disetujui (Semua)</p>
          <p className="text-2xl font-bold font-mono-num text-emerald-700">
            {summary.approvedCount}
          </p>
        </div>
        <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1">
          <p className="text-xs text-[#718096]">Ditolak (Semua)</p>
          <p className="text-2xl font-bold font-mono-num text-rose-700">
            {summary.rejectedCount}
          </p>
        </div>
        <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1">
          <p className="text-xs text-[#718096]">Akumulasi Saldo Wallet</p>
          <p className="text-lg font-bold font-mono-num text-[#102A43]">
            {formatIDR(summary.totalSaldoWallet)}
          </p>
        </div>
        <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1 col-span-2 md:col-span-1">
          <p className="text-xs text-[#718096]">Akumulasi Fee {loadedFeePct}%</p>
          <p className="text-lg font-bold font-mono-num text-emerald-700">
            {formatIDR(summary.totalFeeCollected)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="surface-card rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#102A43]">
            <Filter className="w-4 h-4 text-[#244B75]" />
            Filter Verifikasi Top Up Saldo Reseller
          </div>
          <NavyButton
            type="button"
            variant="outline"
            onClick={() => loadTopups()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </NavyButton>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari ID Top Up, nama, username, WA..."
              className="input-navy w-full rounded-xl pl-9 pr-3 py-2 text-xs"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter status top up"
            className="input-navy rounded-xl px-3 py-2 text-xs"
          >
            <option value="all">Semua Status</option>
            <option value="pending_verification">Menunggu Verifikasi</option>
            <option value="pending_payment">Belum Upload Bukti</option>
            <option value="approved">Disetujui</option>
            <option value="rejected">Ditolak</option>
          </select>

          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="Dari tanggal"
            className="input-navy rounded-xl px-3 py-2 text-xs"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            aria-label="Sampai tanggal"
            className="input-navy rounded-xl px-3 py-2 text-xs"
          />

          <div className="flex gap-1.5">
            <input
              type="number"
              min={0}
              value={minAmountFilter}
              onChange={(e) => setMinAmountFilter(e.target.value)}
              placeholder="Min Rp"
              aria-label="Nominal minimal"
              className="input-navy w-1/2 rounded-xl px-2.5 py-2 text-xs font-mono-num"
            />
            <input
              type="number"
              min={0}
              value={maxAmountFilter}
              onChange={(e) => setMaxAmountFilter(e.target.value)}
              placeholder="Max Rp"
              aria-label="Nominal maksimal"
              className="input-navy w-1/2 rounded-xl px-2.5 py-2 text-xs font-mono-num"
            />
          </div>
        </div>
      </div>

      {/* Topups Table */}
      <div className="surface-card rounded-2xl overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="border-b border-[#E5EAF0] text-[#718096] text-xs">
            <tr>
              <th className="p-4">ID Top Up</th>
              <th className="p-4">Reseller</th>
              <th className="p-4">Nominal Saldo Wallet</th>
              <th className="p-4">Biaya Top Up ({loadedFeePct}%)</th>
              <th className="p-4">Total Pembayaran QRIS</th>
              <th className="p-4">Tanggal</th>
              <th className="p-4">Bukti</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5EAF0]">
            {loading ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-[#718096]">
                  Memuat daftar permintaan top up...
                </td>
              </tr>
            ) : topups.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-[#718096]">
                  Tidak ada permintaan top up sesuai filter saat ini.
                </td>
              </tr>
            ) : (
              topups.map((t) => {
                const badge = TOPUP_STATUS_BADGE[t.status] || TOPUP_STATUS_BADGE.pending_payment;
                return (
                  <tr key={t.id} className="hover:bg-[#F8FAFC]">
                    <td className="p-4">
                      <p className="font-mono-num font-bold text-[#102A43]">{t.topupNumber}</p>
                      <p className="text-[11px] font-mono-num text-[#718096]">{t.method}</p>
                    </td>
                    <td className="p-4">
                      <p className="font-semibold text-[#102A43]">{t.resellerName}</p>
                      <p className="text-xs font-mono-num text-[#244B75]">
                        @{t.resellerUsername} · {t.resellerId}
                      </p>
                      <p className="text-[11px] font-mono-num text-[#718096]">
                        +{t.resellerWhatsapp}
                      </p>
                    </td>
                    <td className="p-4 font-mono-num font-semibold text-emerald-700">
                      {formatIDR(t.walletCredit)}
                    </td>
                    <td className="p-4 font-mono-num text-[#244B75] font-semibold">
                      +{formatIDR(t.feeAmount)}
                      <span className="block text-[10px] text-[#718096] font-normal">
                        (Fee {t.feePercentage}%)
                      </span>
                    </td>
                    <td className="p-4 font-mono-num font-bold text-[#102A43]">
                      {formatIDR(t.totalPayment)}
                    </td>
                    <td className="p-4 text-xs font-mono-num text-[#718096] whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="p-4">
                      {t.proofUrl ? (
                        <button
                          type="button"
                          onClick={() => setProofPreviewTopup(t)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#EAF2FA] text-[#102A43] text-xs font-semibold hover:bg-[#dce9f6] cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Lihat Bukti
                        </button>
                      ) : (
                        <span className="text-xs text-[#718096]">Belum ada</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-semibold whitespace-nowrap ${badge.cls}`}
                      >
                        {badge.label}
                      </span>
                      {t.rejectionReason && (
                        <p className="text-[11px] text-rose-700 mt-1 max-w-[180px]">
                          {t.rejectionReason}
                        </p>
                      )}
                    </td>
                    <td className="p-4 text-right whitespace-nowrap space-x-2">
                      {t.status === 'pending_verification' && (
                        <>
                          <button
                            type="button"
                            disabled={processingId === t.id}
                            onClick={() => setApproveModalTopup(t)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Setujui Top Up
                          </button>
                          <button
                            type="button"
                            disabled={processingId === t.id}
                            onClick={() => {
                              setRejectModalTopup(t);
                              setRejectionReason('');
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            Tolak
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Top Up Configuration Panel */}
      <section className="surface-card rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5EAF0] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#EAF2FA] text-[#102A43] flex items-center justify-center">
              <Settings2 className="w-4 h-4" />
            </div>
              <div>
                <h3 className="text-base font-bold text-[#102A43]">
                  Pengaturan Nominal &amp; Biaya Layanan Top Up Reseller
                </h3>
                <p className="text-xs text-[#718096]">
                  Saat ini: Min {formatIDR(loadedMinAmount)} · Max {formatIDR(loadedMaxAmount)} ·
                  Biaya Tambahan Top Up {loadedFeePct}% (masuk ke pendapatan toko)
                </p>
              </div>
          </div>
          {!isSuperAdmin && (
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
              Perubahan % biaya khusus Super Admin
            </span>
          )}
        </div>

        <form onSubmit={handleSaveSettingsSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <label className="block space-y-1 text-xs font-semibold text-[#253449]">
            Minimal Top Up (Rp)
            <input
              type="number"
              required
              min={1000}
              step={1000}
              value={minAmountDraft}
              onChange={(e) => setMinAmountDraft(e.target.value)}
              className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-mono-num"
            />
          </label>

          <label className="block space-y-1 text-xs font-semibold text-[#253449]">
            Maksimal Top Up (Rp)
            <input
              type="number"
              required
              min={1000}
              step={1000}
              value={maxAmountDraft}
              onChange={(e) => setMaxAmountDraft(e.target.value)}
              className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-mono-num"
            />
          </label>

          <label className="block space-y-1 text-xs font-semibold text-[#253449]">
            Biaya Tambahan Top Up (%)
            <input
              type="number"
              required
              min={0}
              max={100}
              step={1}
              value={feePctDraft}
              onChange={(e) => setFeePctDraft(e.target.value)}
              className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-mono-num"
            />
          </label>

          <NavyButton
            type="submit"
            disabled={savingSettings}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan Top Up'}
          </NavyButton>
        </form>
      </section>

      {/* Proof Preview Modal */}
      {proofPreviewTopup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Bukti Pembayaran Top Up"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="surface-card rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#E5EAF0] pb-3">
              <div>
                <p className="text-xs font-mono-num font-bold text-[#244B75]">
                  {proofPreviewTopup.topupNumber}
                </p>
                <h3 className="text-base font-bold text-[#102A43]">
                  Bukti Transfer — {proofPreviewTopup.resellerName} (@{proofPreviewTopup.resellerUsername})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setProofPreviewTopup(null)}
                aria-label="Tutup pratinjau bukti"
                className="text-[#718096] hover:text-[#102A43] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E5EAF0]">
              <div>
                <p className="text-[#718096]">Pengirim</p>
                <p className="font-semibold text-[#102A43]">{proofPreviewTopup.payerName || '-'}</p>
                <p className="font-mono-num text-[#718096]">
                  +{proofPreviewTopup.payerWhatsapp || proofPreviewTopup.resellerWhatsapp}
                </p>
              </div>
              <div>
                <p className="text-[#718096]">Total Pembayaran QRIS</p>
                <p className="font-mono-num font-bold text-[#102A43] text-sm">
                  {formatIDR(proofPreviewTopup.totalPayment)}
                </p>
                <p className="text-[11px] font-mono-num text-emerald-700">
                  Saldo Wallet: {formatIDR(proofPreviewTopup.walletCredit)} · Fee{' '}
                  {proofPreviewTopup.feePercentage}%: {formatIDR(proofPreviewTopup.feeAmount)}
                </p>
              </div>
            </div>

            {proofPreviewTopup.proofUrl && (
              <div className="rounded-xl border border-[#E5EAF0] bg-[#F8FAFC] p-3 flex flex-col items-center gap-3">
                {isPdfUrl(proofPreviewTopup.proofUrl, proofPreviewTopup.proofMimeType) ? (
                  <div className="py-6 text-center space-y-2">
                    <FileText className="w-10 h-10 text-[#244B75] mx-auto" />
                    <p className="text-xs text-[#253449]">Lampiran berupa dokumen PDF.</p>
                  </div>
                ) : (
                  <img
                    src={proofPreviewTopup.proofUrl}
                    alt={`Bukti Top Up ${proofPreviewTopup.topupNumber}`}
                    className="max-h-80 w-auto rounded-lg object-contain border border-[#E5EAF0]"
                  />
                )}
                <a
                  href={proofPreviewTopup.proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#244B75] hover:underline"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Buka Lampiran di Tab Baru
                </a>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {proofPreviewTopup.status === 'pending_verification' && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const target = proofPreviewTopup;
                      setProofPreviewTopup(null);
                      setRejectModalTopup(target);
                      setRejectionReason('');
                    }}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Tolak Top Up
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const target = proofPreviewTopup;
                      setProofPreviewTopup(null);
                      setApproveModalTopup(target);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Setujui Top Up
                  </button>
                </>
              )}
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setProofPreviewTopup(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Tutup
              </NavyButton>
            </div>
          </div>
        </div>
      )}

      {/* Approve Confirmation Modal */}
      {approveModalTopup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Persetujuan Top Up"
          className="fixed inset-0 z-[60] bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2.5 text-[#102A43]">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <h3 className="text-lg font-bold">Konfirmasi Setujui Top Up</h3>
            </div>
            <p className="text-xs text-[#253449]">
              Pastikan mutasi dana QRIS masuk tepat sebesar{' '}
              <strong className="font-mono-num text-[#102A43]">
                {formatIDR(approveModalTopup.totalPayment)}
              </strong>{' '}
              sebelum mengkreditkan saldo wallet ke{' '}
              <strong className="text-[#102A43]">@{approveModalTopup.resellerUsername}</strong>.
            </p>
            <div className="rounded-xl bg-[#EAF2FA] border border-[#244B75]/20 p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#253449]">Saldo Masuk Wallet Reseller</span>
                <span className="font-mono-num font-semibold text-emerald-700">
                  +{formatIDR(approveModalTopup.walletCredit)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#253449]">
                  Biaya Tambahan Top Up ({approveModalTopup.feePercentage}%)
                </span>
                <span className="font-mono-num font-semibold text-[#244B75]">
                  +{formatIDR(approveModalTopup.feeAmount)}
                </span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-[#244B75]/20 font-bold text-sm">
                <span className="text-[#102A43] flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5" />
                  Total Pembayaran QRIS
                </span>
                <span className="font-mono-num text-[#102A43]">
                  {formatIDR(approveModalTopup.totalPayment)}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-[#718096]">
              Saldo wallet reseller bertambah tepat sebesar {formatIDR(approveModalTopup.walletCredit)}, dan biaya layanan {formatIDR(approveModalTopup.feeAmount)} tercatat sebagai pendapatan Catrizzz Store.
            </p>

            <div className="flex justify-end gap-2">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setApproveModalTopup(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Batal
              </NavyButton>
              <button
                type="button"
                disabled={processingId === approveModalTopup.id}
                onClick={() => handleApproveTopup(approveModalTopup)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                <Coins className="w-3.5 h-3.5" />
                {processingId === approveModalTopup.id ? 'Memproses...' : 'Ya, Setujui & Tambah Saldo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectModalTopup && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tolak Permintaan Top Up"
          className="fixed inset-0 z-[60] bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleRejectTopup}
            className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <h3 className="text-lg font-bold text-[#102A43]">
              Tolak Top Up {rejectModalTopup.topupNumber}
            </h3>
            <p className="text-xs text-[#718096]">
              Alasan penolakan akan ditampilkan pada riwayat top up reseller agar dapat ditindaklanjuti.
            </p>
            <textarea
              rows={3}
              required
              minLength={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Contoh: Nominal transfer QRIS belum sesuai atau bukti buram."
              className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setRejectModalTopup(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Batal
              </NavyButton>
              <button
                type="submit"
                disabled={processingId === rejectModalTopup.id}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {processingId === rejectModalTopup.id ? 'Menolak...' : 'Tolak Top Up'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fee % Change Confirmation Modal (Super Admin Only) */}
      {feeConfirmModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Perubahan Biaya Tambahan Top Up"
          className="fixed inset-0 z-[60] bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start gap-2.5 text-amber-800">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-[#102A43]">
                  Konfirmasi Perubahan Biaya Tambahan Top Up (Super Admin)
                </h3>
                <p className="text-xs text-[#718096] mt-0.5">
                  Anda mengubah persentase biaya tambahan top up dari <strong>{loadedFeePct}%</strong>{' '}
                  menjadi <strong>{feePctDraft}%</strong>.
                </p>
              </div>
            </div>

            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Alasan Perubahan (Wajib untuk Audit Log)
              <input
                type="text"
                required
                value={feeChangeReason}
                onChange={(e) => setFeeChangeReason(e.target.value)}
                placeholder="Contoh: Penyesuaian tarif biaya layanan pembayaran QRIS"
                className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-normal"
              />
            </label>

            <label className="flex items-start gap-2 text-xs text-[#253449] cursor-pointer">
              <input
                type="checkbox"
                checked={feeChangeConfirmed}
                onChange={(e) => setFeeChangeConfirmed(e.target.checked)}
                className="mt-0.5 accent-[#102A43]"
              />
              <span>
                Saya mengonfirmasi perubahan persentase biaya tambahan top up untuk permintaan berikutnya.
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setFeeConfirmModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Batal
              </NavyButton>
              <NavyButton
                type="button"
                disabled={
                  savingSettings || !feeChangeConfirmed || feeChangeReason.trim().length < 3
                }
                onClick={() => submitTopupSettings(true, feeChangeReason)}
                className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {savingSettings ? 'Menyimpan...' : 'Konfirmasi & Simpan'}
              </NavyButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
