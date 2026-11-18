import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogIn,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { normalizeWhatsappNumber } from '../shared/pricing';
import type {
  ResellerApplicationStatus,
  ResellerProfileStatus,
  ResellerStatusHistoryEntry,
} from '../shared/types';
import { NavyButton } from '../components/Interactive';

interface PublicResellerConfig {
  isFree?: boolean;
  feeAmount: number;
  storeWhatsapp: string;
  storeName: string;
}

interface ApplicationStatusSummary {
  id: string;
  applicationNumber: string;
  username: string;
  applicantName: string;
  maskedWhatsapp?: string;
  applicantEmail?: string;
  feeAmount: number;
  status: ResellerApplicationStatus;
  profileStatus?: ResellerProfileStatus;
  paymentStatus: string;
  rejectionReason?: string;
  statusHistory?: ResellerStatusHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  passwordSet?: boolean;
}

const ACTIVE_APP_STORAGE_KEY = 'catrizzz_reseller_active_app_v1';

export function JoinResellerPage() {
  const { userProfile, isResellerActive, showToast, subscribeRealtime } = useStore();

  const [config, setConfig] = useState<PublicResellerConfig | null>(null);
  const [activeApp, setActiveApp] = useState<ApplicationStatusSummary | null>(null);
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [applicantName, setApplicantName] = useState('');
  const [username, setUsername] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantWhatsapp, setApplicantWhatsapp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [appNotes, setAppNotes] = useState('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    document.title = 'Daftar Reseller Gratis — Catrizzz Store';
  }, []);

  const fetchPublicConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/reseller/public-config', { cache: 'no-store' });
      if (res.ok) {
        const json = (await res.json()) as PublicResellerConfig;
        setConfig(json);
      }
    } catch {
      // ignore
    }
  }, []);

  const lookupApplicationStatus = useCallback(
    async (query: string, silent = false) => {
      const clean = query.trim();
      if (!clean) return;
      setLookupLoading(true);
      setLookupError(null);
      try {
        const res = await fetch(
          `/api/reseller/applications/status?query=${encodeURIComponent(clean)}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (!res.ok) {
          if (!silent) {
            setLookupError(json.error || 'Pengajuan reseller tidak ditemukan.');
          }
          return;
        }
        setActiveApp(json.application);
        try {
          sessionStorage.setItem(
            ACTIVE_APP_STORAGE_KEY,
            json.application.applicationNumber
          );
        } catch {
          // ignore
        }
        if (!silent) {
          showToast(
            `Status pendaftaran ${json.application.applicationNumber} diperbarui.`,
            'info'
          );
        }
      } catch {
        if (!silent) {
          setLookupError('Gagal memeriksa status pendaftaran.');
        }
      } finally {
        setLookupLoading(false);
      }
    },
    [showToast]
  );

  useEffect(() => {
    fetchPublicConfig();
    try {
      const savedNumber = sessionStorage.getItem(ACTIVE_APP_STORAGE_KEY);
      if (savedNumber) {
        setLookupQuery(savedNumber);
        lookupApplicationStatus(savedNumber, true);
      }
    } catch {
      // ignore
    }
  }, [fetchPublicConfig, lookupApplicationStatus]);

  useEffect(() => {
    return subscribeRealtime(['reseller_apps', 'resellers'], () => {
      if (activeApp?.applicationNumber) {
        lookupApplicationStatus(activeApp.applicationNumber, true);
      }
    });
  }, [subscribeRealtime, activeApp?.applicationNumber, lookupApplicationStatus]);

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      showToast('Password wajib minimal 6 karakter.', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Konfirmasi password tidak cocok.', 'error');
      return;
    }

    setApplying(true);
    try {
      const res = await fetch('/api/reseller/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantName: applicantName.trim(),
          username: username.trim(),
          applicantEmail: applicantEmail.trim(),
          applicantWhatsapp: applicantWhatsapp.trim(),
          password,
          confirmPassword,
          notes: appNotes.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error || 'Gagal mengajukan pendaftaran reseller.', 'error');
        return;
      }
      const created = json.application as ApplicationStatusSummary;
      setActiveApp({
        ...created,
        profileStatus: json.profileStatus || 'pending_approval',
        passwordSet: true,
        applicantEmail: applicantEmail.trim().toLowerCase(),
      });
      setLookupQuery(created.applicationNumber);
      setPassword('');
      setConfirmPassword('');
      try {
        sessionStorage.setItem(ACTIVE_APP_STORAGE_KEY, created.applicationNumber);
      } catch {
        // ignore
      }
      showToast(
        json.message ||
          'Pendaftaran reseller gratis berhasil dikirim dan menunggu persetujuan admin.',
        'success'
      );
    } catch {
      showToast('Gagal menghubungi server.', 'error');
    } finally {
      setApplying(false);
    }
  };

  const resetToNewForm = () => {
    setActiveApp(null);
    setLookupError(null);
    try {
      sessionStorage.removeItem(ACTIVE_APP_STORAGE_KEY);
    } catch {
      // ignore
    }
  };

  const adminWaHref = `https://wa.me/${normalizeWhatsappNumber(
    config?.storeWhatsapp || '6287738172871'
  )}?text=${encodeURIComponent(
    `Halo Admin Catrizzz Store, saya telah mendaftar Reseller Gratis (${
      activeApp?.applicationNumber || username || ''
    }) dan ingin menanyakan status persetujuan akun saya.`
  )}`;

  const isPendingApproval =
    activeApp?.status === 'pending_approval' ||
    activeApp?.status === 'pending_verification' ||
    activeApp?.status === 'unpaid';

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-10 bg-white">
      {/* Hero Summary */}
      <section className="surface-subtle rounded-2xl p-8 sm:p-10 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#EAF2FA] border border-[#244B75]/20 text-xs font-semibold text-[#102A43]">
              <Award className="w-3.5 h-3.5 text-[#244B75]" />
              Program Mitra Reseller Resmi
            </span>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#102A43] leading-tight text-balance">
              Gabung Mitra Reseller Catrizzz Store (Gratis Rp0)
            </h1>
            <p className="text-sm sm:text-base text-[#253449] leading-relaxed">
              Pendaftaran reseller sepenuhnya <strong className="text-[#102A43]">GRATIS (Rp0)</strong> tanpa biaya registrasi, aktivasi, maupun keanggotaan. Setelah pendaftaran disetujui admin, Anda langsung dapat login untuk mengakses harga reseller <strong className="text-[#102A43]">-20%</strong> dan bertransaksi menggunakan Reseller Wallet.
            </p>
          </div>

          <div className="surface-card rounded-2xl p-5 min-w-[240px] space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#718096]">
              Biaya Pendaftaran Reseller
            </p>
            <p className="font-display text-3xl font-bold font-mono-num text-emerald-700">
              GRATIS (Rp0)
            </p>
            <p className="text-xs text-[#718096]">
              Tanpa biaya registrasi &amp; keanggotaan · Top up QRIS biaya admin 10%
            </p>
          </div>
        </div>

        {/* Benefit Comparison Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div data-spotlight="true" className="surface-card spotlight-surface rounded-xl p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#244B75]">
              <Sparkles className="w-4 h-4" />
              Harga Khusus Reseller (-20%)
            </div>
            <p className="text-xs text-[#718096] leading-relaxed">
              Produk Rp100.000 menjadi <strong className="text-[#102A43]">Rp80.000</strong>, Rp50.000 menjadi <strong className="text-[#102A43]">Rp40.000</strong> secara otomatis.
            </p>
          </div>
          <div data-spotlight="true" className="surface-card spotlight-surface rounded-xl p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#244B75]">
              <ShieldCheck className="w-4 h-4" />
              Reseller Wallet &amp; Top Up Biaya 10%
            </div>
            <p className="text-xs text-[#718096] leading-relaxed">
              Top up saldo Rp100.000 membayar QRIS <strong className="text-[#102A43]">Rp110.000</strong> (termasuk biaya layanan 10%) dan saldo masuk wallet penuh Rp100.000.
            </p>
          </div>
          <div data-spotlight="true" className="surface-card spotlight-surface rounded-xl p-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#244B75]">
              <Award className="w-4 h-4" />
              Portal Reseller Aktif
            </div>
            <p className="text-xs text-[#718096] leading-relaxed">
              Sudah memiliki akun reseller aktif?{' '}
              <Link to="/reseller/login" className="text-[#102A43] font-semibold underline">
                Login Reseller di sini
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      {/* Active Reseller Notice */}
      {isResellerActive && userProfile ? (
        <section className="rounded-2xl p-8 border border-emerald-200 bg-emerald-50 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="font-display text-xl font-bold text-[#102A43]">
                Anda Sudah Masuk Sebagai Reseller Aktif
              </h2>
              <p className="text-sm text-[#253449]">
                Kode Referral Anda:{' '}
                <span className="font-mono-num font-bold text-[#102A43]">
                  {userProfile.referralCode}
                </span>
                . Diskon 20% &amp; Reseller Wallet aktif untuk transaksi Anda.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/reseller/dashboard"
              className="btn-navy-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            >
              Buka Dashboard Reseller
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/produk"
              className="btn-navy-outline inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            >
              Belanja Dengan Harga Reseller
            </Link>
          </div>
        </section>
      ) : (
        <>
          {/* Public Application Status Checker */}
          <section
            data-spotlight="true"
            className="surface-card spotlight-surface rounded-2xl p-5 sm:p-6 space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#102A43]">
                  Sudah Pernah Mendaftar Sebagai Reseller?
                </h2>
                <p className="text-xs text-[#718096]">
                  Cek status persetujuan admin menggunakan Nomor Pendaftaran (RSL-...), Email, atau Nomor WhatsApp.
                </p>
              </div>
              <Link
                to="/reseller/login"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#244B75] hover:text-[#102A43] whitespace-nowrap"
              >
                <LogIn className="w-3.5 h-3.5" />
                Login Reseller Aktif
              </Link>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                lookupApplicationStatus(lookupQuery, false);
              }}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#718096] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={lookupQuery}
                  onChange={(e) => setLookupQuery(e.target.value)}
                  placeholder="Contoh: RSL-20261114-0001 atau email / 0812..."
                  aria-label="Cari status pendaftaran reseller"
                  className="input-navy w-full rounded-xl pl-10 pr-3.5 py-2.5 text-xs sm:text-sm"
                />
              </div>
              <NavyButton
                type="submit"
                variant="outline"
                disabled={lookupLoading}
                className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap cursor-pointer"
              >
                {lookupLoading ? 'Memeriksa...' : 'Cek Status Pendaftaran'}
              </NavyButton>
            </form>
            {lookupError && <p className="text-xs text-rose-600">{lookupError}</p>}
          </section>

          {/* Application State Flow */}
          {activeApp?.status === 'approved' ? (
            <section className="rounded-2xl p-8 border border-emerald-200 bg-emerald-50 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-display text-xl font-bold text-[#102A43]">
                      Pendaftaran Reseller Anda Telah Disetujui Admin
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-md bg-white border border-emerald-200 text-xs font-mono-num font-semibold text-emerald-700">
                      {activeApp.applicationNumber}
                    </span>
                  </div>
                  <p className="text-sm text-[#253449]">
                    {activeApp.passwordSet
                      ? `Akun reseller @${activeApp.username} sudah berstatus Active. Silakan login menggunakan username/email dan password yang Anda daftarkan.`
                      : `Akun reseller @${activeApp.username} telah disetujui. Buka link aktivasi satu kali dari admin untuk membuat password Anda.`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                {activeApp.passwordSet ? (
                  <Link
                    to="/reseller/login"
                    className="btn-navy-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                  >
                    <LogIn className="w-4 h-4" />
                    Login Reseller Sekarang
                  </Link>
                ) : (
                  <a
                    href={adminWaHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-navy-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                  >
                    <KeyRound className="w-4 h-4" />
                    Minta Link Aktivasi ke Admin
                  </a>
                )}
                <button
                  type="button"
                  onClick={resetToNewForm}
                  className="btn-navy-outline px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Daftar Akun Lain
                </button>
              </div>
            </section>
          ) : isPendingApproval && activeApp ? (
            <section
              data-testid="pending-approval-notice"
              className="surface-card rounded-2xl p-8 space-y-5"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700 shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-display text-xl font-bold text-[#102A43]">
                      Pendaftaran Sedang Menunggu Persetujuan Admin
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-xs font-mono-num font-semibold text-amber-800">
                      {activeApp.applicationNumber}
                    </span>
                  </div>
                  <p className="text-sm text-[#253449]">
                    Terima kasih! Akun reseller gratis untuk username{' '}
                    <strong className="font-mono-num">@{activeApp.username}</strong> berstatus{' '}
                    <span className="font-mono-num font-semibold text-amber-800">
                      pending_approval
                    </span>
                    . Anda baru dapat login, melakukan top up saldo, dan bertransaksi setelah admin menyetujui pendaftaran ini.
                  </p>
                </div>
              </div>

              <div className="surface-subtle rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-[#718096]">Nama Pendaftar</p>
                  <p className="font-semibold text-[#102A43] mt-0.5">
                    {activeApp.applicantName} (@{activeApp.username})
                  </p>
                </div>
                <div>
                  <p className="text-[#718096]">Biaya Pendaftaran</p>
                  <p className="font-mono-num font-semibold text-emerald-700 mt-0.5">
                    Gratis (Rp0)
                  </p>
                </div>
                <div>
                  <p className="text-[#718096]">Waktu Pendaftaran</p>
                  <p className="text-[#102A43] font-medium mt-0.5 font-mono-num">
                    {new Date(activeApp.createdAt).toLocaleString('id-ID', {
                      timeZone: 'Asia/Jakarta',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <NavyButton
                  type="button"
                  variant="outline"
                  onClick={() => lookupApplicationStatus(activeApp.applicationNumber, false)}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
                >
                  Perbarui Status Persetujuan
                </NavyButton>
                <a
                  href={adminWaHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Hubungi Admin via WhatsApp
                </a>
                <button
                  type="button"
                  onClick={resetToNewForm}
                  className="px-4 py-2.5 rounded-xl text-xs font-medium text-[#718096] hover:text-[#102A43] cursor-pointer"
                >
                  Daftar Dengan Data Lain
                </button>
              </div>
            </section>
          ) : (
            <div className="space-y-6">
              {activeApp?.status === 'rejected' && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">
                      Pendaftaran Sebelumnya Ditolak ({activeApp.applicationNumber})
                    </p>
                    <p className="text-xs">
                      Alasan: {activeApp.rejectionReason || 'Data pendaftaran belum memenuhi ketentuan.'}. Akun yang ditolak tidak dapat login, top up, atau bertransaksi. Silakan perbaiki data dan ajukan pendaftaran baru di bawah ini.
                    </p>
                  </div>
                </div>
              )}

              <section className="surface-card rounded-2xl p-6 sm:p-8 space-y-5">
                <div className="space-y-1">
                  <h2 className="font-display text-xl font-bold text-[#102A43]">
                    Formulir Pendaftaran Mitra Reseller Gratis (Rp0)
                  </h2>
                  <p className="text-sm text-[#718096]">
                    Tidak ada biaya registrasi, aktivasi, ataupun keanggotaan. Setelah dikirim, akun menunggu persetujuan admin terlebih dahulu sebelum aktif.
                  </p>
                </div>

                <form onSubmit={handleApplySubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="rsl-name"
                        className="block text-xs font-semibold text-[#253449]"
                      >
                        Nama Lengkap <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="rsl-name"
                        type="text"
                        required
                        value={applicantName}
                        onChange={(e) => setApplicantName(e.target.value)}
                        placeholder="Contoh: Andi Wijaya"
                        className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="rsl-username"
                        className="block text-xs font-semibold text-[#253449]"
                      >
                        Username Reseller <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="rsl-username"
                        type="text"
                        required
                        pattern="[a-zA-Z0-9_]{3,28}"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ''))}
                        placeholder="Contoh: andi_reseller"
                        className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-mono-num"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="rsl-email"
                        className="block text-xs font-semibold text-[#253449]"
                      >
                        Email Aktif <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="rsl-email"
                        type="email"
                        required
                        value={applicantEmail}
                        onChange={(e) => setApplicantEmail(e.target.value)}
                        placeholder="email@domain.com"
                        className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="rsl-wa"
                        className="block text-xs font-semibold text-[#253449]"
                      >
                        Nomor WhatsApp Aktif <span className="text-rose-600">*</span>
                      </label>
                      <input
                        id="rsl-wa"
                        type="tel"
                        required
                        value={applicantWhatsapp}
                        onChange={(e) => setApplicantWhatsapp(e.target.value)}
                        placeholder="081234567890"
                        className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-mono-num"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label
                        htmlFor="rsl-password"
                        className="block text-xs font-semibold text-[#253449]"
                      >
                        Password Akun (min. 6 karakter) <span className="text-rose-600">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[#718096] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="rsl-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Minimal 6 karakter"
                          className="input-navy w-full rounded-xl pl-10 pr-10 py-2.5 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#718096] hover:text-[#102A43] cursor-pointer"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label
                        htmlFor="rsl-confirm-password"
                        className="block text-xs font-semibold text-[#253449]"
                      >
                        Konfirmasi Password <span className="text-rose-600">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-[#718096] absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          id="rsl-confirm-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Ulangi password Anda"
                          className="input-navy w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="rsl-notes"
                      className="block text-xs font-semibold text-[#253449]"
                    >
                      Catatan / Rencana Promosi (Opsional)
                    </label>
                    <input
                      id="rsl-notes"
                      type="text"
                      value={appNotes}
                      onChange={(e) => setAppNotes(e.target.value)}
                      placeholder="Contoh: Jualan via WhatsApp, Telegram & Instagram"
                      className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm"
                    />
                  </div>

                  <NavyButton
                    type="submit"
                    disabled={applying}
                    className="px-6 py-3 rounded-xl text-sm font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {applying
                      ? 'Mengirim Pendaftaran...'
                      : 'Daftar Reseller Gratis (Menunggu Approval)'}
                    <ArrowRight className="w-4 h-4" />
                  </NavyButton>
                </form>
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
