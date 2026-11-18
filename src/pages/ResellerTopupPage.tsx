import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  MessageCircle,
  QrCode,
  Sparkles,
  Upload,
  Wallet,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  calculateTopupFee,
  formatIDR,
  TOPUP_PRESET_AMOUNTS,
} from '../shared/pricing';
import type { ResellerTopup, ResellerWallet } from '../shared/types';
import { ResellerLayout } from '../components/reseller/ResellerLayout';
import { NavyButton } from '../components/Interactive';

interface QrisPayload {
  ready: boolean;
  imageUrl: string;
  merchantName: string;
  nmid: string;
  instructions: string[];
}

export function ResellerTopupPage() {
  const {
    userProfile,
    isResellerActive,
    topupConfig,
    storefront,
    showToast,
    refreshResellerWallet,
    refreshStorefront,
    subscribeRealtime,
  } = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const resumeTopupId = searchParams.get('id');

  const [wallet, setWallet] = useState<ResellerWallet | null>(null);
  const [qris, setQris] = useState<QrisPayload | null>(null);
  const [config, setConfig] = useState(topupConfig);
  const [loading, setLoading] = useState(true);

  const [amountInput, setAmountInput] = useState<string>('100000');
  const [notesInput, setNotesInput] = useState('');
  const [creating, setCreating] = useState(false);

  const [activeTopup, setActiveTopup] = useState<ResellerTopup | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string>('');

  const [payerName, setPayerName] = useState('');
  const [payerWhatsapp, setPayerWhatsapp] = useState('');
  const [paymentTime, setPaymentTime] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);

  useEffect(() => {
    document.title = 'Top Up Saldo Reseller — Catrizzz Store';
  }, []);

  useEffect(() => {
    if (userProfile) {
      if (!payerName) setPayerName(userProfile.name || '');
      if (!payerWhatsapp) setPayerWhatsapp(userProfile.whatsapp || '');
    }
  }, [userProfile, payerName, payerWhatsapp]);

  useEffect(() => {
    setConfig(topupConfig);
  }, [topupConfig]);

  const loadTopupContext = useCallback(
    async (silent = false) => {
      if (!isResellerActive) return;
      if (!silent) {
        setLoading(true);
      }
      try {
        const res = await fetch('/api/reseller/topups', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) {
          const json = await res.json();
          setWallet(json.wallet || null);
          if (json.topupConfig) setConfig(json.topupConfig);
          if (json.qris) setQris(json.qris);

          if (resumeTopupId) {
            const found = (json.topups || []).find(
              (t: ResellerTopup) => t.id === resumeTopupId || t.topupNumber === resumeTopupId
            );
            if (found) {
              setActiveTopup(found);
              const detailRes = await fetch(`/api/reseller/topups/${encodeURIComponent(found.id)}`, {
                credentials: 'include',
                cache: 'no-store',
              });
              if (detailRes.ok) {
                const detail = await detailRes.json();
                setWhatsappUrl(detail.whatsappUrl || '');
              }
            }
          }
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [isResellerActive, resumeTopupId]
  );

  useEffect(() => {
    loadTopupContext(false);
  }, [loadTopupContext]);

  useEffect(() => {
    return subscribeRealtime(
      ['storefront', 'payment_settings', 'topups', 'reseller_wallet'],
      () => {
        refreshStorefront({ silent: true });
        loadTopupContext(true);
      }
    );
  }, [subscribeRealtime, refreshStorefront, loadTopupContext]);

  const numericAmount = Math.max(0, Math.floor(Number(amountInput) || 0));
  const sim = calculateTopupFee(numericAmount, config.feePercentage);
  const presetList = config.presetAmounts?.length ? config.presetAmounts : TOPUP_PRESET_AMOUNTS;

  const qrisDisabled =
    qris?.ready === false ||
    storefront?.storeSettings?.qrisReady === false ||
    storefront?.storeSettings?.qrisEnabled === false;

  const isAmountValid =
    Number.isInteger(numericAmount) &&
    numericAmount >= config.minAmount &&
    numericAmount <= config.maxAmount;

  const handleCreateTopup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (qrisDisabled) {
      showToast(
        'Pembayaran QRIS sedang tidak tersedia. Silakan hubungi admin untuk informasi lebih lanjut.',
        'error'
      );
      return;
    }
    if (!isAmountValid) {
      showToast(
        `Nominal top up harus antara ${formatIDR(config.minAmount)} hingga ${formatIDR(config.maxAmount)}.`,
        'error'
      );
      return;
    }

    setCreating(true);
    try {
      const res = await fetch('/api/reseller/topups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          amount: numericAmount,
          notes: notesInput.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Gagal membuat permintaan top up.', 'error');
        return;
      }
      setActiveTopup(json.topup);
      setSearchParams({ id: json.topup.id });
      showToast(`Tagihan Top Up ${json.topup.topupNumber} dibuat. Silakan bayar via QRIS.`, 'success');
    } catch {
      showToast('Terjadi kesalahan jaringan saat membuat permintaan top up.', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTopup) return;
    if (!proofFile) {
      showToast('Unggah foto/PDF bukti transfer QRIS terlebih dahulu.', 'error');
      return;
    }

    setSubmittingProof(true);
    try {
      const fd = new FormData();
      fd.append('payerName', payerName.trim());
      fd.append('payerWhatsapp', payerWhatsapp.trim());
      if (paymentTime.trim()) fd.append('paymentTime', paymentTime.trim());
      if (notesInput.trim()) fd.append('notes', notesInput.trim());
      fd.append('proof', proofFile);

      const res = await fetch(`/api/reseller/topups/${activeTopup.id}/confirm`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Gagal mengirim bukti top up.', 'error');
        return;
      }
      setActiveTopup(json.topup);
      setWhatsappUrl(json.whatsappUrl || '');
      await refreshResellerWallet();
      showToast(json.message || 'Bukti top up berhasil dikirim.', 'success');
    } catch {
      showToast('Terjadi kesalahan jaringan saat mengunggah bukti pembayaran.', 'error');
    } finally {
      setSubmittingProof(false);
    }
  };

  const activeWalletCredit = activeTopup
    ? activeTopup.walletCredit ?? activeTopup.amount
    : 0;
  const activeFeePercentage = activeTopup?.feePercentage ?? config.feePercentage ?? 10;
  const activeFeeAmount = activeTopup?.feeAmount ?? 0;
  const activeTotalPayment = activeTopup
    ? activeTopup.totalPayment ?? (activeWalletCredit + activeFeeAmount)
    : 0;

  return (
    <ResellerLayout
      title="Top Up Saldo Reseller Wallet"
      subtitle={`Top up saldo wallet via QRIS resmi dengan biaya layanan top up ${config.feePercentage}% dari nominal saldo.`}
    >
      {loading ? (
        <div className="h-72 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
      ) : (
        <div className="space-y-6">
          {/* Fee Info & Balance Strip */}
          <div className="rounded-2xl bg-gradient-to-r from-[#102A43] to-[#244B75] text-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_14px_32px_-12px_rgba(36,75,117,0.4)]">
            <div className="space-y-1">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#93C5FD]">
                <Sparkles className="w-3.5 h-3.5" />
                Skema Transparan Top Up Reseller Wallet
              </p>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                Top Up Saldo Wallet · Biaya Top Up {config.feePercentage}%
              </h2>
              <p className="text-xs text-[#EAF2FA]">
                Saldo wallet bertambah penuh sesuai nominal top up Anda. Pembayaran QRIS dikenakan biaya tambahan {config.feePercentage}% sebagai biaya operasional Catrizzz Store.
              </p>
            </div>
            <div className="rounded-xl bg-white/10 border border-white/20 px-4 py-3 shrink-0">
              <p className="text-[11px] text-[#CBD5E1] flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5" />
                Saldo Saat Ini
              </p>
              <p className="text-xl font-bold font-mono-num text-white">
                {formatIDR(wallet?.balance ?? 0)}
              </p>
            </div>
          </div>

          {!activeTopup ? (
            /* STEP 1: Choose Nominal & See 10% Top Up Fee Breakdown */
            <div className="space-y-4">
              {qrisDisabled && (
                <div
                  data-testid="topup-qris-disabled-banner"
                  className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-2.5"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <p className="font-semibold">
                    Pembayaran QRIS sedang tidak tersedia. Silakan hubungi admin untuk informasi lebih lanjut.
                  </p>
                </div>
              )}

              <form onSubmit={handleCreateTopup} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-7 surface-card rounded-2xl p-6 space-y-5">
                  <h3 className="text-base font-bold text-[#102A43]">1. Pilih Nominal Saldo Top Up</h3>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {presetList.map((preset) => {
                      const selected = numericAmount === preset;
                      const presetFee = calculateTopupFee(preset, config.feePercentage);
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setAmountInput(String(preset))}
                          className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                            selected
                              ? 'bg-[#102A43] border-[#102A43] text-white shadow-sm'
                              : 'bg-white border-[#E5EAF0] text-[#102A43] hover:bg-[#EAF2FA] hover:border-[#244B75]/40'
                          }`}
                        >
                          <p className="text-sm font-bold font-mono-num">{formatIDR(preset)}</p>
                          <p
                            className={`text-[11px] font-mono-num mt-0.5 ${
                              selected ? 'text-[#93C5FD]' : 'text-[#244B75] font-medium'
                            }`}
                          >
                            +{formatIDR(presetFee.feeAmount)} biaya &rarr; Bayar {formatIDR(presetFee.totalPayment)}
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="topup-custom-amount"
                      className="block text-xs font-semibold text-[#253449]"
                    >
                      Nominal Saldo Masuk Custom (Rupiah)
                    </label>
                    <input
                      id="topup-custom-amount"
                      type="number"
                      min={config.minAmount}
                      max={config.maxAmount}
                      step={1000}
                      required
                      value={amountInput}
                      onChange={(e) => setAmountInput(e.target.value)}
                      className="input-navy w-full rounded-xl px-4 py-3 text-base font-mono-num font-bold"
                    />
                    <p className="text-xs text-[#718096]">
                      Minimal <span className="font-mono-num font-semibold text-[#102A43]">{formatIDR(config.minAmount)}</span> · Maksimal{' '}
                      <span className="font-mono-num font-semibold text-[#102A43]">{formatIDR(config.maxAmount)}</span>
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="topup-notes"
                      className="block text-xs font-semibold text-[#253449]"
                    >
                      Catatan Top Up (Opsional)
                    </label>
                    <input
                      id="topup-notes"
                      type="text"
                      value={notesInput}
                      onChange={(e) => setNotesInput(e.target.value)}
                      placeholder="Contoh: Top up modal penjualan harian"
                      className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm"
                    />
                  </div>
                </div>

                {/* Live Fee & Payment Breakdown Card */}
                <aside className="lg:col-span-5 surface-subtle rounded-2xl p-6 space-y-5">
                  <h3 className="text-base font-bold text-[#102A43]">
                    Rincian Top Up &amp; Biaya {config.feePercentage}%
                  </h3>

                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between text-[#253449]">
                      <span>Nominal Saldo Masuk Wallet</span>
                      <span
                        data-testid="topup-wallet-credit"
                        className="font-mono-num font-bold text-emerald-700"
                      >
                        {formatIDR(sim.walletCredit)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#244B75] font-medium">
                      <span>Biaya Tambahan Top Up ({config.feePercentage}%)</span>
                      <span data-testid="topup-fee-amount" className="font-mono-num font-bold">
                        +{formatIDR(sim.feeAmount)}
                      </span>
                    </div>
                    <div className="pt-3 border-t border-[#E5EAF0] flex justify-between items-baseline">
                      <span className="font-semibold text-[#102A43]">Total Pembayaran QRIS</span>
                      <span
                        data-testid="topup-total-payment"
                        className="text-2xl font-bold font-mono-num text-[#102A43]"
                      >
                        {formatIDR(sim.totalPayment)}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#718096]">
                      Saldo yang dikreditkan ke Reseller Wallet Anda adalah{' '}
                      <strong className="text-[#102A43] font-mono-num">
                        {formatIDR(sim.walletCredit)}
                      </strong>
                      . Biaya {config.feePercentage}% tidak masuk ke wallet.
                    </p>
                  </div>

                  {!isAmountValid && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                      Masukkan nominal valid antara {formatIDR(config.minAmount)} hingga{' '}
                      {formatIDR(config.maxAmount)}.
                    </div>
                  )}

                  <NavyButton
                    type="submit"
                    disabled={!isAmountValid || creating || qrisDisabled}
                    className="w-full py-3.5 px-5 rounded-xl text-sm font-bold tracking-wide disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {creating ? 'MEMBUAT TAGIHAN...' : 'LANJUTKAN KE PEMBAYARAN QRIS'}
                    <ArrowRight className="w-4 h-4" />
                  </NavyButton>
                </aside>
              </form>
            </div>
          ) : (
            /* STEP 2 & 3: QRIS Display + Proof Upload + Pending Verification / Approved */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left: QRIS Card */}
              <div className="lg:col-span-5 surface-card rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-[#718096]">ID Top Up</p>
                    <p className="text-base font-bold font-mono-num text-[#102A43]">
                      {activeTopup.topupNumber}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-md border text-xs font-semibold ${
                      activeTopup.status === 'approved'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                        : activeTopup.status === 'pending_verification'
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : activeTopup.status === 'rejected'
                            ? 'bg-rose-50 border-rose-200 text-rose-700'
                            : 'bg-[#F8FAFC] border-[#E5EAF0] text-[#102A43]'
                    }`}
                  >
                    {activeTopup.status === 'approved'
                      ? 'Disetujui & Masuk Wallet'
                      : activeTopup.status === 'pending_verification'
                        ? 'Menunggu Verifikasi Admin'
                        : activeTopup.status === 'rejected'
                          ? 'Ditolak'
                          : 'Menunggu Pembayaran QRIS'}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0] space-y-2 text-xs">
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Nominal Saldo Masuk Wallet</span>
                    <span data-testid="active-topup-wallet-credit" className="font-mono-num">
                      {formatIDR(activeWalletCredit)}
                    </span>
                  </div>
                  <div className="flex justify-between text-[#244B75] font-medium">
                    <span>Biaya Tambahan Top Up ({activeFeePercentage}%)</span>
                    <span className="font-mono-num">+{formatIDR(activeFeeAmount)}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-[#E5EAF0]">
                    <span className="font-bold text-[#102A43]">Total Pembayaran QRIS</span>
                    <span
                      data-testid="active-topup-total-payment"
                      className="font-mono-num font-bold text-[#102A43] text-base"
                    >
                      {formatIDR(activeTotalPayment)}
                    </span>
                  </div>
                </div>

                {qris?.ready === false && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-800">
                    Catatan: Pengajuan top up baru sedang dinonaktifkan sementara oleh admin, namun tagihan ini tetap dapat Anda selesaikan &amp; unggah buktinya.
                  </div>
                )}

                {qris?.imageUrl ? (
                  <div className="p-4 rounded-xl border border-[#E5EAF0] bg-white text-center space-y-2.5">
                    <p className="text-xs font-semibold text-[#102A43] flex items-center justify-center gap-1.5">
                      <QrCode className="w-4 h-4 text-[#244B75]" />
                      {qris.merchantName}
                    </p>
                    <img
                      src={qris.imageUrl}
                      alt={`QRIS ${qris.merchantName}`}
                      className="w-56 mx-auto rounded-xl border border-[#E5EAF0]"
                    />
                    <p className="text-[11px] font-mono-num text-[#718096]">NMID: {qris.nmid}</p>
                    <div className="p-3 rounded-xl bg-[#EAF2FA] border border-[#244B75]/20 text-left text-[11px] text-[#102A43] leading-relaxed">
                      <strong>Petunjuk QRIS Statis:</strong> Scan kode QRIS di atas lalu{' '}
                      <strong>masukkan nominal pembayaran secara manual</strong> tepat sebesar{' '}
                      <strong className="font-mono-num">{formatIDR(activeTotalPayment)}</strong>{' '}
                      (saldo masuk <span className="font-mono-num">{formatIDR(activeWalletCredit)}</span> + biaya top up {activeFeePercentage}%{' '}
                      <span className="font-mono-num">{formatIDR(activeFeeAmount)}</span>).
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                    Gambar QRIS belum tersedia. Silakan hubungi WhatsApp Admin.
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setActiveTopup(null);
                    setSearchParams({});
                    setProofFile(null);
                  }}
                  className="btn-navy-outline w-full py-2.5 px-4 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Buat Permintaan Top Up Baru
                </button>
              </div>

              {/* Right: Proof Upload or Pending Verification Result */}
              <div className="lg:col-span-7 surface-card rounded-2xl p-6 space-y-5">
                {activeTopup.status === 'pending_verification' ? (
                  <div className="space-y-5">
                    <div className="p-5 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                      <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                        <Clock className="w-5 h-5 text-amber-600" />
                        <span>MENUNGGU VERIFIKASI ADMIN</span>
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Bukti pembayaran QRIS untuk <strong>{activeTopup.topupNumber}</strong> senilai{' '}
                        <strong className="font-mono-num">{formatIDR(activeTotalPayment)}</strong>{' '}
                        (termasuk biaya top up {activeFeePercentage}%{' '}
                        <span className="font-mono-num">{formatIDR(activeFeeAmount)}</span>) telah kami terima. Saldo sebesar{' '}
                        <strong className="font-mono-num">
                          {formatIDR(activeWalletCredit)}
                        </strong>{' '}
                        akan langsung dikreditkan ke wallet Anda setelah disetujui admin.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {whatsappUrl && (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm"
                        >
                          <MessageCircle className="w-4 h-4" />
                          Konfirmasi via WhatsApp Admin
                        </a>
                      )}
                      <Link
                        to="/reseller/topup/history"
                        className="btn-navy-outline px-4 py-3 rounded-xl text-sm font-semibold"
                      >
                        Lihat Riwayat Top Up
                      </Link>
                      <Link
                        to="/reseller/dashboard"
                        className="btn-navy-primary px-4 py-3 rounded-xl text-sm font-semibold"
                      >
                        Kembali ke Dashboard
                      </Link>
                    </div>
                  </div>
                ) : activeTopup.status === 'approved' ? (
                  <div className="space-y-5">
                    <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                      <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        <span>TOP UP DISETUJUI &amp; SALDO MASUK WALLET</span>
                      </div>
                      <p className="text-xs text-emerald-800">
                        Saldo sebesar{' '}
                        <strong className="font-mono-num">{formatIDR(activeWalletCredit)}</strong>{' '}
                        telah ditambahkan ke Reseller Wallet Anda dari pembayaran QRIS{' '}
                        <span className="font-mono-num">{formatIDR(activeTotalPayment)}</span>{' '}
                        (biaya top up {activeFeePercentage}%:{' '}
                        <span className="font-mono-num">{formatIDR(activeFeeAmount)}</span>).
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Link
                        to="/reseller/wallet/history"
                        className="btn-navy-primary px-5 py-2.5 rounded-xl text-sm font-semibold"
                      >
                        Lihat Mutasi Saldo
                      </Link>
                      <Link
                        to="/produk"
                        className="btn-navy-outline px-5 py-2.5 rounded-xl text-sm font-semibold"
                      >
                        Belanja Produk Sekarang
                      </Link>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmitProof} className="space-y-4">
                    <h3 className="text-base font-bold text-[#102A43]">
                      2. Upload Bukti Transfer QRIS
                    </h3>

                    {activeTopup.status === 'rejected' && activeTopup.rejectionReason && (
                      <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                        <strong>Alasan Penolakan Sebelumnya:</strong> {activeTopup.rejectionReason}.
                        Silakan unggah ulang bukti transfer yang valid.
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                        Nama Pengirim
                        <input
                          type="text"
                          required
                          value={payerName}
                          onChange={(e) => setPayerName(e.target.value)}
                          className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-normal"
                        />
                      </label>
                      <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                        WhatsApp Pengirim
                        <input
                          type="tel"
                          required
                          value={payerWhatsapp}
                          onChange={(e) => setPayerWhatsapp(e.target.value)}
                          className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-mono-num font-normal"
                        />
                      </label>
                    </div>

                    <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                      Waktu Transfer (Opsional)
                      <input
                        type="text"
                        value={paymentTime}
                        onChange={(e) => setPaymentTime(e.target.value)}
                        placeholder="Contoh: Hari ini 14:20 WIB"
                        className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-normal"
                      />
                    </label>

                    <div className="space-y-1.5">
                      <span className="block text-xs font-semibold text-[#253449]">
                        Bukti Pembayaran QRIS (JPG / PNG / WebP / PDF, maks 5MB) *
                      </span>
                      <label className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-[#E5EAF0] hover:border-[#244B75] bg-[#F8FAFC] cursor-pointer text-center transition-colors">
                        <Upload className="w-6 h-6 text-[#244B75]" />
                        <span className="text-xs font-semibold text-[#102A43]">
                          {proofFile
                            ? `File dipilih: ${proofFile.name}`
                            : 'Klik untuk memilih screenshot / bukti transfer QRIS'}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          className="sr-only"
                          onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                        />
                      </label>
                    </div>

                    <NavyButton
                      type="submit"
                      disabled={submittingProof}
                      className="w-full py-3.5 px-5 rounded-xl text-sm font-bold tracking-wide disabled:opacity-50 cursor-pointer"
                    >
                      {submittingProof ? 'MENGIRIM BUKTI...' : 'KIRIM BUKTI TOP UP'}
                    </NavyButton>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </ResellerLayout>
  );
}
