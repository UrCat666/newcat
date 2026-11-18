import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Ban,
  Check,
  Coins,
  Copy,
  Eye,
  FileText,
  KeyRound,
  MessageCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatIDR } from '../../shared/pricing';
import type {
  LeaderboardRange,
  Order,
  OrderItemSnapshot,
  ResellerApplication,
  ResellerLeaderboardEntry,
  ResellerProfileStatus,
  ResellerStatusHistoryEntry,
  ResellerTopup,
  ResellerWallet,
  WalletTransaction,
} from '../../shared/types';
import { OrderStatusBadge, PaymentStatusBadge, ResellerAppStatusBadge } from '../StatusBadge';
import { NavyButton } from '../Interactive';

interface ResellerAdminRow {
  id: string;
  userId: string;
  username: string;
  name: string;
  email: string;
  whatsapp: string;
  referralCode: string;
  status: ResellerProfileStatus;
  statusHistory?: ResellerStatusHistoryEntry[];
  joinedAt: string;
  walletBalance: number;
  walletTotalTopup: number;
  walletTotalFeesPaid: number;
  walletTotalSpent: number;
  walletTotalTransactions: number;
  rank: number;
  attributedOrderCount: number;
  totalAttributedSales: number;
  attributedProductQty: number;
  topProductName: string;
  ownOrderCount: number;
  ownTotalSpent: number;
}

interface ResellerDetailResponse {
  reseller: ResellerAdminRow;
  application: ResellerApplication | null;
  wallet?: ResellerWallet;
  walletTransactions?: WalletTransaction[];
  topups?: ResellerTopup[];
  metrics: {
    attributedPaidCount: number;
    attributedPaidSales: number;
    attributedProductQty: number;
    ownPaidCount: number;
  };
  attributedOrders: Array<Order & { items: OrderItemSnapshot[] }>;
  ownOrders: Array<Order & { items: OrderItemSnapshot[] }>;
}

export function AdminResellerTab() {
  const { getAuthHeader, showToast, refreshResellerWallet, subscribeRealtime } = useStore();
  const [subTab, setSubTab] = useState<'verifications' | 'leaderboard' | 'list'>(
    'verifications'
  );
  const [range, setRange] = useState<LeaderboardRange>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const [applications, setApplications] = useState<ResellerApplication[]>([]);
  const [resellers, setResellers] = useState<ResellerAdminRow[]>([]);
  const [leaderboard, setLeaderboard] = useState<ResellerLeaderboardEntry[]>([]);
  const [summary, setSummary] = useState({
    totalResellers: 0,
    activeResellers: 0,
    newResellers: 0,
    suspendedResellers: 0,
    bannedResellers: 0,
    rejectedResellers: 0,
    pendingApplications: 0,
    totalWalletBalance: 0,
    totalTopupAmount: 0,
    totalFeeRevenue: 0,
    totalWalletSpent: 0,
    totalResellerOrders: 0,
  });

  const [rejectModalAppId, setRejectModalAppId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [detailData, setDetailData] = useState<ResellerDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activationModal, setActivationModal] = useState<{
    name: string;
    username: string;
    referralCode: string;
    whatsapp: string;
    activationUrl: string;
    isReissue: boolean;
  } | null>(null);

  // Manual wallet adjustment modal state
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustAction, setAdjustAction] = useState<'manual_credit' | 'manual_debit' | 'adjustment'>('manual_credit');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

  const loadResellers = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const headers = await getAuthHeader();
        const qs = new URLSearchParams({ range });
        if (search.trim()) qs.set('search', search.trim());
        const res = await fetch(`/api/admin/resellers?${qs.toString()}`, {
          headers,
          credentials: 'include',
          cache: 'no-store',
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json) {
          setApplications(json.applications || []);
          setResellers(json.resellers || []);
          setLeaderboard(json.leaderboard || []);
          if (json.summary) setSummary(json.summary);
        } else if (!silent) {
          showToast(json?.error || 'Gagal memuat data reseller.', 'error');
        }
      } catch {
        if (!silent) {
          showToast('Koneksi bermasalah saat memuat data reseller.', 'error');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [getAuthHeader, range, search, showToast]
  );

  useEffect(() => {
    loadResellers();
  }, [loadResellers]);

  useEffect(() => {
    return subscribeRealtime(
      ['resellers', 'reseller_apps', 'reseller_wallet', 'topups', 'orders'],
      () => {
        loadResellers(true);
      }
    );
  }, [subscribeRealtime, loadResellers]);

  const handleVerifyApplication = async (
    appId: string,
    decision: 'approve' | 'reject'
  ) => {
    if (decision === 'reject' && !rejectionReason.trim()) {
      showToast('Alasan penolakan pendaftaran reseller wajib diisi.', 'error');
      return;
    }

    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch(`/api/admin/resellers/applications/${appId}/verify`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          decision,
          rejectionReason: decision === 'reject' ? rejectionReason.trim() : undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal memverifikasi pendaftaran reseller.', 'error');
        return;
      }

      showToast(
        decision === 'approve'
          ? `Reseller disetujui. Kode referral ${json?.profile?.referralCode || ''} aktif.`
          : 'Pengajuan reseller ditolak.',
        'success'
      );
      if (decision === 'approve' && json?.activationPath) {
        const appObj = applications.find((a) => a.id === appId);
        setActivationModal({
          name: json.profile?.name || appObj?.applicantName || 'Reseller Baru',
          username: json.profile?.username || appObj?.username || '',
          referralCode: json.profile?.referralCode || '',
          whatsapp: appObj?.applicantWhatsapp || '',
          activationUrl: `${window.location.origin}${json.activationPath}`,
          isReissue: false,
        });
      }
      setRejectModalAppId(null);
      setRejectionReason('');
      await loadResellers();
    } catch {
      showToast('Koneksi bermasalah saat memverifikasi reseller.', 'error');
    }
  };

  const handleReissueActivation = async (row: ResellerAdminRow) => {
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`/api/admin/resellers/${row.id}/reissue-activation`, {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.activationPath) {
        showToast(json?.error || 'Gagal membuat tautan aktivasi baru.', 'error');
        return;
      }
      setActivationModal({
        name: json.name || row.name,
        username: json.username || row.username,
        referralCode: row.referralCode,
        whatsapp: json.whatsapp || row.whatsapp,
        activationUrl: `${window.location.origin}${json.activationPath}`,
        isReissue: true,
      });
      showToast(`Link aktivasi baru dibuat untuk @${row.username}.`, 'success');
    } catch {
      showToast('Koneksi bermasalah saat membuat link aktivasi.', 'error');
    }
  };

  const handleToggleResellerStatus = async (
    resellerId: string,
    nextStatus: ResellerProfileStatus
  ) => {
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch(`/api/admin/resellers/${resellerId}/status`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal memperbarui status reseller.', 'error');
        return;
      }
      const labelMap: Record<ResellerProfileStatus, string> = {
        active: 'Aktif',
        suspended: 'Suspended',
        banned: 'Banned',
        rejected: 'Ditolak',
        pending_approval: 'Pending Approval',
      };
      showToast(`Status reseller diperbarui menjadi ${labelMap[nextStatus]}.`, 'success');
      await loadResellers();
      if (detailData?.reseller.id === resellerId) {
        openResellerDetail(resellerId);
      }
    } catch {
      showToast('Koneksi bermasalah saat memperbarui status reseller.', 'error');
    }
  };

  const openResellerDetail = async (resellerId: string) => {
    setLoadingDetail(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`/api/admin/resellers/${resellerId}`, {
        headers,
        credentials: 'include',
      });
      if (res.ok) {
        setDetailData(await res.json());
      } else {
        showToast('Gagal memuat detail performa reseller.', 'error');
      }
    } catch {
      showToast('Koneksi bermasalah saat memuat detail reseller.', 'error');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleWalletAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailData) return;
    const parsedAmount = Math.round(Number(adjustAmount));
    if (!Number.isFinite(parsedAmount) || parsedAmount === 0) {
      showToast('Masukkan nominal penyesuaian saldo yang valid (tidak boleh 0).', 'error');
      return;
    }
    if (adjustReason.trim().length < 4) {
      showToast('Alasan penyesuaian saldo minimal 4 karakter.', 'error');
      return;
    }

    setSubmittingAdjust(true);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch(
        `/api/admin/resellers/${detailData.reseller.id}/wallet/adjust`,
        {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            action: adjustAction,
            amount: parsedAmount,
            reason: adjustReason.trim(),
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal menyesuaikan saldo wallet.', 'error');
        return;
      }
      showToast(
        `Saldo wallet @${detailData.reseller.username} berhasil disesuaikan menjadi ${formatIDR(json?.wallet?.balance ?? 0)}.`,
        'success'
      );
      setAdjustModalOpen(false);
      setAdjustAmount('');
      setAdjustReason('');
      await Promise.all([
        openResellerDetail(detailData.reseller.id),
        loadResellers(),
        refreshResellerWallet(),
      ]);
    } catch {
      showToast('Koneksi bermasalah saat menyesuaikan saldo wallet.', 'error');
    } finally {
      setSubmittingAdjust(false);
    }
  };

  const renderResellerStatusBadge = (status: ResellerProfileStatus) => {
    const cls =
      status === 'active'
        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
        : status === 'banned'
          ? 'bg-rose-100 border-rose-300 text-rose-800'
          : status === 'rejected'
            ? 'bg-rose-50 border-rose-200 text-rose-700'
            : status === 'pending_approval'
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : 'bg-amber-50 border-amber-200 text-amber-800';
    const label =
      status === 'active'
        ? 'Active'
        : status === 'banned'
          ? 'Banned'
          : status === 'rejected'
            ? 'Rejected'
            : status === 'pending_approval'
              ? 'Pending Approval'
              : 'Suspended';
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-semibold border whitespace-nowrap ${cls}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* KPI Summary (8+ metrics) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1">
          <p className="text-xs text-[#718096]">Total Reseller</p>
          <p className="text-2xl font-bold font-mono-num text-[#102A43]">
            {summary.totalResellers}
          </p>
          <p className="text-[11px] text-[#718096]">
            Aktif: <strong className="text-emerald-700">{summary.activeResellers}</strong> · Baru
            30h: <strong className="text-[#244B75]">{summary.newResellers}</strong>
          </p>
        </div>
        <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1">
          <p className="text-xs text-[#718096]">Total Saldo Wallet</p>
          <p className="text-xl font-bold font-mono-num text-[#102A43]">
            {formatIDR(summary.totalWalletBalance)}
          </p>
          <p className="text-[11px] text-[#718096]">Dana aktif seluruh reseller</p>
        </div>
        <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1">
          <p className="text-xs text-[#718096]">Total Top Up Masuk</p>
          <p className="text-xl font-bold font-mono-num text-emerald-700">
            {formatIDR(summary.totalTopupAmount)}
          </p>
          <p className="text-[11px] text-[#718096]">
            Pendapatan Fee Top Up (10%):{' '}
            <strong className="font-mono-num text-[#244B75]">
              {formatIDR(summary.totalFeeRevenue)}
            </strong>
          </p>
        </div>
        <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1">
          <p className="text-xs text-[#718096]">Wallet Terpakai &amp; Transaksi</p>
          <p className="text-xl font-bold font-mono-num text-[#102A43]">
            {formatIDR(summary.totalWalletSpent)}
          </p>
          <p className="text-[11px] text-[#718096]">
            {summary.totalResellerOrders} order reseller ·{' '}
            <span className="text-amber-700 font-semibold">
              {summary.pendingApplications} pending
            </span>{' '}
            ·{' '}
            <span className="text-rose-700 font-semibold">
              {summary.suspendedResellers + summary.bannedResellers} nonaktif
            </span>
          </p>
        </div>
      </div>

      {/* Sub-navigation + Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
          <button
            type="button"
            onClick={() => setSubTab('verifications')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'verifications'
                ? 'bg-[#102A43] text-white'
                : 'text-[#718096] hover:text-[#102A43]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Verifikasi Pendaftaran ({summary.pendingApplications})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('leaderboard')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'leaderboard'
                ? 'bg-[#102A43] text-white'
                : 'text-[#718096] hover:text-[#102A43]'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            Leaderboard Reseller
          </button>
          <button
            type="button"
            onClick={() => setSubTab('list')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'list'
                ? 'bg-[#102A43] text-white'
                : 'text-[#718096] hover:text-[#102A43]'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            Data Reseller ({resellers.length})
          </button>
        </div>

        <NavyButton
          type="button"
          variant="outline"
          onClick={() => loadResellers()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </NavyButton>
      </div>

      {/* SubTab 1: Applications Verification */}
      {subTab === 'verifications' && (
        <div className="space-y-4">
          {applications.length === 0 ? (
            <div className="surface-card rounded-2xl p-10 text-center text-sm text-[#718096]">
              Belum ada pengajuan pendaftaran reseller masuk.
            </div>
          ) : (
            applications.map((app) => (
              <div
                key={app.id}
                className="surface-card rounded-2xl p-5 flex flex-col md:flex-row gap-5 justify-between"
              >
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono-num font-bold text-[#102A43] text-sm">
                      {app.applicationNumber}
                    </span>
                    <ResellerAppStatusBadge status={app.status} />
                  </div>
                  <p className="text-sm font-semibold text-[#102A43]">
                    {app.applicantName}{' '}
                    <span className="text-xs font-mono-num text-[#244B75] font-normal">
                      (@{app.username})
                    </span>
                  </p>
                  <p className="text-[#718096]">
                    WhatsApp: <span className="font-mono-num text-[#253449]">+{app.applicantWhatsapp}</span> · Email:{' '}
                    {app.applicantEmail}
                  </p>
                  <p className="text-[#253449]">
                    Biaya Pendaftaran:{' '}
                    <strong className="font-mono-num text-emerald-700">
                      Gratis (Rp0)
                    </strong>
                  </p>
                  {app.notes && <p className="text-[#718096]">Catatan: {app.notes}</p>}
                  {app.rejectionReason && (
                    <p className="text-rose-700 font-medium">
                      Alasan Penolakan: {app.rejectionReason}
                    </p>
                  )}
                  {app.proofUrl && (
                    <a
                      href={app.proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[#244B75] font-semibold hover:underline pt-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Lihat Lampiran Bukti
                    </a>
                  )}
                </div>

                {(app.status === 'pending_approval' ||
                  app.status === 'pending_verification' ||
                  app.status === 'unpaid') && (
                  <div className="flex items-center gap-2 self-start">
                    <button
                      type="button"
                      onClick={() => handleVerifyApplication(app.id, 'approve')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Setujui Reseller
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectModalAppId(app.id);
                        setRejectionReason('');
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      Tolak
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* SubTab 2: Reseller Leaderboard */}
      {subTab === 'leaderboard' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
              {(
                [
                  { id: 'today', label: 'Hari Ini' },
                  { id: '7d', label: '7 Hari' },
                  { id: '30d', label: '30 Hari' },
                  { id: 'month', label: 'Bulan Ini' },
                  { id: 'all', label: 'Semua Waktu' },
                ] as const
              ).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                    range === r.id
                      ? 'bg-[#102A43] text-white'
                      : 'text-[#718096] hover:text-[#102A43]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari reseller / kode referral..."
                className="input-navy w-full rounded-xl pl-9 pr-3 py-2 text-xs"
              />
            </div>
          </div>

          <p className="text-xs text-[#718096]">
            Leaderboard menghitung hanya transaksi referral berstatus <strong className="text-[#102A43]">Lunas (Paid)</strong> dan tidak dibatalkan.
          </p>

          <div className="surface-card rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-[#E5EAF0] text-[#718096] text-xs">
                <tr>
                  <th className="p-4">Rank</th>
                  <th className="p-4">Reseller</th>
                  <th className="p-4">Kode Referral</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Order Sukses</th>
                  <th className="p-4">Produk Terjual</th>
                  <th className="p-4">Total Penjualan</th>
                  <th className="p-4">Produk Terlaris</th>
                  <th className="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EAF0]">
                {loading ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-[#718096]">
                      Memuat leaderboard reseller...
                    </td>
                  </tr>
                ) : leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-8 text-center text-[#718096]">
                      Belum ada reseller yang terdaftar.
                    </td>
                  </tr>
                ) : (
                  leaderboard.map((row) => (
                    <tr key={row.resellerId} className="hover:bg-[#F8FAFC]">
                      <td className="p-4 font-mono-num font-bold text-[#102A43]">
                        #{row.rank}
                      </td>
                      <td className="p-4">
                        <p className="font-semibold text-[#102A43]">{row.name}</p>
                        <p className="text-xs font-mono-num text-[#718096]">
                          @{row.username}
                        </p>
                      </td>
                      <td className="p-4 font-mono-num font-semibold text-[#244B75]">
                        {row.referralCode}
                      </td>
                      <td className="p-4">
                        {renderResellerStatusBadge(row.status)}
                      </td>
                      <td className="p-4 font-mono-num text-[#102A43]">
                        {row.attributedOrderCount}
                      </td>
                      <td className="p-4 font-mono-num text-[#102A43]">
                        {row.attributedProductQty}
                      </td>
                      <td className="p-4 font-mono-num font-bold text-[#102A43]">
                        {formatIDR(row.totalAttributedSales)}
                      </td>
                      <td className="p-4 text-xs text-[#253449]">
                        {row.topProductName}
                        {row.topProductQty > 0 ? ` (${row.topProductQty}x)` : ''}
                      </td>
                      <td className="p-4 text-right">
                        <NavyButton
                          type="button"
                          variant="outline"
                          onClick={() => openResellerDetail(row.resellerId)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Detail
                        </NavyButton>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SubTab 3: All Resellers Management */}
      {subTab === 'list' && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, username, kode referral..."
              className="input-navy w-full rounded-xl pl-9 pr-3 py-2 text-xs"
            />
          </div>

          <div className="surface-card rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-[#E5EAF0] text-[#718096] text-xs">
                <tr>
                  <th className="p-4">Reseller</th>
                  <th className="p-4">Kontak</th>
                  <th className="p-4">Kode Referral</th>
                  <th className="p-4">Saldo Wallet</th>
                  <th className="p-4">Belanja Pribadi</th>
                  <th className="p-4">Penjualan Referral</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EAF0]">
                {resellers.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-[#718096]">
                      Belum ada reseller yang terdaftar.
                    </td>
                  </tr>
                ) : (
                  resellers.map((r) => (
                    <tr key={r.id} className="hover:bg-[#F8FAFC]">
                      <td className="p-4">
                        <p className="font-semibold text-[#102A43]">{r.name}</p>
                        <p className="text-xs font-mono-num text-[#718096]">
                          @{r.username} · {r.id}
                        </p>
                      </td>
                      <td className="p-4 text-xs text-[#253449]">
                        <p className="font-mono-num">+{r.whatsapp}</p>
                        <p className="text-[#718096]">{r.email}</p>
                      </td>
                      <td className="p-4 font-mono-num font-bold text-[#244B75]">
                        {r.referralCode}
                      </td>
                      <td className="p-4 text-xs font-mono-num">
                        <p className="font-bold text-[#102A43]">
                          {formatIDR(r.walletBalance ?? 0)}
                        </p>
                        <p className="text-[11px] text-[#718096]">
                          Top up: {formatIDR(r.walletTotalTopup ?? 0)}
                        </p>
                      </td>
                      <td className="p-4 text-xs font-mono-num text-[#253449]">
                        {r.ownOrderCount} order · {formatIDR(r.ownTotalSpent)}
                      </td>
                      <td className="p-4 text-xs font-mono-num text-[#102A43] font-semibold">
                        {r.attributedOrderCount} order · {formatIDR(r.totalAttributedSales)}
                      </td>
                      <td className="p-4">{renderResellerStatusBadge(r.status)}</td>
                      <td className="p-4 text-right space-x-1.5 whitespace-nowrap">
                        <NavyButton
                          type="button"
                          variant="outline"
                          onClick={() => openResellerDetail(r.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Detail
                        </NavyButton>
                        {r.status === 'active' && (
                          <NavyButton
                            type="button"
                            variant="outline"
                            onClick={() => handleReissueActivation(r)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-[#244B75]" />
                            Aktivasi
                          </NavyButton>
                        )}
                        {r.status === 'active' ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleToggleResellerStatus(r.id, 'suspended')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold cursor-pointer hover:bg-amber-100"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              Suspend
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleResellerStatus(r.id, 'banned')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold cursor-pointer hover:bg-rose-100"
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                              Ban
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleResellerStatus(r.id, 'active')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold cursor-pointer hover:bg-emerald-100"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Aktifkan
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reject Application Modal */}
      {rejectModalAppId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-[#102A43]">
              Alasan Penolakan Reseller
            </h3>
            <p className="text-xs text-[#718096]">
              Alasan ini akan tampil pada status pengajuan di akun pengguna.
            </p>
            <textarea
              rows={3}
              required
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Contoh: Data pendaftaran belum lengkap atau username tidak sesuai ketentuan."
              className="input-navy w-full rounded-xl px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setRejectModalAppId(null)}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer"
              >
                Batal
              </NavyButton>
              <button
                type="button"
                onClick={() => handleVerifyApplication(rejectModalAppId, 'reject')}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold cursor-pointer"
              >
                Tolak Pengajuan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reseller Performance Detail Modal */}
      {(detailData || loadingDetail) && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="surface-card rounded-2xl max-w-3xl w-full p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            {loadingDetail || !detailData ? (
              <div className="h-48 rounded-xl bg-[#F8FAFC] animate-pulse" />
            ) : (
              <>
                <div className="flex items-start justify-between gap-4 border-b border-[#E5EAF0] pb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Award className="w-5 h-5 text-[#244B75]" />
                      <h3 className="font-display text-xl font-bold text-[#102A43]">
                        Detail Performa Reseller — {detailData.reseller.name}
                      </h3>
                    </div>
                    <p className="text-xs text-[#718096]">
                      @{detailData.reseller.username} · Kode:{' '}
                      <span className="font-mono-num font-bold text-[#244B75]">
                        {detailData.reseller.referralCode}
                      </span>{' '}
                      · +{detailData.reseller.whatsapp}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailData(null)}
                    aria-label="Tutup detail reseller"
                    className="p-1.5 rounded-lg text-[#718096] hover:text-[#102A43] cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="surface-subtle rounded-xl p-3">
                    <p className="text-[#718096]">Order Referral Lunas</p>
                    <p className="text-lg font-bold font-mono-num text-[#102A43] mt-0.5">
                      {detailData.metrics.attributedPaidCount}
                    </p>
                  </div>
                  <div className="surface-subtle rounded-xl p-3">
                    <p className="text-[#718096]">Nilai Referral Lunas</p>
                    <p className="text-lg font-bold font-mono-num text-[#102A43] mt-0.5">
                      {formatIDR(detailData.metrics.attributedPaidSales)}
                    </p>
                  </div>
                  <div className="surface-subtle rounded-xl p-3">
                    <p className="text-[#718096]">Produk Terjual (Ref)</p>
                    <p className="text-lg font-bold font-mono-num text-[#102A43] mt-0.5">
                      {detailData.metrics.attributedProductQty}
                    </p>
                  </div>
                  <div className="surface-subtle rounded-xl p-3">
                    <p className="text-[#718096]">Order Pribadi Lunas</p>
                    <p className="text-lg font-bold font-mono-num text-[#102A43] mt-0.5">
                      {detailData.metrics.ownPaidCount}
                    </p>
                  </div>
                </div>

                {/* Reseller Wallet & Manual Adjustment */}
                <div className="rounded-xl border border-[#244B75]/20 bg-[#F8FAFC] p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-[#244B75]" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#102A43]">
                        Reseller Wallet &amp; Mutasi Saldo
                      </h4>
                    </div>
                    <NavyButton
                      type="button"
                      onClick={() => {
                        setAdjustAction('manual_credit');
                        setAdjustAmount('');
                        setAdjustReason('');
                        setAdjustModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      <Coins className="w-3.5 h-3.5" />
                      Sesuaikan Saldo Manual
                    </NavyButton>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="rounded-lg bg-white border border-[#E5EAF0] p-2.5">
                      <p className="text-[#718096]">Saldo Aktif</p>
                      <p className="text-sm font-bold font-mono-num text-[#102A43] mt-0.5">
                        {formatIDR(detailData.wallet?.balance ?? 0)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white border border-[#E5EAF0] p-2.5">
                      <p className="text-[#718096]">Total Top Up</p>
                      <p className="text-sm font-bold font-mono-num text-emerald-700 mt-0.5">
                        {formatIDR(detailData.wallet?.totalTopup ?? 0)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white border border-[#E5EAF0] p-2.5">
                      <p className="text-[#718096]">Total Biaya Top Up (10%)</p>
                      <p className="text-sm font-bold font-mono-num text-[#244B75] mt-0.5">
                        {formatIDR(detailData.wallet?.totalFeesPaid ?? 0)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white border border-[#E5EAF0] p-2.5">
                      <p className="text-[#718096]">Total Belanja Wallet</p>
                      <p className="text-sm font-bold font-mono-num text-[#102A43] mt-0.5">
                        {formatIDR(detailData.wallet?.totalSpent ?? 0)}
                      </p>
                    </div>
                  </div>

                  {detailData.walletTransactions && detailData.walletTransactions.length > 0 ? (
                    <div className="divide-y divide-[#E5EAF0] border border-[#E5EAF0] rounded-xl bg-white px-3 max-h-48 overflow-y-auto">
                      {detailData.walletTransactions.slice(0, 10).map((tx) => {
                        const isCredit =
                          tx.type === 'topup' ||
                          tx.type === 'topup_bonus' ||
                          tx.type === 'refund' ||
                          tx.type === 'manual_credit' ||
                          (tx.type === 'adjustment' && tx.amount >= 0);
                        return (
                          <div
                            key={tx.id}
                            className="py-2.5 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="min-w-0">
                              <p className="font-semibold text-[#102A43] truncate">
                                {tx.description}
                              </p>
                              <p className="text-[11px] font-mono-num text-[#718096]">
                                {tx.txNumber} · {formatIDR(tx.balanceBefore)} &rarr;{' '}
                                {formatIDR(tx.balanceAfter)}
                                {tx.reason ? ` · Alasan: ${tx.reason}` : ''}
                              </p>
                            </div>
                            <span
                              className={`font-mono-num font-bold whitespace-nowrap ${
                                isCredit ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {isCredit ? '+' : '-'}
                              {formatIDR(Math.abs(tx.amount))}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-[#718096]">Belum ada riwayat mutasi saldo wallet.</p>
                  )}
                </div>

                {/* Status Audit History Timeline */}
                {(detailData.reseller.statusHistory || detailData.application?.statusHistory) && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-[#718096]">
                      Riwayat Perubahan Status Reseller
                    </h4>
                    <div className="divide-y divide-[#E5EAF0] border border-[#E5EAF0] rounded-xl bg-white px-4">
                      {(detailData.reseller.statusHistory?.length
                        ? detailData.reseller.statusHistory
                        : detailData.application?.statusHistory || []
                      ).map((entry) => (
                        <div
                          key={entry.id}
                          className="py-2.5 flex flex-wrap items-start justify-between gap-2 text-xs"
                        >
                          <div className="space-y-0.5">
                            <p className="font-semibold text-[#102A43]">
                              {entry.previousStatus ? `${entry.previousStatus} → ` : ''}
                              <span className="font-mono-num text-[#244B75]">{entry.newStatus}</span>
                            </p>
                            {entry.reason && (
                              <p className="text-[11px] text-[#253449]">
                                Keterangan: {entry.reason}
                              </p>
                            )}
                            <p className="text-[11px] text-[#718096]">
                              Oleh: {entry.changedByName}
                            </p>
                          </div>
                          <span className="font-mono-num text-[11px] text-[#718096]">
                            {new Date(entry.createdAt).toLocaleString('id-ID', {
                              timeZone: 'Asia/Jakarta',
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#718096]">
                    Transaksi Referral Teratribusi ({detailData.attributedOrders.length})
                  </h4>
                  {detailData.attributedOrders.length === 0 ? (
                    <p className="text-xs text-[#718096] p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
                      Belum ada transaksi referral yang tercatat.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#E5EAF0] border border-[#E5EAF0] rounded-xl px-4">
                      {detailData.attributedOrders.map((ord) => (
                        <div
                          key={ord.id}
                          className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <p className="font-mono-num font-bold text-[#102A43]">
                              {ord.orderNumber}
                            </p>
                            <p className="text-[#718096]">{ord.customerName}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <PaymentStatusBadge status={ord.paymentStatus} />
                            <OrderStatusBadge status={ord.orderStatus} />
                          </div>
                          <span className="font-mono-num font-bold text-[#102A43]">
                            {formatIDR(ord.totalAmount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[#718096]">
                    Pembelian Pribadi Reseller ({detailData.ownOrders.length})
                  </h4>
                  {detailData.ownOrders.length === 0 ? (
                    <p className="text-xs text-[#718096] p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
                      Reseller ini belum melakukan pembelian pribadi.
                    </p>
                  ) : (
                    <div className="divide-y divide-[#E5EAF0] border border-[#E5EAF0] rounded-xl px-4">
                      {detailData.ownOrders.map((ord) => (
                        <div
                          key={ord.id}
                          className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <p className="font-mono-num font-bold text-[#102A43]">
                              {ord.orderNumber}
                            </p>
                            <p className="text-[#718096]">
                              Diskon Reseller: -{formatIDR(ord.resellerDiscountTotal || 0)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <PaymentStatusBadge status={ord.paymentStatus} />
                            <OrderStatusBadge status={ord.orderStatus} />
                          </div>
                          <span className="font-mono-num font-bold text-[#102A43]">
                            {formatIDR(ord.totalAmount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Reseller One-Time Activation Link Modal */}
      {activationModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Link Aktivasi Reseller"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="surface-card rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[#E5EAF0] pb-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#244B75]">
                  {activationModal.isReissue
                    ? 'Link Aktivasi / Reset Password Reseller'
                    : 'Reseller Disetujui & Siap Aktivasi'}
                </p>
                <h3 className="font-display text-lg font-bold text-[#102A43] mt-0.5">
                  {activationModal.name} (@{activationModal.username})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActivationModal(null)}
                aria-label="Tutup modal aktivasi"
                className="p-1.5 rounded-lg text-[#718096] hover:text-[#102A43] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] space-y-2 text-xs">
              <p className="text-[#253449]">
                Kode Referral Resmi:{' '}
                <strong className="font-mono-num text-[#102A43]">
                  {activationModal.referralCode}
                </strong>
              </p>
              <p className="text-[#718096]">
                Kirimkan tautan aktivasi sekali pakai berikut kepada reseller untuk membuat password login portal reseller (`/reseller/login`):
              </p>
              <input
                type="text"
                readOnly
                data-testid="activation-link-input"
                value={activationModal.activationUrl}
                className="w-full rounded-lg bg-white border border-[#E5EAF0] px-3 py-2 font-mono-num text-[11px] text-[#102A43]"
              />
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <NavyButton
                type="button"
                variant="outline"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(activationModal.activationUrl);
                    showToast('Link aktivasi reseller berhasil disalin.', 'success');
                  } catch {
                    showToast('Gagal menyalin link aktivasi.', 'error');
                  }
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Salin Link Aktivasi
              </NavyButton>
              {activationModal.whatsapp && (
                <a
                  href={`https://wa.me/${activationModal.whatsapp}?text=${encodeURIComponent(
                    `Halo ${activationModal.name}, pendaftaran Reseller Catrizzz Store Anda (@${activationModal.username}) telah DISETUJUI! Kode Referral: ${activationModal.referralCode}. Silakan buat password akun reseller Anda melalui tautan berikut: ${activationModal.activationUrl}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Kirim ke WhatsApp Reseller
                </a>
              )}
              <NavyButton
                type="button"
                onClick={() => setActivationModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Selesai
              </NavyButton>
            </div>
          </div>
        </div>
      )}
      {/* Manual Wallet Adjustment Modal */}
      {adjustModalOpen && detailData && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sesuaikan Saldo Wallet Reseller"
          className="fixed inset-0 z-[60] bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleWalletAdjustmentSubmit}
            className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#E5EAF0] pb-3">
              <div>
                <h3 className="text-base font-bold text-[#102A43]">
                  Sesuaikan Saldo Wallet Manual
                </h3>
                <p className="text-xs text-[#718096]">
                  @{detailData.reseller.username} · Saldo saat ini:{' '}
                  <strong className="font-mono-num text-[#102A43]">
                    {formatIDR(detailData.wallet?.balance ?? 0)}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustModalOpen(false)}
                className="text-[#718096] hover:text-[#102A43] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Jenis Penyesuaian
              <select
                value={adjustAction}
                onChange={(e) =>
                  setAdjustAction(
                    e.target.value as 'manual_credit' | 'manual_debit' | 'adjustment'
                  )
                }
                className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
              >
                <option value="manual_credit">Tambah Saldo (Manual Credit)</option>
                <option value="manual_debit">Kurangi Saldo (Manual Debit)</option>
                <option value="adjustment">Penyesuaian (+/- Adjustment)</option>
              </select>
            </label>

            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Nominal (Rp){adjustAction === 'adjustment' ? ' — gunakan minus (-) untuk mengurangi' : ''}
              <input
                type="number"
                required
                min={adjustAction === 'adjustment' ? undefined : 1}
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.value)}
                placeholder="Contoh: 25000"
                className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-mono-num font-normal"
              />
            </label>

            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Alasan Penyesuaian (Wajib untuk Audit Log)
              <textarea
                rows={3}
                required
                minLength={4}
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="Contoh: Kompensasi kendala transaksi atau koreksi manual."
                className="input-navy w-full rounded-xl px-3.5 py-2 text-sm font-normal"
              />
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setAdjustModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Batal
              </NavyButton>
              <NavyButton
                type="submit"
                disabled={submittingAdjust}
                className="px-4 py-2 rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {submittingAdjust ? 'Menyimpan...' : 'Simpan Penyesuaian'}
              </NavyButton>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
