import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Shield,
  ShoppingBag,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatIDR, normalizeWhatsappNumber } from '../shared/pricing';
import { NavyButton, spawnNavyRipple } from './Interactive';

export function Navbar() {
  const {
    storefront,
    cartCount,
    setCartOpen,
    adminProfile,
    userProfile,
    isResellerActive,
    resellerWallet,
    logoutReseller,
  } = useStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const location = useLocation();
  const navigate = useNavigate();

  const storeName = storefront?.storeSettings?.storeName || 'Catrizzz Store';
  const waNumber = normalizeWhatsappNumber(
    storefront?.storeSettings?.whatsappNumber || '6287738172871'
  );
  const waHref = `https://wa.me/${waNumber}`;

  const dynamicHeaderLinks = (storefront?.navigationMenus || [])
    .filter((m) => m.location === 'header' && m.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => {
      if (isResellerActive && (m.href === '/join-reseller' || m.href === '/reseller/join')) {
        return { id: m.id, label: 'Dashboard Reseller', to: '/reseller/dashboard', openInNewTab: false };
      }
      return {
        id: m.id,
        label: m.label,
        to: m.href,
        openInNewTab: Boolean(m.openInNewTab) || /^https?:\/\//i.test(m.href),
      };
    });

  const navLinks =
    dynamicHeaderLinks.length > 0
      ? dynamicHeaderLinks
      : [
          { id: 'def-home', label: 'Beranda', to: '/', openInNewTab: false },
          { id: 'def-prod', label: 'Produk', to: '/produk', openInNewTab: false },
          { id: 'def-cat', label: 'Kategori', to: '/kategori', openInNewTab: false },
          isResellerActive
            ? { id: 'def-rsl', label: 'Dashboard Reseller', to: '/reseller/dashboard', openInNewTab: false }
            : { id: 'def-rsl', label: 'Join Reseller', to: '/join-reseller', openInNewTab: false },
          { id: 'def-help', label: 'Bantuan', to: '/bantuan', openInNewTab: false },
        ];

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim();
    setSearchOpen(false);
    setMobileMenuOpen(false);
    navigate(q ? `/produk?search=${encodeURIComponent(q)}` : '/produk');
  };

  const announcementEnabled = Boolean(
    storefront?.siteContent?.announcementEnabled && storefront?.siteContent?.announcementText
  );
  const announcementText = storefront?.siteContent?.announcementText || '';
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <header className="no-print sticky top-0 z-40 surface-glass-nav">
      {storefront?.previewMode && !isAdminRoute && (
        <div className="bg-amber-500 text-white px-3 py-1.5 text-center text-xs font-semibold flex items-center justify-center gap-3">
          <span>Mode Pratinjau Admin (Draft) — Perubahan belum dipublikasikan ke pengunjung publik</span>
          <Link to="/admin" className="underline underline-offset-2 font-bold">
            Kembali ke Admin
          </Link>
        </div>
      )}
      {storefront?.storeSettings?.maintenanceMode && !isAdminRoute && (
        <div className="bg-rose-600 text-white px-3 py-1.5 text-center text-xs font-medium">
          Toko sedang dalam mode pemeliharaan sementara. Hubungi admin via WhatsApp untuk bantuan mendesak.
        </div>
      )}
      {announcementEnabled && !isAdminRoute && (
        <div className="hidden sm:block bg-[#102A43] text-white px-3 py-1.5 text-center">
          <p className="max-w-7xl mx-auto text-[11px] font-medium text-[#EAF2FA] truncate">
            {announcementText}
          </p>
        </div>
      )}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3 lg:gap-8">
        {/* Brand Wordmark */}
        <Link
          to="/"
          onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
          className="ripple-host flex items-center gap-2.5 text-lg font-bold tracking-tight text-[#102A43] whitespace-nowrap shrink-0 rounded-lg px-1.5 py-1"
        >
          {storefront?.storeSettings?.logoUrl ? (
            <img
              src={storefront.storeSettings.logoUrl}
              alt={storeName}
              className="w-7 h-7 rounded-lg object-cover border border-[#E5EAF0]"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="w-7 h-7 rounded-lg bg-[#102A43] flex items-center justify-center text-white text-xs font-bold shadow-sm">
              C
            </span>
          )}
          <span className="font-display">{storeName}</span>
        </Link>

        {/* Desktop Nav Links */}
        <nav
          aria-label="Navigasi utama"
          className="hidden lg:flex items-center gap-1.5 text-sm font-medium text-[#253449]"
        >
          {navLinks.map((item) => {
            const isActive =
              item.to === '/'
                ? location.pathname === '/'
                : item.to === '/join-reseller'
                  ? location.pathname.startsWith('/join-reseller') ||
                    location.pathname.startsWith('/reseller/join')
                  : location.pathname.startsWith(item.to);
            const cls = `ripple-host nav-link-underline relative px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              isActive
                ? 'bg-[#EAF2FA]/85 text-[#102A43] font-semibold'
                : 'text-[#253449] hover:bg-[#F8FAFC] hover:text-[#102A43]'
            }`;
            return item.openInNewTab ? (
              <a
                key={item.id}
                href={item.to}
                target="_blank"
                rel="noopener noreferrer"
                onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
                className={cls}
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.id}
                to={item.to}
                data-active={isActive ? 'true' : undefined}
                onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
                className={cls}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Action Zone (No Customer Login/Register) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
            aria-label="Cari produk digital"
            title="Cari produk"
            className="ripple-host w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-[#253449] hover:text-[#102A43] hover:bg-[#EAF2FA] border border-transparent hover:border-[#E5EAF0] transition-colors cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
            aria-label={`Buka keranjang (${cartCount} produk)`}
            title="Keranjang Belanja"
            className="ripple-host relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-[#253449] hover:text-[#102A43] hover:bg-[#EAF2FA] border border-transparent hover:border-[#E5EAF0] transition-colors cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            {cartCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#102A43] text-white text-[11px] font-mono-num font-semibold flex items-center justify-center shadow-sm">
                {cartCount}
              </span>
            )}
          </button>

          {isResellerActive && userProfile && (
            <div className="hidden sm:flex items-center gap-1.5">
              <Link
                to="/reseller/topup"
                onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
                title="Saldo Reseller Wallet (klik untuk top up)"
                className="ripple-host inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#102A43] hover:bg-[#244B75] text-white text-xs font-mono-num font-semibold whitespace-nowrap shrink-0 shadow-sm transition-colors"
              >
                <Wallet className="w-3.5 h-3.5 text-[#EAF2FA]" />
                <span>{formatIDR(resellerWallet?.balance ?? 0)}</span>
              </Link>
              <Link
                to="/reseller/dashboard"
                onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
                className="ripple-host inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#EAF2FA] hover:bg-[#dce8f6] border border-[#244B75]/20 text-[#102A43] text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#244B75]" />
                <span className="max-w-[96px] truncate">{userProfile.username}</span>
              </Link>
              <button
                type="button"
                onClick={logoutReseller}
                onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
                title="Keluar sesi reseller"
                aria-label="Keluar sesi reseller"
                className="ripple-host w-9 h-9 rounded-xl flex items-center justify-center text-[#718096] hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          {adminProfile && (
            <Link
              to="/admin"
              onPointerDown={(e) => spawnNavyRipple(e, 'light')}
              aria-label="Dashboard Admin"
              title="Dashboard Admin"
              className="hidden md:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#102A43] hover:bg-[#244B75] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Admin</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
            aria-label={mobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            aria-expanded={mobileMenuOpen}
            className="ripple-host lg:hidden w-9 h-9 rounded-xl flex items-center justify-center text-[#102A43] hover:bg-[#EAF2FA] border border-[#E5EAF0] cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Quick Search Bar */}
      {searchOpen && (
        <div className="border-t border-[#E5EAF0] bg-[#F8FAFC] px-4 py-3">
          <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto flex gap-2">
            <label htmlFor="navbar-search-input" className="sr-only">
              Cari aplikasi premium di Catrizzz Store
            </label>
            <input
              id="navbar-search-input"
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari ChatGPT Plus, Canva Pro, Netflix, YouTube..."
              autoFocus
              className="flex-1 input-navy rounded-xl px-4 py-2 text-sm"
            />
            <NavyButton type="submit" className="px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap">
              Cari
            </NavyButton>
          </form>
        </div>
      )}

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <nav
          aria-label="Menu mobile"
          className="lg:hidden border-t border-[#E5EAF0] bg-white px-4 py-4 space-y-1 shadow-lg"
        >
          {navLinks.map((item) => {
            const isActive =
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to);
            const cls = `ripple-host block px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              isActive
                ? 'bg-[#EAF2FA] text-[#102A43] font-semibold'
                : 'text-[#253449] hover:bg-[#F8FAFC]'
            }`;
            return item.openInNewTab ? (
              <a
                key={item.id}
                href={item.to}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
                className={cls}
              >
                {item.label}
              </a>
            ) : (
              <Link
                key={item.id}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                onPointerDown={(e) => spawnNavyRipple(e, 'navy')}
                className={cls}
              >
                {item.label}
              </Link>
            );
          })}

          <div className="pt-3 mt-2 border-t border-[#E5EAF0] flex flex-col gap-2">
            {isResellerActive && userProfile && (
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#102A43] truncate">
                    {userProfile.name} (@{userProfile.username})
                  </p>
                  <p className="text-[11px] text-[#244B75] font-medium font-mono-num">
                    Saldo: {formatIDR(resellerWallet?.balance ?? 0)}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Link
                    to="/reseller/topup"
                    onClick={() => setMobileMenuOpen(false)}
                    className="px-2.5 py-1.5 rounded-lg bg-[#102A43] text-white text-xs font-semibold"
                  >
                    Top Up
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      logoutReseller();
                      setMobileMenuOpen(false);
                    }}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-600 hover:bg-rose-50"
                  >
                    Keluar
                  </button>
                </div>
              </div>
            )}
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#E5EAF0] bg-[#F8FAFC] text-[#102A43] text-sm font-medium"
            >
              <MessageCircle className="w-4 h-4" />
              Chat WhatsApp Toko
            </a>
            {adminProfile && (
              <Link
                to="/admin"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#102A43] text-white text-sm font-medium"
              >
                <Shield className="w-4 h-4" />
                Dashboard Admin
              </Link>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
