import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowDownCircle,
  Award,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  EyeOff,
  History,
  Package,
  Search,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatIDR } from '../shared/pricing';
import { OrderStatusBadge, PaymentStatusBadge } from '../components/StatusBadge';
import { NavyButton } from '../components/Interactive';
import { ResellerLayout } from '../components/reseller/ResellerLayout';
import type {
  OrderStatus,
  PaymentStatus,
  ResellerProfileStatus,
  ResellerStatusHistoryEntry,
  ResellerTopup,
  ResellerWallet,
  WalletTransaction,
} from '../shared/types';

interface ResellerDashboardPayload {
  readOnly: boolean;
  profile: {
    id: string;
    name: string;
    username: string;
    email?: string;
    whatsapp?: string;
    referralCode: string;
    referralPath: string;
    status: ResellerProfileStatus;
    statusHistory?: ResellerStatusHistoryEntry[];
    joinedAt: string;
    discountPercent: number;
  };
  wallet: ResellerWallet;
  topupConfig: {
    minAmount: number;
    maxAmount: number;
    feePercentage: number;
  };
  recentTransactions: WalletTransaction[];
  recentTopups: ResellerTopup[];
  overview: {
    totalOrders: number;
    successfulOrders: number;
    totalSpent: number;
    totalProductsPurchased: number;
    pendingOrders: number;
    totalResellerSavings: number;
  };
  purchaseHistory: Array<{
    id: string;
    orderNumber: string;
    createdAt: string;
    subtotalNormal: number;
    resellerDiscountTotal: number;
    totalAmount: number;
    pricingTier: 'normal' | 'reseller';
    paymentMethod?: 'QRIS' | 'WALLET';
    paymentStatus: PaymentStatus;
    orderStatus: OrderStatus;
    receiptTokenMasked: string;
    items: Array<{
      id: string;
      productId: string;
      productName: string;
      variantName?: string;
      originalUnitPrice: number;
      resellerUnitPrice: number;
      quantity: number;
      lineSubtotal: number;
    }>;
  }>;
  attributedStats: {
    successfulCount: number;
    pendingOrOtherCount: number;
    totalValue: number;
    totalProductQty: number;
    topProduct: { name: string; qty: number };
    transactions: Array<{
      id: string;
      orderNumber: string;
      customerInitial: string;
      maskedWhatsapp: string;
      totalAmount: number;
      paymentStatus: PaymentStatus;
      orderStatus: OrderStatus;
      createdAt: string;
      itemsCount: number;
    }>;
  };
}

export function ResellerDashboardPage() {
  const { userProfile, isResellerActive, showToast, refreshResellerWallet, subscribeRealtime } =
    useStore();
  const location = useLocation();

  const [data, setData] = useState<ResellerDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [hideBalance, setHideBalance] = useState(false);

  useEffect(() => {
    document.title = 'Dashboard Reseller — Catrizzz Store';
  }, []);

  const loadDashboard = useCallback(
    async (silent = false) => {
      if (!userProfile || !isResellerActive) {
        if (!silent) setLoading(false);
        return;
      }
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const params = new URLSearchParams();
        if (search.trim()) params.set('search', search.trim());
        if (paymentStatusFilter !== 'all') params.set('paymentStatus', paymentStatusFilter);
        const res = await fetch(`/api/reseller/dashboard?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'Gagal memuat dashboard reseller.');
        }
        setData(json);
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Gagal memuat dashboard reseller.');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [userProfile, isResellerActive, search, paymentStatusFilter]
  );

  useEffect(() => {
    loadDashboard(false);
    if (isResellerActive) {
      refreshResellerWallet();
    }
  }, [loadDashboard, isResellerActive, refreshResellerWallet]);

  useEffect(() => {
    return subscribeRealtime(
      ['reseller_wallet', 'topups', 'orders', 'resellers', 'payment_settings', 'storefront'],
      () => {
        if (isResellerActive) {
          refreshResellerWallet();
        }
        loadDashboard(true);
      }
    );
  }, [subscribeRealtime, isResellerActive, refreshResellerWallet, loadDashboard]);

  useEffect(() => {
    if (location.hash === '#riwayat-transaksi' && data) {
      const el = document.getElementById('riwayat-transaksi');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [location.hash, data]);

  const copyText = async (val: string, label: string) => {
    try {
      await navigator.clipboard.writeText(val);
      showToast(`${label} berhasil disalin.`, 'success');
    } catch {
      showToast('Gagal menyalin ke clipboard.', 'error');
    }
  };

  return (
    <ResellerLayout>
      {loading && !data ? (
        <div className="space-y-6">
          <div className="h-56 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse"
              />
            ))}
          </div>
        </div>
      ) : error || !data ? (
        <div className="surface-card rounded-2xl p-10 text-center space-y-4">
          <p className="text-sm text-rose-700">{error || 'Data dashboard belum tersedia.'}</p>
          <NavyButton
            type="button"
            onClick={() => loadDashboard(false)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
          >
            Muat Ulang
          </NavyButton>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Minimalist Blue Glow Main Balance Card */}
          <section
            aria-label="Kartu Saldo Reseller Wallet"
            className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#102A43] via-[#17395B] to-[#244B75] text-white p-6 sm:p-8 shadow-[0_18px_45px_-12px_rgba(36,75,117,0.45)] border border-[#244B75]/40"
          >
            <div
              className="pointer-events-none absolute -top-24 -right-24 w-72 h-72 rounded-full bg-[#60A5FA]/15 blur-3xl"
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute -bottom-24 -left-16 w-64 h-64 rounded-full bg-[#93C5FD]/10 blur-3xl"
              aria-hidden="true"
            />

            <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#EAF2FA]">
                  <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                    <Wallet className="w-4 h-4 text-[#93C5FD]" />
                    Reseller Wallet Resmi
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-num">{data.profile.id}</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#93C5FD] font-semibold">
                    Harga Reseller -20% · Biaya Top Up {data.topupConfig.feePercentage}% · Daftar Gratis Rp0
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <p className="text-xs font-medium text-[#CBD5E1]">Saldo Tersedia</p>
                    <button
                      type="button"
                      onClick={() => setHideBalance((v) => !v)}
                      aria-label={hideBalance ? 'Tampilkan saldo wallet' : 'Sembunyikan saldo wallet'}
                      className="p-1 rounded-lg hover:bg-white/10 text-[#EAF2FA] transition-colors cursor-pointer"
                    >
                      {hideBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p
                    data-testid="wallet-balance-display"
                    className="font-display text-3xl sm:text-4xl font-bold font-mono-num tracking-tight text-white"
                  >
                    {hideBalance ? 'Rp••••••••' : formatIDR(data.wallet.balance)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2.5 pt-1">
                  <Link
                    to="/reseller/topup"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-[#102A43] hover:bg-[#EAF2FA] text-xs sm:text-sm font-bold shadow-sm whitespace-nowrap transition-colors"
                  >
                    <ArrowDownCircle className="w-4 h-4" />
                    Top Up Saldo
                  </Link>
                  <Link
                    to="/reseller/wallet/history"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors"
                  >
                    <History className="w-4 h-4" />
                    Riwayat Saldo
                  </Link>
                  <Link
                    to="/produk"
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Belanja Sekarang
                  </Link>
                </div>
              </div>

              {/* Right Wallet Metrics Strip */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full xl:w-auto xl:min-w-[360px]">
                <div className="min-w-0 rounded-xl bg-white/10 border border-white/15 px-3 sm:px-4 py-3 space-y-0.5">
                  <p className="text-[11px] text-[#CBD5E1] truncate">Total Top Up</p>
                  <p className="text-sm sm:text-base font-bold font-mono-num text-white truncate">
                    {hideBalance ? 'Rp••••' : formatIDR(data.wallet.totalTopup)}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl bg-white/10 border border-white/15 px-3 sm:px-4 py-3 space-y-0.5">
                  <p className="text-[11px] text-[#CBD5E1] truncate">
                    Biaya Top Up ({data.topupConfig.feePercentage}%)
                  </p>
                  <p
                    data-testid="wallet-total-fees-paid"
                    className="text-sm sm:text-base font-bold font-mono-num text-[#93C5FD] truncate"
                  >
                    {hideBalance ? 'Rp••••' : formatIDR(data.wallet.totalFeesPaid ?? 0)}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl bg-white/10 border border-white/15 px-3 sm:px-4 py-3 space-y-0.5">
                  <p className="text-[11px] text-[#CBD5E1] truncate">Total Pengeluaran</p>
                  <p className="text-sm sm:text-base font-bold font-mono-num text-white truncate">
                    {hideBalance ? 'Rp••••' : formatIDR(data.wallet.totalSpent)}
                  </p>
                </div>
                <div className="min-w-0 rounded-xl bg-white/10 border border-white/15 px-3 sm:px-4 py-3 space-y-0.5">
                  <p className="text-[11px] text-[#CBD5E1] truncate">Transaksi Sukses</p>
                  <p className="text-sm sm:text-base font-bold font-mono-num text-white">
                    {data.wallet.totalTransactions}x
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Reseller Identity & Referral Box */}
          <section className="surface-subtle rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-[#244B75] font-semibold">
                <Award className="w-4 h-4" />
                <span>Mitra Reseller Resmi</span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Sparkles className="w-3.5 h-3.5" />
                  Harga Khusus Reseller Aktif
                </span>
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-[#102A43]">
                Selamat Datang, {data.profile.name}
              </h1>
              <p className="text-xs text-[#718096]">
                ID Reseller:{' '}
                <span className="font-mono-num font-semibold text-[#102A43]">{data.profile.id}</span>
                {' · '}Username:{' '}
                <span className="font-mono-num text-[#102A43]">@{data.profile.username}</span>
                {' · '}Bergabung{' '}
                {new Date(data.profile.joinedAt).toLocaleDateString('id-ID', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>

            <div className="surface-card rounded-xl p-4 space-y-2 lg:min-w-[340px]">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#718096]">
                  Kode &amp; Tautan Referral Anda
                </span>
                <span className="font-mono-num text-xs font-bold text-[#102A43] bg-[#EAF2FA] px-2 py-0.5 rounded">
                  {data.profile.referralCode}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${window.location.origin}${data.profile.referralPath}`}
                  aria-label="Tautan referral reseller"
                  className="w-full bg-[#F8FAFC] border border-[#E5EAF0] rounded-lg px-2.5 py-1.5 text-xs font-mono-num text-[#253449]"
                />
                <NavyButton
                  type="button"
                  onClick={() =>
                    copyText(
                      `${window.location.origin}${data.profile.referralPath}`,
                      'Link referral'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Salin
                </NavyButton>
              </div>
            </div>
          </section>

          {/* KPI Overview */}
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#718096]">
                <span>Total Belanja Reseller</span>
                <ShoppingBag className="w-4 h-4 text-[#244B75]" />
              </div>
              <p className="font-display text-2xl font-bold font-mono-num text-[#102A43]">
                {formatIDR(data.overview.totalSpent)}
              </p>
              <p className="text-xs text-emerald-700 font-medium">
                Hemat {formatIDR(data.overview.totalResellerSavings)} dari harga normal
              </p>
            </div>

            <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#718096]">
                <span>Transaksi Berhasil</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="font-display text-2xl font-bold font-mono-num text-[#102A43]">
                {data.overview.successfulOrders} / {data.overview.totalOrders}
              </p>
              <p className="text-xs text-[#718096]">
                {data.overview.totalProductsPurchased} item digital berhasil dibeli
              </p>
            </div>

            <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#718096]">
                <span>Menunggu Verifikasi</span>
                <Clock className="w-4 h-4 text-amber-600" />
              </div>
              <p className="font-display text-2xl font-bold font-mono-num text-[#102A43]">
                {data.overview.pendingOrders}
              </p>
              <p className="text-xs text-[#718096]">Pesanan dalam review admin</p>
            </div>

            <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-5 space-y-2">
              <div className="flex items-center justify-between text-xs text-[#718096]">
                <span>Penjualan via Referral</span>
                <TrendingUp className="w-4 h-4 text-[#244B75]" />
              </div>
              <p className="font-display text-2xl font-bold font-mono-num text-[#102A43]">
                {formatIDR(data.attributedStats.totalValue)}
              </p>
              <p className="text-xs text-[#718096]">
                {data.attributedStats.successfulCount} transaksi lunas ·{' '}
                {data.attributedStats.totalProductQty} produk
              </p>
            </div>
          </section>

          {/* Recent Wallet Mutations Preview */}
          <section className="surface-card rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-[#102A43]">
                  Mutasi Wallet Terbaru
                </h2>
                <p className="text-xs text-[#718096]">
                  Catatan saldo masuk (top up), pembelian produk, dan refund.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to="/reseller/topup/history"
                  className="btn-navy-outline px-3 py-1.5 rounded-xl text-xs font-semibold"
                >
                  Riwayat Top Up
                </Link>
                <Link
                  to="/reseller/wallet/history"
                  className="btn-navy-primary px-3 py-1.5 rounded-xl text-xs font-semibold"
                >
                  Semua Mutasi Saldo
                </Link>
              </div>
            </div>

            {data.recentTransactions.length === 0 ? (
              <div className="p-6 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] text-center space-y-2">
                <p className="text-xs text-[#718096]">
                  Belum ada mutasi saldo wallet. Lakukan top up saldo via QRIS (biaya tambahan{' '}
                  {data.topupConfig.feePercentage}%) untuk bertransaksi instan dengan harga reseller.
                </p>
                <Link
                  to="/reseller/topup"
                  className="btn-navy-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  <ArrowDownCircle className="w-3.5 h-3.5" />
                  Top Up Sekarang
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[#E5EAF0] border border-[#E5EAF0] rounded-xl px-4">
                {data.recentTransactions.slice(0, 5).map((tx) => {
                  const isDebit =
                    tx.type === 'purchase' ||
                    tx.type === 'manual_debit' ||
                    (tx.type === 'adjustment' && tx.amount < 0);
                  return (
                    <div
                      key={tx.id}
                      className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-semibold text-[#102A43] truncate">{tx.description}</p>
                        <p className="text-[11px] font-mono-num text-[#718096]">
                          {tx.txNumber} ·{' '}
                          {new Date(tx.createdAt).toLocaleString('id-ID', {
                            timeZone: 'Asia/Jakarta',
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </p>
                      </div>
                      <div className="text-right font-mono-num shrink-0">
                        <p
                          className={`font-bold ${
                            isDebit ? 'text-rose-700' : 'text-emerald-700'
                          }`}
                        >
                          {isDebit ? '-' : '+'}
                          {formatIDR(Math.abs(tx.amount))}
                        </p>
                        <p className="text-[11px] text-[#718096]">
                          Saldo: {formatIDR(tx.balanceAfter)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Purchase History */}
          <section id="riwayat-transaksi" className="surface-card rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-lg font-bold text-[#102A43]">
                  Riwayat Transaksi &amp; Pembelian
                </h2>
                <p className="text-xs text-[#718096]">
                  Seluruh pembelian produk digital pribadi melalui Reseller Wallet maupun QRIS.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative">
                  <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nomor order / produk..."
                    className="input-navy rounded-xl pl-9 pr-3 py-2 text-xs w-full sm:w-56"
                  />
                </div>
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  aria-label="Filter status pembayaran"
                  className="input-navy rounded-xl px-3 py-2 text-xs"
                >
                  <option value="all">Semua Status Bayar</option>
                  <option value="paid">Lunas (Paid)</option>
                  <option value="pending_verification">Menunggu Verifikasi</option>
                  <option value="unpaid">Belum Dibayar</option>
                  <option value="refunded">Refund ke Wallet</option>
                  <option value="rejected">Ditolak</option>
                </select>
              </div>
            </div>

            {data.purchaseHistory.length === 0 ? (
              <div className="p-10 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] text-center space-y-3">
                <Package className="w-8 h-8 text-[#718096] mx-auto" />
                <p className="text-sm font-medium text-[#102A43]">
                  Belum ada riwayat pembelian yang sesuai.
                </p>
                <Link
                  to="/produk"
                  className="btn-navy-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  Belanja Produk Digital Reseller
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E5EAF0] text-[#718096]">
                      <th className="py-3 pr-4 font-semibold">Order &amp; Metode</th>
                      <th className="py-3 pr-4 font-semibold">Produk Digital</th>
                      <th className="py-3 pr-4 font-semibold">Normal vs Reseller</th>
                      <th className="py-3 pr-4 font-semibold">Total Bayar</th>
                      <th className="py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5EAF0]">
                    {data.purchaseHistory.map((ord) => (
                      <tr key={ord.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-3.5 pr-4 align-top whitespace-nowrap">
                          <p className="font-mono-num font-bold text-[#102A43]">
                            {ord.orderNumber}
                          </p>
                          <p className="text-[11px] text-[#718096] mt-0.5">
                            {new Date(ord.createdAt).toLocaleDateString('id-ID', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}{' '}
                            ·{' '}
                            <span className="font-semibold text-[#244B75]">
                              {ord.paymentMethod === 'WALLET' ? 'Reseller Wallet' : 'QRIS'}
                            </span>
                          </p>
                          <Link
                            to={`/pembayaran/${ord.id}`}
                            className="text-[11px] font-semibold text-[#244B75] hover:underline mt-1 inline-block"
                          >
                            Detail Pesanan
                          </Link>
                        </td>
                        <td className="py-3.5 pr-4 align-top space-y-1">
                          {ord.items.map((it) => (
                            <div key={it.id} className="text-[#253449]">
                              <span className="font-medium text-[#102A43]">{it.productName}</span>
                              {it.variantName ? ` (${it.variantName})` : ''} × {it.quantity}
                            </div>
                          ))}
                        </td>
                        <td className="py-3.5 pr-4 align-top whitespace-nowrap">
                          <p className="font-mono-num line-through text-[#718096]">
                            {formatIDR(ord.subtotalNormal)}
                          </p>
                          {ord.resellerDiscountTotal > 0 && (
                            <p className="font-mono-num text-[#244B75] font-semibold">
                              Hemat -{formatIDR(ord.resellerDiscountTotal)}
                            </p>
                          )}
                        </td>
                        <td className="py-3.5 pr-4 align-top whitespace-nowrap font-mono-num font-bold text-[#102A43]">
                          {formatIDR(ord.totalAmount)}
                        </td>
                        <td className="py-3.5 align-top space-y-1">
                          <PaymentStatusBadge status={ord.paymentStatus} />
                          <div>
                            <OrderStatusBadge status={ord.orderStatus} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Attributed Referral Sales */}
          <section className="surface-card rounded-2xl p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-[#102A43]">
                  Statistik Penjualan Referral Teratribusi
                </h2>
                <p className="text-xs text-[#718096]">
                  Hanya transaksi berstatus lunas &amp; tidak dibatalkan yang dihitung ke total performa resmi.
                </p>
              </div>
              {data.attributedStats.topProduct.qty > 0 && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EAF2FA] text-xs font-semibold text-[#102A43]">
                  Produk Terlaris: {data.attributedStats.topProduct.name} (
                  {data.attributedStats.topProduct.qty}x)
                </span>
              )}
            </div>

            {data.attributedStats.transactions.length === 0 ? (
              <div className="p-8 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] text-center text-xs text-[#718096]">
                Belum ada transaksi yang menggunakan tautan referral{' '}
                <span className="font-mono-num text-[#102A43] font-semibold">
                  {data.profile.referralCode}
                </span>
                .
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-[#E5EAF0] text-[#718096]">
                      <th className="py-3 pr-4 font-semibold">Nomor Order</th>
                      <th className="py-3 pr-4 font-semibold">Pembeli</th>
                      <th className="py-3 pr-4 font-semibold">Item</th>
                      <th className="py-3 pr-4 font-semibold">Nilai Transaksi</th>
                      <th className="py-3 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5EAF0]">
                    {data.attributedStats.transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-[#F8FAFC]">
                        <td className="py-3 pr-4 font-mono-num font-bold text-[#102A43]">
                          {tx.orderNumber}
                        </td>
                        <td className="py-3 pr-4 text-[#253449]">
                          {tx.customerInitial}{' '}
                          <span className="text-[#718096] font-mono-num">
                            ({tx.maskedWhatsapp})
                          </span>
                        </td>
                        <td className="py-3 pr-4 font-mono-num text-[#253449]">
                          {tx.itemsCount} item
                        </td>
                        <td className="py-3 pr-4 font-mono-num font-semibold text-[#102A43]">
                          {formatIDR(tx.totalAmount)}
                        </td>
                        <td className="py-3">
                          <PaymentStatusBadge status={tx.paymentStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </ResellerLayout>
  );
}
