import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  MessageCircle,
  QrCode,
  Receipt,
  Upload,
  X,
  ZoomIn,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatIDR, normalizeWhatsappNumber } from '../shared/pricing';
import type { OrderItemSnapshot, OrderStatus, PaymentStatus } from '../shared/types';
import { PaymentStatusBadge } from '../components/StatusBadge';
import { SafeImage } from '../components/SafeImage';
import { NavyButton } from '../components/Interactive';

interface PaymentOrderResponse {
  orderId: string;
  orderNumber: string;
  customerName: string;
  maskedWhatsapp: string;
  items: OrderItemSnapshot[];
  subtotal: number;
  productDiscountTotal: number;
  resellerDiscountTotal?: number;
  pricingTier?: 'normal' | 'reseller';
  couponCode?: string;
  couponDiscount: number;
  shippingCost: number;
  taxAmount: number;
  totalAmount: number;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  rejectionReason?: string;
  createdAt: string;
  qris: {
    ready: boolean;
    imageUrl: string;
    merchantName: string;
    nmid: string;
    instructions: string[];
  };
  storeWhatsapp: string;
  storeName: string;
}

export function PaymentPage() {
  const { orderId } = useParams();
  const { showToast, subscribeRealtime } = useStore();

  const [data, setData] = useState<PaymentOrderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [zoomQris, setZoomQris] = useState(false);
  const [showConfirmForm, setShowConfirmForm] = useState(false);

  const [payerName, setPayerName] = useState('');
  const [payerWhatsapp, setPayerWhatsapp] = useState('');
  const [paymentTime, setPaymentTime] = useState(() =>
    new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
  );
  const [paidAmount, setPaidAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submittingConfirm, setSubmittingConfirm] = useState(false);

  const [confirmationResult, setConfirmationResult] = useState<{
    receiptToken: string;
    receiptUrl: string;
    whatsappUrl: string;
    whatsappMessage: string;
  } | null>(null);

  const loadOrder = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetch(`/api/orders/${encodeURIComponent(orderId || '')}/payment`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Pesanan tidak ditemukan.');
        setData(json);
        setPayerName((prev) => prev || json.customerName || '');
        setPaidAmount((prev) => prev || String(json.totalAmount || ''));
        document.title = `Pembayaran ${json.orderNumber} — Catrizzz Store`;
      } catch (err) {
        if (!silent) {
          setError(err instanceof Error ? err.message : 'Gagal memuat informasi pembayaran.');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [orderId]
  );

  useEffect(() => {
    loadOrder(false);
  }, [loadOrder]);

  useEffect(() => {
    return subscribeRealtime(['orders', 'payments', 'payment_settings', 'storefront'], () => {
      loadOrder(true);
    });
  }, [subscribeRealtime, loadOrder]);

  const storedToken = (() => {
    if (!orderId) return '';
    try {
      return sessionStorage.getItem(`catrizzz_receipt_${orderId}`) || '';
    } catch {
      return '';
    }
  })();

  const copyText = async (val: string, label: string) => {
    try {
      await navigator.clipboard.writeText(val);
      showToast(`${label} berhasil disalin.`, 'success');
    } catch {
      showToast('Gagal menyalin ke clipboard.', 'error');
    }
  };

  const handleConfirmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;

    if (proofFile) {
      const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
      if (!allowed.includes(proofFile.type) && !/\.(jpe?g|png|pdf)$/i.test(proofFile.name)) {
        showToast('Format file bukti pembayaran hanya JPG, JPEG, PNG, atau PDF.', 'error');
        return;
      }
      if (proofFile.size > 5 * 1024 * 1024) {
        showToast('Ukuran bukti pembayaran maksimal 5MB.', 'error');
        return;
      }
    }

    setSubmittingConfirm(true);
    try {
      const fd = new FormData();
      fd.append('orderId', data.orderId);
      fd.append('payerName', payerName.trim());
      fd.append('payerWhatsapp', payerWhatsapp.trim());
      fd.append('paymentTime', paymentTime.trim());
      fd.append('paidAmount', String(Number(paidAmount)));
      fd.append('notes', notes.trim());
      if (storedToken) {
        fd.append('receiptToken', storedToken);
      }
      if (proofFile) {
        fd.append('proof', proofFile);
      }

      const res = await fetch('/api/payments/confirm', {
        method: 'POST',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Gagal mengirim konfirmasi pembayaran.', 'error');
        return;
      }

      if (json.receiptToken) {
        try {
          sessionStorage.setItem(`catrizzz_receipt_${data.orderId}`, json.receiptToken);
        } catch {
          // ignore
        }
      }

      setConfirmationResult({
        receiptToken: json.receiptToken,
        receiptUrl: json.receiptUrl,
        whatsappUrl: json.whatsappUrl,
        whatsappMessage: json.whatsappMessage,
      });
      setShowConfirmForm(false);
      await loadOrder(true);
      showToast(
        'Konfirmasi pembayaran berhasil disimpan. Silakan lanjutkan kirim pesan di WhatsApp.',
        'success'
      );

      const anchor = document.createElement('a');
      anchor.href = json.whatsappUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch {
      showToast('Gagal mengunggah konfirmasi pembayaran. Periksa koneksi Anda.', 'error');
    } finally {
      setSubmittingConfirm(false);
    }
  };

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-12 bg-white">
        <div className="h-96 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center space-y-4 bg-white">
        <h1 className="font-display text-2xl font-bold text-[#102A43]">
          Pesanan Tidak Ditemukan
        </h1>
        <p className="text-sm text-[#718096]">{error}</p>
        <div className="flex justify-center gap-3">
          <Link
            to="/produk"
            className="btn-navy-primary px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            Kembali ke Toko
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

  const adminWaHref = `https://wa.me/${normalizeWhatsappNumber(
    data.storeWhatsapp || '6287738172871'
  )}?text=${encodeURIComponent(
    `Halo Admin ${data.storeName}, saya ingin menanyakan pesanan ${data.orderNumber}.`
  )}`;

  return (
    <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8 bg-white">
      {/* Header Summary */}
      <div className="surface-card rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs font-semibold text-[#244B75]">{data.storeName}</span>
            <span className="text-[#E5EAF0]">·</span>
            <span className="text-sm font-mono-num font-bold text-[#102A43]">
              {data.orderNumber}
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#102A43]">
            Pembayaran QRIS Resmi
          </h1>
          <p className="text-sm text-[#718096]">
            Pembeli: <span className="text-[#102A43] font-medium">{data.customerName}</span> (
            {data.maskedWhatsapp})
          </p>
        </div>

        <div className="flex flex-col sm:items-end gap-2">
          <PaymentStatusBadge status={data.paymentStatus} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#718096]">Total Tagihan:</span>
            <span className="text-2xl font-bold font-mono-num text-[#102A43]">
              {formatIDR(data.totalAmount)}
            </span>
            <button
              type="button"
              onClick={() => copyText(String(data.totalAmount), 'Nominal pembayaran')}
              aria-label="Salin total pembayaran"
              title="Salin nominal"
              className="p-2 rounded-lg bg-[#EAF2FA] hover:bg-[#dce9f6] text-[#102A43] cursor-pointer"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* WhatsApp Redirect & Receipt Fallback Success Banner */}
      {confirmationResult && (
        <section className="rounded-2xl p-6 border border-emerald-200 bg-emerald-50 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-[#102A43]">
                Konfirmasi Pembayaran Tercatat — Menunggu Verifikasi Admin
              </h2>
              <p className="text-sm text-[#253449]">
                WhatsApp resmi Catrizzz Store telah disiapkan dengan rincian pesanan Anda. Silakan tekan tombol Kirim pada aplikasi WhatsApp Anda. Status pesanan akan menjadi lunas setelah admin memverifikasi pembayaran.
              </p>
              <p className="text-xs font-mono-num text-[#244B75] font-semibold pt-1">
                Kode Akses Resi Anda: {confirmationResult.receiptToken}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <a
              href={confirmationResult.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Buka WhatsApp
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <NavyButton
              type="button"
              variant="outline"
              onClick={() => copyText(confirmationResult.whatsappMessage, 'Pesan WhatsApp')}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium cursor-pointer"
            >
              <Copy className="w-4 h-4" />
              Salin Pesan
            </NavyButton>
            <Link
              to={`/resi/${encodeURIComponent(confirmationResult.receiptToken)}`}
              className="btn-navy-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
            >
              <Receipt className="w-4 h-4" />
              Lihat Resi
            </Link>
          </div>
        </section>
      )}

      {data.rejectionReason && data.paymentStatus === 'rejected' && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Pembayaran Sebelumnya Ditolak Admin</p>
            <p className="text-xs mt-1">
              Alasan: {data.rejectionReason}. Silakan lakukan konfirmasi ulang dengan bukti transfer yang sesuai.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Official QRIS & Actions */}
        <section className="lg:col-span-6 surface-card rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-[#102A43] flex items-center gap-2">
              <QrCode className="w-5 h-5 text-[#244B75]" />
              Scan QRIS {data.qris.merchantName}
            </h2>
            {data.qris.nmid && (
              <span className="text-xs font-mono-num text-[#718096]">
                NMID: {data.qris.nmid}
              </span>
            )}
          </div>

          {!data.qris.ready && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                Catatan: Switch QRIS baru saat ini sedang dinonaktifkan oleh admin. Karena pesanan ini sudah tercatat sebelum dinonaktifkan, Anda tetap dapat menyelesaikan pembayaran dan mengirim bukti transfer di halaman ini.
              </span>
            </div>
          )}

          {!data.qris.imageUrl ? (
            <div className="p-8 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-2">
              <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto" />
              <p className="text-sm font-semibold text-amber-900">QRIS Belum Tersedia</p>
              <p className="text-xs text-amber-800">
                Gambar QRIS resmi belum tersedia di pengaturan pembayaran admin. Silakan hubungi admin melalui WhatsApp.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-3 max-w-sm mx-auto border border-[#E5EAF0] shadow-sm">
              <img
                src={data.qris.imageUrl}
                alt={`QRIS Resmi ${data.qris.merchantName}`}
                className="w-full h-auto rounded-lg object-contain"
              />
            </div>
          )}

          {data.qris.imageUrl && (
            <div className="flex flex-wrap justify-center gap-2.5">
              <a
                href={data.qris.imageUrl}
                download={`QRIS-${data.storeName.replace(/\s+/g, '-')}.jpeg`}
                className="btn-navy-outline inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold"
              >
                <Download className="w-3.5 h-3.5" />
                Download QRIS
              </a>
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setZoomQris(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
                Perbesar QRIS
              </NavyButton>
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => copyText(String(data.totalAmount), 'Total pembayaran')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                Salin Total Pembayaran
              </NavyButton>
            </div>
          )}

          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] space-y-2">
            <p className="text-xs font-semibold text-[#102A43]">Petunjuk Pembayaran QRIS:</p>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-[#253449] leading-relaxed">
              {(data.qris.instructions || []).map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ol>
            <p className="text-[11px] text-[#718096] pt-2 border-t border-[#E5EAF0]">
              Catatan: Pembayaran baru dianggap lunas setelah diverifikasi oleh admin Catrizzz Store.
            </p>
          </div>
        </section>

        {/* Right: Order Items + Confirm CTA / Form */}
        <div className="lg:col-span-6 space-y-6">
          <section className="surface-card rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[#102A43]">Rincian Pesanan</h2>
            <div className="space-y-3">
              {data.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 text-sm">
                  <SafeImage
                    src={item.productImageSnapshot}
                    alt={item.productNameSnapshot}
                    className="w-12 h-12 rounded-lg object-cover shrink-0 bg-[#F8FAFC] border border-[#E5EAF0]"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#102A43] truncate">
                      {item.productNameSnapshot}
                    </p>
                    <p className="text-xs text-[#718096]">
                      {item.variantNameSnapshot ? `${item.variantNameSnapshot} · ` : ''}
                      {item.quantity} x {formatIDR(item.unitPriceSnapshot)}
                    </p>
                  </div>
                  <span className="font-mono-num font-semibold text-[#102A43]">
                    {formatIDR(item.lineSubtotal)}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-[#E5EAF0] space-y-1.5 text-xs text-[#253449]">
              <div className="flex justify-between">
                <span>Subtotal Normal</span>
                <span className="font-mono-num">{formatIDR(data.subtotal)}</span>
              </div>
              {data.productDiscountTotal > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Diskon Produk</span>
                  <span className="font-mono-num">
                    -{formatIDR(data.productDiscountTotal)}
                  </span>
                </div>
              )}
              {(data.resellerDiscountTotal || 0) > 0 && (
                <div className="flex justify-between text-[#244B75] font-medium">
                  <span>Diskon Reseller (20%)</span>
                  <span className="font-mono-num">
                    -{formatIDR(data.resellerDiscountTotal || 0)}
                  </span>
                </div>
              )}
              {data.couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Kode Promo ({data.couponCode})</span>
                  <span className="font-mono-num">-{formatIDR(data.couponDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Pengiriman Digital</span>
                <span className="font-mono-num text-emerald-700 font-medium">
                  {data.shippingCost === 0 ? 'Gratis' : formatIDR(data.shippingCost)}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#102A43] pt-2 border-t border-[#E5EAF0]">
                <span>Total</span>
                <span className="font-mono-num">{formatIDR(data.totalAmount)}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              {data.paymentStatus !== 'paid' && data.orderStatus !== 'cancelled' && (
                <NavyButton
                  type="button"
                  onClick={() => setShowConfirmForm(true)}
                  className="px-5 py-3 rounded-xl text-sm font-semibold cursor-pointer"
                >
                  Konfirmasi Pembayaran
                </NavyButton>
              )}
              <a
                href={adminWaHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-navy-outline inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium"
              >
                <MessageCircle className="w-4 h-4" />
                Hubungi Admin
              </a>
            </div>

            {storedToken && (
              <div className="pt-2">
                <Link
                  to={`/resi/${encodeURIComponent(storedToken)}`}
                  className="inline-flex items-center gap-2 text-xs font-semibold text-[#244B75] hover:text-[#102A43]"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Buka Halaman Resi Unik ({data.orderNumber})
                </Link>
              </div>
            )}
          </section>

          {/* Payment Confirmation Form */}
          {(showConfirmForm || (data.paymentStatus === 'unpaid' && !confirmationResult)) &&
            data.paymentStatus !== 'paid' && (
              <section className="surface-card rounded-2xl p-6 space-y-4">
                <h2 className="text-lg font-semibold text-[#102A43]">
                  Form Konfirmasi Pembayaran
                </h2>
                <form onSubmit={handleConfirmSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="conf-name" className="block text-xs font-semibold text-[#253449]">
                        Nama Pembeli
                      </label>
                      <input
                        id="conf-name"
                        type="text"
                        required
                        value={payerName}
                        onChange={(e) => setPayerName(e.target.value)}
                        className="input-navy w-full rounded-xl px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="conf-wa" className="block text-xs font-semibold text-[#253449]">
                        Nomor WhatsApp Pembeli
                      </label>
                      <input
                        id="conf-wa"
                        type="tel"
                        required
                        value={payerWhatsapp}
                        onChange={(e) => setPayerWhatsapp(e.target.value)}
                        placeholder="Contoh: 081234567890"
                        className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <label htmlFor="conf-order" className="block text-xs font-semibold text-[#253449]">
                        Nomor Pesanan
                      </label>
                      <input
                        id="conf-order"
                        type="text"
                        readOnly
                        value={data.orderNumber}
                        className="w-full bg-[#F8FAFC] border border-[#E5EAF0] rounded-xl px-3 py-2 text-xs font-mono-num text-[#718096]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="conf-method" className="block text-xs font-semibold text-[#253449]">
                        Metode
                      </label>
                      <input
                        id="conf-method"
                        type="text"
                        readOnly
                        value="QRIS"
                        className="w-full bg-[#F8FAFC] border border-[#E5EAF0] rounded-xl px-3 py-2 text-xs font-mono-num text-[#718096]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label htmlFor="conf-amount" className="block text-xs font-semibold text-[#253449]">
                        Nominal Dibayarkan
                      </label>
                      <input
                        id="conf-amount"
                        type="number"
                        required
                        min={1}
                        value={paidAmount}
                        onChange={(e) => setPaidAmount(e.target.value)}
                        className="input-navy w-full rounded-xl px-3 py-2 text-sm font-mono-num"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="conf-time" className="block text-xs font-semibold text-[#253449]">
                      Waktu Pembayaran
                    </label>
                    <input
                      id="conf-time"
                      type="text"
                      required
                      value={paymentTime}
                      onChange={(e) => setPaymentTime(e.target.value)}
                      className="input-navy w-full rounded-xl px-3 py-2 text-sm"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="conf-proof" className="block text-xs font-semibold text-[#253449]">
                      Upload Bukti Pembayaran (JPG, PNG, PDF maks. 5MB)
                    </label>
                    <label
                      htmlFor="conf-proof"
                      className="flex items-center gap-3 px-4 py-3 rounded-xl bg-[#F8FAFC] border border-dashed border-[#244B75]/35 hover:border-[#102A43] cursor-pointer text-xs text-[#253449]"
                    >
                      <Upload className="w-4 h-4 text-[#244B75] shrink-0" />
                      <span className="truncate">
                        {proofFile ? proofFile.name : 'Pilih file bukti transfer QRIS...'}
                      </span>
                    </label>
                    <input
                      id="conf-proof"
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                      onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                      className="sr-only"
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor="conf-notes" className="block text-xs font-semibold text-[#253449]">
                      Catatan Tambahan (Opsional)
                    </label>
                    <input
                      id="conf-notes"
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Contoh: Ditransfer dari BCA / GoPay a.n. Budi"
                      className="input-navy w-full rounded-xl px-3 py-2 text-sm"
                    />
                  </div>

                  <NavyButton
                    type="submit"
                    disabled={submittingConfirm}
                    className="w-full py-3 px-5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {submittingConfirm
                      ? 'Mengirim Konfirmasi...'
                      : 'Kirim Konfirmasi & Lanjut ke WhatsApp'}
                  </NavyButton>
                </form>
              </section>
            )}
        </div>
      </div>

      {/* QRIS Zoom Modal */}
      {zoomQris && data.qris.imageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="QRIS Catrizzz Store Diperbesar"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setZoomQris(false)}
        >
          <button
            type="button"
            onClick={() => setZoomQris(false)}
            aria-label="Tutup QRIS diperbesar"
            className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white border border-[#E5EAF0] text-[#102A43] flex items-center justify-center shadow-md cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div
            className="bg-white rounded-2xl p-4 max-w-lg w-full border border-[#E5EAF0] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={data.qris.imageUrl}
              alt={`QRIS Resmi ${data.qris.merchantName}`}
              className="w-full h-auto object-contain"
            />
          </div>
        </div>
      )}
    </main>
  );
}
