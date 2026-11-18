import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  CAT_AI_CLEAN_IMAGE,
  CAT_CREATIVE_CLEAN_IMAGE,
  CAT_SECURITY_CLEAN_IMAGE,
  CAT_STREAMING_CLEAN_IMAGE,
  createDefaultHomepageSections,
  createDefaultNavigationMenus,
  createInitialAdminAccount,
  createInitialSeedState,
  CURRENT_SCHEMA_VERSION,
  hasOfficialQrisFile,
  HERO_CLEAN_IMAGE,
  OFFICIAL_QRIS_PATH,
  type DatabaseState,
} from './seedData';
import {
  calculateResellerPrice,
  calculateTopupFee,
  DEFAULT_TOPUP_MAX,
  DEFAULT_TOPUP_MIN,
  TOPUP_FEE_PERCENTAGE,
} from '../src/shared/pricing';
import type { RealtimeMutationMeta } from '../src/shared/types';

const LEGACY_TO_CLEAN_IMAGES: Record<string, string> = {
  '/src/assets/images/hero_digital_apps_1794605634943.jpg': HERO_CLEAN_IMAGE,
  '/src/assets/images/cat_ai_productivity_1794605634165.jpg': CAT_AI_CLEAN_IMAGE,
  '/src/assets/images/cat_streaming_media_1794605634711.jpg': CAT_STREAMING_CLEAN_IMAGE,
  '/src/assets/images/cat_creative_cloud_1794605634793.jpg': CAT_CREATIVE_CLEAN_IMAGE,
  '/src/assets/images/cat_security_dev_1794605634516.jpg': CAT_SECURITY_CLEAN_IMAGE,
};

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = process.env.STORE_DB_PATH
  ? path.resolve(process.env.STORE_DB_PATH)
  : path.join(DATA_DIR, 'store.db.json');

export interface DatabaseChangeEvent extends RealtimeMutationMeta {
  stateVersion: number;
  timestamp: string;
}

type DatabaseChangeListener = (event: DatabaseChangeEvent) => void;

class PersistentStore {
  private state: DatabaseState;
  private lockChain: Promise<void> = Promise.resolve();
  private listeners = new Set<DatabaseChangeListener>();

  constructor() {
    this.state = this.loadOrInit();
  }

  subscribeChanges(listener: DatabaseChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private loadOrInit(): DatabaseState {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw) as DatabaseState;

        const schemaVer = parsed.schemaVersion || 1;
        const hasRealOrders = Array.isArray(parsed.orders) && parsed.orders.length > 0;

        if (schemaVer < 2 && !hasRealOrders) {
          const fresh = createInitialSeedState();
          fresh.admin_roles = parsed.admin_roles?.length ? parsed.admin_roles : fresh.admin_roles;
          this.persist(fresh);
          return fresh;
        }

        let mutated = false;
        if (!Array.isArray(parsed.admin_accounts) || parsed.admin_accounts.length === 0) {
          parsed.admin_accounts = [createInitialAdminAccount()];
          mutated = true;
        }
        if (!Array.isArray(parsed.users)) {
          parsed.users = [];
          mutated = true;
        }
        if (!Array.isArray(parsed.reseller_applications)) {
          parsed.reseller_applications = [];
          mutated = true;
        }
        if (!Array.isArray(parsed.reseller_profiles)) {
          parsed.reseller_profiles = [];
          mutated = true;
        }
        if (!Array.isArray(parsed.reseller_wallets)) {
          parsed.reseller_wallets = [];
          mutated = true;
        }
        if (!Array.isArray(parsed.wallet_transactions)) {
          parsed.wallet_transactions = [];
          mutated = true;
        }
        if (!Array.isArray(parsed.reseller_topups)) {
          parsed.reseller_topups = [];
          mutated = true;
        }
        if (!Array.isArray(parsed.qris_history)) {
          parsed.qris_history = [];
          mutated = true;
        }
        if (typeof parsed.reseller_app_sequence !== 'number') {
          parsed.reseller_app_sequence = parsed.reseller_applications.length;
          mutated = true;
        }
        if (typeof parsed.topup_sequence !== 'number') {
          parsed.topup_sequence = parsed.reseller_topups.length;
          mutated = true;
        }
        if (typeof parsed.wallet_tx_sequence !== 'number') {
          parsed.wallet_tx_sequence = parsed.wallet_transactions.length;
          mutated = true;
        }
        if (typeof parsed.stateVersion !== 'number' || !Number.isFinite(parsed.stateVersion)) {
          parsed.stateVersion = 1;
          mutated = true;
        }
        if (parsed.store_settings && typeof parsed.store_settings.allowResellerStackPromo !== 'boolean') {
          parsed.store_settings.allowResellerStackPromo = false;
          mutated = true;
        }
        if (parsed.store_settings) {
          if (typeof parsed.store_settings.topupMinAmount !== 'number') {
            parsed.store_settings.topupMinAmount = DEFAULT_TOPUP_MIN;
            mutated = true;
          }
          if (typeof parsed.store_settings.topupMaxAmount !== 'number') {
            parsed.store_settings.topupMaxAmount = DEFAULT_TOPUP_MAX;
            mutated = true;
          }
          const settingsRec = parsed.store_settings as unknown as Record<string, unknown>;
          if (typeof parsed.store_settings.topupFeePercentage !== 'number') {
            parsed.store_settings.topupFeePercentage =
              typeof settingsRec.topupBonusPercentage === 'number'
                ? settingsRec.topupBonusPercentage
                : TOPUP_FEE_PERCENTAGE;
            mutated = true;
          }
          if ('topupBonusPercentage' in settingsRec) {
            delete settingsRec.topupBonusPercentage;
            mutated = true;
          }
          if (parsed.store_settings.seoTitle === undefined) {
            parsed.store_settings.seoTitle =
              'Catrizzz Store — Platform Aplikasi Premium & Produk Digital Terpercaya';
            mutated = true;
          }
          if (parsed.store_settings.seoDescription === undefined) {
            parsed.store_settings.seoDescription =
              'Catrizzz Store — Platform jual beli aplikasi premium, layanan berlangganan, akun digital, dan lisensi resmi dengan checkout aman, QRIS resmi, dan pelacakan resi unik.';
            mutated = true;
          }
          if (parsed.store_settings.faviconUrl === undefined) {
            parsed.store_settings.faviconUrl = '';
            mutated = true;
          }
        }
        if (parsed.site_contents) {
          if (!parsed.site_contents.homepageStatus) {
            parsed.site_contents.homepageStatus = 'published';
            mutated = true;
          }
          if (!parsed.site_contents.homepageSections) {
            parsed.site_contents.homepageSections = createDefaultHomepageSections();
            mutated = true;
          }
        }
        if (!Array.isArray(parsed.navigation_menus) || parsed.navigation_menus.length === 0) {
          parsed.navigation_menus = createDefaultNavigationMenus();
          mutated = true;
        }

        // Ensure every existing reseller profile has an initialized wallet record and statusHistory
        const walletNow = new Date().toISOString();
        for (const profile of parsed.reseller_profiles) {
          if (!Array.isArray(profile.statusHistory) || profile.statusHistory.length === 0) {
            profile.statusHistory = [
              {
                id: `sh-${crypto.randomUUID().slice(0, 8)}`,
                previousStatus: null,
                newStatus: profile.status,
                reason: 'Riwayat status awal akun reseller',
                changedByName: 'system',
                createdAt: profile.joinedAt || walletNow,
              },
            ];
            mutated = true;
          }
          const hasWallet = parsed.reseller_wallets.some(
            (w) => w.resellerId === profile.id || w.userId === profile.userId
          );
          if (!hasWallet) {
            parsed.reseller_wallets.push({
              id: `wal-${crypto.randomUUID().slice(0, 10)}`,
              resellerId: profile.id,
              userId: profile.userId,
              balance: 0,
              totalTopup: 0,
              totalFeesPaid: 0,
              totalSpent: 0,
              totalTransactions: 0,
              createdAt: profile.joinedAt || walletNow,
              updatedAt: walletNow,
            });
            mutated = true;
          }
        }

        for (const app of parsed.reseller_applications) {
          if (!Array.isArray(app.statusHistory) || app.statusHistory.length === 0) {
            app.statusHistory = [
              {
                id: `sh-${crypto.randomUUID().slice(0, 8)}`,
                previousStatus: null,
                newStatus: app.status,
                reason: 'Pengajuan pendaftaran reseller',
                changedByName: app.applicantName || 'system',
                createdAt: app.createdAt || walletNow,
              },
            ];
            mutated = true;
          }
        }

        for (const w of parsed.reseller_wallets) {
          const rec = w as unknown as Record<string, unknown>;
          if (typeof w.totalFeesPaid !== 'number') {
            w.totalFeesPaid = 0;
            mutated = true;
          }
          if ('totalBonus' in rec) {
            delete rec.totalBonus;
            mutated = true;
          }
        }

        for (const t of parsed.reseller_topups) {
          const rec = t as unknown as Record<string, unknown>;
          if (
            typeof t.feePercentage !== 'number' ||
            typeof t.feeAmount !== 'number' ||
            typeof t.totalPayment !== 'number' ||
            typeof t.walletCredit !== 'number'
          ) {
            const pct =
              typeof rec.bonusPercentage === 'number'
                ? rec.bonusPercentage
                : TOPUP_FEE_PERCENTAGE;
            const calc = calculateTopupFee(t.amount, pct);
            t.feePercentage = calc.feePercentage;
            t.feeAmount = calc.feeAmount;
            t.totalPayment = calc.totalPayment;
            t.walletCredit = calc.walletCredit;
            mutated = true;
          }
          for (const legacyKey of ['bonusPercentage', 'bonusAmount', 'totalCredit', 'bonusTxId']) {
            if (legacyKey in rec) {
              delete rec[legacyKey];
              mutated = true;
            }
          }
        }

        // Ensure every product has explicit resellerPriceEnabled / resellerPrice defaults
        for (const prod of parsed.products || []) {
          if (typeof prod.resellerPriceEnabled !== 'boolean') {
            prod.resellerPriceEnabled = true;
            mutated = true;
          }
          if (prod.resellerPrice === undefined) {
            prod.resellerPrice = calculateResellerPrice(prod.price);
            mutated = true;
          }
        }

        // Upgrade legacy dark demo artwork URLs cleanly to Clean White + Navy assets
        if (schemaVer < CURRENT_SCHEMA_VERSION) {
          if (parsed.site_contents?.heroImageUrl && LEGACY_TO_CLEAN_IMAGES[parsed.site_contents.heroImageUrl]) {
            parsed.site_contents.heroImageUrl = LEGACY_TO_CLEAN_IMAGES[parsed.site_contents.heroImageUrl];
          }
          for (const cat of parsed.categories || []) {
            if (cat.isDemo && LEGACY_TO_CLEAN_IMAGES[cat.imageUrl]) {
              cat.imageUrl = LEGACY_TO_CLEAN_IMAGES[cat.imageUrl];
            }
          }
          for (const prod of parsed.products || []) {
            if (prod.isDemo) {
              if (LEGACY_TO_CLEAN_IMAGES[prod.imageUrl]) {
                prod.imageUrl = LEGACY_TO_CLEAN_IMAGES[prod.imageUrl];
              }
              if (Array.isArray(prod.galleryUrls)) {
                prod.galleryUrls = prod.galleryUrls.map((u) => LEGACY_TO_CLEAN_IMAGES[u] || u);
              }
            }
          }
          for (const ban of parsed.banners || []) {
            if (ban.isDemo && LEGACY_TO_CLEAN_IMAGES[ban.imageUrl]) {
              ban.imageUrl = LEGACY_TO_CLEAN_IMAGES[ban.imageUrl];
            }
          }
          parsed.schemaVersion = CURRENT_SCHEMA_VERSION;
          mutated = true;
        }

        // Ensure baseline QRIS history entry exists when QRIS is configured
        if (
          parsed.qris_history.length === 0 &&
          parsed.store_settings?.qrisImageUrl
        ) {
          parsed.qris_history.push({
            id: 'qris-hist-initial',
            action: 'uploaded',
            newImageUrl: parsed.store_settings.qrisImageUrl,
            merchantName: parsed.store_settings.qrisMerchantName || 'Catrizz_Store',
            nmid: parsed.store_settings.qrisNmid || 'ID1024365593051',
            changedBy: 'system',
            note: 'QRIS aktif toko.',
            createdAt: parsed.store_settings.updatedAt || new Date().toISOString(),
          });
          mutated = true;
        }

        // Reconcile QRIS file existence on boot so we never assume QRIS is ready if file is missing
        if (parsed.store_settings?.qrisImageUrl === OFFICIAL_QRIS_PATH && !hasOfficialQrisFile()) {
          parsed.store_settings.qrisEnabled = false;
          parsed.store_settings.qrisImageUrl = '';
          mutated = true;
        }

        if (mutated) {
          this.persist(parsed);
        }
        return parsed;
      } catch (err) {
        console.error('Failed to read store.db.json, re-initializing seed state:', err);
      }
    }
    const seed = createInitialSeedState();
    this.persist(seed);
    return seed;
  }

  private persist(nextState: DatabaseState): void {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmpPath = `${DB_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(nextState, null, 2), 'utf8');
    fs.renameSync(tmpPath, DB_FILE);
  }

  getSnapshot(): DatabaseState {
    return structuredClone(this.state);
  }

  async withTransaction<T>(
    fn: (draft: DatabaseState) => Promise<T> | T,
    meta?: RealtimeMutationMeta
  ): Promise<T> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.lockChain;
    this.lockChain = next;
    await prev;

    let committedVersion = this.state.stateVersion || 1;
    let result!: T;
    try {
      const draft = structuredClone(this.state);
      result = await fn(draft);
      draft.stateVersion = (draft.stateVersion || 0) + 1;
      committedVersion = draft.stateVersion;
      this.state = draft;
      this.persist(this.state);
    } finally {
      release();
    }

    if (meta && meta.areas.length > 0) {
      const event: DatabaseChangeEvent = {
        ...meta,
        stateVersion: committedVersion,
        timestamp: new Date().toISOString(),
      };
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch (err) {
          console.error('Realtime subscriber notification error:', err);
        }
      }
    }

    return result;
  }
}

export const db = new PersistentStore();
