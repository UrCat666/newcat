import React, { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  Award,
  BarChart3,
  Coins,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  Package,
  QrCode,
  RefreshCw,
  ShieldAlert,
  ShoppingBag,
  Tag,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { AdminOverviewTab } from '../components/admin/AdminOverviewTab';
import { AdminCatalogTab } from '../components/admin/AdminCatalogTab';
import { AdminOrdersTab } from '../components/admin/AdminOrdersTab';
import { AdminPromosTab } from '../components/admin/AdminPromosTab';
import { AdminPaymentSettingsTab } from '../components/admin/AdminPaymentSettingsTab';
import { AdminResellerApprovalTab } from '../components/admin/AdminResellerApprovalTab';
import { AdminResellerTab } from '../components/admin/AdminResellerTab';
import { AdminTopupsTab } from '../components/admin/AdminTopupsTab';
import { AdminLogsCustomersTab } from '../components/admin/AdminLogsCustomersTab';
import { AdminCmsSettingsTab } from '../components/admin/AdminCmsSettingsTab';
import { NavyButton } from '../components/Interactive';

export type AdminTab =
  | 'overview'
  | 'reseller-approval'
  | 'orders'
  | 'topups'
  | 'resellers'
  | 'catalog'
  | 'promos'
  | 'cms'
  | 'payment'
  | 'logs';

const TAB_PATH_MAP: Partial<Record<AdminTab, string>> = {
  payment: '/admin/payment-settings',
  'reseller-approval': '/admin/reseller-approval',
  topups: '/admin/topups',
  cms: '/admin/cms',
};

class AdminTabErrorBoundary extends React.Component<
  { tabKey: string; children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Modul mengalami kendala.',
    };
  }

  componentDidUpdate(prevProps: { tabKey: string }) {
    if (prevProps.tabKey !== this.props.tabKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="surface-card rounded-2xl p-6 border border-rose-200 bg-rose-50/70 space-y-3"
        >
          <p className="text-sm font-semibold text-rose-800">
            Gagal memuat modul dashboard ini
          </p>
          <p className="text-xs text-rose-700">
            Modul lain pada dashboard admin tetap dapat digunakan secara normal.
          </p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#102A43] text-white text-xs font-semibold hover:bg-[#244B75] cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Muat Ulang Modul
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AdminPage({ initialTab = 'overview' }: { initialTab?: AdminTab }) {
  const {
    authReady,
    user,
    userProfile,
    adminProfile,
    adminAuthReason,
    checkingAdmin,
    checkingUser,
    logoutAdmin,
    logoutReseller,
    changeAdminPassword,
    getAuthHeader,
    showToast,
    realtimeStatus,
    lastSyncedAt,
    reconnectRealtime,
    subscribeRealtime,
  } = useStore();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<AdminTab>(initialTab);
  const [pendingResellerCount, setPendingResellerCount] = useState(0);
  const [pendingTopupCount, setPendingTopupCount] = useState(0);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const selectTab = useCallback(
    (tab: AdminTab) => {
      setActiveTab(tab);
      const targetPath = TAB_PATH_MAP[tab] || '/admin';
      if (window.location.pathname !== targetPath) {
        navigate(targetPath);
      }
    },
    [navigate]
  );

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    document.title =
      activeTab === 'payment'
        ? 'Payment Settings — Dashboard Admin Catrizzz Store'
        : 'Dashboard Admin — Catrizzz Store';
  }, [activeTab]);

  const refreshBadgeCounts = useCallback(async () => {
    if (!adminProfile) return;
    try {
      const headers = await getAuthHeader();
      const res = await fetch('/api/admin/overview?range=30d', {
        headers,
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const json = await res.json();
        setPendingResellerCount(json.stats?.resellerPendingCount ?? 0);
        setPendingTopupCount(json.stats?.pendingTopupVerificationCount ?? 0);
      }
    } catch {
      // non-fatal badge refresh
    }
  }, [adminProfile, getAuthHeader]);

  useEffect(() => {
    refreshBadgeCounts();
  }, [refreshBadgeCounts, activeTab]);

  useEffect(() => {
    return subscribeRealtime(
      ['overview', 'orders', 'reseller_apps', 'topups', 'payment_settings', 'resellers'],
      () => {
        refreshBadgeCounts();
      }
    );
  }, [subscribeRealtime, refreshBadgeCounts]);

  if (!authReady || checkingAdmin || (!adminProfile && checkingUser)) {
    return (
      <main className="max-w-md mx-auto px-4 py-24 text-center space-y-4 bg-white">
        <div className="w-12 h-12 rounded-2xl bg-[#EAF2FA] text-[#102A43] flex items-center justify-center mx-auto animate-pulse">
          <Lock className="w-6 h-6" />
        </div>
        <p className="text-sm text-[#718096]">Memverifikasi sesi admin...</p>
      </main>
    );
  }

  // User is authenticated (e.g. non-admin Firebase account or reseller) without admin access -> show Access Denied
  if (!adminProfile && (user || userProfile)) {
    const deniedMessage =
      adminAuthReason === 'disabled'
        ? 'Akun administrator Anda saat ini dinonaktifkan.'
        : adminAuthReason === 'unverified_email'
          ? 'Email akun Anda belum terverifikasi.'
          : adminAuthReason === 'server_error'
            ? 'Pemeriksaan hak akses gagal. Silakan coba lagi atau periksa koneksi server.'
            : 'Akun yang sedang aktif bukan akun administrator dan tidak memiliki izin membuka dashboard admin.';

    return (
      <main className="min-h-[calc(100vh-140px)] flex items-center justify-center px-4 py-12 bg-white">
        <section
          data-testid="admin-access-denied"
          className="w-full max-w-md surface-card rounded-2xl p-8 text-center space-y-5 shadow-sm"
        >
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-xl font-bold text-[#102A43]">
              Akses Ditolak
            </h1>
            <p className="text-xs sm:text-sm text-[#718096]">{deniedMessage}</p>
            <p className="text-[11px] font-mono-num text-[#718096]">
              Akun aktif: {user?.email || userProfile?.email || userProfile?.username}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <Link
              to="/"
              className="btn-navy-outline flex-1 py-2.5 px-4 rounded-xl text-xs font-semibold text-center"
            >
              Kembali ke Toko
            </Link>
            <button
              type="button"
              onClick={async () => {
                if (user) await logoutAdmin();
                if (userProfile) await logoutReseller();
                navigate('/admin/login', { replace: true });
              }}
              className="flex-1 py-2.5 px-4 rounded-xl bg-[#102A43] hover:bg-[#244B75] text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              Ganti Akun Admin
            </button>
          </div>
        </section>
      </main>
    );
  }

  // Unauthenticated visitor -> redirect to admin login
  if (!adminProfile) {
    return <Navigate to="/admin/login" replace />;
  }

  const handleLogout = async () => {
    await logoutAdmin();
    navigate('/admin/login', { replace: true });
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    if (newPassword.length < 6) {
      setPasswordError('Password baru minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi password baru tidak cocok.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await changeAdminPassword(currentPassword, newPassword, confirmPassword);
      if (!res.ok) {
        setPasswordError(res.error || 'Gagal mengganti password.');
        return;
      }
      showToast(res.message || 'Password admin berhasil diperbarui.', 'success');
      setPasswordModalOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } finally {
      setSavingPassword(false);
    }
  };

  const tabs: Array<{
    id: AdminTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="w-4 h-4" /> },
    {
      id: 'reseller-approval',
      label: 'RESELLER APPROVAL',
      icon: <UserCheck className="w-4 h-4" />,
      badge: pendingResellerCount,
    },
    { id: 'orders', label: 'Pesanan & QRIS', icon: <ShoppingBag className="w-4 h-4" /> },
    {
      id: 'topups',
      label: 'Verifikasi Top Up',
      icon: <Coins className="w-4 h-4" />,
      badge: pendingTopupCount,
    },
    { id: 'resellers', label: 'Manajemen Reseller', icon: <Award className="w-4 h-4" /> },
    { id: 'catalog', label: 'Produk & Kategori', icon: <Package className="w-4 h-4" /> },
    { id: 'promos', label: 'Diskon & Promo', icon: <Tag className="w-4 h-4" /> },
    { id: 'cms', label: 'Konten & Profil', icon: <Globe className="w-4 h-4" /> },
    { id: 'payment', label: 'Manajemen Pembayaran', icon: <QrCode className="w-4 h-4" /> },
    { id: 'logs', label: 'Pelanggan & Log', icon: <Users className="w-4 h-4" /> },
  ];

  const statusMeta =
    realtimeStatus === 'CONNECTED'
      ? {
          label: 'CONNECTED',
          cls: 'bg-emerald-50 border-emerald-200 text-emerald-700',
          dotCls: 'bg-emerald-500',
          icon: <Wifi className="w-3.5 h-3.5 text-emerald-600" />,
        }
      : realtimeStatus === 'RECONNECTING'
        ? {
            label: 'RECONNECTING',
            cls: 'bg-amber-50 border-amber-200 text-amber-800',
            dotCls: 'bg-amber-500 animate-pulse',
            icon: <RefreshCw className="w-3.5 h-3.5 text-amber-700 animate-spin" />,
          }
        : {
            label: 'DISCONNECTED',
            cls: 'bg-rose-50 border-rose-200 text-rose-700',
            dotCls: 'bg-rose-500',
            icon: <WifiOff className="w-3.5 h-3.5 text-rose-600" />,
          };

  const formattedLastSynced = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '-';

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6 bg-white">
      {/* Admin Header */}
      <header className="surface-subtle rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#244B75] uppercase tracking-wider">
            Dashboard Pengelola · {adminProfile.role}
          </p>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-[#102A43]">
            Catrizzz Store Control Center
          </h1>
          <div className="flex flex-wrap items-center gap-2.5 mt-1">
            <p className="text-xs text-[#718096]">
              Masuk sebagai{' '}
              <span className="text-[#102A43] font-semibold">
                {adminProfile.username || adminProfile.email}
              </span>
            </p>
            <span
              data-testid="realtime-status-badge"
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border text-[11px] font-mono-num font-semibold ${statusMeta.cls}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.dotCls}`} />
              {statusMeta.icon}
              {statusMeta.label}
            </span>
            <span className="text-[11px] font-mono-num text-[#718096]">
              Sinkronisasi: {formattedLastSynced} WIB
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {realtimeStatus !== 'CONNECTED' && (
            <button
              type="button"
              onClick={() => {
                reconnectRealtime();
                refreshBadgeCounts();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold hover:bg-amber-100 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Hubungkan Ulang
            </button>
          )}
          <Link
            to="/"
            className="btn-navy-outline px-3.5 py-2 rounded-xl text-xs font-semibold"
          >
            Lihat Toko Publik
          </Link>
          {adminProfile.authMethod !== 'firebase' && (
            <NavyButton
              type="button"
              variant="outline"
              onClick={() => {
                setPasswordError(null);
                setPasswordModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5 text-[#244B75]" />
              Ganti Password
            </NavyButton>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar
          </button>
        </div>
      </header>

      {realtimeStatus !== 'CONNECTED' && (
        <div
          role="status"
          data-testid="realtime-warning-banner"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900"
        >
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              {realtimeStatus === 'RECONNECTING'
                ? 'Koneksi realtime sedang mencoba menghubungkan ulang ke server...'
                : 'Koneksi realtime terputus. Pembaruan otomatis tertunda hingga koneksi tersambung kembali.'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              reconnectRealtime();
              refreshBadgeCounts();
            }}
            className="px-3 py-1.5 rounded-lg bg-[#102A43] text-white font-semibold hover:bg-[#244B75] cursor-pointer"
          >
            Hubungkan Ulang
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <nav
        role="tablist"
        aria-label="Menu Admin"
        className="flex flex-wrap items-center gap-1.5 pb-2.5 border-b border-[#E5EAF0]"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => selectTab(tab.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors border cursor-pointer ${
              activeTab === tab.id
                ? 'border-[#102A43] bg-[#EAF2FA] text-[#102A43]'
                : 'border-transparent text-[#718096] hover:text-[#102A43] hover:bg-[#F8FAFC]'
            }`}
          >
            {tab.icon}
            {tab.label}
            {typeof tab.badge === 'number' && tab.badge > 0 && (
              <span
                data-testid={`badge-${tab.id}`}
                className="ml-0.5 px-1.5 py-0.5 rounded-md bg-amber-500 text-white text-[10px] font-mono-num font-bold leading-none"
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Active Tab Body (isolated per module so listener/render errors never break dashboard shell) */}
      <section>
        <AdminTabErrorBoundary tabKey={activeTab}>
          {activeTab === 'overview' && (
            <AdminOverviewTab onNavigateTab={(tab) => selectTab(tab)} />
          )}
          {activeTab === 'reseller-approval' && (
            <AdminResellerApprovalTab
              onPendingCountChange={(count) => setPendingResellerCount(count)}
            />
          )}
          {activeTab === 'orders' && <AdminOrdersTab />}
          {activeTab === 'topups' && <AdminTopupsTab />}
          {activeTab === 'resellers' && <AdminResellerTab />}
          {activeTab === 'catalog' && <AdminCatalogTab />}
          {activeTab === 'promos' && <AdminPromosTab />}
          {activeTab === 'cms' && <AdminCmsSettingsTab />}
          {activeTab === 'payment' && <AdminPaymentSettingsTab />}
          {activeTab === 'logs' && <AdminLogsCustomersTab />}
        </AdminTabErrorBoundary>
      </section>

      {/* Change Password Modal */}
      {passwordModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Ganti Password Admin"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={handlePasswordSubmit}
            className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#102A43] flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#244B75]" />
                Ganti Password Admin
              </h2>
              <button
                type="button"
                onClick={() => setPasswordModalOpen(false)}
                aria-label="Tutup modal ganti password"
                className="text-[#718096] hover:text-[#102A43] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {passwordError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {passwordError}
              </div>
            )}

            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Password Saat Ini
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-normal"
              />
            </label>

            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Password Baru (min. 6 karakter)
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-normal"
              />
            </label>

            <label className="block space-y-1 text-xs font-semibold text-[#253449]">
              Konfirmasi Password Baru
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm font-normal"
              />
            </label>

            <div className="flex justify-end gap-2.5 pt-2">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setPasswordModalOpen(false)}
                className="px-4 py-2 rounded-xl text-sm cursor-pointer"
              >
                Batal
              </NavyButton>
              <NavyButton
                type="submit"
                disabled={savingPassword}
                className="px-5 py-2 rounded-xl text-sm font-semibold disabled:opacity-60 cursor-pointer"
              >
                {savingPassword ? 'Menyimpan...' : 'Simpan Password'}
              </NavyButton>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
