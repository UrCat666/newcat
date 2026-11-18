import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowDownCircle,
  History,
  LayoutDashboard,
  Lock,
  LogOut,
  MessageCircle,
  Package,
  Receipt,
  ShoppingBag,
  User,
  Wallet,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatIDR, normalizeWhatsappNumber } from '../../shared/pricing';

interface ResellerLayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export function ResellerLayout({ children, title, subtitle }: ResellerLayoutProps) {
  const {
    userProfile,
    checkingUser,
    isResellerActive,
    resellerWallet,
    storefront,
    logoutReseller,
  } = useStore();
  const location = useLocation();
  const navigate = useNavigate();

  const waNumber = normalizeWhatsappNumber(
    storefront?.storeSettings?.whatsappNumber || '6287738172871'
  );
  const waHelpHref = `https://wa.me/${waNumber}?text=${encodeURIComponent(
    `Halo Admin Catrizzz Store, saya reseller @${userProfile?.username || ''} membutuhkan bantuan terkait akun/saldo.`
  )}`;

  useEffect(() => {
    if (!checkingUser && !userProfile) {
      navigate(
        `/reseller/login?redirect=${encodeURIComponent(location.pathname + location.search)}`,
        { replace: true }
      );
    }
  }, [checkingUser, userProfile, navigate, location.pathname, location.search]);

  if (checkingUser) {
    return (
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-6 bg-white">
        <div className="h-32 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-3 h-80 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
          <div className="lg:col-span-9 h-80 rounded-2xl bg-[#F8FAFC] border border-[#E5EAF0] animate-pulse" />
        </div>
      </main>
    );
  }

  if (userProfile && !isResellerActive) {
    const status = userProfile.resellerStatus;
    const statusTitle =
      status === 'banned'
        ? 'Akun Reseller Diblokir Permanen'
        : status === 'suspended'
          ? 'Akun Reseller Sedang Ditangguhkan'
          : status === 'rejected'
            ? 'Pendaftaran Reseller Ditolak'
            : status === 'pending_approval'
              ? 'Menunggu Persetujuan Admin'
              : 'Akses Khusus Reseller Resmi';
    const statusDesc =
      status === 'banned'
        ? 'Akun reseller Anda berstatus Banned oleh pengelola Catrizzz Store sehingga tidak dapat melakukan top up maupun transaksi.'
        : status === 'suspended'
          ? 'Status reseller Anda sedang dinonaktifkan sementara oleh admin. Hubungi admin via WhatsApp untuk informasi lebih lanjut.'
          : status === 'rejected'
            ? 'Pengajuan akun reseller Anda tidak disetujui admin. Hubungi admin via WhatsApp jika memerlukan klarifikasi atau ingin mengajukan ulang.'
            : 'Pendaftaran akun reseller Anda sedang menunggu persetujuan admin Catrizzz Store. Anda dapat login dan bertransaksi setelah status akun menjadi Active.';

    return (
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center space-y-5 bg-white">
        <div className="w-14 h-14 rounded-2xl bg-[#EAF2FA] border border-[#E5EAF0] flex items-center justify-center mx-auto text-[#102A43]">
          <Lock className="w-6 h-6" />
        </div>
        <h1 className="font-display text-2xl font-bold text-[#102A43]">{statusTitle}</h1>
        <p className="text-sm text-[#718096]">{statusDesc}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href={waHelpHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-navy-primary px-5 py-2.5 rounded-xl text-sm font-semibold inline-flex items-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            Hubungi WhatsApp Admin
          </a>
          <Link
            to="/produk"
            className="btn-navy-outline px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            Kembali ke Katalog
          </Link>
        </div>
      </main>
    );
  }

  if (!userProfile) {
    return null;
  }

  const navItems = [
    {
      label: 'Dashboard',
      to: '/reseller/dashboard',
      icon: <LayoutDashboard className="w-4 h-4 shrink-0" />,
      active: location.pathname === '/reseller/dashboard' && location.hash !== '#riwayat-transaksi',
    },
    {
      label: 'Katalog Produk',
      to: '/produk',
      icon: <Package className="w-4 h-4 shrink-0" />,
      active: false,
    },
    {
      label: 'Belanja',
      to: '/keranjang',
      icon: <ShoppingBag className="w-4 h-4 shrink-0" />,
      active: false,
    },
    {
      label: 'Top Up Saldo',
      to: '/reseller/topup',
      icon: <ArrowDownCircle className="w-4 h-4 shrink-0" />,
      active: location.pathname === '/reseller/topup',
    },
    {
      label: 'Riwayat Top Up',
      to: '/reseller/topup/history',
      icon: <History className="w-4 h-4 shrink-0" />,
      active: location.pathname === '/reseller/topup/history',
    },
    {
      label: 'Riwayat Transaksi',
      to: '/reseller/dashboard#riwayat-transaksi',
      icon: <Receipt className="w-4 h-4 shrink-0" />,
      active: location.pathname === '/reseller/dashboard' && location.hash === '#riwayat-transaksi',
    },
    {
      label: 'Saldo Saya',
      to: '/reseller/wallet/history',
      icon: <Wallet className="w-4 h-4 shrink-0" />,
      active: location.pathname === '/reseller/wallet/history',
    },
    {
      label: 'Profil Saya',
      to: '/reseller/profile',
      icon: <User className="w-4 h-4 shrink-0" />,
      active: location.pathname === '/reseller/profile',
    },
  ];

  const handleLogout = async () => {
    await logoutReseller();
    navigate('/', { replace: true });
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 bg-white">
      <div className="flex flex-col lg:flex-row gap-7 items-start">
        {/* Desktop Sidebar & Mobile Compact Menu */}
        <aside className="w-full lg:w-64 shrink-0 space-y-4">
          <div className="surface-subtle rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#244B75] truncate">
                  {userProfile.resellerId || 'Reseller Aktif'}
                </p>
                <p className="text-sm font-bold text-[#102A43] truncate">{userProfile.name}</p>
                <p className="text-xs font-mono-num text-[#718096] truncate">
                  @{userProfile.username}
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold shrink-0">
                Active
              </span>
            </div>

            <div className="pt-2.5 border-t border-[#E5EAF0] flex items-center justify-between gap-2">
              <span className="text-xs text-[#718096]">Saldo Wallet</span>
              <span className="text-sm font-bold font-mono-num text-[#102A43]">
                {formatIDR(resellerWallet?.balance ?? 0)}
              </span>
            </div>
          </div>

          {/* Mobile horizontal navigation */}
          <nav
            aria-label="Navigasi Reseller Mobile"
            className="flex lg:hidden items-center gap-1.5 overflow-x-auto pb-1"
          >
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                  item.active
                    ? 'bg-[#102A43] border-[#102A43] text-white'
                    : 'bg-white border-[#E5EAF0] text-[#253449] hover:bg-[#EAF2FA]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
            <a
              href={waHelpHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 bg-emerald-50 border border-emerald-200 text-emerald-700"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>Bantuan WhatsApp</span>
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 bg-rose-50 border border-rose-200 text-rose-700 cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Logout</span>
            </button>
          </nav>

          {/* Desktop vertical navigation */}
          <nav
            aria-label="Menu Reseller"
            className="hidden lg:flex flex-col gap-1 surface-card rounded-2xl p-2.5"
          >
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                  item.active
                    ? 'bg-[#102A43] text-white font-semibold shadow-sm'
                    : 'text-[#253449] hover:bg-[#EAF2FA] hover:text-[#102A43]'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            ))}

            <div className="my-1 border-t border-[#E5EAF0]" />

            <a
              href={waHelpHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-emerald-700 hover:bg-emerald-50 whitespace-nowrap transition-colors"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>Bantuan WhatsApp</span>
            </a>

            <button
              type="button"
              onClick={handleLogout}
              className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-medium text-rose-700 hover:bg-rose-50 whitespace-nowrap transition-colors text-left cursor-pointer"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              <span>Logout</span>
            </button>
          </nav>
        </aside>

        {/* Main Workspace Content */}
        <div className="w-full flex-1 min-w-0 space-y-6">
          {(title || subtitle) && (
            <header className="border-b border-[#E5EAF0] pb-4 space-y-1">
              {title && (
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#102A43]">
                  {title}
                </h1>
              )}
              {subtitle && <p className="text-sm text-[#718096]">{subtitle}</p>}
            </header>
          )}
          {children}
        </div>
      </div>
    </main>
  );
}
