import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Info,
  Lock,
  Mail,
  ShoppingBag,
  Sparkles,
  Tag,
  Wallet,
  AlertTriangle,
  QrCode,
  Zap,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  calculateOrderTotals,
  formatIDR,
  isValidWhatsappNumber,
} from '../shared/pricing';
import { SafeImage } from '../components/SafeImage';
import { NavyButton } from '../components/Interactive';

export function CheckoutPage() {
  const {
    cart,
    enrichedCart,
    allCatalogProducts,
    loadingStorefront,
    storefront,
    clearCart,
    showToast,
    refreshStorefront,
    userProfile,
    isResellerActive,
    resellerWallet,
    refreshResellerWallet,
    cartResellerSavings,
    referralCode,
    subscribeRealtime,
  } = useStore();
  const navigate = useNavigate();

  const [customerName, setCustomerName] = useState('');
  const [customerWhatsapp, setCustomerWhatsapp] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [shippingMethodId, setShippingMethodId] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [prefilled, setPrefilled] = useState(false);

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    promoName: string;
    discountAmount: number;
  } | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'WALLET' | 'QRIS'>(
    isResellerActive ? 'WALLET' : 'QRIS'
  );
  const [paymentMethodInitialized, setPaymentMethodInitialized] = useState(isResellerActive);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  );

  useEffect(() => {
    document.title = 'Checkout — Catrizzz Store';
  }, []);

  useEffect(() => {
    if (isResellerActive && !paymentMethodInitialized) {
      setSelectedPaymentMethod('WALLET');
      setPaymentMethodInitialized(true);
    } else if (!isResellerActive) {
      setSelectedPaymentMethod('QRIS');
    }
  }, [isResellerActive, paymentMethodInitialized]);

  useEffect(() => {
    if (isResellerActive) {
      refreshResellerWallet();
    }
  }, [isResellerActive, refreshResellerWallet]);

  useEffect(() => {
    return subscribeRealtime(
      ['storefront', 'payment_settings', 'discounts', 'products', 'reseller_wallet'],
      () => {
        refreshStorefront({ silent: true });
        if (isResellerActive) {
          refreshResellerWallet();
        }
      }
    );
  }, [subscribeRealtime, refreshStorefront, refreshResellerWallet, isResellerActive]);

  useEffect(() => {
    if (userProfile && !prefilled) {
      if (!customerName) setCustomerName(userProfile.name || '');
      if (!customerWhatsapp) setCustomerWhatsapp(userProfile.whatsapp || '');
      if (!customerEmail) setCustomerEmail(userProfile.email || '');
      setPrefilled(true);
    }
  }, [userProfile, prefilled, customerName, customerWhatsapp, customerEmail]);

  const shippingOptions = storefront?.shippingSettings || [];

  useEffect(() => {
    if (shippingOptions.length > 0 && !shippingMethodId) {
      const digitalOpt = shippingOptions.find((s) => s.type === 'digital');
      setShippingMethodId(digitalOpt?.id || shippingOptions[0].id);
    }
  }, [shippingOptions, shippingMethodId]);

  const cartSignature = enrichedCart
    .map((i) => `${i.productId}:${i.variantId || ''}:${i.quantity}`)
    .join('|');
  useEffect(() => {
    setIdempotencyKey(
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`
    );
  }, [cartSignature]);

  const selectedShipping = shippingOptions.find((s) => s.id === shippingMethodId);

  const subtotalOriginal = enrichedCart.reduce(
    (sum, item) => sum + item.originalUnitPrice * item.quantity,
    0
  );
  const subtotalAfterProductDiscount = enrichedCart.reduce(
    (sum, item) => sum + item.lineSubtotal,
    0
  );
  const regularProductDiscountTotal = isResellerActive
    ? 0
    : Math.max(0, subtotalOriginal - subtotalAfterProductDiscount);
  const resellerDiscountTotal = isResellerActive
    ? Math.max(0, cartResellerSavings)
    : 0;
  const couponDiscount = appliedCoupon?.discountAmount || 0;
  const totals = calculateOrderTotals({
    subtotalAfterProductDiscount,
    couponDiscount,
    shippingSetting: selectedShipping,
    taxPercent: storefront?.storeSettings?.taxPercent || 0,
  });

  const promoBlockedForReseller =
    isResellerActive && !storefront?.storeSettings?.allowResellerStackPromo;
  const effectivePaymentMethod: 'WALLET' | 'QRIS' = isResellerActive
    ? selectedPaymentMethod
    : 'QRIS';
  const qrisDisabled =
    storefront?.storeSettings?.qrisReady === false ||
    storefront?.storeSettings?.qrisEnabled === false;
  const walletBalance = resellerWallet?.balance ?? 0;
  const insufficientWalletBalance =
    effectivePaymentMethod === 'WALLET' && walletBalance < totals.totalAmount;
  const walletShortfall = Math.max(0, totals.totalAmount - walletBalance);
  const remainingWalletBalance = Math.max(0, walletBalance - totals.totalAmount);

  const handleApplyCoupon = async () => {
    const code = couponInput.trim();
    if (!code) {
      setCouponFeedback({ ok: false, message: 'Masukkan kode diskon terlebih dahulu.' });
      return;
    }
    setValidatingCoupon(true);
    setCouponFeedback(null);
    try {
      const res = await fetch('/api/discounts/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          code,
          customerWhatsapp,
          items: enrichedCart.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (data.valid) {
        setAppliedCoupon({
          code: data.code,
          promoName: data.promoName,
          discountAmount: data.discountAmount,
        });
        setCouponFeedback({ ok: true, message: data.message });
        showToast('Kode diskon berhasil digunakan.', 'success');
      } else {
        setAppliedCoupon(null);
        setCouponFeedback({
          ok: false,
          message: data.message || data.error || 'Kode tidak valid.',
        });
      }
    } catch {
      setCouponFeedback({ ok: false, message: 'Gagal memvalidasi kode diskon.' });
    } finally {
      setValidatingCoupon(false);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (customerName.trim().length < 2) {
      errs.customerName = 'Nama lengkap wajib diisi minimal 2 karakter.';
    }
    if (!isValidWhatsappNumber(customerWhatsapp)) {
      errs.customerWhatsapp =
        'Nomor WhatsApp tidak valid. Gunakan nomor Indonesia aktif, contoh: 087738172871.';
    }
    if (!shippingMethodId) {
      errs.shippingMethodId = 'Pilih metode pengiriman digital.';
    }
    setFormErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (effectivePaymentMethod === 'QRIS' && qrisDisabled) {
      showToast(
        'Pembayaran QRIS sedang tidak tersedia. Silakan hubungi admin untuk informasi lebih lanjut.',
        'error'
      );
      return;
    }

    if (insufficientWalletBalance) {
      showToast('Saldo Anda tidak mencukupi untuk melakukan transaksi ini.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          idempotencyKey,
          customerName: customerName.trim(),
          customerWhatsapp: customerWhatsapp.trim(),
          customerEmail: customerEmail.trim() || undefined,
          shippingMethodId,
          orderNotes: orderNotes.trim() || undefined,
          couponCode: appliedCoupon?.code || undefined,
          referralCode: referralCode || undefined,
          paymentMethod: effectivePaymentMethod,
          items: enrichedCart.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'INSUFFICIENT_WALLET_BALANCE') {
          await refreshResellerWallet();
        }
        showToast(data.error || 'Gagal membuat pesanan.', 'error');
        return;
      }

      if (data.receiptToken) {
        try {
          sessionStorage.setItem(`catrizzz_receipt_${data.orderId}`, data.receiptToken);
        } catch {
          // ignore
        }
      }

      clearCart();
      await refreshStorefront({ silent: true });

      if (
        data.paymentMethod === 'WALLET' &&
        data.paymentStatus === 'paid' &&
        data.receiptToken
      ) {
        await refreshResellerWallet();
        showToast(
          `Pembayaran via Reseller Wallet sukses! Pesanan ${data.orderNumber} langsung diproses.`,
          'success'
        );
        navigate(`/resi/${encodeURIComponent(data.receiptToken)}`);
        return;
      }

      showToast(`Pesanan ${data.orderNumber} berhasil dibuat.`, 'success');
      navigate(`/pembayaran/${data.orderId}`);
    } catch {
      showToast('Terjadi kesalahan jaringan saat membuat pesanan.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (
    (loadingStorefront || allCatalogProducts.length === 0) &&
    cart.length > 0 &&
    enrichedCart.length === 0
  ) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-6 bg-white">
        <div className="h-10 w-64 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 h-96 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
          <div className="lg:col-span-5 h-80 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
        </div>
      </main>
    );
  }

  if (enrichedCart.length === 0) {
    return (
      <main className="max-w-xl mx-auto px-4 py-20 text-center space-y-4 bg-white">
        <div className="w-14 h-14 rounded-2xl bg-[#EAF2FA] border border-[#E5EAF0] flex items-center justify-center mx-auto text-[#102A43]">
          <ShoppingBag className="w-6 h-6" />
        </div>
        <h1 className="font-display text-2xl font-bold text-[#102A43]">
          Keranjang Anda Kosong
        </h1>
        <p className="text-sm text-[#718096]">
          Tambahkan produk ke keranjang terlebih dahulu sebelum melakukan checkout.
        </p>
        <Link
          to="/produk"
          className="btn-navy-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
        >
          Jelajahi Katalog
          <ArrowRight className="w-4 h-4" />
        </Link>
      </main>
    );
  }

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8 bg-white">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E5EAF0] pb-6">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold text-[#102A43]">
            Checkout Pesanan
          </h1>
          <p className="text-sm text-[#718096]">
            Semua harga, stok, dan diskon divalidasi langsung oleh server demi keamanan transaksi Anda.
          </p>
        </div>
        {isResellerActive && (
          <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#EAF2FA] border border-[#244B75]/20 text-xs font-semibold text-[#102A43]">
            <Sparkles className="w-4 h-4 text-[#244B75]" />
            Harga Khusus Reseller Aktif (Hemat 20%)
          </div>
        )}
      </div>

      {effectivePaymentMethod === 'QRIS' && qrisDisabled && (
        <div
          data-testid="checkout-qris-disabled-banner"
          className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-2.5"
        >
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">
              Pembayaran QRIS sedang tidak tersedia. Silakan hubungi admin untuk informasi lebih lanjut.
            </p>
            {isResellerActive && (
              <p className="text-xs text-rose-700 mt-0.5">
                Anda tetap dapat menyelesaikan pembayaran secara instan menggunakan metode Reseller Wallet.
              </p>
            )}
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmitOrder}
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
      >
        {/* Left: Buyer & Shipping Form */}
        <div className="lg:col-span-7 space-y-6">
          <section className="surface-card rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-[#102A43]">
              A. Informasi Pembeli
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="checkout-name"
                  className="block text-xs font-semibold text-[#253449]"
                >
                  Nama Lengkap <span className="text-rose-600">*</span>
                </label>
                <input
                  id="checkout-name"
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm"
                />
                {formErrors.customerName && (
                  <p className="text-xs text-rose-600">{formErrors.customerName}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="checkout-wa"
                  className="block text-xs font-semibold text-[#253449]"
                >
                  Nomor WhatsApp <span className="text-rose-600">*</span>
                </label>
                <input
                  id="checkout-wa"
                  type="tel"
                  required
                  value={customerWhatsapp}
                  onChange={(e) => setCustomerWhatsapp(e.target.value)}
                  placeholder="Contoh: 087738172871"
                  className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-mono-num"
                />
                {formErrors.customerWhatsapp && (
                  <p className="text-xs text-rose-600">{formErrors.customerWhatsapp}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="checkout-email"
                className="block text-xs font-semibold text-[#253449]"
              >
                Email Akun / Aktivasi (Opsional)
              </label>
              <input
                id="checkout-email"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="Email akun tujuan aktivasi / undangan (opsional)"
                className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>

            <div className="space-y-2.5">
              <span className="block text-xs font-semibold text-[#253449]">
                Metode Pengiriman Digital <span className="text-rose-600">*</span>
              </span>
              <div className="grid grid-cols-1 gap-2.5">
                {shippingOptions.map((opt) => {
                  const selected = opt.id === shippingMethodId;
                  return (
                    <label
                      key={opt.id}
                      className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        selected
                          ? 'bg-[#EAF2FA] border-[#102A43] shadow-sm'
                          : 'bg-white border-[#E5EAF0] hover:border-[#244B75]/40'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="shippingMethod"
                          value={opt.id}
                          checked={selected}
                          onChange={() => setShippingMethodId(opt.id)}
                          className="mt-1 accent-[#102A43]"
                        />
                        <div>
                          <p className="text-sm font-semibold text-[#102A43] flex items-center gap-1.5">
                            {opt.id.includes('email') ? (
                              <Mail className="w-3.5 h-3.5 text-[#244B75]" />
                            ) : (
                              <Zap className="w-3.5 h-3.5 text-[#244B75]" />
                            )}
                            {opt.name}
                          </p>
                          <p className="text-xs text-[#718096] mt-0.5">{opt.description}</p>
                        </div>
                      </div>
                      <span className="text-sm font-semibold font-mono-num text-emerald-700 whitespace-nowrap">
                        {opt.cost === 0 ? 'Gratis' : formatIDR(opt.cost)}
                      </span>
                    </label>
                  );
                })}
              </div>
              {formErrors.shippingMethodId && (
                <p className="text-xs text-rose-600">{formErrors.shippingMethodId}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="checkout-notes"
                className="block text-xs font-semibold text-[#253449]"
              >
                Catatan Aktivasi / Akun (Opsional)
              </label>
              <input
                id="checkout-notes"
                type="text"
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Contoh: Email akun Canva atau permintaan perangkat/platform"
                className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm"
              />
            </div>
          </section>

          {/* Payment Method (Reseller Wallet vs QRIS) */}
          {isResellerActive && (
            <section className="surface-card rounded-2xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-[#102A43] flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-[#244B75]" />
                  B. Metode Pembayaran
                </h2>
                <Link
                  to="/reseller/topup"
                  className="text-xs font-semibold text-[#244B75] hover:underline"
                >
                  + Top Up Saldo Wallet
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedPaymentMethod === 'WALLET'
                      ? 'bg-[#EAF2FA] border-[#102A43] shadow-sm'
                      : 'bg-white border-[#E5EAF0] hover:border-[#244B75]/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="WALLET"
                    checked={selectedPaymentMethod === 'WALLET'}
                    onChange={() => setSelectedPaymentMethod('WALLET')}
                    className="mt-1 accent-[#102A43]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[#102A43] flex items-center gap-1.5">
                        <Wallet className="w-4 h-4 text-[#244B75]" />
                        Reseller Wallet
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[10px] font-semibold text-emerald-700">
                        Instan
                      </span>
                    </div>
                    <p className="text-xs text-[#718096] mt-1">
                      Saldo tersedia:{' '}
                      <strong className="font-mono-num text-[#102A43]">
                        {formatIDR(walletBalance)}
                      </strong>
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedPaymentMethod === 'QRIS'
                      ? 'bg-[#EAF2FA] border-[#102A43] shadow-sm'
                      : 'bg-white border-[#E5EAF0] hover:border-[#244B75]/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="QRIS"
                    checked={selectedPaymentMethod === 'QRIS'}
                    onChange={() => setSelectedPaymentMethod('QRIS')}
                    className="mt-1 accent-[#102A43]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-[#102A43] flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-[#244B75]" />
                        QRIS Manual
                      </span>
                      {qrisDisabled && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-[10px] font-semibold text-rose-700">
                          Nonaktif
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#718096] mt-1">
                      {qrisDisabled
                        ? 'Pembayaran QRIS sedang tidak tersedia.'
                        : 'Scan QRIS & unggah bukti transfer untuk diverifikasi admin.'}
                    </p>
                  </div>
                </label>
              </div>
            </section>
          )}

          {/* Coupon Form */}
          <section className="surface-card rounded-2xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[#102A43] flex items-center gap-2">
              <Tag className="w-4 h-4 text-[#244B75]" />
              {isResellerActive ? 'C.' : 'B.'} Kode Diskon / Voucher
            </h2>

            {promoBlockedForReseller ? (
              <div className="p-3.5 rounded-xl bg-[#EAF2FA] border border-[#244B75]/20 text-xs text-[#253449] flex items-start gap-2.5">
                <Info className="w-4 h-4 text-[#244B75] shrink-0 mt-0.5" />
                <span>
                  Akun Anda sudah mendapatkan <strong className="text-[#102A43]">Harga Reseller (-20% dari Harga Normal)</strong>. Saat ini kode promo tambahan tidak dapat digabung dengan diskon reseller.
                </span>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row gap-2.5">
                  <label htmlFor="coupon-input" className="sr-only">
                    Masukkan Kode Diskon
                  </label>
                  <input
                    id="coupon-input"
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Masukkan Kode Diskon (cth: CATRIZZZ20)"
                    className="input-navy flex-1 rounded-xl px-3.5 py-2.5 text-sm font-mono-num uppercase"
                  />
                  <NavyButton
                    type="button"
                    variant="outline"
                    disabled={validatingCoupon}
                    onClick={handleApplyCoupon}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap disabled:opacity-50 cursor-pointer"
                  >
                    {validatingCoupon ? 'Memeriksa...' : 'Gunakan Kode'}
                  </NavyButton>
                </div>
                {couponFeedback && (
                  <p
                    className={`text-xs flex items-center gap-1.5 font-medium ${
                      couponFeedback.ok ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {couponFeedback.ok && <CheckCircle2 className="w-3.5 h-3.5" />}
                    <span>{couponFeedback.message}</span>
                  </p>
                )}
              </>
            )}
          </section>
        </div>

        {/* Right: Order Summary */}
        <aside className="lg:col-span-5 surface-subtle rounded-2xl p-6 space-y-5 lg:sticky lg:top-24">
          <h2 className="text-lg font-semibold text-[#102A43]">
            Ringkasan Pembelian
          </h2>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {enrichedCart.map((item) => (
              <div
                key={`${item.productId}-${item.variantId || 'default'}`}
                className="flex items-center gap-3 pb-3 border-b border-[#E5EAF0]"
              >
                <SafeImage
                  src={item.product.imageUrl}
                  alt={item.product.name}
                  className="w-14 h-14 rounded-lg object-cover shrink-0 bg-white border border-[#E5EAF0]"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#102A43] truncate">
                    {item.product.name}
                  </p>
                  {item.variantName && (
                    <p className="text-xs text-[#244B75] font-medium">{item.variantName}</p>
                  )}
                  <div className="flex items-center gap-1.5 text-xs font-mono-num text-[#718096]">
                    <span>
                      {item.quantity} x {formatIDR(item.unitPrice)}
                    </span>
                    {item.pricingTier === 'reseller' && (
                      <span className="line-through text-[11px]">
                        {formatIDR(item.originalUnitPrice)}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-sm font-mono-num font-bold text-[#102A43] whitespace-nowrap">
                  {formatIDR(item.lineSubtotal)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-2 text-sm pt-1">
            <div className="flex justify-between text-[#253449]">
              <span>Subtotal Harga Normal</span>
              <span className="font-mono-num">{formatIDR(subtotalOriginal)}</span>
            </div>
            {regularProductDiscountTotal > 0 && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Diskon Produk</span>
                <span className="font-mono-num">
                  -{formatIDR(regularProductDiscountTotal)}
                </span>
              </div>
            )}
            {resellerDiscountTotal > 0 && (
              <div className="flex justify-between text-[#244B75] font-medium">
                <span>Diskon Reseller (20%)</span>
                <span className="font-mono-num">-{formatIDR(resellerDiscountTotal)}</span>
              </div>
            )}
            {appliedCoupon && (
              <div className="flex justify-between text-emerald-700 font-medium">
                <span>Kupon ({appliedCoupon.code})</span>
                <span className="font-mono-num">
                  -{formatIDR(appliedCoupon.discountAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-[#253449]">
              <span>Pengiriman Digital</span>
              <span className="font-mono-num text-emerald-700 font-medium">
                {totals.shippingCost === 0 ? 'Gratis' : formatIDR(totals.shippingCost)}
              </span>
            </div>
            {totals.taxAmount > 0 && (
              <div className="flex justify-between text-[#253449]">
                <span>Pajak</span>
                <span className="font-mono-num">{formatIDR(totals.taxAmount)}</span>
              </div>
            )}
            <div className="pt-3 border-t border-[#E5EAF0] flex justify-between items-baseline">
              <span className="text-base font-semibold text-[#102A43]">
                Total Pembayaran
              </span>
              <span className="text-2xl font-bold font-mono-num text-[#102A43]">
                {formatIDR(totals.totalAmount)}
              </span>
            </div>
          </div>

          {isResellerActive && effectivePaymentMethod === 'WALLET' && (
            <div
              className={`rounded-xl p-4 border space-y-2.5 text-xs ${
                insufficientWalletBalance
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-white border-[#244B75]/25 text-[#253449]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#102A43] flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-[#244B75]" />
                  Ringkasan Reseller Wallet
                </span>
                <span className="font-mono-num font-bold text-[#102A43]">
                  {formatIDR(walletBalance)}
                </span>
              </div>

              {insufficientWalletBalance ? (
                <div className="space-y-2.5 pt-1 border-t border-rose-200">
                  <div className="flex items-start gap-2 text-rose-800">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-bold">
                        Saldo Anda tidak mencukupi untuk melakukan transaksi ini.
                      </p>
                      <p className="text-[11px]">
                        Kekurangan saldo:{' '}
                        <strong className="font-mono-num">{formatIDR(walletShortfall)}</strong>
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/reseller/topup"
                    className="btn-navy-primary w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-bold tracking-wide"
                  >
                    TOP UP SEKARANG
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="flex justify-between items-center pt-1.5 border-t border-[#E5EAF0] text-[#253449]">
                  <span>Sisa saldo setelah bayar</span>
                  <span className="font-mono-num font-bold text-emerald-700">
                    {formatIDR(remainingWalletBalance)}
                  </span>
                </div>
              )}
            </div>
          )}

          <NavyButton
            type="submit"
            disabled={
              submitting ||
              insufficientWalletBalance ||
              (effectivePaymentMethod === 'QRIS' && qrisDisabled)
            }
            className="w-full py-3.5 px-5 rounded-xl text-sm font-bold tracking-wide disabled:opacity-50 cursor-pointer"
          >
            {submitting
              ? 'MEMPROSES PESANAN...'
              : effectivePaymentMethod === 'WALLET'
                ? 'BAYAR DENGAN RESELLER WALLET'
                : 'LANJUTKAN KE PEMBAYARAN'}
          </NavyButton>

          <p className="text-xs text-[#718096] flex items-center justify-center gap-1.5 text-center">
            <Lock className="w-3.5 h-3.5 text-[#244B75]" />
            <span>Transaksi dilindungi validasi harga server &amp; token resi unik</span>
          </p>
        </aside>
      </form>
    </main>
  );
}
