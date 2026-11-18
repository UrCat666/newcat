import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  Wallet,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatIDR } from '../shared/pricing';
import type { ResellerWallet, WalletTransaction, WalletTransactionType } from '../shared/types';
import { ResellerLayout } from '../components/reseller/ResellerLayout';
import { NavyButton } from '../components/Interactive';

const TX_TYPE_LABEL: Record<
  WalletTransactionType,
  { label: string; badgeCls: string; sign: '+' | '-' | 'adj' }
> = {
  topup: {
    label: 'Top Up Saldo',
    badgeCls: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    sign: '+',
  },
  topup_bonus: {
    label: 'Bonus Top Up (10%)',
    badgeCls: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    sign: '+',
  },
  purchase: {
    label: 'Pembelian Produk',
    badgeCls: 'bg-rose-50 border-rose-200 text-rose-700',
    sign: '-',
  },
  refund: {
    label: 'Refund Pesanan',
    badgeCls: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    sign: '+',
  },
  manual_credit: {
    label: 'Kredit Admin',
    badgeCls: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    sign: '+',
  },
  manual_debit: {
    label: 'Debit Admin',
    badgeCls: 'bg-rose-50 border-rose-200 text-rose-700',
    sign: '-',
  },
  adjustment: {
    label: 'Penyesuaian Admin',
    badgeCls: 'bg-amber-50 border-amber-200 text-amber-800',
    sign: 'adj',
  },
};

export function ResellerWalletHistoryPage() {
  const { isResellerActive, showToast, subscribeRealtime } = useStore();
  const [wallet, setWallet] = useState<ResellerWallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Mutasi Saldo Wallet — Catrizzz Store';
  }, []);

  const loadHistory = useCallback(
    async (silent = false) => {
      if (!isResellerActive) return;
      if (!silent) setLoading(true);
      try {
        const qs = new URLSearchParams({
          type: typeFilter,
          page: String(page),
          limit: '15',
        });
        if (search.trim()) qs.set('search', search.trim());
        if (startDate) qs.set('startDate', startDate);
        if (endDate) qs.set('endDate', endDate);

        const res = await fetch(`/api/reseller/wallet/transactions?${qs.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) {
          const json = await res.json();
          setWallet(json.wallet || null);
          setTransactions(json.transactions || []);
          setTotal(json.total || 0);
          setTotalPages(json.totalPages || 1);
        }
      } catch {
        if (!silent) {
          showToast('Gagal memuat riwayat mutasi saldo.', 'error');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isResellerActive, typeFilter, search, startDate, endDate, page, showToast]
  );

  useEffect(() => {
    loadHistory(false);
  }, [loadHistory]);

  useEffect(() => {
    return subscribeRealtime(['reseller_wallet', 'topups', 'orders'], () => {
      loadHistory(true);
    });
  }, [subscribeRealtime, loadHistory]);

  return (
    <ResellerLayout
      title="Mutasi Saldo Reseller Wallet"
      subtitle="Buku besar riwayat seluruh perubahan saldo masuk (top up), pembelian produk, refund, dan penyesuaian."
    >
      <div className="space-y-5">
        {/* Wallet Strip */}
        <div className="surface-subtle rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="text-xs text-[#718096]">Saldo Aktif</p>
              <p className="text-2xl font-bold font-mono-num text-[#102A43]">
                {formatIDR(wallet?.balance ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#718096]">Total Saldo Top Up</p>
              <p className="text-base font-bold font-mono-num text-[#102A43]">
                {formatIDR(wallet?.totalTopup ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#718096]">Total Biaya Top Up (10%)</p>
              <p className="text-base font-bold font-mono-num text-[#244B75]">
                {formatIDR(wallet?.totalFeesPaid ?? 0)}
              </p>
            </div>
          </div>

          <Link
            to="/reseller/topup"
            className="btn-navy-primary inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold"
          >
            <ArrowDownCircle className="w-4 h-4" />
            Top Up Saldo
          </Link>
        </div>

        {/* Filter Controls */}
        <div className="surface-card rounded-2xl p-4 space-y-3">
          <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
            {[
              { id: 'all', label: 'Semua' },
              { id: 'topup', label: 'Top Up' },
              { id: 'purchase', label: 'Pembelian' },
              { id: 'refund', label: 'Refund' },
              { id: 'adjustment', label: 'Penyesuaian Admin' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => {
                  setTypeFilter(f.id);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  typeFilter === f.id
                    ? 'bg-[#102A43] text-white'
                    : 'text-[#718096] hover:text-[#102A43]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Cari ID mutasi, nomor order, atau keterangan..."
                className="input-navy w-full rounded-xl pl-9 pr-3 py-2 text-xs"
              />
            </div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              aria-label="Tanggal mulai"
              className="input-navy rounded-xl px-3 py-2 text-xs font-mono-num"
            />
            <span className="text-xs text-[#718096]">s/d</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              aria-label="Tanggal akhir"
              className="input-navy rounded-xl px-3 py-2 text-xs font-mono-num"
            />
            <NavyButton
              type="button"
              variant="outline"
              onClick={() => loadHistory(false)}
              aria-label="Refresh mutasi wallet"
              className="p-2 rounded-xl cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </NavyButton>
          </div>
        </div>

        {/* Ledger Table */}
        <div className="surface-card rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-[#E5EAF0] text-[#718096] text-xs">
              <tr>
                <th className="p-4">ID &amp; Waktu</th>
                <th className="p-4">Kategori</th>
                <th className="p-4">Keterangan</th>
                <th className="p-4 text-right">Nominal</th>
                <th className="p-4 text-right">Saldo Sebelum</th>
                <th className="p-4 text-right">Saldo Sesudah</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAF0]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[#718096]">
                    Memuat mutasi wallet...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-10 text-center space-y-2">
                    <Wallet className="w-8 h-8 text-[#718096] mx-auto" />
                    <p className="text-sm font-medium text-[#102A43]">
                      Belum ada mutasi saldo yang tercatat.
                    </p>
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const cfg = TX_TYPE_LABEL[tx.type] || TX_TYPE_LABEL.adjustment;
                  const isNegative =
                    cfg.sign === '-' || (cfg.sign === 'adj' && tx.amount < 0);
                  return (
                    <tr key={tx.id} className="hover:bg-[#F8FAFC]">
                      <td className="p-4 whitespace-nowrap">
                        <p className="font-mono-num font-bold text-[#102A43]">{tx.txNumber}</p>
                        <p className="text-[11px] font-mono-num text-[#718096]">
                          {new Date(tx.createdAt).toLocaleString('id-ID', {
                            timeZone: 'Asia/Jakarta',
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </p>
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-semibold ${cfg.badgeCls}`}
                        >
                          {cfg.label}
                        </span>
                      </td>
                      <td className="p-4 text-xs text-[#253449]">
                        <p className="font-medium text-[#102A43]">{tx.description}</p>
                        {tx.reason && (
                          <p className="text-[11px] text-[#718096] mt-0.5">Catatan: {tx.reason}</p>
                        )}
                      </td>
                      <td
                        className={`p-4 text-right font-mono-num font-bold whitespace-nowrap ${
                          isNegative ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {isNegative ? '-' : '+'}
                        {formatIDR(Math.abs(tx.amount))}
                      </td>
                      <td className="p-4 text-right font-mono-num text-[#718096] whitespace-nowrap">
                        {formatIDR(tx.balanceBefore)}
                      </td>
                      <td className="p-4 text-right font-mono-num font-bold text-[#102A43] whitespace-nowrap">
                        {formatIDR(tx.balanceAfter)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-[#718096]">
            <span>
              Menampilkan halaman {page} dari {totalPages} ({total} mutasi)
            </span>
            <div className="flex items-center gap-2">
              <NavyButton
                type="button"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Sebelumnya
              </NavyButton>
              <NavyButton
                type="button"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg inline-flex items-center gap-1 disabled:opacity-40 cursor-pointer"
              >
                Berikutnya
                <ChevronRight className="w-3.5 h-3.5" />
              </NavyButton>
            </div>
          </div>
        )}
      </div>
    </ResellerLayout>
  );
}
