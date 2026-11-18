export type PaymentStatus =
  | 'unpaid'
  | 'pending_verification'
  | 'paid'
  | 'rejected'
  | 'refunded';

export type OrderStatus =
  | 'pending_payment'
  | 'processing'
  | 'shipped'
  | 'completed'
  | 'cancelled';

export type ProductBadge = '' | 'Best Seller' | 'New' | 'Promo';

export type DiscountType = 'percentage' | 'fixed';

export type ShippingType = 'digital' | 'physical' | 'pickup';

export type UserRole = 'reseller';

export type ResellerApplicationStatus =
  | 'pending_approval'
  | 'unpaid'
  | 'pending_verification'
  | 'approved'
  | 'rejected';

export type ResellerProfileStatus =
  | 'pending_approval'
  | 'active'
  | 'suspended'
  | 'banned'
  | 'rejected';

export interface ResellerStatusHistoryEntry {
  id: string;
  previousStatus: string | null;
  newStatus: string;
  reason?: string;
  changedByAdminId?: string;
  changedByName: string;
  createdAt: string;
}

export interface UserAccount {
  id: string;
  username: string;
  name: string;
  email: string;
  whatsapp: string;
  passwordHash: string;
  passwordSalt: string;
  passwordSet?: boolean;
  activationTokenHash?: string;
  activationExpiresAt?: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResellerApplication {
  id: string;
  applicationNumber: string;
  userId?: string;
  username: string;
  applicantName: string;
  applicantWhatsapp: string;
  applicantEmail: string;
  feeAmount: number;
  status: ResellerApplicationStatus;
  paymentStatus: PaymentStatus;
  proofUrl?: string;
  proofMimeType?: string;
  proofHash?: string;
  payerName?: string;
  payerWhatsapp?: string;
  paidAmount?: number;
  paymentTime?: string;
  notes?: string;
  verifiedByAdminId?: string;
  verifiedByAdminEmail?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  statusHistory?: ResellerStatusHistoryEntry[];
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResellerProfile {
  id: string;
  userId: string;
  username: string;
  name: string;
  referralCode: string;
  status: ResellerProfileStatus;
  applicationId: string;
  statusHistory?: ResellerStatusHistoryEntry[];
  joinedAt: string;
  updatedAt: string;
}

export interface PublicUserProfile {
  id: string;
  resellerId?: string;
  username: string;
  name: string;
  email: string;
  whatsapp: string;
  role: UserRole;
  resellerStatus?: ResellerProfileStatus;
  referralCode?: string;
  joinedAt?: string;
  passwordSet?: boolean;
}

export interface QrisHistoryEntry {
  id: string;
  action: 'uploaded' | 'updated' | 'enabled' | 'disabled' | 'removed' | 'restored';
  previousImageUrl?: string;
  newImageUrl?: string;
  merchantName: string;
  nmid: string;
  changedBy: string;
  note?: string;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string;
  sortOrder: number;
  active: boolean;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  name: string;
  priceDelta: number;
  stock: number;
  active: boolean;
}

export type AvailabilityStatus = 'available' | 'limited' | 'out_of_stock';

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  additionalInfo: string;
  subscriptionDuration?: string;
  benefits?: string[];
  activationGuide?: string;
  availabilityStatus?: AvailabilityStatus;
  categoryId: string;
  price: number;
  discountPrice?: number | null;
  resellerPrice?: number | null;
  resellerPriceEnabled?: boolean;
  stock: number;
  soldCount: number;
  rating: number;
  reviewCount: number;
  badge: ProductBadge;
  imageUrl: string;
  galleryUrls: string[];
  featured: boolean;
  active: boolean;
  requiresShipping: boolean;
  labels?: string[];
  publicationStatus?: 'draft' | 'published' | 'inactive';
  featuredOrder?: number;
  archived?: boolean;
  isDemo?: boolean;
  variants?: ProductVariant[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemSnapshot {
  id: string;
  orderId: string;
  productId: string;
  productNameSnapshot: string;
  productImageSnapshot: string;
  variantId?: string;
  variantNameSnapshot?: string;
  unitPriceSnapshot: number;
  originalUnitPriceSnapshot: number;
  pricingTierSnapshot?: 'normal' | 'reseller';
  quantity: number;
  lineSubtotal: number;
}

export interface OrderTimelineEvent {
  title: string;
  description: string;
  timestamp: string;
  status: 'done' | 'current' | 'rejected' | 'upcoming';
}

export interface Order {
  id: string;
  orderNumber: string;
  idempotencyKey: string;
  buyerUserId?: string;
  buyerType?: 'customer' | 'reseller';
  pricingTier?: 'normal' | 'reseller';
  attributedResellerId?: string;
  referralCodeUsed?: string;
  customerId: string;
  customerName: string;
  customerWhatsapp: string;
  customerEmail?: string;
  shippingAddress?: string;
  shippingMethodId: string;
  shippingMethodName: string;
  trackingNumber?: string;
  orderNotes?: string;
  internalNotes?: string;
  subtotal: number;
  productDiscountTotal: number;
  resellerDiscountTotal?: number;
  couponCode?: string;
  couponDiscount: number;
  shippingCost: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod?: 'QRIS' | 'WALLET';
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  walletTransactionId?: string;
  walletRefunded?: boolean;
  refundReason?: string;
  refundedAt?: string;
  refundedByAdminId?: string;
  receiptTokenHash: string;
  receiptTokenMasked: string;
  receiptActive: boolean;
  rejectionReason?: string;
  timeline?: OrderTimelineEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  method: 'QRIS' | 'WALLET';
  expectedAmount: number;
  confirmedAmount?: number;
  status: PaymentStatus;
  verifiedByAdminId?: string;
  verifiedByAdminEmail?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentConfirmation {
  id: string;
  orderId: string;
  orderNumber: string;
  payerName: string;
  payerWhatsapp: string;
  paymentTime: string;
  method: 'QRIS';
  paidAmount: number;
  proofUrl?: string;
  proofMimeType?: string;
  notes?: string;
  createdAt: string;
}

export interface DiscountCode {
  id: string;
  promoName: string;
  code: string;
  description: string;
  type: DiscountType;
  value: number;
  minPurchase: number;
  maxDiscount?: number | null;
  startDate: string;
  endDate: string;
  maxTotalUsage: number;
  maxPerCustomer: number;
  usedCount: number;
  applicableProductIds: string[];
  applicableCategoryIds: string[];
  eligibleTier?: 'all' | 'customer' | 'reseller';
  active: boolean;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DiscountUsage {
  id: string;
  discountCodeId: string;
  code: string;
  orderId: string;
  orderNumber: string;
  customerWhatsapp: string;
  discountAmount: number;
  createdAt: string;
}

export interface StoreSettings {
  id: string;
  storeName: string;
  seoTitle?: string;
  seoDescription?: string;
  tagline?: string;
  logoUrl: string;
  faviconUrl?: string;
  whatsappNumber: string;
  email: string;
  address: string;
  operatingHours: string;
  currency: string;
  taxPercent: number;
  maintenanceMode?: boolean;
  qrisEnabled: boolean;
  qrisImageUrl: string;
  qrisMerchantName: string;
  qrisNmid: string;
  qrisInstructions: string[];
  qrisVersion?: number;
  qrisUpdatedByAdminId?: string;
  qrisUpdatedByAdminEmail?: string;
  allowResellerStackPromo?: boolean;
  topupMinAmount?: number;
  topupMaxAmount?: number;
  topupFeePercentage?: number;
  reviewsEnabled: boolean;
  updatedAt: string;
}

export interface NavigationMenuItem {
  id: string;
  label: string;
  href: string;
  location: 'header' | 'footer';
  group?: 'main' | 'portal';
  openInNewTab?: boolean;
  sortOrder: number;
  active: boolean;
}

export interface Banner {
  id: string;
  headline: string;
  subheadline?: string;
  description: string;
  imageUrl: string;
  ctaLabel: string;
  ctaLink: string;
  startDate?: string;
  endDate?: string;
  active: boolean;
  isDemo?: boolean;
  updatedAt: string;
}

export interface StoreAdvantage {
  id: string;
  title: string;
  description: string;
  iconName: string;
}

export interface StoreFaq {
  id: string;
  question: string;
  answer: string;
}

export interface SiteContent {
  id: string;
  announcementEnabled?: boolean;
  announcementText?: string;
  homepageStatus?: 'published' | 'inactive';
  homepageSections?: Record<
    string,
    {
      enabled?: boolean;
      visible?: boolean;
      sortOrder?: number;
      title?: string;
      subtitle?: string;
      maxItems?: number;
      primaryCtaLink?: string;
      secondaryCtaLink?: string;
      backgroundStyle?: 'white' | 'soft_navy';
    }
  >;
  heroHeadline: string;
  heroSubheadline: string;
  heroDescription: string;
  heroImageUrl: string;
  heroPrimaryCtaLabel: string;
  heroSecondaryCtaLabel: string;
  advantages: StoreAdvantage[];
  faqs: StoreFaq[];
  aboutTitle: string;
  aboutDescription: string;
  footerDescription: string;
  footerCopyright: string;
  socialLinks: {
    instagram?: string;
    tiktok?: string;
    telegram?: string;
    youtube?: string;
    email?: string;
  };
  privacyPolicy: string;
  termsConditions: string;
  returnPolicy: string;
  updatedAt: string;
}

export interface CustomerRecord {
  id: string;
  name: string;
  whatsapp: string;
  email?: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderAt: string;
}

export interface ShippingSetting {
  id: string;
  name: string;
  description: string;
  type: ShippingType;
  cost: number;
  requiresAddress: boolean;
  active: boolean;
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  variantId?: string;
  delta: number;
  previousStock: number;
  newStock: number;
  reason: string;
  orderId?: string;
  actor: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorEmail: string;
  actorUid?: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string;
}

export interface AdminRole {
  uid: string;
  email: string;
  role: 'super_admin' | 'admin' | 'verifier';
  active: boolean;
  createdAt: string;
}

export interface AdminAccount {
  id: string;
  username: string;
  displayName?: string;
  passwordHash: string;
  passwordSalt: string;
  role: 'super_admin' | 'admin';
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface PublicReceiptView {
  orderNumber: string;
  createdAt: string;
  customerName: string;
  maskedWhatsapp: string;
  shippingMethodName: string;
  trackingNumber?: string;
  shippingAddressMasked?: string;
  items: OrderItemSnapshot[];
  subtotal: number;
  productDiscountTotal: number;
  resellerDiscountTotal?: number;
  pricingTier?: 'normal' | 'reseller';
  couponCode?: string;
  couponDiscount: number;
  shippingCost: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod: 'QRIS' | 'WALLET';
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  confirmedAt?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  receiptTokenMasked: string;
  timeline: OrderTimelineEvent[];
}

export type LeaderboardRange = 'today' | '7d' | '30d' | 'month' | 'all';

export interface ResellerLeaderboardEntry {
  rank: number;
  resellerId: string;
  userId: string;
  name: string;
  username: string;
  referralCode: string;
  status: ResellerProfileStatus;
  joinedAt: string;
  totalAttributedSales: number;
  attributedOrderCount: number;
  attributedProductQty: number;
  topProductName: string;
  topProductQty: number;
}

export type WalletTransactionType =
  | 'topup'
  | 'topup_bonus'
  | 'purchase'
  | 'refund'
  | 'manual_credit'
  | 'manual_debit'
  | 'adjustment';

export type TopupStatus =
  | 'pending_payment'
  | 'pending_verification'
  | 'approved'
  | 'rejected';

export interface ResellerWallet {
  id: string;
  resellerId: string;
  userId: string;
  balance: number;
  totalTopup: number;
  totalFeesPaid: number;
  totalSpent: number;
  totalTransactions: number;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  txNumber: string;
  resellerId: string;
  userId: string;
  type: WalletTransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceType: 'topup' | 'order' | 'admin_adjustment' | 'system';
  referenceId: string;
  description: string;
  reason?: string;
  actorId?: string;
  actorName?: string;
  createdAt: string;
}

export interface ResellerTopup {
  id: string;
  topupNumber: string;
  resellerId: string;
  userId: string;
  resellerName: string;
  resellerUsername: string;
  resellerWhatsapp: string;
  amount: number;
  feePercentage: number;
  feeAmount: number;
  totalPayment: number;
  walletCredit: number;
  method: 'QRIS';
  status: TopupStatus;
  credited: boolean;
  proofUrl?: string;
  proofMimeType?: string;
  proofHash?: string;
  payerName?: string;
  payerWhatsapp?: string;
  paymentTime?: string;
  notes?: string;
  approvedAt?: string;
  approvedByAdminId?: string;
  approvedByAdminEmail?: string;
  rejectedAt?: string;
  rejectedByAdminId?: string;
  rejectionReason?: string;
  topupTxId?: string;
  createdAt: string;
  updatedAt: string;
}

export type RealtimeArea =
  | 'storefront'
  | 'products'
  | 'categories'
  | 'discounts'
  | 'cms'
  | 'payment_settings'
  | 'orders'
  | 'payments'
  | 'reseller_apps'
  | 'resellers'
  | 'reseller_wallet'
  | 'topups'
  | 'overview'
  | 'logs';

export type RealtimeConnectionState = 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED';

export interface RealtimeMutationMeta {
  areas: RealtimeArea[];
  targetUserId?: string;
  targetResellerId?: string;
  orderId?: string;
  receiptTokenHash?: string;
  summary?: string;
}

export type RealtimeEventMessage =
  | {
      type: 'connected';
      clientId: string;
      role: 'admin' | 'reseller' | 'guest';
      stateVersion: number;
      timestamp: string;
    }
  | {
      type: 'invalidate';
      areas: RealtimeArea[];
      stateVersion: number;
      timestamp: string;
      summary?: string;
    }
  | {
      type: 'pong';
      timestamp: string;
    };
