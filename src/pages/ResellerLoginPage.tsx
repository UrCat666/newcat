import React, { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Eye,
  EyeOff,
  Lock,
  Sparkles,
  User,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { NavyButton } from '../components/Interactive';

export function ResellerLoginPage() {
  const { userProfile, checkingUser, isResellerActive, loginReseller } = useStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = searchParams.get('redirect') || '/reseller/dashboard';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Login Reseller — Catrizzz Store';
  }, []);

  if (!checkingUser && isResellerActive && userProfile) {
    return <Navigate to={redirectTarget} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!identifier.trim() || !password) {
      setErrorMessage('Username/email dan password reseller wajib diisi.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await loginReseller(identifier.trim(), password);
      if (res.ok) {
        navigate(redirectTarget, { replace: true });
      } else {
        setErrorMessage(res.error || 'Login reseller gagal. Periksa kredensial Anda.');
      }
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
          <div className="text-center space-y-2.5">
            <div className="w-12 h-12 rounded-2xl bg-[#102A43] text-white flex items-center justify-center mx-auto shadow-sm">
              <Award className="w-6 h-6" />
            </div>
            <h1 className="font-display text-2xl font-bold text-[#102A43]">
              Portal Login Reseller
            </h1>
            <p className="text-xs sm:text-sm text-[#718096]">
              Khusus mitra reseller resmi Catrizzz Store yang telah disetujui admin dan berstatus Active.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#EAF2FA]/75 border border-[#244B75]/15 text-xs text-[#253449] flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-[#244B75] shrink-0 mt-0.5" />
            <span>
              Pembeli reguler dapat langsung berbelanja &amp; checkout tanpa perlu login atau membuat akun.
            </span>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="reseller-identifier"
                className="block text-xs font-semibold text-[#253449]"
              >
                Username atau Email Reseller
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#718096] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reseller-identifier"
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="username atau email@domain.com"
                  className="input-navy w-full rounded-xl pl-10 pr-3.5 py-2.5 text-sm"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="reseller-password"
                className="block text-xs font-semibold text-[#253449]"
              >
                Password Reseller
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#718096] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="reseller-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password akun reseller"
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
              disabled={submitting}
              className="w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Memverifikasi...' : 'Masuk ke Dashboard Reseller'}
            </NavyButton>
          </form>

          <div className="pt-4 border-t border-[#E5EAF0] text-center space-y-2 text-xs text-[#718096]">
            <p>
              Belum menjadi reseller resmi?{' '}
              <Link
                to="/join-reseller"
                className="text-[#102A43] font-semibold underline underline-offset-2 hover:text-[#244B75]"
              >
                Daftar Join Reseller (-20%)
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
