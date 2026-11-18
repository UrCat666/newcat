import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  MessageCircle,
  Printer,
  RefreshCw,
  Share2,
  XCircle,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatIDR, normalizeWhatsappNumber } from '../shared/pricing';
import type { PublicReceiptView } from '../shared/types';
import { OrderStatusBadge, PaymentStatusBadge } from '../components/StatusBadge';
import { SafeImage } from '../components/SafeImage';
import { downloadReceiptPdf } from '../utils/pdfReceipt';
import { NavyButton } from '../components/Interactive';

export function ReceiptDetailPage() {
  const { token } = useParams();
  const { showToast, subscribeRealtime } = useStore();

  const [receipt, setReceipt] = useState<PublicReceiptView | null>(null);
  const [storeInfo, setStoreInfo] = useState<{
    storeName: string;
    whatsappNumber: string;
    email?: string;
    address?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReceipt = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetch(`/api/receipts/${encodeURIComponent(token || '')}`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || 'RESI TIDAK DITEMUKAN ATAU KODE AKSES TIDAK VALID.');
        }
        setReceipt(json.receipt);
        setStoreInfo(json.storeSettings);
        document.title = `Resi ${json.receipt.orderNumber} — ${json.storeSettings.storeName}`;
      } catch (err) {
        if (!silent) {
          setError(
            err instanceof Error
              ? err.message
              : 'RESI TIDAK DITEMUKAN ATAU KODE AKSES TIDAK VALID.'
          );
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [token]
  );

  useEffect(() => {
    loadReceipt(false);
  }, [loadReceipt]);

  useEffect(() => {
    return subscribeRealtime(['orders', 'payments'], () => {
      loadReceipt(true);
    });
  }, [subscribeRealtime, loadReceipt]);

  useEffect(() => {
    if (!token) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connect = () => {
      if (closed) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws?receiptToken=${encodeURIComponent(token)}`;
      try {
        ws = new WebSocket(url);
      } catch {
        return;
      }
      ws.onmessage = (event) => {
        if (closed || typeof event.data !== 'string') return;
        try {
          const parsed = JSON.parse(event.data) as { type?: string };
          if (parsed.type === 'invalidate') {
            loadReceipt(true);
          }
        } catch {
          // ignore malformed payload
        }
      };
      ws.onclose = () => {
        if (closed) return;
        reconnectTimer = window.setTimeout(connect, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, [token, loadReceipt]);

  const copyReceiptLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Tautan resi berhasil disalin.', 'success');
    } catch {
      showToast('Gagal menyalin tautan resi.', 'error');
    }
  };

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-12 bg-white">
        <div className="h-[520px] rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
      </main>
    );
  }

  if (error || !receipt) {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center space-y-4 bg-white">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center mx-auto text-rose-600">
          <XCircle className="w-7 h-7" />
        </div>
        <h1 className="font-display text-xl sm:text-2xl font-bold text-[#102A43]">
          RESI TIDAK DITEMUKAN ATAU KODE AKSES TIDAK VALID.
        </h1>
        <p className="text-sm text-[#718096]">
          Pastikan tautan atau Kode Akses Resi Anda benar. Hubungi admin apabila membutuhkan bantuan.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            to="/cek-resi"
            className="btn-navy-primary px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            Cek Resi Ulang
          </Link>
          <a
            href={`https://wa.me/${normalizeWhatsappNumber(
              (typeof window !== 'undefined' &&
                (window as unknown as { __CATRIZZZ_WA__?: string }).__CATRIZZZ_WA__) ||
                '6287738172871'
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-navy-outline px-5 py-2.5 rounded-xl text-sm font-medium"
          >
            Hubungi Admin
          </a>
        </div>
      </main>
    );
  }

  const storeName = storeInfo?.storeName || 'Catrizzz Store';
  const waNum = normalizeWhatsappNumber(storeInfo?.whatsappNumber || '6287738172871');
  const shareWaUrl = `https://wa.me/?text=${encodeURIComponent(
    `Bukti Transaksi ${storeName} (${receipt.orderNumber}): ${window.location.href}`
  )}`;
  const contactAdminUrl = `https://wa.me/${waNum}?text=${encodeURIComponent(
    `Halo Admin ${storeName}, saya ingin menanyakan status pesanan ${receipt.orderNumber}.`
  )}`;

  const createdDate = new Date(receipt.createdAt);
  const formattedDate = createdDate.toLocaleDateString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const formattedTime =
    createdDate.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
    }) + ' WIB';

  return (
    <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6 bg-white">
      {/* Action Bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <NavyButton
          type="button"
          variant="outline"
          onClick={() => loadReceipt(false)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Perbarui Status
        </NavyButton>

        <div className="flex flex-wrap items-center gap-2">
          <NavyButton
            type="button"
            onClick={() => downloadReceiptPdf(receipt, storeName, waNum)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Download Resi PDF
          </NavyButton>
          <NavyButton
            type="button"
            variant="outline"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Cetak Resi
          </NavyButton>
          <NavyButton
            type="button"
            variant="outline"
            onClick={copyReceiptLink}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
            Salin Link Resi
          </NavyButton>
          <a
            href={shareWaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-navy-outline inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium whitespace-nowrap"
          >
            <Share2 className="w-3.5 h-3.5" />
            Bagikan ke WhatsApp
          </a>
          <a
            href={contactAdminUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-navy-outline inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-[#244B75] whitespace-nowrap"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Hubungi Admin
          </a>
        </div>
      </div>

      {/* Invoice Card */}
      <article className="print-invoice surface-card rounded-2xl p-6 sm:p-10 space-y-8">
        {/* A. Transaction Identity */}
        <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-[#E5EAF0]">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-[#102A43] flex items-center justify-center text-white text-sm font-bold">
                C
              </span>
              <span className="font-display text-xl font-bold text-[#102A43]">
                {storeName}
              </span>
            </div>
            <p className="text-xs text-[#718096]">Bukti Transaksi Resmi Elektronik</p>
            <p className="text-xs font-mono-num text-[#718096]">
              Kode Akses: {receipt.receiptTokenMasked}
            </p>
          </div>

          <div className="sm:text-right space-y-1.5">
            <p className="text-xs text-[#718096]">Nomor Pesanan</p>
            <p className="text-xl font-bold font-mono-num text-[#102A43]">
              {receipt.orderNumber}
            </p>
            <p className="text-xs text-[#718096]">
              {formattedDate} · {formattedTime}
            </p>
            <div className="flex sm:justify-end gap-2 pt-1 flex-wrap">
              <PaymentStatusBadge status={receipt.paymentStatus} />
              <OrderStatusBadge status={receipt.orderStatus} />
            </div>
          </div>
        </header>

        {receipt.rejectionReason && receipt.paymentStatus === 'rejected' && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Alasan Penolakan Pembayaran</p>
              <p className="text-xs mt-1">{receipt.rejectionReason}</p>
            </div>
          </div>
        )}

        {/* B & E. Buyer & Payment Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-[#718096] uppercase tracking-wider">
              Informasi Pembeli
            </h2>
            <p className="text-sm font-semibold text-[#102A43]">{receipt.customerName}</p>
            <p className="text-xs font-mono-num text-[#253449]">
              WhatsApp: {receipt.maskedWhatsapp}
            </p>
            <p className="text-xs text-[#253449]">
              Pengiriman Digital: {receipt.shippingMethodName}
            </p>
            {receipt.trackingNumber && (
              <p
                data-testid="receipt-tracking-number"
                className="text-xs font-mono-num text-[#244B75] font-semibold"
              >
                Info Aktivasi / Resi: {receipt.trackingNumber}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-[#718096] uppercase tracking-wider">
              Informasi Pembayaran
            </h2>
            <p className="text-sm font-semibold text-[#102A43]">
              Metode: {receipt.paymentMethod === 'WALLET' ? 'Reseller Wallet' : receipt.paymentMethod || 'QRIS'}
            </p>
            <p className="text-xs font-mono-num text-[#253449]">
              Nominal Tagihan: {formatIDR(receipt.totalAmount)}
            </p>
            {receipt.confirmedAt && (
              <p className="text-xs text-[#718096]">
                Dikonfirmasi:{' '}
                {new Date(receipt.confirmedAt).toLocaleString('id-ID', {
                  timeZone: 'Asia/Jakarta',
                })}{' '}
                WIB
              </p>
            )}
            {receipt.verifiedAt && (
              <p className="text-xs text-emerald-700 font-medium">
                Diverifikasi:{' '}
                {new Date(receipt.verifiedAt).toLocaleString('id-ID', {
                  timeZone: 'Asia/Jakarta',
                })}{' '}
                WIB
              </p>
            )}
          </div>
        </div>

        {/* C. Line Items */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-[#718096] uppercase tracking-wider">
            Detail Produk
          </h2>
          <div className="divide-y divide-[#E5EAF0] border-y border-[#E5EAF0]">
            {receipt.items.map((item) => (
              <div key={item.id} className="py-3.5 flex items-center gap-4">
                <SafeImage
                  src={item.productImageSnapshot}
                  alt={item.productNameSnapshot}
                  className="w-14 h-14 rounded-xl object-cover shrink-0 bg-[#F8FAFC] border border-[#E5EAF0]"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#102A43]">
                    {item.productNameSnapshot}
                  </p>
                  {item.variantNameSnapshot && (
                    <p className="text-xs text-[#244B75] font-medium">
                      Varian: {item.variantNameSnapshot}
                    </p>
                  )}
                  <p className="text-xs font-mono-num text-[#718096]">
                    {item.quantity} x {formatIDR(item.unitPriceSnapshot)}
                  </p>
                </div>
                <span className="text-sm font-bold font-mono-num text-[#102A43] whitespace-nowrap">
                  {formatIDR(item.lineSubtotal)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* D. Cost Summary */}
        <div className="flex justify-end">
          <div className="w-full sm:w-80 space-y-2 text-sm">
            <div className="flex justify-between text-[#253449]">
              <span>Subtotal Produk</span>
              <span className="font-mono-num">{formatIDR(receipt.subtotal)}</span>
            </div>
            {receipt.productDiscountTotal > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Diskon Produk</span>
                <span className="font-mono-num">
                  -{formatIDR(receipt.productDiscountTotal)}
                </span>
              </div>
            )}
            {(receipt.resellerDiscountTotal || 0) > 0 && (
              <div className="flex justify-between text-[#244B75] font-medium">
                <span>Diskon Reseller (20%)</span>
                <span className="font-mono-num">
                  -{formatIDR(receipt.resellerDiscountTotal || 0)}
                </span>
              </div>
            )}
            {receipt.couponDiscount > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Kode Promo ({receipt.couponCode})</span>
                <span className="font-mono-num">-{formatIDR(receipt.couponDiscount)}</span>
              </div>
            )}
            <div className="flex justify-between text-[#253449]">
              <span>Pengiriman Digital</span>
              <span className="font-mono-num text-emerald-700 font-medium">
                {receipt.shippingCost === 0 ? 'Gratis' : formatIDR(receipt.shippingCost)}
              </span>
            </div>
            {receipt.taxAmount > 0 && (
              <div className="flex justify-between text-[#253449]">
                <span>Pajak</span>
                <span className="font-mono-num">{formatIDR(receipt.taxAmount)}</span>
              </div>
            )}
            <div className="pt-2 border-t border-[#E5EAF0] flex justify-between items-baseline">
              <span className="font-semibold text-[#102A43]">Total Pembayaran</span>
              <span className="text-xl font-bold font-mono-num text-[#102A43]">
                {formatIDR(receipt.totalAmount)}
              </span>
            </div>
          </div>
        </div>

        {/* F. Order Timeline */}
        <div className="pt-6 border-t border-[#E5EAF0] space-y-4">
          <h2 className="text-xs font-semibold text-[#718096] uppercase tracking-wider">
            Riwayat Status Pesanan
          </h2>
          <ol className="space-y-3">
            {receipt.timeline.map((step, idx) => (
              <li key={idx} className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  {step.status === 'done' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : step.status === 'rejected' ? (
                    <XCircle className="w-4 h-4 text-rose-600" />
                  ) : step.status === 'current' ? (
                    <Clock className="w-4 h-4 text-[#244B75]" />
                  ) : (
                    <span className="block w-4 h-4 rounded-full border border-[#E5EAF0]" />
                  )}
                </div>
                <div className="flex-1">
                  <p
                    className={`text-sm font-medium ${
                      step.status === 'upcoming' ? 'text-[#718096]' : 'text-[#102A43]'
                    }`}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-[#718096]">{step.description}</p>
                </div>
                {step.timestamp && (
                  <span className="text-[11px] font-mono-num text-[#718096] whitespace-nowrap">
                    {new Date(step.timestamp).toLocaleString('id-ID', {
                      timeZone: 'Asia/Jakarta',
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </article>
    </main>
  );
}
