import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, signInAdminWithEmail, signInAdminWithGoogle, signOutAdmin } from '../lib/firebase';
import {
  DEFAULT_TOPUP_MAX,
  DEFAULT_TOPUP_MIN,
  TOPUP_FEE_PERCENTAGE,
  TOPUP_PRESET_AMOUNTS,
  resolveProductEffectiveNormalPrice,
  resolveProductResellerUnitPrice,
} from '../shared/pricing';
import type {
  Banner,
  CartItem,
  Category,
  NavigationMenuItem,
  Product,
  PublicUserProfile,
  RealtimeArea,
  RealtimeConnectionState,
  RealtimeEventMessage,
  ResellerWallet,
  ShippingSetting,
  SiteContent,
  StoreSettings,
} from '../shared/types';

export interface StorefrontPayload {
  storeSettings: StoreSettings & { qrisReady?: boolean };
  siteContent: SiteContent;
  categories: Array<Category & { productCount?: number }>;
  featuredProducts: Product[];
  banners: Banner[];
  shippingSettings: ShippingSetting[];
  previewMode?: boolean;
  navigationMenus?: NavigationMenuItem[];
  publishedPages?: Array<{ id: string; slug: string; title: string; showInFooter?: boolean }>;
}

export interface EnrichedCartItem {
  productId: string;
  variantId?: string;
  quantity: number;
  product: Product;
  variantName?: string;
  unitPrice: number;
  originalUnitPrice: number;
  pricingTier: 'normal' | 'reseller';
  maxStock: number;
  lineSubtotal: number;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface AdminProfile {
  uid: string;
  username?: string;
  email: string;
  role: string;
  authMethod?: 'session' | 'firebase';
}

interface StoreContextValue {
  storefront: StorefrontPayload | null;
  loadingStorefront: boolean;
  storefrontError: string | null;
  refreshStorefront: (options?: { silent?: boolean }) => Promise<void>;
  allCatalogProducts: Product[];
  refreshCatalogProducts: () => Promise<void>;
  cart: CartItem[];
  enrichedCart: EnrichedCartItem[];
  cartCount: number;
  cartSubtotal: number;
  cartSubtotalNormal: number;
  cartResellerSavings: number;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addToCart: (product: Product, quantity?: number, variantId?: string) => boolean;
  updateCartQuantity: (productId: string, variantId: string | undefined, quantity: number) => void;
  removeFromCart: (productId: string, variantId?: string) => void;
  clearCart: () => void;
  toasts: ToastItem[];
  showToast: (message: string, type?: ToastItem['type']) => void;
  dismissToast: (id: string) => void;
  user: User | null;
  authReady: boolean;
  adminProfile: AdminProfile | null;
  adminAuthReason: string | null;
  checkingAdmin: boolean;
  loginAdmin: () => Promise<{ ok: boolean; error?: string }>;
  loginAdminWithPassword: (
    username: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  changeAdminPassword: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => Promise<{ ok: boolean; message?: string; error?: string }>;
  logoutAdmin: () => Promise<void>;
  getAuthHeader: () => Promise<Record<string, string>>;
  userProfile: PublicUserProfile | null;
  checkingUser: boolean;
  isResellerActive: boolean;
  resellerWallet: ResellerWallet | null;
  topupConfig: {
    minAmount: number;
    maxAmount: number;
    feePercentage: number;
    presetAmounts: number[];
  };
  refreshResellerWallet: () => Promise<void>;
  refreshResellerSession: () => Promise<void>;
  setResellerProfile: (profile: PublicUserProfile | null) => void;
  loginReseller: (
    identifier: string,
    password: string
  ) => Promise<{ ok: boolean; user?: PublicUserProfile; error?: string }>;
  logoutReseller: () => Promise<void>;
  referralCode: string | null;
  setReferralCodeManual: (code: string | null) => void;
  clearReferralCode: () => void;
  realtimeStatus: RealtimeConnectionState;
  lastSyncedAt: string | null;
  reconnectRealtime: () => void;
  subscribeRealtime: (areas: RealtimeArea[], callback: () => void) => () => void;
}

const CART_STORAGE_KEY = 'catrizzz_store_cart_v1';
const REF_STORAGE_KEY = 'catrizzz_referral_code_v1';

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [storefront, setStorefront] = useState<StorefrontPayload | null>(null);
  const [loadingStorefront, setLoadingStorefront] = useState(true);
  const [storefrontError, setStorefrontError] = useState<string | null>(null);
  const [allCatalogProducts, setAllCatalogProducts] = useState<Product[]>([]);

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [];
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const [referralCode, setReferralCode] = useState<string | null>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = params.get('ref')?.trim().toUpperCase();
      if (fromUrl) {
        localStorage.setItem(REF_STORAGE_KEY, fromUrl);
        return fromUrl;
      }
      return localStorage.getItem(REF_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [adminProfile, setAdminProfile] = useState<AdminProfile | null>(null);
  const [adminAuthReason, setAdminAuthReason] = useState<string | null>(null);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  const [userProfile, setUserProfile] = useState<PublicUserProfile | null>(null);
  const [checkingUser, setCheckingUser] = useState(true);
  const [resellerWallet, setResellerWallet] = useState<ResellerWallet | null>(null);
  const [topupConfig, setTopupConfig] = useState({
    minAmount: DEFAULT_TOPUP_MIN,
    maxAmount: DEFAULT_TOPUP_MAX,
    feePercentage: TOPUP_FEE_PERCENTAGE,
    presetAmounts: TOPUP_PRESET_AMOUNTS,
  });
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeConnectionState>('RECONNECTING');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [wsEpoch, setWsEpoch] = useState(0);

  const subscribersRef = useRef<
    Map<number, { areas: Set<RealtimeArea>; callback: () => void }>
  >(new Map());
  const nextSubIdRef = useRef(1);
  const hasConnectedOnceRef = useRef(false);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastItem['type'] = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, message }]);
      window.setTimeout(() => {
        dismissToast(id);
      }, 4200);
    },
    [dismissToast]
  );

  const setReferralCodeManual = useCallback((code: string | null) => {
    const clean = code ? code.trim().toUpperCase() : null;
    setReferralCode(clean);
    try {
      if (clean) localStorage.setItem(REF_STORAGE_KEY, clean);
      else localStorage.removeItem(REF_STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const clearReferralCode = useCallback(() => {
    setReferralCodeManual(null);
  }, [setReferralCodeManual]);

  const refreshCatalogProducts = useCallback(async () => {
    try {
      const res = await fetch('/api/products?limit=48', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setAllCatalogProducts(data.products || []);
      }
    } catch {
      // non-fatal background refresh
    }
  }, []);

  const refreshStorefront = useCallback(
    async (options?: { silent?: boolean }) => {
      const isSilent = Boolean(options?.silent);
      if (!isSilent) {
        setLoadingStorefront(true);
      }
      setStorefrontError(null);
      try {
        const res = await fetch('/api/storefront', { cache: 'no-store' });
        if (!res.ok) throw new Error('Gagal memuat data toko.');
        const data = (await res.json()) as StorefrontPayload;
        setStorefront(data);
        setLastSyncedAt(new Date().toISOString());
        await refreshCatalogProducts();
      } catch (err) {
        if (!isSilent) {
          setStorefrontError(
            err instanceof Error ? err.message : 'Koneksi ke server bermasalah.'
          );
        }
      } finally {
        if (!isSilent) {
          setLoadingStorefront(false);
        }
      }
    },
    [refreshCatalogProducts]
  );

  const refreshResellerSession = useCallback(async (options?: { silent?: boolean }) => {
    const isSilent = Boolean(options?.silent);
    if (!isSilent) {
      setCheckingUser(true);
    }
    try {
      const res = await fetch('/api/reseller/session', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setUserProfile(data.authenticated ? data.user || null : null);
      } else {
        setUserProfile(null);
      }
    } catch {
      if (!isSilent) {
        setUserProfile(null);
      }
    } finally {
      if (!isSilent) {
        setCheckingUser(false);
      }
    }
  }, []);

  const refreshResellerWallet = useCallback(async () => {
    try {
      const res = await fetch('/api/reseller/wallet', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        setResellerWallet(data.wallet || null);
        if (data.topupConfig) {
          setTopupConfig({
            minAmount: Number(data.topupConfig.minAmount ?? DEFAULT_TOPUP_MIN),
            maxAmount: Number(data.topupConfig.maxAmount ?? DEFAULT_TOPUP_MAX),
            feePercentage: Number(data.topupConfig.feePercentage ?? TOPUP_FEE_PERCENTAGE),
            presetAmounts: Array.isArray(data.topupConfig.presetAmounts)
              ? data.topupConfig.presetAmounts
              : TOPUP_PRESET_AMOUNTS,
          });
        }
      } else {
        setResellerWallet(null);
      }
    } catch {
      // non-fatal background refresh
    }
  }, []);

  useEffect(() => {
    refreshStorefront();
    refreshResellerSession();
  }, [refreshStorefront, refreshResellerSession]);

  useEffect(() => {
    const s = storefront?.storeSettings;
    if (!s) return;

    const seoTitle = s.seoTitle || `${s.storeName} — ${s.tagline || 'Platform Aplikasi Premium'}`;
    const seoDesc = s.seoDescription || '';

    const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
      if (!content) return;
      let el = document.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    setMeta('property', 'og:title', seoTitle);
    if (seoDesc) {
      setMeta('name', 'description', seoDesc);
      setMeta('property', 'og:description', seoDesc);
    }

    if (s.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = s.faviconUrl;
    }
  }, [storefront?.storeSettings]);

  useEffect(() => {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // ignore storage quota errors
    }
  }, [cart]);

  const mapAdminReasonMessage = useCallback((reason?: string | null): string => {
    switch (reason) {
      case 'disabled':
        return 'Akun dinonaktifkan.';
      case 'unverified_email':
        return 'Email akun belum terverifikasi.';
      case 'server_error':
        return 'Pemeriksaan hak akses gagal.';
      case 'invalid_token':
        return 'Sesi autentikasi tidak valid atau telah kedaluwarsa.';
      case 'not_admin':
        return 'Akun belum memiliki akses admin.';
      default:
        return 'Akun belum memiliki akses admin.';
    }
  }, []);

  const checkAdminSession = useCallback(async (firebaseUser: User | null) => {
    setCheckingAdmin(true);
    try {
      const headers: Record<string, string> = {};
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          headers.Authorization = `Bearer ${token}`;
        } catch {
          // Do not abort cookie session verification if Firebase token fetch fails
        }
      }
      const res = await fetch('/api/admin/session', {
        headers,
        credentials: 'include',
        cache: 'no-store',
      });
      if (res.ok) {
        const data = (await res.json()) as {
          authenticated?: boolean;
          admin?: AdminProfile | null;
          reason?: string | null;
        };
        if (data.authenticated && data.admin) {
          setAdminProfile(data.admin);
          setAdminAuthReason(null);
        } else {
          setAdminProfile(null);
          setAdminAuthReason(data.reason || null);
        }
      } else {
        setAdminProfile(null);
        setAdminAuthReason('server_error');
      }
    } catch {
      setAdminProfile(null);
      setAdminAuthReason('server_error');
    } finally {
      setCheckingAdmin(false);
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      await checkAdminSession(firebaseUser);
    });
    return () => unsub();
  }, [checkAdminSession]);

  const getAuthHeader = useCallback(async (): Promise<Record<string, string>> => {
    if (!auth.currentUser) return {};
    try {
      const token = await auth.currentUser.getIdToken();
      return { Authorization: `Bearer ${token}` };
    } catch {
      return {};
    }
  }, []);

  const loginReseller = useCallback(
    async (
      identifier: string,
      password: string
    ): Promise<{ ok: boolean; user?: PublicUserProfile; error?: string }> => {
      try {
        const res = await fetch('/api/reseller/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ identifier, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data.error || 'Username/email atau password reseller salah.' };
        }
        setUserProfile(data.user);
        showToast(`Selamat datang, ${data.user?.name || data.user?.username}!`, 'success');
        return { ok: true, user: data.user };
      } catch {
        return { ok: false, error: 'Gagal terhubung ke server.' };
      }
    },
    [showToast]
  );

  const logoutReseller = useCallback(async () => {
    try {
      await fetch('/api/reseller/logout', { method: 'POST', credentials: 'include' });
    } catch {
      // ignore
    }
    setUserProfile(null);
    setResellerWallet(null);
    showToast('Anda telah keluar dari sesi reseller.', 'info');
  }, [showToast]);

  const verifyFirebaseSessionWithBackend = useCallback(
    async (firebaseUser: User): Promise<{ ok: boolean; error?: string }> => {
      try {
        const token = await firebaseUser.getIdToken(true);
        const res = await fetch('/api/admin/session', {
          headers: { Authorization: `Bearer ${token}` },
          credentials: 'include',
          cache: 'no-store',
        });
        if (!res.ok) {
          setAdminAuthReason('server_error');
          return { ok: false, error: 'Pemeriksaan hak akses gagal.' };
        }
        const data = (await res.json()) as {
          authenticated?: boolean;
          admin?: AdminProfile | null;
          reason?: string | null;
        };
        if (data.authenticated && data.admin) {
          setAdminProfile(data.admin);
          setAdminAuthReason(null);
          setAuthReady(true);
          setCheckingAdmin(false);
          showToast('Berhasil masuk ke dashboard admin.', 'success');
          return { ok: true };
        }
        const reason = data.reason || 'not_admin';
        setAdminProfile(null);
        setAdminAuthReason(reason);
        setAuthReady(true);
        setCheckingAdmin(false);
        return { ok: false, error: mapAdminReasonMessage(reason) };
      } catch {
        setAdminAuthReason('server_error');
        return { ok: false, error: 'Koneksi server bermasalah.' };
      }
    },
    [mapAdminReasonMessage, showToast]
  );

  const loginAdmin = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    try {
      const cred = await signInAdminWithGoogle();
      setUser(cred.user);
      return await verifyFirebaseSessionWithBackend(cred.user);
    } catch (err: any) {
      const code = String(err?.code || '');
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        return { ok: false, error: 'Login Google dibatalkan.' };
      }
      if (code === 'auth/network-request-failed') {
        return { ok: false, error: 'Koneksi server bermasalah.' };
      }
      if (code === 'auth/user-disabled') {
        return { ok: false, error: 'Akun dinonaktifkan.' };
      }
      if (code === 'auth/popup-blocked') {
        return { ok: false, error: 'Popup login diblokir browser. Izinkan popup untuk melanjutkan.' };
      }
      return { ok: false, error: 'Gagal masuk dengan Google Admin.' };
    }
  }, [verifyFirebaseSessionWithBackend]);

  const loginAdminWithPassword = useCallback(
    async (username: string, password: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username, password }),
        });
        let data: { ok?: boolean; admin?: AdminProfile; error?: string; code?: string } = {};
        try {
          data = await res.json();
        } catch {
          data = {};
        }

        if (res.ok && data.admin) {
          setAdminProfile(data.admin);
          setAdminAuthReason(null);
          setAuthReady(true);
          setCheckingAdmin(false);
          showToast('Berhasil masuk ke dashboard admin.', 'success');
          return { ok: true };
        }

        if (res.status === 403 || data.code === 'disabled') {
          setAdminAuthReason('disabled');
          return { ok: false, error: data.error || 'Akun dinonaktifkan.' };
        }

        if (res.status === 429) {
          return { ok: false, error: data.error || 'Terlalu banyak percobaan login. Silakan tunggu sebentar.' };
        }

        if (res.status >= 500) {
          return { ok: false, error: 'Koneksi server bermasalah.' };
        }

        // If identifier is an email address, verify via Firebase Email/Password + backend role check
        if (username.includes('@')) {
          try {
            const cred = await signInAdminWithEmail(username, password);
            setUser(cred.user);
            return await verifyFirebaseSessionWithBackend(cred.user);
          } catch (fbErr: any) {
            const fbCode = String(fbErr?.code || '');
            if (fbCode === 'auth/user-disabled') {
              return { ok: false, error: 'Akun dinonaktifkan.' };
            }
            if (fbCode === 'auth/network-request-failed') {
              return { ok: false, error: 'Koneksi server bermasalah.' };
            }
            if (fbCode === 'auth/too-many-requests') {
              return { ok: false, error: 'Terlalu banyak percobaan login. Silakan tunggu sebentar.' };
            }
            return { ok: false, error: 'Email atau password tidak valid.' };
          }
        }

        return { ok: false, error: data.error || 'Email atau password tidak valid.' };
      } catch {
        return { ok: false, error: 'Koneksi server bermasalah.' };
      }
    },
    [showToast, verifyFirebaseSessionWithBackend]
  );

  const changeAdminPassword = useCallback(
    async (
      currentPassword: string,
      newPassword: string,
      confirmPassword: string
    ): Promise<{ ok: boolean; message?: string; error?: string }> => {
      try {
        const headers = {
          ...(await getAuthHeader()),
          'Content-Type': 'application/json',
        };
        const res = await fetch('/api/admin/change-password', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
        });
        const data = await res.json();
        if (!res.ok) {
          return { ok: false, error: data.error || 'Gagal mengganti password.' };
        }
        return { ok: true, message: data.message || 'Password berhasil diperbarui.' };
      } catch {
        return { ok: false, error: 'Terjadi kesalahan jaringan saat mengganti password.' };
      }
    },
    [getAuthHeader]
  );

  const logoutAdmin = useCallback(async () => {
    try {
      await fetch('/api/admin/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // ignore network errors on logout
    }
    try {
      await signOutAdmin();
    } catch {
      // ignore if Firebase not signed in
    }
    setUser(null);
    setAdminProfile(null);
    setAdminAuthReason(null);
    showToast('Berhasil keluar dari sesi admin.', 'info');
  }, [showToast]);

  const isResellerActive = Boolean(
    userProfile?.role === 'reseller' && userProfile?.resellerStatus === 'active'
  );

  useEffect(() => {
    if (isResellerActive) {
      refreshResellerWallet();
    } else {
      setResellerWallet(null);
    }
  }, [isResellerActive, refreshResellerWallet]);

  const subscribeRealtime = useCallback(
    (areas: RealtimeArea[], callback: () => void) => {
      const id = nextSubIdRef.current++;
      subscribersRef.current.set(id, {
        areas: new Set(areas),
        callback,
      });
      return () => {
        subscribersRef.current.delete(id);
      };
    },
    []
  );

  const reconnectRealtime = useCallback(() => {
    setRealtimeStatus('RECONNECTING');
    setWsEpoch((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let attempt = 0;

    const clearTimers = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (pingTimer !== null) {
        window.clearInterval(pingTimer);
        pingTimer = null;
      }
    };

    const dispatchSubscribers = (areas?: RealtimeArea[]) => {
      const targets = areas ? new Set(areas) : null;
      for (const entry of subscribersRef.current.values()) {
        if (!targets) {
          try {
            entry.callback();
          } catch {
            // ignore subscriber error
          }
          continue;
        }
        let match = false;
        for (const area of targets) {
          if (entry.areas.has(area)) {
            match = true;
            break;
          }
        }
        if (match) {
          try {
            entry.callback();
          } catch {
            // ignore subscriber error
          }
        }
      }
    };

    const connect = () => {
      if (closed) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setRealtimeStatus('DISCONNECTED');
        return;
      }

      setRealtimeStatus('RECONNECTING');
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws`;

      try {
        ws = new WebSocket(url);
      } catch {
        setRealtimeStatus('DISCONNECTED');
        return;
      }

      ws.onopen = async () => {
        if (closed) return;
        attempt = 0;
        setRealtimeStatus('CONNECTED');
        setLastSyncedAt(new Date().toISOString());

        if (adminProfile?.authMethod === 'firebase' && auth.currentUser) {
          try {
            const token = await auth.currentUser.getIdToken();
            if (!closed && ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'auth', token }));
            }
          } catch {
            // non-fatal WS upgrade error; never blocks dashboard auth
          }
        }

        if (hasConnectedOnceRef.current) {
          refreshStorefront({ silent: true });
          if (userProfile) {
            refreshResellerSession({ silent: true });
            refreshResellerWallet();
          }
          dispatchSubscribers();
        }
        hasConnectedOnceRef.current = true;

        pingTimer = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            try {
              ws.send(JSON.stringify({ type: 'ping' }));
            } catch {
              // ignore send error
            }
          }
        }, 25_000);
      };

      ws.onmessage = (event) => {
        if (closed || typeof event.data !== 'string') return;
        let msg: RealtimeEventMessage | null = null;
        try {
          msg = JSON.parse(event.data) as RealtimeEventMessage;
        } catch {
          return;
        }
        if (!msg) return;

        if (msg.type === 'connected') {
          setRealtimeStatus('CONNECTED');
          setLastSyncedAt(msg.timestamp || new Date().toISOString());
          return;
        }

        if (msg.type === 'pong') {
          setLastSyncedAt(msg.timestamp || new Date().toISOString());
          return;
        }

        if (msg.type === 'invalidate') {
          const areas = Array.isArray(msg.areas) ? msg.areas : [];
          setLastSyncedAt(msg.timestamp || new Date().toISOString());

          if (
            areas.some((a) =>
              [
                'storefront',
                'products',
                'categories',
                'discounts',
                'cms',
                'payment_settings',
              ].includes(a)
            )
          ) {
            refreshStorefront({ silent: true });
          }

          if (
            areas.some((a) =>
              ['reseller_wallet', 'topups', 'resellers'].includes(a)
            )
          ) {
            refreshResellerSession({ silent: true });
            refreshResellerWallet();
          }

          dispatchSubscribers(areas);
        }
      };

      ws.onclose = () => {
        clearTimers();
        if (closed) return;
        setRealtimeStatus(
          typeof navigator !== 'undefined' && navigator.onLine === false
            ? 'DISCONNECTED'
            : 'RECONNECTING'
        );
        const delayMs = Math.min(10_000, 1_000 * Math.pow(2, Math.min(attempt, 4)));
        attempt += 1;
        reconnectTimer = window.setTimeout(connect, delayMs);
      };

      ws.onerror = () => {
        // close event handles reconnect
      };
    };

    const handleOnline = () => {
      if (closed) return;
      clearTimers();
      if (ws && ws.readyState === WebSocket.OPEN) return;
      attempt = 0;
      connect();
    };

    const handleOffline = () => {
      if (closed) return;
      clearTimers();
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
      setRealtimeStatus('DISCONNECTED');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    connect();

    return () => {
      closed = true;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearTimers();
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, [
    adminProfile?.uid,
    userProfile?.id,
    wsEpoch,
    refreshStorefront,
    refreshResellerSession,
    refreshResellerWallet,
  ]);

  const enrichedCart = useMemo<EnrichedCartItem[]>(() => {
    const productPool =
      allCatalogProducts.length > 0
        ? allCatalogProducts
        : storefront?.featuredProducts || [];
    const productMap = new Map(productPool.map((p) => [p.id, p]));

    const list: EnrichedCartItem[] = [];
    for (const item of cart) {
      const product = productMap.get(item.productId);
      if (!product || !product.active) continue;
      const variant = item.variantId
        ? product.variants?.find((v) => v.id === item.variantId && v.active)
        : undefined;
      const delta = variant?.priceDelta || 0;
      const originalUnitPrice = Math.max(0, product.price + delta);
      const normalUnitPrice = resolveProductEffectiveNormalPrice(product, delta);
      const unitPrice = isResellerActive
        ? resolveProductResellerUnitPrice(product, delta)
        : normalUnitPrice;

      const maxStock = variant ? Math.min(product.stock, variant.stock) : product.stock;
      const safeQty = Math.min(Math.max(1, item.quantity), Math.max(1, maxStock));
      list.push({
        productId: product.id,
        variantId: variant?.id,
        quantity: safeQty,
        product,
        variantName: variant?.name,
        unitPrice,
        originalUnitPrice,
        pricingTier: isResellerActive ? 'reseller' : 'normal',
        maxStock,
        lineSubtotal: unitPrice * safeQty,
      });
    }
    return list;
  }, [cart, allCatalogProducts, storefront, isResellerActive]);

  const cartCount = useMemo(
    () => enrichedCart.reduce((acc, item) => acc + item.quantity, 0),
    [enrichedCart]
  );

  const cartSubtotal = useMemo(
    () => enrichedCart.reduce((acc, item) => acc + item.lineSubtotal, 0),
    [enrichedCart]
  );

  const cartSubtotalNormal = useMemo(
    () => enrichedCart.reduce((acc, item) => acc + item.originalUnitPrice * item.quantity, 0),
    [enrichedCart]
  );

  const cartResellerSavings = useMemo(
    () =>
      isResellerActive
        ? Math.max(0, cartSubtotalNormal - cartSubtotal)
        : 0,
    [isResellerActive, cartSubtotalNormal, cartSubtotal]
  );

  const addToCart = useCallback(
    (product: Product, quantity = 1, variantId?: string): boolean => {
      if (!product.active || product.stock <= 0 || product.availabilityStatus === 'out_of_stock') {
        showToast('Maaf, kuota produk digital ini sedang habis.', 'error');
        return false;
      }

      const activeVariants = (product.variants || []).filter((v) => v.active);
      let chosenVariantId = variantId;
      if (!chosenVariantId && activeVariants.length > 0) {
        const firstAvailable = activeVariants.find((v) => v.stock > 0) || activeVariants[0];
        chosenVariantId = firstAvailable.id;
      }

      const chosenVariant = chosenVariantId
        ? activeVariants.find((v) => v.id === chosenVariantId)
        : undefined;
      const maxStock = chosenVariant
        ? Math.min(product.stock, chosenVariant.stock)
        : product.stock;

      if (maxStock <= 0) {
        showToast('Kuota paket ini sedang habis.', 'error');
        return false;
      }

      let added = false;
      setCart((prev) => {
        const existingIdx = prev.findIndex(
          (i) => i.productId === product.id && (i.variantId || '') === (chosenVariantId || '')
        );
        if (existingIdx >= 0) {
          const currentQty = prev[existingIdx].quantity;
          if (currentQty + quantity > maxStock) {
            showToast(`Maksimal pembelian sesuai kuota tersisa (${maxStock}).`, 'error');
            return prev;
          }
          const next = [...prev];
          next[existingIdx] = { ...next[existingIdx], quantity: currentQty + quantity };
          added = true;
          return next;
        }
        if (quantity > maxStock) {
          showToast(`Maksimal pembelian sesuai kuota tersisa (${maxStock}).`, 'error');
          return prev;
        }
        added = true;
        return [...prev, { productId: product.id, variantId: chosenVariantId, quantity }];
      });

      if (added) {
        showToast(`"${product.name}" ditambahkan ke keranjang.`, 'success');
      }
      return added;
    },
    [showToast]
  );

  const updateCartQuantity = useCallback(
    (productId: string, variantId: string | undefined, quantity: number) => {
      if (quantity <= 0) {
        setCart((prev) =>
          prev.filter(
            (i) => !(i.productId === productId && (i.variantId || '') === (variantId || ''))
          )
        );
        return;
      }
      const match = enrichedCart.find(
        (i) => i.productId === productId && (i.variantId || '') === (variantId || '')
      );
      if (match && quantity > match.maxStock) {
        showToast(`Jumlah melebihi kuota tersedia (${match.maxStock}).`, 'error');
        return;
      }
      setCart((prev) =>
        prev.map((i) =>
          i.productId === productId && (i.variantId || '') === (variantId || '')
            ? { ...i, quantity }
            : i
        )
      );
    },
    [enrichedCart, showToast]
  );

  const removeFromCart = useCallback((productId: string, variantId?: string) => {
    setCart((prev) =>
      prev.filter(
        (i) => !(i.productId === productId && (i.variantId || '') === (variantId || ''))
      )
    );
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  return (
    <StoreContext.Provider
      value={{
        storefront,
        loadingStorefront,
        storefrontError,
        refreshStorefront,
        allCatalogProducts,
        refreshCatalogProducts,
        cart,
        enrichedCart,
        cartCount,
        cartSubtotal,
        cartSubtotalNormal,
        cartResellerSavings,
        cartOpen,
        setCartOpen,
        addToCart,
        updateCartQuantity,
        removeFromCart,
        clearCart,
        toasts,
        showToast,
        dismissToast,
        user,
        authReady,
        adminProfile,
        adminAuthReason,
        checkingAdmin,
        loginAdmin,
        loginAdminWithPassword,
        changeAdminPassword,
        logoutAdmin,
        getAuthHeader,
        userProfile,
        checkingUser,
        isResellerActive,
        resellerWallet,
        topupConfig,
        refreshResellerWallet,
        refreshResellerSession,
        setResellerProfile: setUserProfile,
        loginReseller,
        logoutReseller,
        referralCode,
        setReferralCodeManual,
        clearReferralCode,
        realtimeStatus,
        lastSyncedAt,
        reconnectRealtime,
        subscribeRealtime,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}

