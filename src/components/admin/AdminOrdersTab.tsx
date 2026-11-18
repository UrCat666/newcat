import { useCallback, useEffect, useState } from 'react';
import { Check, Eye, FileText, RefreshCw, RotateCcw, Search, Wallet, X } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatIDR } from '../../shared/pricing';
import type {
  Order,
  OrderItemSnapshot,
  OrderStatus,
  Payment,
  PaymentConfirmation,
} from '../../shared/types';
import { OrderStatusBadge, PaymentStatusBadge } from '../StatusBadge';
import { NavyButton } from '../Interactive';

type EnrichedOrder = Order & {
  items: OrderItemSnapshot[];
  payment?: Payment;
  confirmations: PaymentConfirmation[];
};

export function AdminOrdersTab({ deepLinkOrderId }: { deepLinkOrderId?: string }) {
  const { getAuthHeader, showToast, refreshResellerWallet, subscribeRealtime } = useStore();
  const [subTab, setSubTab] = useState<'orders' | 'verifications'>('orders');
  const [orders, setOrders] = useState<EnrichedOrder[]>([]);
  const [confirmations, setConfirmations] = useState<
    Array<PaymentConfirmation & { order?: Order; payment?: Payment }>
  >([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [buyerTypeFilter, setBuyerTypeFilter] = useState<'all' | 'customer' | 'reseller'>('all');
  const [selectedOrder, setSelectedOrder] = useState<EnrichedOrder | null>(null);
  const [rejectModalOrderId, setRejectModalOrderId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [refundModalOrder, setRefundModalOrder] = useState<EnrichedOrder | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [processingRefund, setProcessingRefund] = useState(false);
  const [internalNotesDraft, setInternalNotesDraft] = useState('');
  const [trackingNumberDraft, setTrackingNumberDraft] = useState('');
  const [rotatedTokenNotice, setRotatedTokenNotice] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const headers = await getAuthHeader();
      const qs = new URLSearchParams();
      if (search) qs.set('search', search);
      if (statusFilter !== 'all') qs.set('paymentStatus', statusFilter);
      if (buyerTypeFilter !== 'all') qs.set('buyerType', buyerTypeFilter);

      const [ordersRes, confRes] = await Promise.all([
        fetch(`/api/admin/orders?${qs.toString()}`, {
          headers,
          credentials: 'include',
          cache: 'no-store',
        }),
        fetch('/api/admin/payments/confirmations', {
          headers,
          credentials: 'include',
          cache: 'no-store',
        }),
      ]);

      if (ordersRes.ok) {
        const json = await ordersRes.json();
        const loaded: EnrichedOrder[] = json.orders || [];
        setOrders(loaded);
        if (deepLinkOrderId) {
          const hit = loaded.find((o) => o.id === deepLinkOrderId || o.orderNumber === deepLinkOrderId);
          if (hit) {
            setSelectedOrder(hit);
            setInternalNotesDraft(hit.internalNotes || '');
            setTrackingNumberDraft(hit.trackingNumber || '');
          }
        }
      } else {
        showToast('Gagal memuat daftar pesanan.', 'error');
      }
      if (confRes.ok) {
        const json = await confRes.json();
        setConfirmations(json.confirmations || []);
      }
    } catch {
      showToast('Koneksi bermasalah saat memuat pesanan.', 'error');
    }
  }, [getAuthHeader, search, statusFilter, buyerTypeFilter, deepLinkOrderId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return subscribeRealtime(['orders', 'payments', 'reseller_wallet'], () => {
      loadData();
    });
  }, [subscribeRealtime, loadData]);

  const handleVerifyPayment = async (orderId: string, decision: 'approve' | 'reject') => {
    if (processingAction) return;
    if (decision === 'reject' && !rejectionReason.trim()) {
      showToast('Alasan penolakan wajib diisi.', 'error');
      return;
    }
    setProcessingAction(true);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch(`/api/admin/payments/${orderId}/verify`, {
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
        showToast(json?.error || 'Gagal memverifikasi pembayaran.', 'error');
        return;
      }
      showToast(
        decision === 'approve'
          ? 'Pembayaran disetujui. Status resi pelanggan otomatis diperbarui.'
          : 'Pembayaran ditolak.',
        'success'
      );
      setRejectModalOrderId(null);
      setRejectionReason('');
      await loadData();
      setSelectedOrder(null);
    } catch {
      showToast('Gagal menghubungi server saat memverifikasi pembayaran.', 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleOrderStatusChange = async (orderId: string, nextStatus: OrderStatus) => {
    if (processingAction) return;
    setProcessingAction(true);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          orderStatus: nextStatus,
          internalNotes: internalNotesDraft,
          trackingNumber: trackingNumberDraft,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json) {
        showToast('Status & rincian pesanan berhasil diperbarui.', 'success');
        await loadData();
        if (selectedOrder?.id === orderId) {
          setSelectedOrder((prev) => (prev ? { ...prev, ...json.order } : null));
        }
      } else {
        showToast(json?.error || 'Gagal memperbarui status.', 'error');
      }
    } catch {
      showToast('Gagal menghubungi server saat memperbarui status pesanan.', 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleRotateToken = async (orderId: string, action: 'rotate' | 'disable') => {
    if (processingAction) return;
    setProcessingAction(true);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch(`/api/admin/orders/${orderId}/rotate-token`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ action }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json) {
        if (json.receiptToken) {
          setRotatedTokenNotice(json.receiptToken);
        }
        showToast(
          action === 'disable'
            ? 'Token resi dinonaktifkan.'
            : 'Token resi baru berhasil diterbitkan.',
          'success'
        );
        await loadData();
      } else {
        showToast(json?.error || 'Gagal memproses token resi.', 'error');
      }
    } catch {
      showToast('Gagal menghubungi server saat memperbarui token resi.', 'error');
    } finally {
      setProcessingAction(false);
    }
  };

  const handleRefundToWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundModalOrder) return;
    if (refundReason.trim().length < 3) {
      showToast('Alasan refund ke wallet minimal 3 karakter.', 'error');
      return;
    }
    setProcessingRefund(true);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch(`/api/admin/orders/${refundModalOrder.id}/refund`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ reason: refundReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Gagal memproses refund ke wallet.', 'error');
        return;
      }
      showToast(
        `Dana ${formatIDR(refundModalOrder.totalAmount)} berhasil di-refund ke Reseller Wallet.`,
        'success'
      );
      setRefundModalOrder(null);
      setRefundReason('');
      setSelectedOrder(null);
      await loadData();
      await refreshResellerWallet();
    } finally {
      setProcessingRefund(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 p-1 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
          <button
            type="button"
            onClick={() => setSubTab('orders')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'orders' ? 'bg-[#102A43] text-white' : 'text-[#718096]'
            }`}
          >
            Semua Pesanan ({orders.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('verifications')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'verifications' ? 'bg-[#102A43] text-white' : 'text-[#718096]'
            }`}
          >
            Verifikasi Pembayaran (
            {confirmations.filter((c) => c.order?.paymentStatus === 'pending_verification').length})
          </button>
        </div>

        <NavyButton
          type="button"
          variant="outline"
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </NavyButton>
      </div>

      {subTab === 'orders' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-[#718096] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari Order ID atau nama pelanggan..."
                className="input-navy w-full rounded-xl pl-10 pr-3 py-2 text-sm"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input-navy rounded-xl px-3.5 py-2 text-sm"
            >
              <option value="all">Semua Status Pembayaran</option>
              <option value="unpaid">Belum Dibayar</option>
              <option value="pending_verification">Menunggu Verifikasi</option>
              <option value="paid">Lunas (Paid)</option>
              <option value="refunded">Refunded</option>
              <option value="rejected">Ditolak</option>
            </select>
            <select
              value={buyerTypeFilter}
              onChange={(e) =>
                setBuyerTypeFilter(e.target.value as 'all' | 'customer' | 'reseller')
              }
              className="input-navy rounded-xl px-3.5 py-2 text-sm"
            >
              <option value="all">Semua Tipe Pembeli</option>
              <option value="customer">Pelanggan Publik</option>
              <option value="reseller">Reseller</option>
            </select>
          </div>

          <div className="surface-card rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-[#E5EAF0] text-[#718096] text-xs">
                <tr>
                  <th className="p-4">Order ID</th>
                  <th className="p-4">Pelanggan</th>
                  <th className="p-4">Tanggal</th>
                  <th className="p-4">Total</th>
                  <th className="p-4">Pembayaran</th>
                  <th className="p-4">Pesanan</th>
                  <th className="p-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EAF0]">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-[#718096]">
                      Belum ada transaksi pesanan masuk.
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <tr key={o.id} className="hover:bg-[#F8FAFC]">
                      <td className="p-4 font-mono-num font-bold text-[#244B75]">
                        {o.orderNumber}
                        {o.pricingTier === 'reseller' && (
                          <span className="block text-[10px] font-sans text-emerald-700 font-semibold">
                            Harga Reseller
                          </span>
                        )}
                        {o.referralCodeUsed && (
                          <span className="block text-[10px] font-mono-num text-[#718096] font-normal">
                            Ref: {o.referralCodeUsed}
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <p className="font-semibold text-[#102A43] flex items-center gap-1.5">
                          <span>{o.customerName}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              o.buyerType === 'reseller' || o.pricingTier === 'reseller'
                                ? 'bg-[#EAF2FA] text-[#244B75]'
                                : 'bg-[#F8FAFC] text-[#718096] border border-[#E5EAF0]'
                            }`}
                          >
                            {o.buyerType === 'reseller' || o.pricingTier === 'reseller'
                              ? 'Reseller'
                              : 'Pelanggan'}
                          </span>
                        </p>
                        <p className="text-xs font-mono-num text-[#718096]">
                          +{o.customerWhatsapp}
                        </p>
                      </td>
                      <td className="p-4 text-xs font-mono-num text-[#718096]">
                        {new Date(o.createdAt).toLocaleString('id-ID', {
                          timeZone: 'Asia/Jakarta',
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>
                      <td className="p-4 font-mono-num font-bold text-[#102A43]">
                        {formatIDR(o.totalAmount)}
                      </td>
                      <td className="p-4 space-y-1">
                        <PaymentStatusBadge status={o.paymentStatus} />
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border ${
                            o.paymentMethod === 'WALLET'
                              ? 'bg-[#EAF2FA] text-[#102A43] border-[#244B75]/25'
                              : 'bg-white text-[#718096] border-[#E5EAF0]'
                          }`}
                        >
                          {o.paymentMethod === 'WALLET' ? 'Reseller Wallet' : 'QRIS'}
                        </span>
                      </td>
                      <td className="p-4">
                        <OrderStatusBadge status={o.orderStatus} />
                      </td>
                      <td className="p-4 text-right">
                        <NavyButton
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setSelectedOrder(o);
                            setInternalNotesDraft(o.internalNotes || '');
                            setTrackingNumberDraft(o.trackingNumber || '');
                            setRotatedTokenNotice(null);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
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
      ) : (
        <div className="space-y-4">
          {confirmations.length === 0 ? (
            <div className="surface-card rounded-2xl p-10 text-center text-sm text-[#718096]">
              Belum ada konfirmasi pembayaran dari pelanggan.
            </div>
          ) : (
            confirmations.map((c) => (
              <div
                key={c.id}
                className="surface-card rounded-2xl p-5 flex flex-col md:flex-row gap-5 justify-between"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono-num font-bold text-[#244B75]">
                      {c.orderNumber}
                    </span>
                    {c.order && <PaymentStatusBadge status={c.order.paymentStatus} />}
                  </div>
                  <p className="text-sm text-[#102A43] font-semibold">
                    {c.payerName} ·{' '}
                    <span className="font-mono-num text-[#718096] font-normal">
                      +{c.payerWhatsapp}
                    </span>
                  </p>
                  <p className="text-xs text-[#718096]">
                    Nominal Dikonfirmasi:{' '}
                    <span className="font-mono-num text-[#102A43] font-bold">
                      {formatIDR(c.paidAmount)}
                    </span>
                    {c.order && ` (Tagihan: ${formatIDR(c.order.totalAmount)})`}
                  </p>
                  <p className="text-xs text-[#718096]">Waktu Bayar: {c.paymentTime}</p>
                  {c.notes && <p className="text-xs text-[#253449]">Catatan: {c.notes}</p>}
                  {c.proofUrl && (
                    <a
                      href={c.proofUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#244B75] hover:underline pt-1"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Lihat Bukti Pembayaran
                    </a>
                  )}
                </div>

                {c.order && c.order.paymentStatus !== 'paid' && (
                  <div className="flex items-center gap-2 self-start">
                    <button
                      type="button"
                      onClick={() => handleVerifyPayment(c.orderId, 'approve')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Setujui (Paid)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRejectModalOrderId(c.orderId);
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

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="surface-card rounded-2xl max-w-2xl w-full p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold font-mono-num text-[#102A43]">
                  {selectedOrder.orderNumber}
                </h3>
                <p className="text-xs text-[#718096]">
                  Resi Masked: {selectedOrder.receiptTokenMasked} ·{' '}
                  {selectedOrder.receiptActive ? 'Aktif' : 'Nonaktif'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-[#718096] hover:text-[#102A43] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-[#F8FAFC] p-4 rounded-xl border border-[#E5EAF0]">
              <div className="space-y-1">
                <p className="text-[#718096]">Pelanggan</p>
                <p className="text-[#102A43] font-semibold">{selectedOrder.customerName}</p>
                <p className="font-mono-num text-[#244B75]">
                  +{selectedOrder.customerWhatsapp}
                </p>
                {selectedOrder.customerEmail && (
                  <p className="text-[#253449]">Email: {selectedOrder.customerEmail}</p>
                )}
                {selectedOrder.shippingMethodName && (
                  <p className="text-[#718096]">
                    Pengiriman Digital: {selectedOrder.shippingMethodName}
                  </p>
                )}
                {selectedOrder.orderNotes && (
                  <p className="text-[#253449]">Catatan: {selectedOrder.orderNotes}</p>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-[#718096]">Status &amp; Tagihan</p>
                <div className="flex gap-2 flex-wrap">
                  <PaymentStatusBadge status={selectedOrder.paymentStatus} />
                  <OrderStatusBadge status={selectedOrder.orderStatus} />
                </div>
                <p className="text-xs font-semibold text-[#244B75] pt-0.5">
                  Metode:{' '}
                  {selectedOrder.paymentMethod === 'WALLET' ? 'Reseller Wallet' : 'QRIS'}
                </p>
                <p className="text-base font-bold font-mono-num text-[#102A43] pt-1">
                  {formatIDR(selectedOrder.totalAmount)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-[#253449]">Item Pesanan</p>
              <div className="divide-y divide-[#E5EAF0] border border-[#E5EAF0] rounded-xl px-4">
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="py-2.5 flex justify-between text-xs">
                    <span className="text-[#253449]">
                      {item.productNameSnapshot}
                      {item.variantNameSnapshot ? ` (${item.variantNameSnapshot})` : ''} x
                      {item.quantity}
                    </span>
                    <span className="font-mono-num text-[#102A43] font-semibold">
                      {formatIDR(item.lineSubtotal)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {selectedOrder.confirmations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#253449]">Bukti Konfirmasi</p>
                {selectedOrder.confirmations.map((cf) => (
                  <div
                    key={cf.id}
                    className="p-3 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] text-xs space-y-1"
                  >
                    <p className="text-[#102A43] font-medium">
                      {cf.payerName} · {formatIDR(cf.paidAmount)} · {cf.paymentTime}
                    </p>
                    {cf.proofUrl && (
                      <a
                        href={cf.proofUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#244B75] font-semibold underline inline-block"
                      >
                        Buka Lampiran Bukti ({cf.proofMimeType})
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E5EAF0]">
              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Ubah Status Pesanan
                <select
                  value={selectedOrder.orderStatus}
                  onChange={(e) =>
                    handleOrderStatusChange(selectedOrder.id, e.target.value as OrderStatus)
                  }
                  className="input-navy w-full rounded-xl px-3 py-2 text-sm font-normal"
                >
                  <option value="pending_payment">Pending Payment</option>
                  <option value="processing">Sedang Diproses</option>
                  <option value="shipped">Dikirim / Diproses</option>
                  <option value="completed">Selesai</option>
                  <option value="cancelled">Dibatalkan (Kembalikan Stok)</option>
                </select>
              </label>

              <div className="space-y-1 text-xs font-semibold text-[#253449]">
                <span>Keamanan Token Resi</span>
                <div className="flex gap-2">
                  <NavyButton
                    type="button"
                    variant="outline"
                    onClick={() => handleRotateToken(selectedOrder.id, 'rotate')}
                    className="px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    Terbitkan Token Baru
                  </NavyButton>
                  <button
                    type="button"
                    onClick={() => handleRotateToken(selectedOrder.id, 'disable')}
                    className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold cursor-pointer"
                  >
                    Nonaktifkan Resi
                  </button>
                </div>
              </div>
            </div>

            {rotatedTokenNotice && (
              <div className="p-3 rounded-xl bg-[#EAF2FA] border border-[#244B75]/20 text-xs text-[#102A43]">
                Token Resi Baru (salin sekarang):{' '}
                <span className="font-mono-num font-bold select-all">
                  {rotatedTokenNotice}
                </span>
              </div>
            )}

            <div className="space-y-3">
              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Kode Aktivasi / Nomor Pengiriman Digital (Tracking)
                <input
                  type="text"
                  value={trackingNumberDraft}
                  onChange={(e) => setTrackingNumberDraft(e.target.value)}
                  placeholder="Contoh: LIC-CATRIZZ-8891 atau keterangan akun dikirim"
                  className="input-navy w-full rounded-xl px-3 py-2 text-xs font-mono-num font-normal"
                />
              </label>
              <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                Catatan Internal Admin
                <textarea
                  rows={2}
                  value={internalNotesDraft}
                  onChange={(e) => setInternalNotesDraft(e.target.value)}
                  className="input-navy w-full rounded-xl px-3 py-2 text-xs font-normal"
                />
              </label>
              <div className="flex flex-wrap justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {selectedOrder.paymentStatus !== 'paid' &&
                    selectedOrder.paymentStatus !== 'refunded' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleVerifyPayment(selectedOrder.id, 'approve')}
                          className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          Setujui Pembayaran
                        </button>
                        <button
                          type="button"
                          onClick={() => setRejectModalOrderId(selectedOrder.id)}
                          className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          Tolak Pembayaran
                        </button>
                      </>
                    )}
                  {selectedOrder.paymentMethod === 'WALLET' &&
                    selectedOrder.paymentStatus === 'paid' &&
                    !selectedOrder.walletRefunded && (
                      <button
                        type="button"
                        onClick={() => {
                          setRefundModalOrder(selectedOrder);
                          setRefundReason('');
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#EAF2FA] hover:bg-[#dce9f6] border border-[#244B75]/30 text-[#102A43] text-xs font-semibold cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Refund ke Wallet
                      </button>
                    )}
                </div>
                <NavyButton
                  type="button"
                  onClick={() =>
                    handleOrderStatusChange(selectedOrder.id, selectedOrder.orderStatus)
                  }
                  className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Simpan Catatan
                </NavyButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectModalOrderId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="text-lg font-semibold text-[#102A43]">
              Alasan Penolakan Pembayaran
            </h3>
            <p className="text-xs text-[#718096]">
              Alasan ini akan ditampilkan kepada pelanggan secara aman pada halaman resi.
            </p>
            <textarea
              rows={3}
              required
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Contoh: Nominal transfer tidak sesuai atau mutasi QRIS belum masuk."
              className="input-navy w-full rounded-xl px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setRejectModalOrderId(null)}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer"
              >
                Batal
              </NavyButton>
              <button
                type="button"
                onClick={() => handleVerifyPayment(rejectModalOrderId, 'reject')}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold cursor-pointer"
              >
                Kirim Penolakan
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Refund to Wallet Modal */}
      {refundModalOrder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Konfirmasi Refund ke Reseller Wallet"
          className="fixed inset-0 z-[60] bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleRefundToWallet}
            className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center gap-2 text-[#102A43]">
              <Wallet className="w-5 h-5 text-[#244B75]" />
              <h3 className="text-lg font-bold">
                Refund Pesanan {refundModalOrder.orderNumber} ke Wallet
              </h3>
            </div>
            <p className="text-xs text-[#253449]">
              Dana sebesar{' '}
              <strong className="font-mono-num text-[#102A43]">
                {formatIDR(refundModalOrder.totalAmount)}
              </strong>{' '}
              akan dikembalikan secara atomik ke Reseller Wallet, stok produk dipulihkan, dan
              pesanan ditandai sebagai dibatalkan.
            </p>
            <textarea
              rows={3}
              required
              minLength={3}
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              placeholder="Contoh: Stok akun habis atau permintaan pembatalan dari reseller."
              className="input-navy w-full rounded-xl px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setRefundModalOrder(null)}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer"
              >
                Batal
              </NavyButton>
              <button
                type="submit"
                disabled={processingRefund}
                className="px-4 py-2 rounded-xl bg-[#102A43] hover:bg-[#244B75] text-white text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                {processingRefund ? 'Memproses...' : 'Proses Refund ke Wallet'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
