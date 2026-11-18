import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Eye, EyeOff, Lock, LogOut, ShieldCheck, User } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { NavyButton } from '../components/Interactive';

export function AdminLoginPage() {
  const {
    user,
    adminProfile,
    adminAuthReason,
    authReady,
    checkingAdmin,
    loginAdminWithPassword,
    loginAdmin,
    logoutAdmin,
  } = useStore();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Login Admin — Catrizzz Store';
  }, []);

  if (!authReady || checkingAdmin) {
    return (
      <main className="min-h-[calc(100vh-140px)] flex items-center justify-center px-4 py-12 bg-white">
        <div className="w-full max-w-md surface-card rounded-2xl p-8 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-[#EAF2FA] text-[#102A43] flex items-center justify-center mx-auto animate-pulse">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <p className="text-sm text-[#718096]">Memeriksa sesi administrator...</p>
        </div>
      </main>
    );
  }

  if (adminProfile) {
    return <Navigate to="/admin" replace />;
  }

  const nonAdminSessionMessage =
    user && !adminProfile && adminAuthReason
      ? adminAuthReason === 'disabled'
        ? 'Akun dinonaktifkan.'
        : adminAuthReason === 'unverified_email'
          ? 'Email akun belum terverifikasi.'
          : adminAuthReason === 'server_error'
            ? 'Pemeriksaan hak akses gagal.'
            : 'Akun belum memiliki akses admin.'
      : null;

  const displayedError = errorMessage || nonAdminSessionMessage;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || googleSubmitting) return;
    setErrorMessage(null);

    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      setErrorMessage('Username/email dan password wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await loginAdminWithPassword(cleanUser, password);
      if (result.ok) {
        navigate('/admin', { replace: true });
      } else {
        setErrorMessage(result.error || 'Email atau password tidak valid.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (submitting || googleSubmitting) return;
    setErrorMessage(null);
    setGoogleSubmitting(true);
    try {
      const result = await loginAdmin();
      if (result.ok) {
        navigate('/admin', { replace: true });
      } else if (result.error) {
        setErrorMessage(result.error);
      }
    } finally {
      setGoogleSubmitting(false);
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
          Kembali ke Beranda Toko
        </Link>

        <section className="surface-card rounded-2xl p-7 sm:p-8 space-y-6 shadow-sm">
          <div className="text-center space-y-2.5">
            <div className="w-12 h-12 rounded-2xl bg-[#102A43] text-white flex items-center justify-center mx-auto shadow-sm">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h1 className="font-display text-2xl font-bold text-[#102A43]">
              Portal Login Admin
            </h1>
            <p className="text-xs sm:text-sm text-[#718096]">
              Masuk dengan kredensial administrator Catrizzz Store untuk mengelola produk digital, pesanan, reseller, dan pengaturan pembayaran.
            </p>
          </div>

          {displayedError && (
            <div
              role="alert"
              data-testid="admin-login-error"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 space-y-2"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{displayedError}</span>
              </div>
              {user && !adminProfile && (
                <button
                  type="button"
                  onClick={logoutAdmin}
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-800 underline underline-offset-2 hover:text-rose-950 cursor-pointer"
                >
                  <LogOut className="w-3 h-3" />
                  Keluar dari akun {user.email || 'saat ini'}
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="admin-username"
                className="block text-xs font-semibold text-[#253449]"
              >
                Username atau Email Admin
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#718096] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan username atau email admin"
                  className="input-navy w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="admin-password"
                className="block text-xs font-semibold text-[#253449]"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#718096] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password admin"
                  className="input-navy w-full rounded-xl pl-10 pr-10 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#718096] hover:text-[#102A43] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <NavyButton
              type="submit"
              disabled={submitting || googleSubmitting}
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Memverifikasi...' : 'Masuk ke Dashboard'}
            </NavyButton>
          </form>

          <div className="pt-4 border-t border-[#E5EAF0] space-y-3">
            <NavyButton
              type="button"
              variant="outline"
              disabled={submitting || googleSubmitting}
              onClick={handleGoogleLogin}
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold disabled:opacity-60 cursor-pointer"
            >
              {googleSubmitting ? 'Memverifikasi Akun Google...' : 'Atau Masuk dengan Google Admin'}
            </NavyButton>
            <p className="text-[11px] text-[#718096] text-center">
              Dilindungi verifikasi sesi server terenkripsi &amp; kontrol akses administrator.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
