import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Bell, Coins, Trash2 } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatIDR, type TopupFeeStats } from '../../shared/pricing';
import type { AuditLog, OrderStatus, PaymentStatus } from '../../shared/types';
import { OrderStatusBadge, PaymentStatusBadge } from '../StatusBadge';
import { NavyButton } from '../Interactive';
import type { AdminTab } from '../../pages/AdminPage';

interface OverviewResponse {
  stats: {
    totalSales: number;
    totalTransactions: number;
    newOrders: number;
    waitingPayment: number;
    pendingVerification: number;
    paidCount: number;
    processingCount: number;
    completedCount: number;
    cancelledCount: number;
    activeProducts: number;
    lowStockProducts: number;
    customerCount: number;
    resellerActiveCount?: number;
    resellerPendingCount?: number;
    resellerRejectedCount?: number;
    resellerSuspendedCount?: number;
    pendingTopupVerificationCount?: number;
    totalFeeCollected?: number;
    qrisEnabled?: boolean;
    qrisReady?: boolean;
    hasDemoData: boolean;
  };
  topupFeeStats?: TopupFeeStats;
  charts: {
    daily: Array<{ label: string; revenue: number; orders: number }>;
    weekly: Array<{ label: string; revenue: number; orders: number }>;
    monthly: Array<{ label: string; revenue: number; orders: number }>;
  };
  recentOrders?: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    totalAmount: number;
    paymentStatus: PaymentStatus;
    orderStatus: OrderStatus;
    createdAt: string;
  }>;
  recentAuditLogs?: AuditLog[];
}

export function AdminOverviewTab({
  onNavigateTab,
}: {
  onNavigateTab?: (tab: AdminTab) => void;
}) {
  const { getAuthHeader, showToast, refreshStorefront, subscribeRealtime } = useStore();
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'month' | 'custom'>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [chartView, setChartView] = useState<'daily' | 'weekly' | 'monthly' | 'orders'>('daily');
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmClearDemo, setConfirmClearDemo] = useState(false);
  const [clearingDemo, setClearingDemo] = useState(false);

  const loadOverview = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const headers = await getAuthHeader();
        const qs = new URLSearchParams({ range });
        if (range === 'custom' && customStart) qs.set('start', customStart);
        if (range === 'custom' && customEnd) qs.set('end', customEnd);
        const res = await fetch(`/api/admin/overview?${qs.toString()}`, {
          headers,
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) {
          setData(await res.json());
        } else if (!silent) {
          showToast('Gagal memuat ringkasan dashboard admin.', 'error');
        }
      } catch {
        if (!silent) {
          showToast('Koneksi bermasalah saat memuat ringkasan admin.', 'error');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [getAuthHeader, range, customStart, customEnd, showToast]
  );

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    return subscribeRealtime(
      ['overview', 'orders', 'payments', 'reseller_apps', 'topups', 'payment_settings', 'logs'],
      () => {
        loadOverview(true);
      }
    );
  }, [subscribeRealtime, loadOverview]);

  const handleClearDemo = async () => {
    setClearingDemo(true);
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/api/admin/demo-data/clear', {
        method: 'POST',
        headers,
        credentials: 'include',
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json) {
        showToast(`${json.removedCount} item data demo berhasil dihapus.`, 'success');
        setConfirmClearDemo(false);
        await loadOverview();
        await refreshStorefront();
      } else {
        showToast(json?.error || 'Gagal menghapus data demo.', 'error');
      }
    } catch {
      showToast('Gagal menghubungi server saat membersihkan data demo.', 'error');
    } finally {
      setClearingDemo(false);
    }
  };

  const stats = data?.stats;
  const series =
    chartView === 'weekly'
      ? data?.charts.weekly || []
      : chartView === 'monthly'
        ? data?.charts.monthly || []
        : data?.charts.daily || [];

  const maxVal = Math.max(
    1,
    ...series.map((s) => (chartView === 'orders' ? s.orders : s.revenue))
  );

  const kpiCards = stats
    ? [
        { label: 'Total Penjualan (Lunas)', val: formatIDR(stats.totalSales), accent: 'text-[#102A43]' },
        { label: 'Total Transaksi', val: String(stats.totalTransactions), accent: 'text-[#102A43]' },
        { label: 'Pesanan Baru', val: String(stats.newOrders), accent: 'text-[#102A43]' },
        { label: 'Menunggu Verifikasi Bayar', val: String(stats.pendingVerification), accent: 'text-amber-700' },
        { label: 'Pembayaran Berhasil', val: String(stats.paidCount), accent: 'text-emerald-700' },
        { label: 'Pesanan Diproses', val: String(stats.processingCount), accent: 'text-[#244B75]' },
        { label: 'Pesanan Selesai', val: String(stats.completedCount), accent: 'text-emerald-700' },
        { label: 'Produk Aktif', val: String(stats.activeProducts), accent: 'text-[#102A43]' },
        { label: 'Pending Approval Reseller', val: String(stats.resellerPendingCount ?? 0), accent: 'text-amber-700' },
        { label: 'Reseller Aktif', val: String(stats.resellerActiveCount ?? 0), accent: 'text-emerald-700' },
        { label: 'Reseller Ditolak', val: String(stats.resellerRejectedCount ?? 0), accent: 'text-rose-700' },
        { label: 'Pending Verifikasi Top Up', val: String(stats.pendingTopupVerificationCount ?? 0), accent: 'text-amber-700' },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Pending Reseller Notification Banner */}
      {(stats?.resellerPendingCount ?? 0) > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs sm:text-sm text-amber-900">
            <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-800 shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold">
                {stats?.resellerPendingCount} Pendaftaran Reseller Baru Menunggu Persetujuan Admin
              </p>
              <p className="text-xs text-amber-800">
                Tinjau data pendaftar dan lakukan Approve atau Reject pada tab RESELLER APPROVAL.
              </p>
            </div>
          </div>
          {onNavigateTab && (
            <button
              type="button"
              onClick={() => onNavigateTab('reseller-approval')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#102A43] hover:bg-[#244B75] text-white text-xs font-semibold cursor-pointer"
            >
              Buka RESELLER APPROVAL
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
          {[
            { id: 'today', label: 'Hari Ini' },
            { id: '7d', label: '7 Hari' },
            { id: '30d', label: '30 Hari' },
            { id: 'month', label: 'Bulan Ini' },
            { id: 'custom', label: 'Kustom' },
          ].map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setRange(btn.id as typeof range)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                range === btn.id
                  ? 'bg-[#102A43] text-white'
                  : 'text-[#718096] hover:text-[#102A43]'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {stats?.hasDemoData && (
          <button
            type="button"
            onClick={() => setConfirmClearDemo(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs font-semibold hover:bg-amber-100 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Hapus Data Demo
          </button>
        )}
      </div>

      {range === 'custom' && (
        <div className="flex flex-wrap items-center gap-3 surface-card rounded-xl p-3">
          <label className="text-xs font-semibold text-[#253449] flex items-center gap-2">
            Dari:
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="input-navy rounded-lg px-2.5 py-1.5 text-xs font-normal"
            />
          </label>
          <label className="text-xs font-semibold text-[#253449] flex items-center gap-2">
            Sampai:
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="input-navy rounded-lg px-2.5 py-1.5 text-xs font-normal"
            />
          </label>
        </div>
      )}

      {loading && !stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div
              key={i}
              className="h-24 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse"
            />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {kpiCards.map((card) => (
              <div
                key={card.label}
                data-spotlight="true"
                className="surface-card spotlight-surface rounded-2xl p-4 space-y-1.5"
              >
                <p className="text-xs text-[#718096]">{card.label}</p>
                <p className={`text-xl font-bold font-mono-num ${card.accent}`}>
                  {card.val}
                </p>
              </div>
            ))}
          </div>

          {data?.topupFeeStats && (
            <section
              aria-label="Ringkasan Fee Top Up Reseller"
              className="surface-card rounded-2xl p-5 space-y-3 border border-[#244B75]/20"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#102A43] text-white flex items-center justify-center">
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#102A43] uppercase tracking-wide">
                      BIAYA TAMBAHAN TOP UP RESELLER (10%)
                    </h3>
                    <p className="text-[11px] text-[#718096]">
                      Wallet reseller dikreditkan tepat sebesar nominal top up; biaya layanan 10% menjadi pendapatan Catrizzz Store
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px] font-mono-num">
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                    Menunggu Verifikasi: {data.topupFeeStats.pendingVerificationCount}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Disetujui: {data.topupFeeStats.approvedCount}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200">
                    Ditolak: {data.topupFeeStats.rejectedCount}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] p-3.5">
                  <p className="text-xs text-[#718096]">Pendapatan Fee Top Up (10%)</p>
                  <p className="text-lg font-bold font-mono-num text-emerald-700 mt-0.5">
                    {formatIDR(data.topupFeeStats.totalFeeCollected)}
                  </p>
                </div>
                <div className="rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] p-3.5">
                  <p className="text-xs text-[#718096]">Total Saldo Masuk Wallet</p>
                  <p className="text-lg font-bold font-mono-num text-[#102A43] mt-0.5">
                    {formatIDR(data.topupFeeStats.totalSaldoWallet)}
                  </p>
                </div>
                <div className="rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] p-3.5">
                  <p className="text-xs text-[#718096]">Total Pembayaran QRIS</p>
                  <p className="text-lg font-bold font-mono-num text-[#244B75] mt-0.5">
                    {formatIDR(data.topupFeeStats.totalQrisPayments)}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Chart Card */}
          <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#102A43]">
                  Analitik Penjualan &amp; Transaksi
                </h3>
                <p className="text-xs text-[#718096]">
                  Dihitung langsung dari catatan transaksi aktual di database.
                </p>
              </div>
              <div className="flex gap-1 p-1 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
                {[
                  { id: 'daily', label: 'Harian' },
                  { id: 'weekly', label: 'Mingguan' },
                  { id: 'monthly', label: 'Bulanan' },
                  { id: 'orders', label: 'Jumlah Transaksi' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setChartView(tab.id as typeof chartView)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                      chartView === tab.id
                        ? 'bg-[#102A43] text-white'
                        : 'text-[#718096] hover:text-[#102A43]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {series.length === 0 ? (
              <p className="text-sm text-[#718096] py-10 text-center">
                Belum ada transaksi tercatat pada rentang waktu ini.
              </p>
            ) : (
              <div className="h-52 flex items-end gap-2 pt-4 overflow-x-auto">
                {series.map((point) => {
                  const val = chartView === 'orders' ? point.orders : point.revenue;
                  const pct = Math.max(4, Math.round((val / maxVal) * 100));
                  return (
                    <div
                      key={point.label}
                      className="flex-1 min-w-[36px] flex flex-col items-center gap-2 group"
                    >
                      <span className="text-[10px] font-mono-num text-[#102A43] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {chartView === 'orders' ? `${val}x` : formatIDR(val)}
                      </span>
                      <div className="w-full h-36 flex items-end justify-center">
                        <div
                          style={{ height: `${pct}%` }}
                          className="w-full max-w-[36px] rounded-t-lg bg-[#244B75] group-hover:bg-[#102A43] transition-colors"
                          title={`${point.label}: ${
                            chartView === 'orders' ? `${val} transaksi` : formatIDR(val)
                          }`}
                        />
                      </div>
                      <span className="text-[10px] font-mono-num text-[#718096] truncate max-w-full">
                        {point.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Ringkasan Aktivitas Terbaru */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-[#102A43]">Pesanan Terbaru</h3>
                <p className="text-xs text-[#718096]">
                  Transaksi terbaru yang masuk ke sistem.
                </p>
              </div>
              {!data?.recentOrders || data.recentOrders.length === 0 ? (
                <p className="text-xs text-[#718096] py-6 text-center">
                  Belum ada pesanan terbaru.
                </p>
              ) : (
                <div className="divide-y divide-[#E5EAF0]">
                  {data.recentOrders.map((ord) => (
                    <div
                      key={ord.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-mono-num font-bold text-[#244B75]">
                          {ord.orderNumber}
                        </p>
                        <p className="text-[#253449]">{ord.customerName}</p>
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

            <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-base font-semibold text-[#102A43]">
                  Ringkasan Aktivitas Terbaru
                </h3>
                <p className="text-xs text-[#718096]">
                  Log perubahan &amp; aktivitas operasional admin.
                </p>
              </div>
              {!data?.recentAuditLogs || data.recentAuditLogs.length === 0 ? (
                <p className="text-xs text-[#718096] py-6 text-center">
                  Belum ada aktivitas admin tercatat.
                </p>
              ) : (
                <div className="divide-y divide-[#E5EAF0]">
                  {data.recentAuditLogs.map((log) => (
                    <div key={log.id} className="py-2.5 space-y-0.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono-num text-[#244B75] font-semibold">
                          {log.action}
                        </span>
                        <span className="text-[11px] font-mono-num text-[#718096]">
                          {new Date(log.createdAt).toLocaleString('id-ID', {
                            timeZone: 'Asia/Jakarta',
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-[#253449]">{log.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {confirmClearDemo && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4">
            <h3 className="text-lg font-semibold text-[#102A43]">
              Hapus Seluruh Data Demo?
            </h3>
            <p className="text-sm text-[#253449]">
              Tindakan ini akan menghapus produk, kategori, banner, dan kode kupon contoh yang bertanda demo. Data pesanan atau transaksi nyata tidak akan terhapus.
            </p>
            <div className="flex justify-end gap-2.5">
              <NavyButton
                type="button"
                variant="outline"
                disabled={clearingDemo}
                onClick={() => setConfirmClearDemo(false)}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer disabled:opacity-50"
              >
                Batal
              </NavyButton>
              <button
                type="button"
                disabled={clearingDemo}
                onClick={handleClearDemo}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
              >
                {clearingDemo ? 'Menghapus...' : 'Ya, Hapus Data Demo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
