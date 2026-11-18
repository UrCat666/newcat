import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownCircle,
  Eye,
  FileText,
  History,
  MessageCircle,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatIDR } from '../shared/pricing';
import type { ResellerTopup, TopupStatus } from '../shared/types';
import { ResellerLayout } from '../components/reseller/ResellerLayout';
import { NavyButton } from '../components/Interactive';

export function ResellerTopupHistoryPage() {
  const { isResellerActive, showToast, subscribeRealtime } = useStore();
  const [topups, setTopups] = useState<ResellerTopup[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailModal, setDetailModal] = useState<{
    topup: ResellerTopup;
    whatsappUrl?: string;
  } | null>(null);

  useEffect(() => {
    document.title = 'Riwayat Top Up Reseller — Catrizzz Store';
  }, []);

  const loadTopups = useCallback(
    async (silent = false) => {
      if (!isResellerActive) return;
      if (!silent) setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (statusFilter !== 'all') qs.set('status', statusFilter);
        if (search.trim()) qs.set('search', search.trim());
        const res = await fetch(`/api/reseller/topups?${qs.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) {
          const json = await res.json();
          setTopups(json.topups || []);
        }
      } catch {
        if (!silent) {
          showToast('Gagal memuat riwayat top up.', 'error');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [isResellerActive, statusFilter, search, showToast]
  );

  useEffect(() => {
    loadTopups(false);
  }, [loadTopups]);

  useEffect(() => {
    return subscribeRealtime(['topups', 'reseller_wallet'], () => {
      loadTopups(true);
    });
  }, [subscribeRealtime, loadTopups]);

  const openDetail = async (item: ResellerTopup) => {
    try {
      const res = await fetch(`/api/reseller/topups/${encodeURIComponent(item.id)}`, {
        credentials: 'include',
      });
      if (res.ok) {
        const json = await res.json();
        setDetailModal({ topup: json.topup, whatsappUrl: json.whatsappUrl });
        return;
      }
    } catch {
      // fallback to local row
    }
    setDetailModal({ topup: item });
  };

  const renderStatus = (status: TopupStatus) => {
    if (status === 'approved') {
      return (
        <span className="px-2.5 py-1 rounded-md border bg-emerald-50 border-emerald-200 text-emerald-700 text-xs font-semibold whitespace-nowrap">
          Disetujui
        </span>
      );
    }
    if (status === 'pending_verification') {
      return (
        <span className="px-2.5 py-1 rounded-md border bg-amber-50 border-amber-200 text-amber-800 text-xs font-semibold whitespace-nowrap">
          Menunggu Verifikasi
        </span>
      );
    }
    if (status === 'rejected') {
      return (
        <span className="px-2.5 py-1 rounded-md border bg-rose-50 border-rose-200 text-rose-700 text-xs font-semibold whitespace-nowrap">
          Ditolak
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-md border bg-[#F8FAFC] border-[#E5EAF0] text-[#253449] text-xs font-semibold whitespace-nowrap">
        Menunggu Pembayaran
      </span>
    );
  };

  return (
    <ResellerLayout
      title="Riwayat Top Up Saldo"
      subtitle="Pantau pengajuan top up QRIS, biaya layanan top up 10%, saldo masuk wallet, dan status verifikasi admin."
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
            {[
              { id: 'all', label: 'Semua' },
              { id: 'pending_payment', label: 'Belum Bayar' },
              { id: 'pending_verification', label: 'Menunggu Verifikasi' },
              { id: 'approved', label: 'Disetujui' },
              { id: 'rejected', label: 'Ditolak' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-[#102A43] text-white'
                    : 'text-[#718096] hover:text-[#102A43]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari ID top up..."
                className="input-navy rounded-xl pl-9 pr-3 py-2 text-xs w-44 sm:w-56"
              />
            </div>
            <NavyButton
              type="button"
              variant="outline"
              onClick={() => loadTopups(false)}
              aria-label="Refresh riwayat top up"
              className="p-2 rounded-xl cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </NavyButton>
            <Link
              to="/reseller/topup"
              className="btn-navy-primary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
            >
              <ArrowDownCircle className="w-3.5 h-3.5" />
              Top Up Baru
            </Link>
          </div>
        </div>

        <div className="surface-card rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-[#E5EAF0] text-[#718096] text-xs">
              <tr>
                <th className="p-4">ID Top Up</th>
                <th className="p-4">Tanggal</th>
                <th className="p-4">Saldo Masuk Wallet</th>
                <th className="p-4">Biaya Top Up (10%)</th>
                <th className="p-4">Total Bayar QRIS</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAF0]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-[#718096]">
                    Memuat riwayat top up...
                  </td>
                </tr>
              ) : topups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center space-y-3">
                    <History className="w-8 h-8 text-[#718096] mx-auto" />
                    <p className="text-sm font-medium text-[#102A43]">
                      Belum ada pengajuan top up saldo.
                    </p>
                    <Link
                      to="/reseller/topup"
                      className="btn-navy-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold"
                    >
                      Top Up Sekarang
                    </Link>
                  </td>
                </tr>
              ) : (
                topups.map((t) => {
                  const walletCredit = t.walletCredit ?? t.amount;
                  const feePct = t.feePercentage ?? 10;
                  const feeAmt = t.feeAmount ?? 0;
                  const totalPay = t.totalPayment ?? (walletCredit + feeAmt);
                  return (
                  <tr key={t.id} className="hover:bg-[#F8FAFC]">
                    <td className="p-4 font-mono-num font-bold text-[#102A43] whitespace-nowrap">
                      {t.topupNumber}
                    </td>
                    <td className="p-4 text-xs font-mono-num text-[#718096] whitespace-nowrap">
                      {new Date(t.createdAt).toLocaleString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="p-4 font-mono-num font-bold text-emerald-700 whitespace-nowrap">
                      {formatIDR(walletCredit)}
                    </td>
                    <td className="p-4 font-mono-num text-[#244B75] font-semibold whitespace-nowrap">
                      +{formatIDR(feeAmt)} ({feePct}%)
                    </td>
                    <td className="p-4 font-mono-num font-bold text-[#102A43] whitespace-nowrap">
                      {formatIDR(totalPay)}
                    </td>
                    <td className="p-4">{renderStatus(t.status)}</td>
                    <td className="p-4 text-right whitespace-nowrap space-x-2">
                      {(t.status === 'pending_payment' || t.status === 'rejected') && (
                        <Link
                          to={`/reseller/topup?id=${encodeURIComponent(t.id)}`}
                          className="btn-navy-primary inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
                        >
                          Upload Bukti
                        </Link>
                      )}
                      <NavyButton
                        type="button"
                        variant="outline"
                        onClick={() => openDetail(t)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Detail
                      </NavyButton>
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {detailModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Detail Top Up Reseller"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="surface-card rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-[#E5EAF0] pb-3">
              <div>
                <p className="text-xs text-[#718096]">Detail Top Up Wallet</p>
                <h2 className="text-lg font-bold font-mono-num text-[#102A43]">
                  {detailModal.topup.topupNumber}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                aria-label="Tutup detail top up"
                className="text-[#718096] hover:text-[#102A43] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#718096]">Status</span>
                {renderStatus(detailModal.topup.status)}
              </div>
              <div className="flex justify-between">
                <span className="text-[#718096]">Nominal Saldo Masuk Wallet</span>
                <span className="font-mono-num font-bold text-emerald-700">
                  {formatIDR(detailModal.topup.walletCredit ?? detailModal.topup.amount)}
                </span>
              </div>
              <div className="flex justify-between text-[#244B75] font-medium">
                <span>Biaya Tambahan Top Up ({detailModal.topup.feePercentage ?? 10}%)</span>
                <span className="font-mono-num">
                  +{formatIDR(detailModal.topup.feeAmount ?? 0)}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#E5EAF0]">
                <span className="font-semibold text-[#102A43]">Total Pembayaran QRIS</span>
                <span className="font-mono-num font-bold text-[#102A43]">
                  {formatIDR(
                    detailModal.topup.totalPayment ??
                      (detailModal.topup.amount + (detailModal.topup.feeAmount ?? 0))
                  )}
                </span>
              </div>
            </div>

            {detailModal.topup.rejectionReason && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                <strong>Alasan Penolakan:</strong> {detailModal.topup.rejectionReason}
              </div>
            )}

            {detailModal.topup.proofUrl && (
              <a
                href={detailModal.topup.proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#244B75] hover:underline"
              >
                <FileText className="w-4 h-4" />
                Lihat Bukti Pembayaran QRIS
              </a>
            )}

            <div className="flex flex-wrap justify-end gap-2 pt-2">
              {detailModal.whatsappUrl && detailModal.topup.status === 'pending_verification' && (
                <a
                  href={detailModal.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Konfirmasi via WhatsApp
                </a>
              )}
              <NavyButton
                type="button"
                onClick={() => setDetailModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Tutup
              </NavyButton>
            </div>
          </div>
        </div>
      )}
    </ResellerLayout>
  );
}
