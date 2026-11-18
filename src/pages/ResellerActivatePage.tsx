import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { NavyButton } from '../components/Interactive';

interface TokenInfo {
  username: string;
  name: string;
  email: string;
  referralCode: string;
}

export function ResellerActivatePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setResellerProfile, showToast } = useStore();
  const token = searchParams.get('token') || '';

  const [checking, setChecking] = useState(true);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Aktivasi Akun Reseller — Catrizzz Store';
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function validateToken() {
      if (!token) {
        setTokenError('Link aktivasi tidak lengkap atau token tidak ditemukan.');
        setChecking(false);
        return;
      }
      setChecking(true);
      setTokenError(null);
      try {
        const res = await fetch(
          `/api/reseller/activate/validate?token=${encodeURIComponent(token)}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json.valid) {
          setTokenError(
            json.error || 'Link aktivasi reseller tidak valid atau sudah digunakan.'
          );
          setTokenInfo(null);
        } else {
          setTokenInfo({
            username: json.username,
            name: json.name,
            email: json.email,
            referralCode: json.referralCode,
          });
        }
      } catch {
        if (!cancelled) {
          setTokenError('Gagal memvalidasi link aktivasi. Periksa koneksi Anda.');
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    validateToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleActivateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (password.length < 6) {
      setFormError('Password minimal 6 karakter.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Konfirmasi password tidak cocok.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/reseller/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          token,
          password,
          confirmPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setFormError(json.error || 'Gagal mengaktifkan akun reseller.');
        return;
      }
      if (json.user) {
        setResellerProfile(json.user);
      }
      showToast('Akun reseller aktif! Anda sudah masuk ke Dashboard Reseller.', 'success');
      navigate('/reseller/dashboard', { replace: true });
    } catch {
      setFormError('Terjadi kesalahan jaringan saat mengaktifkan akun.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-[calc(100vh-140px)] flex items-center justify-center px-4 py-12 bg-white">
      <div className="w-full max-w-md space-y-5">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-xs font-medium text-[#718096] hover:text-[#102A43] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Kembali ke Beranda
        </Link>

        <section
          data-spotlight="true"
          className="surface-card spotlight-surface rounded-2xl p-7 sm:p-8 space-y-6"
        >
          {checking ? (
            <div className="space-y-3 py-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#EAF2FA] text-[#102A43] flex items-center justify-center mx-auto animate-pulse">
                <KeyRound className="w-6 h-6" />
              </div>
              <p className="text-sm text-[#718096]">Memeriksa validitas link aktivasi...</p>
            </div>
          ) : tokenError || !tokenInfo ? (
            <div className="space-y-4 text-center py-2">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h1 className="font-display text-xl font-bold text-[#102A43]">
                Link Aktivasi Tidak Valid
              </h1>
              <p className="text-sm text-[#718096]">{tokenError}</p>
              <div className="flex flex-wrap justify-center gap-2.5 pt-2">
                <Link
                  to="/reseller/login"
                  className="btn-navy-primary px-4 py-2.5 rounded-xl text-xs font-semibold"
                >
                  Login Reseller
                </Link>
                <Link
                  to="/join-reseller"
                  className="btn-navy-outline px-4 py-2.5 rounded-xl text-xs font-semibold"
                >
                  Cek Status Pendaftaran
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h1 className="font-display text-2xl font-bold text-[#102A43]">
                  Aktivasi Akun Reseller
                </h1>
                <p className="text-xs sm:text-sm text-[#718096]">
                  Selamat, pengajuan reseller Anda telah disetujui admin! Buat password untuk mulai menggunakan harga reseller -20%.
                </p>
              </div>

              <div className="surface-subtle rounded-xl p-4 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#718096]">Nama Mitra</span>
                  <span className="font-semibold text-[#102A43]">{tokenInfo.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#718096]">Username</span>
                  <span className="font-mono-num font-semibold text-[#102A43]">
                    @{tokenInfo.username}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#718096]">Kode Referral</span>
                  <span className="font-mono-num font-bold text-[#244B75]">
                    {tokenInfo.referralCode}
                  </span>
                </div>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              <form onSubmit={handleActivateSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="act-password"
                    className="block text-xs font-semibold text-[#253449]"
                  >
                    Password Baru (Min. 6 karakter)
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#718096] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="act-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Buat password baru"
                      className="input-navy w-full rounded-xl pl-10 pr-10 py-2.5 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#718096] hover:text-[#102A43] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="act-confirm"
                    className="block text-xs font-semibold text-[#253449]"
                  >
                    Ulangi Password Baru
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#718096] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      id="act-confirm"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Konfirmasi password baru"
                      className="input-navy w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm"
                    />
                  </div>
                </div>

                <NavyButton
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Mengaktifkan Akun...' : 'Simpan Password & Masuk Dashboard'}
                </NavyButton>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
