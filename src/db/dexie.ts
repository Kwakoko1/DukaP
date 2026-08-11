import Dexie, { type Table } from 'dexie';
import type { SyncOutboxItem } from '../types/stockSync';

// Interfaces for our database entities
export interface Product {
  id: string;
  name: string;
  category: string;
  buyingPrice: number; // Default Buying Price
  sellingPrice: number; // Default Selling Price (also mapped to price for compatibility)
  price: number; // Selling Price representation
  stock: number; // Aggregate total stock of all variants (calculated read-only when hasVariants is true)
  expiryDate?: string;
  tenant_id: string;
  branch_id: string;
  module: string; // Dynamic mapping to all 27+ modules
  hasVariants: boolean;
  brand?: string;
  description?: string;
  supplier?: string;
  image?: string;
  attributes?: string[]; // Configurable attributes list, e.g. ['Size', 'Color']
  reorderLevel?: number; // Optional custom reorder level trigger

  // Multiple Selling Price Tiers
  wholesalePrice?: number;
  vipPrice?: number;
  onlinePrice?: number;

  // Production-grade CamelCase & synchronization fields
  tenantId?: string;
  branchId?: string;
  sku?: string;
  barcode?: string;
  categoryId?: string;
  costPrice?: number;
  status?: 'Active' | 'Inactive';
  version?: number;
  createdAt?: number;
  updatedAt?: number;
  deletedAt?: number;
  createdBy?: string;
  updatedBy?: string;
  syncStatus?: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  origin?: 'DEMO' | 'PRODUCTION' | 'IMPORTED' | 'MIGRATED';

  // ── Beverage / Bar Extension (JSONB payload for Bar module) ──────────────
  item_type?: string;             // e.g. 'Beverage', 'Food', 'Non-Alcoholic'
  packaging?: string;             // 'Bottle' | 'Can' | 'Draught' | 'Sachet'
  bottle_size_ml?: number;        // e.g. 750 for 750ml bottle
  standard_pour_ml?: number;      // Pour size in ml, e.g. 30ml per shot
  total_pours_per_bottle?: number; // Calculated: bottle_size_ml / standard_pour_ml
  cost_per_pour?: number;         // Buying price / total_pours_per_bottle
  selling_price_per_pour?: number; // Revenue per pour
  track_empty_bottles?: boolean;  // Track empties for deposit/return
  excise_tax_applicable?: boolean; // Tanzania excise tax on alcohol
  excise_tax_rate?: number;        // e.g. 0.25 = 25%
  abv_percent?: number;            // Alcohol by Volume %
  is_happy_hour_eligible?: boolean; // Qualifies for happy hour pricing
  happy_hour_price?: number;        // Discounted pour price during happy hour
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  barcode?: string;
  buyingPrice?: number; // Override buying price (optional)
  sellingPrice?: number; // Override selling price (optional)
  wholesalePrice?: number; // Override wholesale price (optional)
  vipPrice?: number; // Override VIP price (optional)
  onlinePrice?: number; // Override online price (optional)
  stock: number;
  reservedStock: number;
  reorderLevel: number;
  status: 'Active' | 'Inactive';
  attributes: Record<string, string>; // e.g. { Size: "L", Color: "Red" }
  image?: string;
  tenant_id: string;
  branch_id: string;
  inheritBuyingPrice?: boolean;
  inheritSellingPrice?: boolean;
  // Sync metadata
  isSynced?: number;       // 0 = pending, 1 = synced (fast IndexedDB indexing)
  syncStatus?: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
  origin?: 'DEMO' | 'PRODUCTION' | 'IMPORTED' | 'MIGRATED';
}

/**
 * IdMappingLedger — immutable log that maps a temporary client-generated ID
 * to the permanent server-assigned UUID after a successful cloud INSERT.
 * This prevents data decoupling when the server reassigns primary keys.
 */
export interface IdMappingLedger {
  /** Auto-increment primary key */
  id?: number;
  /** The temporary client-side ID (e.g. "offline-usr-product-1234") */
  clientId: string;
  /** The permanent server UUID returned after the INSERT succeeded */
  serverId: string;
  /** Which entity this mapping covers */
  entityName: 'products' | 'productVariants';
  /** Tenant scoping */
  tenantId: string;
  /** When the mapping was created */
  createdAt: number;
  /** Whether dependent references have been cascaded */
  reconciled: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  loyaltyPoints: number;
  outstandingBalance: number;
  creditLimit?: number;
  walletBalance?: number;
  tenant_id: string;
  branch_id: string;
  type: string; // Patient, Member, Student, Tenant, Guest, Client, Customer
  origin?: 'DEMO' | 'PRODUCTION' | 'IMPORTED' | 'MIGRATED';
}

export interface OrderItem {
  productId: string;
  variantId?: string; // Selected Variant if exists
  name: string;
  price: number;
  quantity: number;
}

export interface Order {
  id: string;
  items: OrderItem[];
  total: number;
  discount: number;
  tax: number;
  paymentMethod: string;
  status: 'Completed' | 'Pending' | 'Cancelled' | 'Voided' | 'Refunded';
  timestamp: number;
  syncStatus: 'Synced' | 'Pending';
  tenant_id: string;
  branch_id: string;
  module: string;
  origin?: 'DEMO' | 'PRODUCTION' | 'IMPORTED' | 'MIGRATED';
}

export type SyncOperation =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'RESTORE'
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'TRANSFER'
  | 'PAYMENT'
  | 'REFUND'
  | 'RETURN'
  | 'PURCHASE'
  | 'EXPENSE'
  | 'ATTACHMENT';

export type SyncStatus = 'Pending' | 'Syncing' | 'Completed' | 'Failed' | 'Conflict' | 'Cancelled' | 'Processing' | 'DeadLetter';

export interface SyncItem {
  id?: number;
  tenant_id?: string;
  branch_id?: string;
  entity?: string;
  entity_id?: string;
  operation?: SyncOperation;
  payload: any;
  status: SyncStatus;
  retry_count?: number;
  priority?: 1 | 2 | 3 | 4;
  created_at?: number;
  last_attempt?: number | null;
  error?: string | null;
  device_id?: string;
  user_id?: string;
  sync_token?: string;

  // Backwards compatibility properties
  actionType?: 'INSERT' | 'UPDATE' | 'DELETE' | string;
  entityName?: string;
  timestamp?: number;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'Active' | 'Suspended' | 'Trial' | 'Registered' | 'Cancelled' | 'Demo' | 'DEMO' | 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'EXPIRED' | 'ARCHIVED' | 'Expired' | 'Archived' | 'Prospect' | 'Registration' | 'Verification' | 'Provisioning' | 'Demo Mode' | 'Subscribed' | 'Deleted' | 'Draft' | 'DRAFT';
  plan: 'Basic' | 'Professional' | 'Enterprise';
  // Extended SaaS fields
  business_type?: string;
  email?: string;
  phone?: string;
  country?: string;
  region?: string;
  address?: string;
  logo_url?: string;
  banner_url?: string;
  tenant_code?: string;
  reg_number?: string;
  tax_number?: string;
  industry?: string;
  district?: string;
  created_at?: number;
  trial_ends_at?: number;
  deleted_at?: number;
  deletedAt?: number;
  tenant_uuid?: string;
  business_code?: string;
  human_tenant_id?: string;
  // Master Tenant Registry fields
  legal_name?: string;
  tin?: string;
  category?: string;
  timezone?: string;
  currency?: string;
  language?: string;
  owner_name?: string;
  owner_email?: string;
  owner_phone?: string;
  brand_colors?: { primary: string; secondary: string };
  db_identifier?: string;
  storage_bucket?: string;
  last_login_at?: number;
  last_sync_at?: number;
  last_backup_at?: number;
  version?: string;
  api_key?: string;
  feature_package?: string;
  verification_status?: 'Pending' | 'Verified' | 'Rejected' | string;
  data_residency_region?: string;
  registration_source?: string;
  created_by?: string;
  registration_ip?: string;
  registration_device?: string;
  registration_completed?: boolean;
}

export interface TenantBackup {
  id: string;
  tenant_id: string;
  type: 'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'MANUAL';
  status: 'COMPLETED' | 'IN_PROGRESS' | 'FAILED';
  size_mb: number;
  encrypted: boolean;
  checksum: string;
  created_at: number;
  created_by?: string;
}

export interface SystemNotification {
  id: string;
  tenant_id?: string | null;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'IN_APP' | 'PUSH';
  subject: string;
  message: string;
  target_scope: 'SINGLE' | 'ALL' | 'PLAN' | 'CATEGORY' | 'REGION';
  target_filter?: string;
  status: 'SENT' | 'PENDING' | 'FAILED';
  sent_at: number;
}

export interface SecurityIncident {
  id: string;
  tenant_id: string;
  type: 'FAILED_LOGIN' | 'LOCKED_ACCOUNT' | 'SUSPICIOUS_LOCATION' | 'CONCURRENT_SESSIONS' | 'TOKEN_ABUSE' | 'API_ABUSE' | 'RATE_LIMIT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'DISMISSED';
  details: string;
  ip_address?: string;
  user_agent?: string;
  created_at: number;
}


export interface Branch {
  id: string;
  tenant_id: string;
  name: string;
  location: string;
  // Extended SaaS fields (optional for backward compat)
  branch_code?: string;
  phone?: string;
  is_headquarters?: boolean;
  is_default?: boolean;          // Marks the default/HQ branch for the tenant
  status?: 'Active' | 'Inactive';
  created_at?: number;
}

export interface TenantModule {
  id: string;
  tenant_id: string;
  module_key: string; // matches IndustryModule keys
  enabled: boolean;
  configuration: Record<string, any>;
  installed_at: number;
}

export interface TenantSetting {
  id: string;
  tenant_id: string;
  setting_key: string;
  setting_value: any;
}

export interface AppSetting {
  id: string;
  tenantId: string;
  branchId?: string;
  userId?: string;
  namespace: string;
  config: Record<string, any>;
  version: number;
  syncedAt?: number;
}

export interface FeatureFlag {
  id: string;
  tenant_id: string;
  feature_key: string;
  enabled: boolean;
}

export interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string;
  user_name: string;
  action: string;
  entity: string;
  entity_id?: string;
  metadata?: Record<string, any>;
  created_at: number;
  origin?: 'DEMO' | 'PRODUCTION' | 'IMPORTED' | 'MIGRATED';
}

// ── Receipt Management Module Interfaces (v32) ──────────────────────────────
export type ReceiptStatus = 'Completed' | 'Cancelled' | 'Refunded' | 'Voided' | 'Draft' | 'Archived';
export type ReceiptTransactionType =
  | 'POS_SALE'
  | 'POS_RETURN'
  | 'REFUND'
  | 'LAYBY_PAYMENT'
  | 'CUSTOMER_DEPOSIT'
  | 'CREDIT_PAYMENT'
  | 'SERVICE_INVOICE'
  | 'RESTAURANT_ORDER'
  | 'CASH_DRAWER_OP'
  | 'MEMBERSHIP_PAYMENT'
  | 'SUBSCRIPTION_PAYMENT'
  | 'EXPENSE'
  | 'OTHER';

export type ReceiptFormat = 'thermal_58' | 'thermal_80' | 'a4';

export interface Receipt {
  id: string;
  receipt_number: string;
  transaction_id?: string;
  transaction_type: ReceiptTransactionType;
  original_receipt_id?: string;
  original_receipt_number?: string;
  tenant_id: string;
  branch_id: string;
  device_id?: string;
  terminal_id?: string;
  cashier_id: string;
  cashier_name: string;
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string;
  currency: string;
  exchange_rate?: number;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total: number;
  paid_amount: number;
  change_amount: number;
  payment_method: string;
  payment_reference?: string;
  tax_breakdown?: Array<{ label: string; rate: number; amount: number }>;
  status: ReceiptStatus;
  print_count: number;
  last_printed_at?: number;
  last_printed_by?: string;
  cancellation_reason?: string;
  refund_reason?: string;
  created_at: number;
  updated_at: number;
  created_by?: string;
  updated_by?: string;
  sync_status: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  sync_version?: number;
  version?: number;
  qr_payload?: string;
  barcode_value?: string;
  signature_hash?: string;
  notes?: string;
  custom_fields?: Record<string, any>;
}

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  tenant_id: string;
  product_id?: string;
  variant_id?: string;
  name: string;
  sku?: string;
  qty: number;
  unit_price: number;
  discount: number;
  tax_rate: number;
  tax_amount: number;
  subtotal: number;
  total: number;
  notes?: string;
}

export interface ReceiptTemplate {
  id: string;
  tenant_id: string;
  branch_id?: string;
  name: string;
  format: ReceiptFormat;
  is_default: boolean;
  business_name?: string;
  business_address?: string;
  business_phone?: string;
  tin?: string;
  header_text?: string;
  footer_text?: string;
  return_policy?: string;
  thank_you_message?: string;
  logo_url?: string;
  show_logo?: boolean;
  show_qr?: boolean;
  show_barcode?: boolean;
  show_tax_breakdown?: boolean;
  show_cashier?: boolean;
  show_customer?: boolean;
  show_branch?: boolean;
  show_device?: boolean;
  show_return_policy?: boolean;
  receipt_prefix?: string;
  primary_color?: string;
  font_size?: string;
  paper_width?: number;
  created_at: number;
  updated_at: number;
  created_by?: string;
}

export interface ReceiptPrintLog {
  id: string;
  receipt_id: string;
  receipt_number: string;
  tenant_id: string;
  branch_id: string;
  printed_by: string;
  printed_by_name: string;
  device_id?: string;
  format: ReceiptFormat;
  is_reprint: boolean;
  reprint_reason?: string;
  created_at: number;
}

export interface ReceiptShareLog {
  id: string;
  receipt_id: string;
  receipt_number: string;
  tenant_id: string;
  branch_id: string;
  shared_by: string;
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'IN_APP' | 'PUSH';
  recipient?: string;
  status: 'SENT' | 'FAILED';
  created_at: number;
}

export interface ReceiptAuditLog {
  id: string;
  receipt_id: string;
  receipt_number: string;
  tenant_id: string;
  branch_id: string;
  user_id: string;
  user_name: string;
  action: 'CREATED' | 'PRINTED' | 'REPRINTED' | 'CANCELLED' | 'REFUNDED' | 'SHARED' | 'ARCHIVED' | 'RESTORED';
  details?: string;
  device_id?: string;
  created_at: number;
}

export interface ReceiptQrCode {
  id: string;
  receipt_id: string;
  receipt_number: string;
  tenant_id: string;
  payload: string;
  created_at: number;
}

export interface ReceiptSignature {
  id: string;
  receipt_id: string;
  receipt_number: string;
  tenant_id: string;
  algorithm: string;
  hash: string;
  input_string: string;
  created_at: number;
}

export interface ReceiptNumberSequence {
  id: string;
  tenant_id: string;
  branch_id: string;
  date_key: string;
  last_sequence: number;
  updated_at: number;
}

export interface ResetCommand {
  id: string;
  tenant_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PAUSED' | 'CANCELLED';
  requested_by: string;
  clear_type: 'DEMO_DATA' | 'ALL_DATA';
  created_at: number;
  completed_at?: number;
  error_message?: string;
  current_table?: string;
  processed_count?: number;
  total_count?: number;
  percent_complete?: number;
  rollback_package_data?: string;
  rollback_available?: boolean;
  is_paused?: boolean;
  is_cancelled?: boolean;
}

export interface Industry {
  id: string;
  name: string;
  schema_preset: Record<string, any>;
}

export interface TenantIndustry {
  tenant_id: string;
  industry_id: string;
}

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  is_super_admin: boolean;
  name: string;
  phone: string;
  
  // Extended SaaS fields
  tenant_id?: string | null;      // null = system platform employee, non-null = tenant user
  first_name?: string;
  last_name?: string;
  username?: string;
  pin_hash?: string;              // POS quick PIN hash (clean 4-digit, no prefix)
  avatar_url?: string;
  status?: 'Active' | 'Suspended' | 'Inactive';
  email_verified?: boolean;
  phone_verified?: boolean;
  last_login_at?: number;
  created_at?: number;
  updated_at?: number;
  
  // Registration Audit Metadata
  registration_source?: 'SELF_REGISTERED' | 'ADMIN_PROVISIONED' | 'SUPER_ADMIN_CPANEL' | 'INVITATION_LINK' | 'SYSTEM_SEED';
  created_by?: string;
  registration_ip?: string;
  registration_device?: string;
  verification_status?: 'VERIFIED' | 'PENDING' | 'UNVERIFIED';

  // Assignment
  branch_id?: string;             // Auto-set to HQ branch on provisioning
  role?: string;                  // Friendly role label (e.g. 'Tenant Owner')
  user_code?: string;             // Human-readable User Code (e.g. USR-OWNER, USR-CSH-1001)
}

export interface TenantUser {
  id: string;
  tenant_id: string;
  user_id: string;
  employee_code: string;
  job_title: string;
  department: string;
  status: 'Active' | 'Inactive' | 'Suspended';
  joined_at: number;
}

export interface Employee {
  id: string;
  tenant_id: string;
  user_id: string;
  employee_number: string;
  national_id?: string;
  address?: string;
  emergency_contact?: string;
  employment_date: number;
  salary_type: 'Monthly' | 'Hourly' | 'Commission';
  notes?: string;
}

export interface Role {
  id: string;
  tenant_id: string | null;      // null for platform system roles
  name: string;
  slug: string;
  description: string;
  is_system_role: boolean;
  is_custom: boolean;
  created_at: number;
}

export interface Permission {
  id: string;
  module: string;                  // e.g. 'inventory', 'sales', 'reports'
  resource: string;                // e.g. 'product', 'sale', 'config'
  action: string;                  // e.g. 'create', 'void', 'view'
  slug: string;                    // e.g. 'inventory.product.create'
  description: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
}

export interface TenantUserBranch {
  id: string;
  tenant_id: string;
  user_id: string;
  branch_id: string;
  role_id: string;                 // references role.id or role.slug
  is_primary: boolean;
  assigned_at: number;
}

export interface UserSecurity {
  user_id: string;
  pin_hash: string;
  failed_attempts: number;
  locked_until?: number;
  two_factor_enabled: boolean;
}

export interface SecurityAuditLog {
  id: string;
  tenant_id: string | null;
  branch_id?: string;
  user_id: string;
  action: string;                  // e.g. 'user.login.success', 'permission.changed'
  ip_address?: string;
  device_info?: string;
  app_version?: string;
  payload?: any;
  created_at: number;
}

export interface UserBranchRole {
  id: string;
  user_id: string;
  tenant_id: string;
  branch_id: string;
  industry_id: string;
  role_id: string;
}

export interface StockLedgerEntry {
  id: string;
  tenant_id: string;
  branch_id: string;
  warehouse_id?: string;
  product_id: string;
  variant_id?: string;
  movement_type: 
    | 'OPENING_STOCK' 
    | 'PURCHASE_RECEIVE' 
    | 'CUSTOMER_RETURN' 
    | 'TRANSFER_IN' 
    | 'PRODUCTION_OUTPUT' 
    | 'ADJUSTMENT_GAIN' 
    | 'SALE' 
    | 'SUPPLIER_RETURN' 
    | 'TRANSFER_OUT' 
    | 'DAMAGE' 
    | 'EXPIRY' 
    | 'ADJUSTMENT_LOSS' 
    | 'PRODUCTION_USAGE';
  reference_type?: string;
  reference_id?: string;
  quantity_before: number;
  quantity_change: number;
  quantity_after: number;
  unit_cost: number;
  total_cost: number;
  user_id: string;
  device_id?: string;
  notes?: string;
  created_at: number;
  synced: boolean;
  origin?: 'DEMO' | 'PRODUCTION' | 'IMPORTED' | 'MIGRATED';
  
  // Event Sourcing & Sync fields
  idempotency_key?: string;
  event_version?: number;
  sync_status?: 'PENDING' | 'SYNCED' | 'FAILED';
  retry_count?: number;
  last_error?: string;
  synced_at?: number;
}

export interface ProductBranchStock {
  id: string;
  tenant_id: string;
  branch_id: string;
  warehouse_id?: string;
  product_id: string;
  // Stores the variant_id string if a variant, or the sentinel 'no-variant' for simple products.
  // This sentinel is required because IndexedDB compound indices cannot handle undefined.
  variant_id: string;
  current_quantity: number;
  average_cost: number;
  stock_value: number;
  updated_at: number;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  code: string;
  description: string;
  price: number;
  currency: string;
  billing_cycle: 'monthly' | 'yearly';
  max_users: number;
  max_branches: number;
  max_products: number;
  max_storage_mb: number;
  is_trial: boolean;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

export interface TenantSubscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';
  start_date: number;
  end_date: number;
  trial_end_date?: number;
  auto_renew: boolean;
  cancelled_at?: number;
  created_at: number;
  updated_at: number;
}

export interface Invoice {
  id: string;
  tenant_id: string;
  invoice_number: string;
  amount: number;
  tax: number;
  total: number;
  status: 'UNPAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  due_date: number;
  created_at: number;
  origin?: 'DEMO' | 'PRODUCTION' | 'IMPORTED' | 'MIGRATED';
}

export interface Payment {
  id: string;
  tenant_id: string;
  subscription_id: string;
  provider: 'M-PESA' | 'AIRTEL' | 'CRDB' | 'NBC' | 'STRIPE' | 'PAYPAL';
  transaction_reference: string;
  amount: number;
  currency: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  paid_at: number;
  origin?: 'DEMO' | 'PRODUCTION' | 'IMPORTED' | 'MIGRATED';
}

export interface SubscriptionEvent {
  id: string;
  tenant_id: string;
  event_type: 'PLAN_UPGRADED' | 'PAYMENT_RECEIVED' | 'TRIAL_STARTED' | 'SUBSCRIPTION_EXPIRED' | 'FEATURE_ENABLED' | 'TRIAL_EXTENDED' | 'PLAN_DOWNGRADED' | 'SUBSCRIPTION_CANCELLED' | 'LIMIT_OVERRIDDEN' | 'COUPON_APPLIED';
  old_value: any;
  new_value: any;
  performed_by: string;
  created_at: number;
}

// Feature registry — every DukaPos capability has a code
export interface Feature {
  id: string;
  code: string;          // e.g. POS_BASIC, MULTI_BRANCH, AI_ASSISTANT
  name: string;
  module: string;        // e.g. POS, Inventory, Reports
  description: string;
  created_at: number;
}

// Links plans to features (with optional per-feature limit overrides)
export interface PlanFeature {
  id: string;
  plan_id: string;
  feature_id: string;
  enabled: boolean;
  // Optional limit overrides (JSON serialized)
  max_users?: number;
  max_products?: number;
  max_branches?: number;
  created_at: number;
}

// Tracks live usage metrics per tenant
export interface SubscriptionUsage {
  id: string;
  tenant_id: string;
  products_used: number;
  users_used: number;
  branches_used: number;
  storage_used_mb: number;
  updated_at: number;
}

// Coupon/promo codes for subscription discounts
export interface Coupon {
  id: string;
  code: string;           // e.g. DUKAPOS20
  description: string;
  discount_percent: number;
  valid_from: number;
  valid_until: number;
  max_uses: number;       // 0 = unlimited
  times_used: number;
  applicable_plans: string[];  // plan codes, empty = all plans
  is_active: boolean;
  created_at: number;
}

// ── Purchasing / SRM Module ──────────────────────────────────────────────────

export interface Supplier {
  id: string;
  supplier_code: string;        // e.g. SUP-001, auto-generated
  name: string;
  trading_name?: string;        // optional DBA / trading name
  category: string;

  // Tanzania Tax Compliance
  tin_number?: string;          // TRA Tax Identification Number
  vrn_number?: string;          // VAT Registration Number

  phone: string;
  whatsapp?: string;
  email?: string;
  country: string;              // default: Tanzania
  region?: string;              // e.g. Dar es Salaam, Arusha
  city: string;
  address?: string;

  // Payment Configuration
  preferred_currency: string;   // default: TZS
  payment_terms_days: number;   // 0 = COD, 7, 14, 30, 60
  credit_limit: number;         // maximum credit allowed
  current_balance: number;      // ledger-driven: sum(debits) - sum(credits)

  // Tanzania Mobile Money
  mpesa_number?: string;
  tigopesa_number?: string;
  airtel_money_number?: string;
  bank_account?: string;

  notes?: string;
  tenant_id: string;
  branch_id: string;
  status: 'Active' | 'Inactive' | 'Blacklisted';
  created_at: number;
  updated_at: number;
  origin?: 'DEMO' | 'PRODUCTION' | 'IMPORTED' | 'MIGRATED';
}

// Multiple contacts per supplier (Sales Manager, Accountant, Driver, Owner)
export interface SupplierContact {
  id: string;
  supplier_id: string;
  tenant_id: string;
  name: string;
  position?: string;    // e.g. 'Sales Manager', 'Accounts Officer'
  phone: string;
  email?: string;
  is_primary: boolean;
  created_at: number;
}

// Line item on a Purchase Order
export interface POItem {
  product_id: string;
  variant_id?: string;
  product_name: string;
  sku: string;
  qty_ordered: number;
  qty_received: number;
  unit_cost: number;
  total_cost: number;
}

// Full 7-stage Purchase Order lifecycle
export interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Sent' | 'Partial' | 'Completed' | 'Cancelled';
  payment_status: 'Unpaid' | 'Partial' | 'Paid';
  items: POItem[];
  subtotal: number;
  tax_amount: number;
  total: number;
  notes?: string;
  expected_delivery?: number;
  ordered_by: string;
  approved_by?: string;
  grn_id?: string;              // linked GRN once received
  tenant_id: string;
  branch_id: string;
  created_at: number;
  approved_at?: number;
  completed_at?: number;
}

// Line item on a Goods Receiving Note
export interface GRNItem {
  product_id: string;
  product_name: string;
  sku: string;
  qty_ordered: number;
  qty_received: number;   // may be < qty_ordered for partial delivery
  unit_cost: number;
  total_cost: number;
}

// Goods Receiving Note — triggers stock increase + AP ledger entry
export interface GoodsReceipt {
  id: string;
  grn_number: string;
  purchase_order_id: string;
  supplier_id: string;
  supplier_name: string;
  invoice_number?: string;      // supplier's invoice reference
  received_by: string;
  status: 'Completed' | 'Partial';
  items: GRNItem[];
  total_received_value: number;
  notes?: string;
  tenant_id: string;
  branch_id: string;
  created_at: number;
}

// Supplier Invoice (Accounts Payable bill created when GRN is saved)
export interface SupplierInvoice {
  id: string;
  invoice_number: string;       // supplier's external invoice number
  grn_id: string;
  purchase_order_id: string;
  supplier_id: string;
  supplier_name: string;
  amount: number;               // total invoice amount
  paid_amount: number;
  balance: number;
  due_date?: number;
  status: 'Unpaid' | 'Partial' | 'Paid' | 'Overdue';
  tenant_id: string;
  branch_id: string;
  created_at: number;
}

// Supplier AP Ledger — every financial movement (double-entry style)
export interface SupplierLedgerEntry {
  id: string;
  supplier_id: string;
  transaction_type: 'Invoice' | 'Payment' | 'Return' | 'Adjustment';
  debit: number;                // increases balance (e.g. new invoice)
  credit: number;               // decreases balance (e.g. payment made)
  running_balance: number;      // balance after this entry
  reference_type?: string;      // 'INVOICE' | 'PAYMENT' | 'GRN' | 'RETURN'
  reference_id?: string;
  description?: string;
  created_by?: string;
  tenant_id: string;
  branch_id: string;
  created_at: number;
}

// Supplier Payment — records how and when a supplier was paid
export interface SupplierPayment {
  id: string;
  payment_number: string;
  supplier_id: string;
  supplier_name: string;
  invoice_id?: string;          // optional: applied to a specific invoice
  amount: number;
  payment_method: 'Cash' | 'MobileMoney' | 'MPesa' | 'TigoPesa' | 'Airtel' | 'Bank' | 'Cheque';
  reference_number?: string;    // M-Pesa txn ID, bank reference, cheque number
  notes?: string;
  created_by: string;
  tenant_id: string;
  branch_id: string;
  created_at: number;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  location: string;
  manager_name: string;
  phone?: string;
  capacity_sqm?: number;
  tenant_id: string;
  branch_id: string;
  status: 'Active' | 'Inactive';
  created_at: number;
}

// ─── Batch / Lot Tracking ─────────────────────────────────────────────────────
export interface BatchLot {
  id: string;
  tenant_id: string;
  branch_id: string;
  warehouse_id?: string;
  product_id: string;
  variant_id?: string;
  batch_number: string;
  lot_number?: string;
  supplier_id?: string;
  supplier_name?: string;
  manufacturing_date?: number;
  expiry_date?: number; // Unix ms
  received_date: number;
  quantity_received: number;
  quantity_remaining: number;
  unit_cost: number;
  status: 'Active' | 'Expired' | 'Recalled' | 'Quarantine' | 'Consumed';
  notes?: string;
  created_by: string;
  created_at: number;
}

// ─── Serial Number Tracking ───────────────────────────────────────────────────
export interface SerialNumber {
  id: string;
  tenant_id: string;
  branch_id: string;
  product_id: string;
  variant_id?: string;
  serial_number: string;
  imei?: string;
  mac_address?: string;
  warranty_expires?: number;
  purchase_date?: number;
  status: 'Available' | 'Sold' | 'Returned' | 'Defective' | 'Scrapped';
  sale_id?: string;
  customer_id?: string;
  notes?: string;
  created_at: number;
}

// ─── Stock Transfer ───────────────────────────────────────────────────────────
export interface StockTransferItem {
  id: string;
  transfer_id: string;
  product_id: string;
  variant_id?: string;
  product_name: string;
  sku: string;
  qty_requested: number;
  qty_sent?: number;
  qty_received?: number;
  unit_cost: number;
  batch_id?: string;
  notes?: string;
}

export interface StockTransfer {
  id: string;
  transfer_number: string;
  tenant_id: string;
  from_branch_id: string;
  from_warehouse_id?: string;
  to_branch_id: string;
  to_warehouse_id?: string;
  status: 'Draft' | 'Pending' | 'In Transit' | 'Received' | 'Cancelled' | 'Partial';
  notes?: string;
  requested_by: string;
  approved_by?: string;
  received_by?: string;
  created_at: number;
  sent_at?: number;
  received_at?: number;
  cancelled_at?: number;
}

// ─── Physical Stock Count ─────────────────────────────────────────────────────
export interface PhysicalCountItem {
  id: string;
  count_id: string;
  product_id: string;
  variant_id?: string;
  product_name: string;
  sku: string;
  system_quantity: number;
  counted_quantity: number;
  variance: number; // counted - system (can be negative)
  unit_cost: number;
  notes?: string;
}

export interface PhysicalCount {
  id: string;
  count_number: string;
  tenant_id: string;
  branch_id: string;
  warehouse_id?: string;
  status: 'Draft' | 'Counting' | 'Pending Approval' | 'Approved' | 'Cancelled';
  total_items: number;
  variance_items: number;
  variance_value: number;
  notes?: string;
  created_by: string;
  approved_by?: string;
  created_at: number;
  approved_at?: number;
}

// ─── Reorder Rules ────────────────────────────────────────────────────────────
export interface ReorderRule {
  id: string;
  tenant_id: string;
  branch_id: string;
  product_id: string;
  variant_id?: string;
  min_quantity: number;
  max_quantity: number;
  reorder_quantity: number;
  preferred_supplier_id?: string;
  preferred_supplier_name?: string;
  lead_time_days: number;
  auto_reorder: boolean;
  is_active: boolean;
  created_at: number;
  updated_at: number;
}

// ─── Inventory Valuation Snapshot ─────────────────────────────────────────────
export interface InventoryValuation {
  id: string;
  tenant_id: string;
  branch_id: string;
  product_id: string;
  product_name: string;
  method: 'FIFO' | 'WAC' | 'STANDARD';
  quantity: number;
  unit_value: number;
  total_value: number;
  computed_at: number;
}

// ─── Expiry Alert ─────────────────────────────────────────────────────────────
export interface ExpiryAlert {
  id: string;
  tenant_id: string;
  branch_id: string;
  product_id: string;
  product_name: string;
  batch_id: string;
  batch_number: string;
  expiry_date: number;
  quantity_remaining: number;
  alert_level: 'EXPIRED' | 'TODAY' | 'WEEK' | 'MONTH';
  is_dismissed: boolean;
  // Extended pharmacy fields (optional for backward compatibility)
  days_to_expiry?: number;
  is_resolved?: boolean;
  resolved_at?: number;
  created_at: number;
}

// ─── POS Shift ────────────────────────────────────────────────────────────────
export interface PosShift {
  id: string;
  tenant_id: string;
  branch_id: string;
  cashier_id: string;
  cashier_name: string;
  status: 'OPEN' | 'CLOSED';
  opening_time: number;
  closing_time?: number;
  opening_float: number;
  cash_sales: number;
  mpesa_sales: number;
  bank_sales: number;
  cash_in: number;
  cash_out: number;
  closing_cash_actual?: number;
  notes?: string;
}

// ─── Held Cart ────────────────────────────────────────────────────────────────
export interface HeldCartItem {
  product: Product;
  variant?: ProductVariant;
  quantity: number;
  price?: number;
}
export interface HeldCart {
  id: string;
  tenant_id: string;
  branch_id: string;
  cashier_id: string;
  name: string;
  items: HeldCartItem[];
  discountPercent: number;
  selectedCustomerId?: string;
  created_at: number;
}

// ─── Bar / Pub / Lounge Module Tables (v14) ───────────────────────────────────
export interface Unit {
  id: string;
  tenant_id: string;
  name: string;
  symbol: string;
}

export interface ProductUnit {
  id: string;
  product_id: string;
  from_unit: string;
  to_unit: string;
  conversion_factor: number;
}

export interface Recipe {
  id: string;
  tenant_id: string;
  product_id: string;
  name: string;
  yield_quantity: number;
}

export interface RecipeItem {
  id: string;
  tenant_id: string;
  recipe_id: string;
  ingredient_product_id: string;
  quantity: number;
  unit: string;
}

export interface WastageLog {
  id: string;
  tenant_id: string;
  product_id: string;
  quantity: number;
  unit: string;
  reason: 'SPILL' | 'BAD POUR' | 'EXPIRED' | 'FREE TASTING' | 'DAMAGED' | 'STAFF DRINK' | 'OTHER';
  employee_id: string;
  approved_by?: string;
  timestamp: number;
  notes?: string;
}

export interface Tab {
  id: string;
  tenant_id: string;
  customer_id?: string;
  table_id?: string;
  tab_name?: string;
  tab_type?: 'TABLE' | 'CUSTOMER' | 'VIP' | 'CREDIT' | 'MOBILE';
  status: 'OPEN' | 'ORDERING' | 'BILL_REQUESTED' | 'PARTIALLY_PAID' | 'PAID' | 'CLOSED';
  opened_by: string;
  opened_at: number;
  closed_at?: number;
  items: Array<{
    product_id: string;
    variant_id?: string;
    quantity: number;
    price: number;
    notes?: string;
  }>;
  total: number;
  total_amount?: number;
}

export interface TableEntity {
  id: string;
  tenant_id: string;
  branch_id: string;
  zone_id: string;
  name: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'WAITING_PAYMENT' | 'RESERVED';
  origin?: 'DEMO' | 'PRODUCTION' | 'IMPORTED' | 'MIGRATED';
}

export interface PricingRule {
  id: string;
  tenant_id: string;
  rule_type: string;
  start_time?: string; // HH:MM
  end_time?: string;   // HH:MM
  days?: string[];     // ['Friday', 'Saturday']
  discount_percent: number;
  applicable_product_ids?: string[];
  promo_type?: 'HAPPY_HOUR' | 'BUY_X_GET_Y' | 'BUNDLE_DEAL';
  buy_qty?: number;
  get_qty?: number;
  bundle_deal_ids?: string[];
}

export interface Tip {
  id: string;
  tenant_id: string;
  employee_id: string;
  amount: number;
  transaction_id: string;
  timestamp: number;
  commission_earned?: number;
}

export interface UserSession {
  id: string;
  userId: string;
  tenantId: string;
  branchId?: string;
  refreshTokenHash: string;
  deviceId: string;
  deviceName?: string;
  ipAddress?: string;
  userAgent?: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'LOGGED_OUT';
  lastActivity: number;
  createdAt: number;
  expiresAt: number;
  revokedAt?: number;
}

export interface UserDevice {
  id: string;
  userId: string;
  tenantId: string;
  deviceId: string;
  name: string;
  platform: string;
  browser?: string;
  trusted: boolean;
  lastSeen: number;
  createdAt: number;
}

export interface OfflineSession {
  id: string;
  userId: string;
  tenantId: string;
  branchId?: string;
  permissions: string[];
  offlineAllowedUntil: number; // timestamp
  lastSync: number; // timestamp
}

export interface Expense {
  id: string;
  tenant_id: string;
  branch_id: string;
  category: string; // Rent, Salaries, Utilities, Permits, Transport, Maintenance, Packaging, Marketing, Banking, Waste, Other
  sub_category?: string;
  description?: string;
  amount: number;
  date: string; // YYYY-MM-DD
  paymentMethod: string; // Cash, M-Pesa, Bank, TigoPesa, Airtel, Cheque, Petty Cash
  payment_reference?: string; // M-Pesa ref code, Cheque #, Bank slip #
  payee_name?: string; // Vendor, Landlord, TANESCO, Employee
  status: 'Paid' | 'Pending' | 'Approved' | 'Voided';
  tax_deductible?: boolean;
  is_hq?: boolean; // HQ Corporate Overhead
  is_recurring?: boolean;
  recurring_frequency?: 'Monthly' | 'Weekly' | 'Quarterly' | 'Yearly';
  approved_by?: string;
  approved_at?: number;
  notes?: string;
  created_at: number;
  created_by: string;
  updated_at?: number;
  updated_by?: string;
  sync_status?: 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';
  origin?: 'DEMO' | 'PRODUCTION' | 'IMPORTED' | 'MIGRATED';
}

export interface BusinessProfile {
  id: string;
  tenantId: string;
  businessName: string;
  tradingName: string;
  registrationNumber: string;
  tin: string;
  vatNumber: string;
  industry: string;
  businessType: string;
  description: string;
  logoUrl: string;
  coverImage: string;
  phone: string;
  email: string;
  website: string;
  country: string;
  region: string;
  district: string;
  ward: string;
  street: string;
  postalAddress: string;
  latitude: number;
  longitude: number;
  currency: string;
  timezone: string;
  language: string;
  dateFormat: string;
  receiptFooter: string;
  receiptHeader: string;
  defaultWarehouseId: string;
  taxEnabled: boolean;
  vatRate: number;
  openingTime: string;
  closingTime: string;
  ownerId: string;
  ownerName?: string;
  subscriptionId: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  
  // Custom extra fields for social, banking, compliance, integrations, security, AI etc.
  ownerNationalId?: string;
  ownerPassportNumber?: string;
  ownerMobileNumber?: string;
  ownerEmail?: string;
  ownerPosition?: string;
  ownerPhoto?: string;
  
  themeColor?: string;
  secondaryColor?: string;
  favicon?: string;
  emailTemplate?: string;
  smsSignature?: string;
  qrCodeBranding?: string;
  invoiceTemplate?: string;
  
  bankName?: string;
  bankAccountName?: string;
  bankAccountNumber?: string;
  bankSwiftCode?: string;
  bankBranchName?: string;
  
  mpesaMerchantCode?: string;
  airtelMerchantCode?: string;
  mixxMerchantCode?: string;
  haloMerchantCode?: string;
  tigoMerchantCode?: string;
  
  socialFacebook?: string;
  socialInstagram?: string;
  socialLinkedIn?: string;
  socialX?: string;
  socialTikTok?: string;
  socialYouTube?: string;
  
  compliancePrivacyPolicy?: string;
  complianceTerms?: string;
  complianceReturns?: string;
  complianceWarranty?: string;
  complianceDataRetention?: string;
  
  integrationPaymentGateway?: string;
  integrationAccountingSystem?: string;
  integrationSmsProvider?: string;
  integrationEmailProvider?: string;
  integrationWhatsappApi?: string;
  integrationEfdDevice?: string;
  integrationBarcodeScanner?: string;
  integrationPrinter?: string;
  integrationScale?: string;
  integrationApiKeys?: Record<string, string>;
  
  licenseTrade?: string;
  licenseMedical?: string;
  licensePharmacy?: string;
  licenseFood?: string;
  licenseConstruction?: string;
  licenseTradeExpiry?: number;
  licenseMedicalExpiry?: number;
  licensePharmacyExpiry?: number;
  licenseFoodExpiry?: number;
  licenseConstructionExpiry?: number;
  
  aiPrimaryIndustry?: string;
  aiBusinessSize?: string;
  aiEmployeesCount?: number;
  aiBranchesCount?: number;
  aiDailySales?: number;
  aiPeakHours?: string;
  aiPreferredLanguage?: string;
  aiPreferredReports?: string[];
  aiAutomationPreferences?: string[];
}


export interface Category {
  id: string;
  name: string;
  description?: string;
  parent_id?: string;
  default_tax_rate?: string;
  target_margin_pct?: number;
  module?: string;
  icon?: string;
  slug?: string;
  is_active?: boolean;
  tenant_id: string;
  created_at?: number;
  updated_at?: number;
}

export interface Brand {
  id: string;
  name: string;
  description?: string;
  logo_url?: string;
  website?: string;
  is_active?: boolean;
  tenant_id: string;
  created_at?: number;
  updated_at?: number;
}

// ─── Cash Drawer Module Tables (v28) ──────────────────────────────────────────
export interface CashDrawerEntity {
  id: string;
  tenant_id: string;
  branch_id: string;
  terminal_id: string;
  name: string;
  drawer_code: string;
  type: 'DEDICATED_CASHIER' | 'DEDICATED_TERMINAL' | 'SHARED';
  status: 'OPEN' | 'CLOSED' | 'LOCKED' | 'EMERGENCY_LOCKED';
  assigned_cashier_id?: string;
  assigned_cashier_name?: string;
  current_balance: number;
  currency: string;
  max_cash_limit: number;
  created_at: number;
  updated_at: number;
}

export interface CashDrawerSession {
  id: string;
  tenant_id: string;
  branch_id: string;
  drawer_id: string;
  terminal_id: string;
  cashier_id: string;
  cashier_name: string;
  shift_type: 'Morning' | 'Afternoon' | 'Night';
  status: 'OPEN' | 'COUNTING' | 'RECONCILED' | 'CLOSED' | 'LOCKED';
  opening_float: number;
  opening_time: number;
  opening_counted_by: string;
  closing_time?: number;
  closing_counted_by?: string;
  manager_approved_by?: string;
  notes?: string;
  created_at: number;
}

export interface CashDrawerEvent {
  id: string;
  tenant_id: string;
  branch_id: string;
  drawer_id: string;
  session_id?: string;
  event_type: 'DRAWER_OPENED' | 'DRAWER_CLOSED' | 'FORCED_OPEN' | 'MANUAL_OPEN' | 'PRINTER_TRIGGER_OPEN' | 'KEY_OPEN' | 'NO_SALE_OPEN' | 'HARDWARE_ERROR' | 'COUNT_STARTED' | 'COUNT_COMPLETED' | 'LOCK_ENGAGED' | 'UNLOCKED';
  user_id: string;
  user_name: string;
  reason?: string;
  hardware_type?: 'USB' | 'RJ11' | 'BLUETOOTH' | 'ETHERNET' | 'MANUAL';
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface CashTransaction {
  id: string;
  tenant_id: string;
  branch_id: string;
  drawer_id: string;
  session_id: string;
  type: 'CASH_SALE' | 'CASH_REFUND' | 'CHANGE_GIVEN' | 'CASH_RECEIVED' | 'CASH_DEPOSIT' | 'CASH_WITHDRAWAL' | 'CASH_IN' | 'CASH_OUT' | 'PETTY_CASH' | 'SUPPLIER_PAYMENT' | 'EXPENSE_PAYMENT' | 'BANK_DEPOSIT' | 'SAFE_TRANSFER' | 'BRANCH_TRANSFER';
  amount: number;
  running_balance: number;
  user_id: string;
  user_name: string;
  terminal_id: string;
  timestamp: number;
  reason?: string;
  notes?: string;
  reference_number?: string;
  approved_by?: string;
}

export interface CashCount {
  id: string;
  tenant_id: string;
  branch_id: string;
  drawer_id: string;
  session_id: string;
  count_type: 'OPENING' | 'BLIND_CLOSING' | 'MID_SHIFT' | 'MANAGER_AUDIT';
  counted_by: string;
  manager_witness?: string;
  total_amount: number;
  is_blind: boolean;
  timestamp: number;
}

export interface CashDenomination {
  id: string;
  count_id: string;
  denomination_value: number; // 10000, 5000, 2000, 1000, 500, 200, 100, 50
  count_quantity: number;
  total_value: number;
}

export interface CashReconciliation {
  id: string;
  tenant_id: string;
  branch_id: string;
  session_id: string;
  drawer_id: string;
  opening_float: number;
  total_cash_sales: number;
  total_cash_in: number;
  total_refunds: number;
  total_expenses: number;
  total_cash_out: number;
  total_deposits: number;
  expected_cash: number;
  actual_counted_cash: number;
  variance_amount: number; // actual - expected
  variance_status: 'BALANCED' | 'SHORT' | 'OVER';
  tolerance_threshold: number;
  tolerance_status: 'ACCEPTED' | 'REQUIRES_APPROVAL' | 'REJECTED';
  manager_approved: boolean;
  approved_by?: string;
  timestamp: number;
}

export interface CashVariance {
  id: string;
  reconciliation_id: string;
  tenant_id: string;
  branch_id: string;
  cashier_id: string;
  amount: number;
  status: 'ACCEPTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'DISPUTED';
  reason?: string;
  manager_action?: string;
  timestamp: number;
}

export interface CashTransfer {
  id: string;
  tenant_id: string;
  branch_id: string;
  from_type: 'DRAWER' | 'BRANCH_SAFE' | 'BANK';
  from_id: string;
  to_type: 'DRAWER' | 'BRANCH_SAFE' | 'BANK';
  to_id: string;
  amount: number;
  deposit_number?: string;
  user_id: string;
  user_name: string;
  witness_name?: string;
  timestamp: number;
  status: 'COMPLETED' | 'PENDING' | 'CANCELLED';
}

export interface BankDeposit {
  id: string;
  tenant_id: string;
  branch_id: string;
  safe_id?: string;
  bank_name: string;
  account_number: string;
  deposit_slip_number: string;
  amount: number;
  deposited_by: string;
  witness?: string;
  timestamp: number;
  status: 'DEPOSITED' | 'CONFIRMED' | 'REJECTED';
}

export interface CashExpense {
  id: string;
  tenant_id: string;
  branch_id: string;
  drawer_id: string;
  session_id: string;
  category: string;
  description: string;
  amount: number;
  recipient: string;
  approved_by: string;
  timestamp: number;
}

export interface DrawerAssignment {
  id: string;
  tenant_id: string;
  branch_id: string;
  drawer_id: string;
  cashier_id: string;
  terminal_id: string;
  is_active: boolean;
  assigned_at: number;
  unassigned_at?: number;
}

export interface DrawerPermission {
  id: string;
  tenant_id: string;
  role: string;
  can_open_manual: boolean;
  can_override_variance: boolean;
  can_lock_emergency: boolean;
  can_reopen_session: boolean;
  max_cash_limit: number;
}

export interface DrawerAuditLog {
  id: string;
  tenant_id: string;
  branch_id: string;
  drawer_id: string;
  session_id?: string;
  user_id: string;
  user_name: string;
  action: string;
  digital_signature: string;
  ip_address?: string;
  device_info?: string;
  timestamp: number;
}

// ── Enterprise Release Management & CI/CD Tables (v31) ──────────────────────
export interface AppVersion {
  id: string;
  version: string;
  major: number;
  minor: number;
  patch: number;
  release_type: 'MAJOR' | 'MINOR' | 'PATCH';
  git_tag: string;
  commit_hash: string;
  release_notes: string;
  release_date: number;
  deployment_status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK' | 'PENDING';
  build_number: string;
  created_by: string;
  created_at: number;
}

export interface VersionChange {
  id: string;
  version_id: string;
  module: string;
  feature: string;
  change_type: 'FEATURE' | 'BUG_FIX' | 'SECURITY' | 'PERFORMANCE' | 'BREAKING';
  commit_hash: string;
  developer: string;
  created_at: number;
}

export interface DeploymentHistory {
  id: string;
  version: string;
  environment: 'PRODUCTION' | 'STAGING' | 'PRE_PROD' | 'DEV';
  deployment_start: number;
  deployment_end: number;
  duration_ms: number;
  status: 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  rollback_reason?: string;
  quality_gates_summary: Record<string, boolean>;
  created_at: number;
}

class DukaPosDatabase extends Dexie {
  products!: Table<Product>;
  productVariants!: Table<ProductVariant>;
  customers!: Table<Customer>;
  orders!: Table<Order>;
  syncQueue!: Table<SyncItem>;
  tenants!: Table<Tenant>;
  branches!: Table<Branch>;
  industries!: Table<Industry>;
  tenantIndustries!: Table<TenantIndustry>;
  users!: Table<DbUser>;
  businessProfiles!: Table<BusinessProfile>;
  userBranchRoles!: Table<UserBranchRole>;
  stockLedger!: Table<StockLedgerEntry>;
  stockBalance!: Table<ProductBranchStock>;
  syncOutbox!: Table<SyncOutboxItem>;
  tenantModules!: Table<TenantModule>;
  tenantSettings!: Table<TenantSetting>;
  appSettings!: Table<AppSetting>;
  featureFlags!: Table<FeatureFlag>;
  auditLogs!: Table<AuditLog>;
  resetCommands!: Table<ResetCommand>;
  
  subscriptionPlans!: Table<SubscriptionPlan>;
  tenantSubscriptions!: Table<TenantSubscription>;
  invoices!: Table<Invoice>;
  payments!: Table<Payment>;
  subscriptionEvents!: Table<SubscriptionEvent>;
  features!: Table<Feature>;
  planFeatures!: Table<PlanFeature>;
  subscriptionUsage!: Table<SubscriptionUsage>;
  coupons!: Table<Coupon>;

  // ── Unified Users & Roles Management Tables ───────────────────────────────
  tenantUsers!: Table<TenantUser>;
  employees!: Table<Employee>;
  roles!: Table<Role>;
  permissions!: Table<Permission>;
  rolePermissions!: Table<RolePermission>;
  tenantUserBranches!: Table<TenantUserBranch>;
  userSecurity!: Table<UserSecurity>;
  securityAuditLogs!: Table<SecurityAuditLog>;

  // ── Purchasing / SRM Module Tables ──────────────────────────────────────────
  suppliers!: Table<Supplier>;
  supplierContacts!: Table<SupplierContact>;
  purchaseOrders!: Table<PurchaseOrder>;
  goodsReceipts!: Table<GoodsReceipt>;
  supplierInvoices!: Table<SupplierInvoice>;
  supplierLedger!: Table<SupplierLedgerEntry>;
  supplierPayments!: Table<SupplierPayment>;
  warehouses!: Table<Warehouse>;

  /** Immutable ID mapping ledger (client temp ID → server permanent ID) */
  idMappingLedger!: Table<IdMappingLedger>;

  // ── New Inventory Module Tables (v12) ─────────────────────────────────────
  batchLots!: Table<BatchLot>;
  serialNumbers!: Table<SerialNumber>;
  stockTransfers!: Table<StockTransfer>;
  stockTransferItems!: Table<StockTransferItem>;
  physicalCounts!: Table<PhysicalCount>;
  physicalCountItems!: Table<PhysicalCountItem>;
  reorderRules!: Table<ReorderRule>;
  inventoryValuations!: Table<InventoryValuation>;
  expiryAlerts!: Table<ExpiryAlert>;

  // ── New POS Refinements Tables (v13) ─────────────────────────────────────
  posShifts!: Table<PosShift>;
  heldCarts!: Table<HeldCart>;

  // ── Bar / Pub / Lounge Module Tables (v14) ───────────────────────────────
  units!: Table<Unit>;
  productUnits!: Table<ProductUnit>;
  recipes!: Table<Recipe>;
  recipeItems!: Table<RecipeItem>;
  wastageLogs!: Table<WastageLog>;
  tabs!: Table<Tab>;
  barTables!: Table<TableEntity>;
  pricingRules!: Table<PricingRule>;
  tips!: Table<Tip>;
  userSessions!: Table<UserSession>;
  userDevices!: Table<UserDevice>;
  offlineSessions!: Table<OfflineSession>;
  expenses!: Table<Expense>;
  backups!: Table<TenantBackup>;
  notifications!: Table<SystemNotification>;
  categories!: Table<Category>;
  brands!: Table<Brand>;
  securityIncidents!: Table<SecurityIncident>;

  // ── Cash Drawer Module Tables (v28) ───────────────────────────────────────
  cashDrawers!: Table<CashDrawerEntity>;
  cashDrawerSessions!: Table<CashDrawerSession>;
  cashDrawerEvents!: Table<CashDrawerEvent>;
  cashTransactions!: Table<CashTransaction>;
  cashCounts!: Table<CashCount>;
  cashDenominations!: Table<CashDenomination>;
  cashReconciliations!: Table<CashReconciliation>;
  cashVariances!: Table<CashVariance>;
  cashTransfers!: Table<CashTransfer>;
  bankDeposits!: Table<BankDeposit>;
  cashExpenses!: Table<CashExpense>;
  drawerAssignments!: Table<DrawerAssignment>;
  drawerPermissions!: Table<DrawerPermission>;
  drawerAuditLogs!: Table<DrawerAuditLog>;

  // ── Enterprise Release Management Tables (v31) ────────────────────────────
  appVersions!: Table<AppVersion>;
  versionChanges!: Table<VersionChange>;
  deploymentHistory!: Table<DeploymentHistory>;

  // ── Receipt Management Module Tables (v32) ────────────────────────────────
  receipts!: Table<Receipt>;
  receiptItems!: Table<ReceiptItem>;
  receiptTemplates!: Table<ReceiptTemplate>;
  receiptPrintLogs!: Table<ReceiptPrintLog>;
  receiptShareLogs!: Table<ReceiptShareLog>;
  receiptAuditLogs!: Table<ReceiptAuditLog>;
  receiptQrCodes!: Table<ReceiptQrCode>;
  receiptSignatures!: Table<ReceiptSignature>;
  receiptNumberSequences!: Table<ReceiptNumberSequence>;

  // Fast Sync Watermark & Metadata Store (v34)
  syncMetadata!: Table<{ key: string; value: any; updatedAt: number }>;

  // ── Law Firm / Legal Practice Module Tables (v35) ───────────────────────────
  legalClients!: Table<LegalClient>;
  legalCases!: Table<LegalCase>;
  legalConflictChecks!: Table<LegalConflictCheck>;
  legalHearings!: Table<LegalHearing>;
  legalTasks!: Table<LegalTask>;
  legalDocuments!: Table<LegalDocument>;
  legalTimeEntries!: Table<LegalTimeEntry>;
  legalRetainers!: Table<LegalRetainer>;
  legalTimeline!: Table<LegalTimelineEntry>;

  // ── Pharmacy Management Module Tables (v36) ─────────────────────────────────
  pharmacyPatients!: Table<PharmacyPatient>;
  pharmacyDoctors!: Table<PharmacyDoctor>;
  medicineBatches!: Table<MedicineBatch>;
  prescriptions!: Table<Prescription>;
  prescriptionItems!: Table<PrescriptionItem>;
  dispensings!: Table<Dispensing>;
  dispensingItems!: Table<DispensingItem>;
  drugInteractions!: Table<DrugInteraction>;
  insuranceProviders!: Table<InsuranceProvider>;
  insuranceClaims!: Table<InsuranceClaim>;
  controlledDrugRegister!: Table<ControlledDrugEntry>;
  pharmacyAuditLogs!: Table<PharmacyAuditLog>;
  documentAttachments!: Table<DocumentAttachment>;
  farms!: Table<Farm>;
  farmHouses!: Table<FarmHouse>;
  birdBatches!: Table<BirdBatch>;
  livestockAnimals!: Table<LivestockAnimal>;
  livestockBreeds!: Table<LivestockBreed>;
  feedItems!: Table<FeedItem>;
  feedConsumptions!: Table<FeedConsumption>;
  waterConsumptions!: Table<WaterConsumption>;
  vaccinationRecords!: Table<VaccinationRecord>;
  livestockHealthRecords!: Table<LivestockHealthRecord>;
  veterinaryVisits!: Table<VeterinaryVisit>;
  breedingRecords!: Table<BreedingRecord>;
  hatcheryIncubators!: Table<HatcheryIncubator>;
  hatchCycles!: Table<HatchCycle>;
  eggProductions!: Table<EggProduction>;
  milkProductions!: Table<MilkProduction>;
  weightRecords!: Table<WeightRecord>;
  livestockTasks!: Table<LivestockTask>;

  constructor() {
    super('DukaPosDatabase');

    // Version migration chain — Dexie requires all prior versions to be declared
    // even if no schema changes are needed, so that upgrades work from any starting point.
    this.version(1).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
    });

    this.version(2).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status',
      branches: 'id, tenant_id, name, location',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, industry_id, role_id',
    });

    this.version(3).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status',
      branches: 'id, tenant_id, name, location',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, industry_id, role_id',
    });

    // Version 4: Added stockLedger and stockBalance tables for immutable ledger architecture
    this.version(4).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status',
      branches: 'id, tenant_id, name, location',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, industry_id, role_id',
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at',
      stockBalance: 'id, tenant_id, branch_id, product_id, variant_id, [branch_id+product_id+variant_id]'
    });

    // Version 5: Added tenantModules, tenantSettings, featureFlags, auditLogs for full SaaS Tenant Management
    this.version(5).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status, plan',
      branches: 'id, tenant_id, name, location, is_headquarters',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, industry_id, role_id',
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at',
      stockBalance: 'id, tenant_id, branch_id, product_id, variant_id, [branch_id+product_id+variant_id]',
      tenantModules: 'id, tenant_id, module_key, enabled',
      tenantSettings: 'id, tenant_id, setting_key',
      featureFlags: 'id, tenant_id, feature_key, enabled',
      auditLogs: 'id, tenant_id, user_id, entity, created_at'
    });

    // Version 6: Added subscription tables for full client-side SaaS subscription enforcement
    this.version(6).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status, plan',
      branches: 'id, tenant_id, name, location, is_headquarters',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, industry_id, role_id',
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at',
      stockBalance: 'id, tenant_id, branch_id, product_id, variant_id, [branch_id+product_id+variant_id]',
      tenantModules: 'id, tenant_id, module_key, enabled',
      tenantSettings: 'id, tenant_id, setting_key',
      featureFlags: 'id, tenant_id, feature_key, enabled',
      auditLogs: 'id, tenant_id, user_id, entity, created_at',
      
      subscriptionPlans: 'id, name, code, is_active',
      tenantSubscriptions: 'id, tenant_id, plan_id, status',
      invoices: 'id, tenant_id, invoice_number, status',
      payments: 'id, tenant_id, subscription_id, transaction_reference, status',
      subscriptionEvents: 'id, tenant_id, event_type, created_at'
    });

    // Version 7: Added Feature registry, PlanFeatures mapping, SubscriptionUsage tracking, Coupons
    this.version(7).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status, plan',
      branches: 'id, tenant_id, name, location, is_headquarters',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, industry_id, role_id',
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at',
      stockBalance: 'id, tenant_id, branch_id, product_id, variant_id, [branch_id+product_id+variant_id]',
      tenantModules: 'id, tenant_id, module_key, enabled',
      tenantSettings: 'id, tenant_id, setting_key',
      featureFlags: 'id, tenant_id, feature_key, enabled',
      auditLogs: 'id, tenant_id, user_id, entity, created_at',
      subscriptionPlans: 'id, name, code, is_active',
      tenantSubscriptions: 'id, tenant_id, plan_id, status',
      invoices: 'id, tenant_id, invoice_number, status',
      payments: 'id, tenant_id, subscription_id, transaction_reference, status',
      subscriptionEvents: 'id, tenant_id, event_type, created_at',
      features: 'id, code, module',
      planFeatures: 'id, plan_id, feature_id',
      subscriptionUsage: 'id, tenant_id',
      coupons: 'id, code, is_active'
    });

    // Version 8: Unified Users & Roles Management system
    this.version(8).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status, plan',
      branches: 'id, tenant_id, name, location, is_headquarters',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin, tenant_id, username',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, industry_id, role_id',
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at',
      stockBalance: 'id, tenant_id, branch_id, product_id, variant_id, [branch_id+product_id+variant_id]',
      tenantModules: 'id, tenant_id, module_key, enabled',
      tenantSettings: 'id, tenant_id, setting_key',
      featureFlags: 'id, tenant_id, feature_key, enabled',
      auditLogs: 'id, tenant_id, user_id, entity, created_at',
      subscriptionPlans: 'id, name, code, is_active',
      tenantSubscriptions: 'id, tenant_id, plan_id, status',
      invoices: 'id, tenant_id, invoice_number, status',
      payments: 'id, tenant_id, subscription_id, transaction_reference, status',
      subscriptionEvents: 'id, tenant_id, event_type, created_at',
      features: 'id, code, module',
      planFeatures: 'id, plan_id, feature_id',
      subscriptionUsage: 'id, tenant_id',
      coupons: 'id, code, is_active',
      
      // New tables:
      tenantUsers: 'id, tenant_id, user_id, status',
      employees: 'id, tenant_id, user_id, employee_number',
      roles: 'id, tenant_id, slug, is_system_role',
      permissions: 'id, module, slug',
      rolePermissions: 'id, role_id, permission_id, [role_id+permission_id]',
      tenantUserBranches: 'id, tenant_id, user_id, branch_id, role_id',
      userSecurity: 'user_id',
      securityAuditLogs: 'id, tenant_id, branch_id, user_id, action, created_at'
    });

    // Version 9: Purchasing module — suppliers, purchaseOrders, warehouses
    this.version(9).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status, plan',
      branches: 'id, tenant_id, name, location, is_headquarters',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin, tenant_id, username',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, industry_id, role_id',
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at',
      stockBalance: 'id, tenant_id, branch_id, product_id, variant_id, [branch_id+product_id+variant_id]',
      tenantModules: 'id, tenant_id, module_key, enabled',
      tenantSettings: 'id, tenant_id, setting_key',
      featureFlags: 'id, tenant_id, feature_key, enabled',
      auditLogs: 'id, tenant_id, user_id, entity, created_at',
      subscriptionPlans: 'id, name, code, is_active',
      tenantSubscriptions: 'id, tenant_id, plan_id, status',
      invoices: 'id, tenant_id, invoice_number, status',
      payments: 'id, tenant_id, subscription_id, transaction_reference, status',
      subscriptionEvents: 'id, tenant_id, event_type, created_at',
      features: 'id, code, module',
      planFeatures: 'id, plan_id, feature_id',
      subscriptionUsage: 'id, tenant_id',
      coupons: 'id, code, is_active',
      tenantUsers: 'id, tenant_id, user_id, status',
      employees: 'id, tenant_id, user_id, employee_number',
      roles: 'id, tenant_id, slug, is_system_role',
      permissions: 'id, module, slug',
      rolePermissions: 'id, role_id, permission_id, [role_id+permission_id]',
      tenantUserBranches: 'id, tenant_id, user_id, branch_id, role_id',
      userSecurity: 'user_id',
      securityAuditLogs: 'id, tenant_id, branch_id, user_id, action, created_at',
      // New purchasing tables:
      suppliers: 'id, tenant_id, branch_id, status, category, created_at',
      purchaseOrders: 'id, tenant_id, branch_id, supplier_id, po_number, status, created_at',
      warehouses: 'id, tenant_id, branch_id, code, status'
    });

    // Version 10: Upgraded SRM/Purchasing module with detailed ledger and compliance
    this.version(10).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status, plan',
      branches: 'id, tenant_id, name, location, is_headquarters',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin, tenant_id, username',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, industry_id, role_id',
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at',
      stockBalance: 'id, tenant_id, branch_id, product_id, variant_id, [branch_id+product_id+variant_id]',
      tenantModules: 'id, tenant_id, module_key, enabled',
      tenantSettings: 'id, tenant_id, setting_key',
      featureFlags: 'id, tenant_id, feature_key, enabled',
      auditLogs: 'id, tenant_id, user_id, entity, created_at',
      subscriptionPlans: 'id, name, code, is_active',
      tenantSubscriptions: 'id, tenant_id, plan_id, status',
      invoices: 'id, tenant_id, invoice_number, status',
      payments: 'id, tenant_id, subscription_id, transaction_reference, status',
      subscriptionEvents: 'id, tenant_id, event_type, created_at',
      features: 'id, code, module',
      planFeatures: 'id, plan_id, feature_id',
      subscriptionUsage: 'id, tenant_id',
      coupons: 'id, code, is_active',
      tenantUsers: 'id, tenant_id, user_id, status',
      employees: 'id, tenant_id, user_id, employee_number',
      roles: 'id, tenant_id, slug, is_system_role',
      permissions: 'id, module, slug',
      rolePermissions: 'id, role_id, permission_id, [role_id+permission_id]',
      tenantUserBranches: 'id, tenant_id, user_id, branch_id, role_id',
      userSecurity: 'user_id',
      securityAuditLogs: 'id, tenant_id, branch_id, user_id, action, created_at',

      // Upgraded Purchasing/SRM Module Tables
      suppliers: 'id, tenant_id, branch_id, status, category, supplier_code, created_at',
      supplierContacts: 'id, supplier_id, tenant_id, is_primary',
      purchaseOrders: 'id, tenant_id, branch_id, supplier_id, po_number, status, payment_status, created_at',
      goodsReceipts: 'id, tenant_id, branch_id, purchase_order_id, supplier_id, grn_number, created_at',
      supplierInvoices: 'id, tenant_id, branch_id, supplier_id, grn_id, status, due_date',
      supplierLedger: 'id, tenant_id, supplier_id, transaction_type, created_at',
      supplierPayments: 'id, tenant_id, branch_id, supplier_id, payment_method, created_at',
      warehouses: 'id, tenant_id, branch_id, code, status'
    });

    // Version 11: ID Mapping Ledger — tracks client temp ID → server permanent ID
    // for safe post-sync reconciliation without data loss.
    this.version(11).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants, syncStatus, isSynced',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id, syncStatus, isSynced',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status, plan',
      branches: 'id, tenant_id, name, location, is_headquarters',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin, tenant_id, username',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, industry_id, role_id',
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at',
      stockBalance: 'id, tenant_id, branch_id, product_id, variant_id, [branch_id+product_id+variant_id]',
      tenantModules: 'id, tenant_id, module_key, enabled',
      tenantSettings: 'id, tenant_id, setting_key',
      featureFlags: 'id, tenant_id, feature_key, enabled',
      auditLogs: 'id, tenant_id, user_id, entity, created_at',
      subscriptionPlans: 'id, name, code, is_active',
      tenantSubscriptions: 'id, tenant_id, plan_id, status',
      invoices: 'id, tenant_id, invoice_number, status',
      payments: 'id, tenant_id, subscription_id, transaction_reference, status',
      subscriptionEvents: 'id, tenant_id, event_type, created_at',
      features: 'id, code, module',
      planFeatures: 'id, plan_id, feature_id',
      subscriptionUsage: 'id, tenant_id',
      coupons: 'id, code, is_active',
      tenantUsers: 'id, tenant_id, user_id, status',
      employees: 'id, tenant_id, user_id, employee_number',
      roles: 'id, tenant_id, slug, is_system_role',
      permissions: 'id, module, slug',
      rolePermissions: 'id, role_id, permission_id, [role_id+permission_id]',
      tenantUserBranches: 'id, tenant_id, user_id, branch_id, role_id',
      userSecurity: 'user_id',
      securityAuditLogs: 'id, tenant_id, branch_id, user_id, action, created_at',
      suppliers: 'id, tenant_id, branch_id, status, category, supplier_code, created_at',
      supplierContacts: 'id, supplier_id, tenant_id, is_primary',
      purchaseOrders: 'id, tenant_id, branch_id, supplier_id, po_number, status, payment_status, created_at',
      goodsReceipts: 'id, tenant_id, branch_id, purchase_order_id, supplier_id, grn_number, created_at',
      supplierInvoices: 'id, tenant_id, branch_id, supplier_id, grn_id, status, due_date',
      supplierLedger: 'id, tenant_id, supplier_id, transaction_type, created_at',
      supplierPayments: 'id, tenant_id, branch_id, supplier_id, payment_method, created_at',
      warehouses: 'id, tenant_id, branch_id, code, status',
      // New: ID mapping ledger
      idMappingLedger: '++id, clientId, serverId, entityName, tenantId, reconciled, createdAt'
    });

    // Version 12: Full Inventory Module — Batch/Lot, Serial Numbers, Transfers,
    // Physical Count, Reorder Rules, Valuation Snapshots, Expiry Alerts
    this.version(12).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants, syncStatus, isSynced',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id, syncStatus, isSynced',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status, plan',
      branches: 'id, tenant_id, name, location, is_headquarters',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin, tenant_id, username',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, industry_id, role_id',
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at',
      stockBalance: 'id, tenant_id, branch_id, product_id, variant_id, [branch_id+product_id+variant_id]',
      tenantModules: 'id, tenant_id, module_key, enabled',
      tenantSettings: 'id, tenant_id, setting_key',
      featureFlags: 'id, tenant_id, feature_key, enabled',
      auditLogs: 'id, tenant_id, user_id, entity, created_at',
      subscriptionPlans: 'id, name, code, is_active',
      tenantSubscriptions: 'id, tenant_id, plan_id, status',
      invoices: 'id, tenant_id, invoice_number, status',
      payments: 'id, tenant_id, subscription_id, transaction_reference, status',
      subscriptionEvents: 'id, tenant_id, event_type, created_at',
      features: 'id, code, module',
      planFeatures: 'id, plan_id, feature_id',
      subscriptionUsage: 'id, tenant_id',
      coupons: 'id, code, is_active',
      tenantUsers: 'id, tenant_id, user_id, status',
      employees: 'id, tenant_id, user_id, employee_number',
      roles: 'id, tenant_id, slug, is_system_role',
      permissions: 'id, module, slug',
      rolePermissions: 'id, role_id, permission_id, [role_id+permission_id]',
      tenantUserBranches: 'id, tenant_id, user_id, branch_id, role_id',
      userSecurity: 'user_id',
      securityAuditLogs: 'id, tenant_id, branch_id, user_id, action, created_at',
      suppliers: 'id, tenant_id, branch_id, status, category, supplier_code, created_at',
      supplierContacts: 'id, supplier_id, tenant_id, is_primary',
      purchaseOrders: 'id, tenant_id, branch_id, supplier_id, po_number, status, payment_status, created_at',
      goodsReceipts: 'id, tenant_id, branch_id, purchase_order_id, supplier_id, grn_number, created_at',
      supplierInvoices: 'id, tenant_id, branch_id, supplier_id, grn_id, status, due_date',
      supplierLedger: 'id, tenant_id, supplier_id, transaction_type, created_at',
      supplierPayments: 'id, tenant_id, branch_id, supplier_id, payment_method, created_at',
      warehouses: 'id, tenant_id, branch_id, code, status',
      idMappingLedger: '++id, clientId, serverId, entityName, tenantId, reconciled, createdAt',
      // New v12 inventory tables
      batchLots: 'id, tenant_id, branch_id, product_id, variant_id, batch_number, expiry_date, status, created_at',
      serialNumbers: 'id, tenant_id, branch_id, product_id, variant_id, serial_number, status',
      stockTransfers: 'id, tenant_id, from_branch_id, to_branch_id, status, transfer_number, created_at',
      stockTransferItems: 'id, transfer_id, product_id, variant_id',
      physicalCounts: 'id, tenant_id, branch_id, warehouse_id, status, count_number, created_at',
      physicalCountItems: 'id, count_id, product_id, variant_id',
      reorderRules: 'id, tenant_id, branch_id, product_id, variant_id, is_active',
      inventoryValuations: 'id, tenant_id, branch_id, product_id, method, computed_at',
      expiryAlerts: 'id, tenant_id, branch_id, product_id, batch_id, expiry_date, alert_level, is_dismissed'
    });

    // Version 13: POS Refinement (Shifts and Held Carts)
    this.version(13).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants, syncStatus, isSynced',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id, syncStatus, isSynced',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status, plan',
      branches: 'id, tenant_id, name, location, is_headquarters',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin, tenant_id, username',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, industry_id, role_id',
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at',
      stockBalance: 'id, tenant_id, branch_id, product_id, variant_id, [branch_id+product_id+variant_id]',
      tenantModules: 'id, tenant_id, module_key, enabled',
      tenantSettings: 'id, tenant_id, setting_key',
      featureFlags: 'id, tenant_id, feature_key, enabled',
      auditLogs: 'id, tenant_id, user_id, entity, created_at',
      subscriptionPlans: 'id, name, code, is_active',
      tenantSubscriptions: 'id, tenant_id, plan_id, status',
      invoices: 'id, tenant_id, invoice_number, status',
      payments: 'id, tenant_id, subscription_id, transaction_reference, status',
      subscriptionEvents: 'id, tenant_id, event_type, created_at',
      features: 'id, code, module',
      planFeatures: 'id, plan_id, feature_id',
      subscriptionUsage: 'id, tenant_id',
      coupons: 'id, code, is_active',
      tenantUsers: 'id, tenant_id, user_id, status',
      employees: 'id, tenant_id, user_id, employee_number',
      roles: 'id, tenant_id, slug, is_system_role',
      permissions: 'id, module, slug',
      rolePermissions: 'id, role_id, permission_id, [role_id+permission_id]',
      tenantUserBranches: 'id, tenant_id, user_id, branch_id, role_id',
      userSecurity: 'user_id',
      securityAuditLogs: 'id, tenant_id, branch_id, user_id, action, created_at',
      suppliers: 'id, tenant_id, branch_id, status, category, supplier_code, created_at',
      supplierContacts: 'id, supplier_id, tenant_id, is_primary',
      purchaseOrders: 'id, tenant_id, branch_id, supplier_id, po_number, status, payment_status, created_at',
      goodsReceipts: 'id, tenant_id, branch_id, purchase_order_id, supplier_id, grn_number, created_at',
      supplierInvoices: 'id, tenant_id, branch_id, supplier_id, grn_id, status, due_date',
      supplierLedger: 'id, tenant_id, supplier_id, transaction_type, created_at',
      supplierPayments: 'id, tenant_id, branch_id, supplier_id, payment_method, created_at',
      warehouses: 'id, tenant_id, branch_id, code, status',
      idMappingLedger: '++id, clientId, serverId, entityName, tenantId, reconciled, createdAt',
      batchLots: 'id, tenant_id, branch_id, product_id, variant_id, batch_number, expiry_date, status, created_at',
      serialNumbers: 'id, tenant_id, branch_id, product_id, variant_id, serial_number, status',
      stockTransfers: 'id, tenant_id, from_branch_id, to_branch_id, status, transfer_number, created_at',
      stockTransferItems: 'id, transfer_id, product_id, variant_id',
      physicalCounts: 'id, tenant_id, branch_id, warehouse_id, status, count_number, created_at',
      physicalCountItems: 'id, count_id, product_id, variant_id',
      reorderRules: 'id, tenant_id, branch_id, product_id, variant_id, is_active',
      inventoryValuations: 'id, tenant_id, branch_id, product_id, method, computed_at',
      expiryAlerts: 'id, tenant_id, branch_id, product_id, batch_id, expiry_date, alert_level, is_dismissed',
      posShifts: 'id, tenant_id, branch_id, cashier_id, status, opening_time',
      heldCarts: 'id, tenant_id, branch_id, cashier_id, name, created_at'
    });

    // Version 14: Bar & Beverage Lounge Module Tables
    this.version(14).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants, syncStatus, isSynced',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id, syncStatus, isSynced',
      customers: 'id, name, phone, type, tenant_id, branch_id',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status, plan',
      branches: 'id, tenant_id, name, location, is_headquarters',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin, tenant_id, username',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, industry_id, role_id',
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at',
      stockBalance: 'id, tenant_id, branch_id, product_id, variant_id, [branch_id+product_id+variant_id]',
      tenantModules: 'id, tenant_id, module_key, enabled',
      tenantSettings: 'id, tenant_id, setting_key',
      featureFlags: 'id, tenant_id, feature_key, enabled',
      auditLogs: 'id, tenant_id, user_id, entity, created_at',
      subscriptionPlans: 'id, name, code, is_active',
      tenantSubscriptions: 'id, tenant_id, plan_id, status',
      invoices: 'id, tenant_id, invoice_number, status',
      payments: 'id, tenant_id, subscription_id, transaction_reference, status',
      subscriptionEvents: 'id, tenant_id, event_type, created_at',
      features: 'id, code, module',
      planFeatures: 'id, plan_id, feature_id',
      subscriptionUsage: 'id, tenant_id',
      coupons: 'id, code, is_active',
      tenantUsers: 'id, tenant_id, user_id, status',
      employees: 'id, tenant_id, user_id, employee_number',
      roles: 'id, tenant_id, slug, is_system_role',
      permissions: 'id, module, slug',
      rolePermissions: 'id, role_id, permission_id, [role_id+permission_id]',
      tenantUserBranches: 'id, tenant_id, user_id, branch_id, role_id',
      userSecurity: 'user_id',
      securityAuditLogs: 'id, tenant_id, branch_id, user_id, action, created_at',
      suppliers: 'id, tenant_id, branch_id, status, category, supplier_code, created_at',
      supplierContacts: 'id, supplier_id, tenant_id, is_primary',
      purchaseOrders: 'id, tenant_id, branch_id, supplier_id, po_number, status, payment_status, created_at',
      goodsReceipts: 'id, tenant_id, branch_id, purchase_order_id, supplier_id, grn_number, created_at',
      supplierInvoices: 'id, tenant_id, branch_id, supplier_id, grn_id, status, due_date',
      supplierLedger: 'id, tenant_id, supplier_id, transaction_type, created_at',
      supplierPayments: 'id, tenant_id, branch_id, supplier_id, payment_method, created_at',
      warehouses: 'id, tenant_id, branch_id, code, status',
      idMappingLedger: '++id, clientId, serverId, entityName, tenantId, reconciled, createdAt',
      batchLots: 'id, tenant_id, branch_id, product_id, variant_id, batch_number, expiry_date, status, created_at',
      serialNumbers: 'id, tenant_id, branch_id, product_id, variant_id, serial_number, status',
      stockTransfers: 'id, tenant_id, from_branch_id, to_branch_id, status, transfer_number, created_at',
      stockTransferItems: 'id, transfer_id, product_id, variant_id',
      physicalCounts: 'id, tenant_id, branch_id, warehouse_id, status, count_number, created_at',
      physicalCountItems: 'id, count_id, product_id, variant_id',
      reorderRules: 'id, tenant_id, branch_id, product_id, variant_id, is_active',
      inventoryValuations: 'id, tenant_id, branch_id, product_id, method, computed_at',
      expiryAlerts: 'id, tenant_id, branch_id, product_id, batch_id, expiry_date, alert_level, is_dismissed',
      posShifts: 'id, tenant_id, branch_id, cashier_id, status, opening_time',
      heldCarts: 'id, tenant_id, branch_id, cashier_id, name, created_at',
      // Bar module new stores
      units: 'id, tenant_id, name, symbol',
      productUnits: 'id, product_id, from_unit, to_unit',
      recipes: 'id, tenant_id, product_id, name',
      recipeItems: 'id, recipe_id, ingredient_product_id',
      wastageLogs: 'id, tenant_id, product_id, timestamp, reason',
      tabs: 'id, tenant_id, customer_id, table_id, status, opened_at',
      barTables: 'id, tenant_id, branch_id, zone_id, status',
      pricingRules: 'id, tenant_id, rule_type',
      tips: 'id, employee_id, transaction_id'
    });

    // Version 15: Demo Data Origin Tracking & Reset Command tables
    this.version(15).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants, syncStatus, isSynced, origin',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id, syncStatus, isSynced, origin',
      customers: 'id, name, phone, type, tenant_id, branch_id, origin',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id, origin',
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at, origin',
      invoices: 'id, tenant_id, invoice_number, status, origin',
      payments: 'id, tenant_id, subscription_id, transaction_reference, status, origin',
      suppliers: 'id, tenant_id, branch_id, status, category, supplier_code, created_at, origin',
      purchaseOrders: 'id, tenant_id, branch_id, supplier_id, po_number, status, payment_status, created_at, origin',
      barTables: 'id, tenant_id, branch_id, zone_id, status, origin',
      resetCommands: 'id, tenant_id, status, requested_by, created_at'
    });

    this.version(16).stores({
      userSessions: 'id, userId, tenantId, status, expiresAt',
      userDevices: 'id, userId, tenantId, deviceId',
      offlineSessions: 'id, userId, tenantId, offlineAllowedUntil'
    });

    this.version(17).stores({
      expenses: 'id, tenant_id, branch_id, category, amount, status, date, created_at, origin'
    });

    // v18: Add refreshTokenHash index to userSessions — required by sessionService.ts
    // .where('refreshTokenHash') queries were throwing "KeyPath not indexed" errors
    // causing users to be thrown out of their active session unexpectedly.
    this.version(18).stores({
      userSessions: 'id, userId, tenantId, status, expiresAt, refreshTokenHash'
    });

    this.version(19).stores({
      appSettings: 'id, tenantId, namespace, branchId, userId, [tenantId+namespace], [tenantId+branchId+userId+namespace]'
    });

    this.version(20).stores({
      businessProfiles: 'id, tenantId, tin, status'
    });

    this.version(21).stores({
      recipeItems: 'id, tenant_id, recipe_id, ingredient_product_id',
      tips: 'id, tenant_id, employee_id, transaction_id'
    });

    this.version(22).stores({
      backups: 'id, tenant_id, type, status, created_at',
      notifications: 'id, tenant_id, channel, target_scope, status, sent_at',
      securityIncidents: 'id, tenant_id, type, severity, status, created_at'
    });

    this.version(23).stores({
      categories: 'id, tenant_id, name, parent_id',
      brands: 'id, tenant_id, name'
    });

    this.version(24).stores({
      userBranchRoles: 'id, user_id, tenant_id, branch_id, [user_id+tenant_id+branch_id]',
      tenantUsers: 'id, tenant_id, user_id, status',
      tenantUserBranches: 'id, tenant_id, user_id, branch_id'
    });

    this.version(25).stores({
      tenants: 'id, name, slug, status, plan, business_code, tenant_uuid, email, phone'
    });

    this.version(26).stores({
      users: 'id, email, is_super_admin, tenant_id, username, created_at, registration_source, verification_status'
    });

    // Version 27: Unified Complete Schema consolidation ensuring all 74 object stores exist in IndexedDB
    this.version(27).stores({
      products: 'id, name, category, module, tenant_id, branch_id, hasVariants, syncStatus, isSynced, origin',
      productVariants: 'id, productId, sku, barcode, tenant_id, branch_id, syncStatus, isSynced, origin',
      customers: 'id, name, phone, type, tenant_id, branch_id, origin',
      orders: 'id, timestamp, syncStatus, module, tenant_id, branch_id, origin',
      syncQueue: '++id, entityName, actionType, status, timestamp',
      tenants: 'id, name, slug, status, plan, business_code, tenant_uuid, email, phone',
      branches: 'id, tenant_id, name, location, is_headquarters',
      industries: 'id, name',
      tenantIndustries: '[tenant_id+industry_id], tenant_id, industry_id',
      users: 'id, email, is_super_admin, tenant_id, username, created_at, registration_source, verification_status',
      businessProfiles: 'id, tenantId, tin, status',
      userBranchRoles: 'id, user_id, tenant_id, branch_id, [user_id+tenant_id+branch_id], industry_id, role_id',
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at, origin',
      stockBalance: 'id, tenant_id, branch_id, product_id, variant_id, [branch_id+product_id+variant_id]',
      tenantModules: 'id, tenant_id, module_key, enabled',
      tenantSettings: 'id, tenant_id, setting_key',
      appSettings: 'id, tenantId, namespace, branchId, userId, [tenantId+namespace], [tenantId+branchId+userId+namespace]',
      featureFlags: 'id, tenant_id, feature_key, enabled',
      auditLogs: 'id, tenant_id, user_id, entity, created_at',
      subscriptionPlans: 'id, name, code, is_active',
      tenantSubscriptions: 'id, tenant_id, plan_id, status',
      invoices: 'id, tenant_id, invoice_number, status, origin',
      payments: 'id, tenant_id, subscription_id, transaction_reference, status, origin',
      subscriptionEvents: 'id, tenant_id, event_type, created_at',
      features: 'id, code, module',
      planFeatures: 'id, plan_id, feature_id',
      subscriptionUsage: 'id, tenant_id',
      coupons: 'id, code, is_active',
      tenantUsers: 'id, tenant_id, user_id, status',
      employees: 'id, tenant_id, user_id, employee_number',
      roles: 'id, tenant_id, slug, is_system_role',
      permissions: 'id, module, slug',
      rolePermissions: 'id, role_id, permission_id, [role_id+permission_id]',
      tenantUserBranches: 'id, tenant_id, user_id, branch_id',
      userSecurity: 'user_id',
      securityAuditLogs: 'id, tenant_id, branch_id, user_id, action, created_at',
      suppliers: 'id, tenant_id, branch_id, status, category, supplier_code, created_at, origin',
      supplierContacts: 'id, supplier_id, tenant_id, is_primary',
      purchaseOrders: 'id, tenant_id, branch_id, supplier_id, po_number, status, payment_status, created_at, origin',
      goodsReceipts: 'id, tenant_id, branch_id, purchase_order_id, supplier_id, grn_number, created_at',
      supplierInvoices: 'id, tenant_id, branch_id, supplier_id, grn_id, status, due_date',
      supplierLedger: 'id, tenant_id, supplier_id, transaction_type, created_at',
      supplierPayments: 'id, tenant_id, branch_id, supplier_id, payment_method, created_at',
      warehouses: 'id, tenant_id, branch_id, code, status',
      idMappingLedger: '++id, clientId, serverId, entityName, tenantId, reconciled, createdAt',
      batchLots: 'id, tenant_id, branch_id, product_id, variant_id, batch_number, expiry_date, status, created_at',
      serialNumbers: 'id, tenant_id, branch_id, product_id, variant_id, serial_number, status',
      stockTransfers: 'id, tenant_id, from_branch_id, to_branch_id, status, transfer_number, created_at',
      stockTransferItems: 'id, transfer_id, product_id, variant_id',
      physicalCounts: 'id, tenant_id, branch_id, warehouse_id, status, count_number, created_at',
      physicalCountItems: 'id, count_id, product_id, variant_id',
      reorderRules: 'id, tenant_id, branch_id, product_id, variant_id, is_active',
      inventoryValuations: 'id, tenant_id, branch_id, product_id, method, computed_at',
      expiryAlerts: 'id, tenant_id, branch_id, product_id, batch_id, expiry_date, alert_level, is_dismissed',
      posShifts: 'id, tenant_id, branch_id, cashier_id, status, opening_time',
      heldCarts: 'id, tenant_id, branch_id, cashier_id, name, created_at',
      units: 'id, tenant_id, name, symbol',
      productUnits: 'id, product_id, from_unit, to_unit',
      recipes: 'id, tenant_id, product_id, name',
      recipeItems: 'id, tenant_id, recipe_id, ingredient_product_id',
      wastageLogs: 'id, tenant_id, product_id, timestamp, reason',
      tabs: 'id, tenant_id, customer_id, table_id, status, opened_at',
      barTables: 'id, tenant_id, branch_id, zone_id, status, origin',
      pricingRules: 'id, tenant_id, rule_type',
      tips: 'id, tenant_id, employee_id, transaction_id',
      resetCommands: 'id, tenant_id, status, requested_by, created_at',
      userSessions: 'id, userId, tenantId, status, expiresAt, refreshTokenHash',
      userDevices: 'id, userId, tenantId, deviceId',
      offlineSessions: 'id, userId, tenantId, offlineAllowedUntil',
      expenses: 'id, tenant_id, branch_id, category, amount, status, date, created_at, origin',
      backups: 'id, tenant_id, type, status, created_at',
      notifications: 'id, tenant_id, channel, target_scope, status, sent_at',
      securityIncidents: 'id, tenant_id, type, severity, status, created_at',
      categories: 'id, tenant_id, name, parent_id',
      brands: 'id, tenant_id, name'
    });

    // Version 28: Cash Drawer Module Schema
    this.version(28).stores({
      cashDrawers: 'id, tenant_id, branch_id, terminal_id, status, assigned_cashier_id',
      cashDrawerSessions: 'id, tenant_id, branch_id, drawer_id, cashier_id, status, opening_time',
      cashDrawerEvents: 'id, tenant_id, branch_id, drawer_id, session_id, event_type, timestamp',
      cashTransactions: 'id, tenant_id, branch_id, drawer_id, session_id, type, user_id, timestamp',
      cashCounts: 'id, tenant_id, branch_id, drawer_id, session_id, count_type, timestamp',
      cashDenominations: 'id, count_id, denomination_value',
      cashReconciliations: 'id, tenant_id, branch_id, session_id, drawer_id, variance_status, timestamp',
      cashVariances: 'id, reconciliation_id, tenant_id, branch_id, cashier_id, status, timestamp',
      cashTransfers: 'id, tenant_id, branch_id, from_id, to_id, status, timestamp',
      bankDeposits: 'id, tenant_id, branch_id, safe_id, deposit_slip_number, status, timestamp',
      cashExpenses: 'id, tenant_id, branch_id, drawer_id, session_id, category, timestamp',
      drawerAssignments: 'id, tenant_id, branch_id, drawer_id, cashier_id, is_active',
      drawerPermissions: 'id, tenant_id, role',
      drawerAuditLogs: 'id, tenant_id, branch_id, drawer_id, session_id, user_id, timestamp'
    });

    // Version 29: Event-Driven Stock Ledger Sync Engine Schema
    this.version(29).stores({
      stockLedger: 'id, tenant_id, branch_id, product_id, variant_id, movement_type, created_at, origin, idempotency_key, [tenant_id+branch_id+sync_status], event_version'
    });

    // Version 30: Production-Grade Event-Driven Persistent Sync Queue Schema
    this.version(30).stores({
      syncQueue: '++id, tenant_id, branch_id, entity, entity_id, operation, status, priority, created_at, last_attempt, sync_token, device_id, user_id, actionType, entityName, timestamp'
    });

    // Version 31: Enterprise Release Management & Versioning Schema
    this.version(31).stores({
      appVersions: 'id, version, major, minor, patch, release_type, git_tag, commit_hash, deployment_status, release_date',
      versionChanges: 'id, version_id, module, change_type, commit_hash, created_at',
      deploymentHistory: 'id, version, environment, status, deployment_start, created_at'
    });
    // Version 32: Production-Grade Receipt Management Module
    // Centralized receipt engine for all transaction types across DukaPos.
    this.version(32).stores({
      receipts: [
        'id',
        'receipt_number',
        'tenant_id',
        'branch_id',
        'transaction_id',
        'transaction_type',
        'cashier_id',
        'customer_id',
        'status',
        'sync_status',
        'created_at',
        'payment_method',
        'origin',
        '[tenant_id+branch_id+status]',
        '[tenant_id+branch_id+created_at]',
        '[tenant_id+status]',
      ].join(', '),
      receiptItems: 'id, receipt_id, tenant_id, product_id, variant_id',
      receiptTemplates: 'id, tenant_id, branch_id, format, is_default',
      receiptPrintLogs: 'id, receipt_id, tenant_id, branch_id, printed_by, created_at',
      receiptShareLogs: 'id, receipt_id, tenant_id, branch_id, channel, created_at',
      receiptAuditLogs: 'id, receipt_id, tenant_id, branch_id, user_id, action, created_at',
      receiptQrCodes: 'id, receipt_id, receipt_number, tenant_id',
      receiptSignatures: 'id, receipt_id, receipt_number, tenant_id',
      receiptNumberSequences: 'id, tenant_id, branch_id, date_key',
    });

    // Version 33: Enterprise Stock Sync Engine Transactional Outbox Schema
    this.version(33).stores({
      syncOutbox: '++id, outbox_id, operation_id, idempotency_key, tenant_id, branch_id, status, created_at'
    });

    // Version 34: Fast Bootstrap & Monotonic Watermark Metadata Store
    this.version(34).stores({
      syncMetadata: 'key'
    });

    // Version 35: Law Firm / Legal Services Module Schema
    this.version(35).stores({
      legalClients: 'id, tenant_id, branch_id, type, name, company_name, phone, status, created_at',
      legalCases: 'id, tenant_id, branch_id, case_number, title, client_id, status, priority, created_at',
      legalConflictChecks: 'id, tenant_id, case_title, party_searched, match_found, timestamp',
      legalHearings: 'id, tenant_id, case_id, event_type, date_time, status, created_at',
      legalTasks: 'id, tenant_id, case_id, assigned_user_id, status, due_date, created_at',
      legalDocuments: 'id, tenant_id, case_id, category, version, uploaded_by, created_at',
      legalTimeEntries: 'id, tenant_id, case_id, lawyer_id, date, is_billed, created_at',
      legalRetainers: 'id, tenant_id, client_id, case_id, status, updated_at',
      legalTimeline: 'id, tenant_id, case_id, timestamp'
    });

    // Version 36: Pharmacy Management Module Schema
    this.version(36).stores({
      pharmacyPatients: 'id, tenant_id, branch_id, patient_code, name, phone, nhif_number, status, created_at',
      pharmacyDoctors: 'id, tenant_id, registration_number, name, specialty, hospital, status, created_at',
      medicineBatches: [
        'id',
        'tenant_id',
        'branch_id',
        'product_id',
        'batch_number',
        'expiry_date',
        'status',
        'supplier_id',
        'created_at',
        '[tenant_id+branch_id+status]',
        '[tenant_id+product_id+expiry_date]',
        '[tenant_id+branch_id+expiry_date]'
      ].join(', '),
      prescriptions: 'id, tenant_id, branch_id, prescription_number, patient_id, doctor_id, status, created_at',
      prescriptionItems: 'id, prescription_id, tenant_id, product_id, batch_id, dispensed_qty, status',
      dispensings: 'id, tenant_id, branch_id, prescription_id, patient_id, pharmacist_id, status, created_at',
      dispensingItems: 'id, dispensing_id, tenant_id, product_id, batch_id, created_at',
      drugInteractions: 'id, tenant_id, drug_a_id, drug_b_id, severity, created_at',
      insuranceProviders: 'id, tenant_id, name, code, type, status, created_at',
      insuranceClaims: 'id, tenant_id, branch_id, provider_id, patient_id, sale_id, status, submitted_at, created_at',
      controlledDrugRegister: 'id, tenant_id, branch_id, product_id, batch_id, prescription_id, patient_id, pharmacist_id, created_at',
      medicineRecalls: 'id, tenant_id, product_id, batch_id, reason, status, initiated_at, created_at',
      expiryAlerts: 'id, tenant_id, branch_id, product_id, batch_id, expiry_date, alert_level, is_resolved, created_at',
      pharmacyAuditLogs: 'id, tenant_id, branch_id, user_id, action, entity_type, entity_id, created_at'
    });

    this.version(37).stores({
      documentAttachments: 'id, tenant_id, branch_id, module, entity_type, entity_id, is_confidential, created_at',
      farms: 'id, tenant_id, branch_id, farm_code, farm_type, status, created_at',
      farmHouses: 'id, tenant_id, farm_id, house_type, status, created_at',
      birdBatches: 'id, tenant_id, branch_id, farm_id, house_id, batch_number, breed, status, arrival_date, created_at',
      livestockAnimals: 'id, tenant_id, branch_id, farm_id, house_id, animal_id, tag_number, species, breed, gender, status, created_at',
      livestockBreeds: 'id, tenant_id, species, breed_name, created_at',
      feedItems: 'id, tenant_id, branch_id, feed_name, category, created_at',
      feedConsumptions: 'id, tenant_id, branch_id, farm_id, batch_id, animal_id, date, created_at',
      waterConsumptions: 'id, tenant_id, branch_id, farm_id, house_id, date, created_at',
      vaccinationRecords: 'id, tenant_id, branch_id, farm_id, batch_id, animal_id, vaccine_name, status, scheduled_date, created_at',
      livestockHealthRecords: 'id, tenant_id, branch_id, farm_id, batch_id, animal_id, diagnosis, status, created_at',
      veterinaryVisits: 'id, tenant_id, branch_id, farm_id, veterinarian_name, visit_date, created_at',
      breedingRecords: 'id, tenant_id, branch_id, farm_id, female_animal_id, male_animal_id, mating_type, status, expected_delivery_date, created_at',
      hatcheryIncubators: 'id, tenant_id, farm_id, incubator_name, status, created_at',
      hatchCycles: 'id, tenant_id, branch_id, farm_id, incubator_id, batch_number, status, set_date, expected_hatch_date, created_at',
      eggProductions: 'id, tenant_id, branch_id, farm_id, house_id, batch_id, collection_date, created_at',
      milkProductions: 'id, tenant_id, branch_id, farm_id, animal_id, session_date, created_at',
      weightRecords: 'id, tenant_id, branch_id, farm_id, batch_id, animal_id, weigh_date, created_at',
      livestockTasks: 'id, tenant_id, branch_id, farm_id, task_type, priority, status, due_date, assigned_to, created_at'
    });

    const tablesWithOrigin = [
      'products', 'productVariants', 'customers', 'orders',
      'stockLedger', 'invoices', 'payments', 'suppliers',
      'purchaseOrders', 'barTables', 'expenses'
    ];
    tablesWithOrigin.forEach(tableName => {
      const table = (this as any)[tableName];
      if (table) {
        table.hook('creating', function(_primKey: any, obj: any) {
          const tenantId = obj.tenant_id || obj.tenantId;
          if (tenantId && (tenantId.endsWith('_demo') || tenantId.includes('_demo_') || tenantId === 'tenant-new-wizard')) {
            obj.origin = 'DEMO';
          } else if (!obj.origin) {
            obj.origin = 'PRODUCTION';
          }
        });
      }
    });
  }
}



export const db = new DukaPosDatabase();

// ─── Deep Write Pipeline ──────────────────────────────────────────────────────
/**
 * Atomically persists a parent product AND all its variants in a single
 * Dexie transaction. If any variant write fails the entire operation is
 * rolled back, preventing orphaned parent records.
 *
 * Implements Fix #1 from the Root Cause Matrix:
 *   "UI state updated locally but failed to write variants alongside the parent."
 */
export function normalizeVariantAttributes(attrs: Record<string, string> | undefined | null): string {
  if (!attrs || typeof attrs !== 'object') return '';
  const parts: string[] = [];
  for (const [, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      parts.push(String(v).trim().toLowerCase());
    }
  }
  return parts.sort().join('|');
}

// ─── Deep Write Pipeline ──────────────────────────────────────────────────────
/**
 * Atomically persists a parent product AND all its variants in a single
 * Dexie transaction. If any variant write fails the entire operation is
 * rolled back, preventing orphaned parent records.
 *
 * Implements Fix #1 from the Root Cause Matrix:
 *   "UI state updated locally but failed to write variants alongside the parent."
 */
export async function saveProductAndVariants(
  product: Product,
  variants: ProductVariant[]
): Promise<void> {
  return db.transaction('rw', db.products, db.productVariants, db.syncQueue, async () => {
    let finalProduct = { ...product };

    // Deduplicate incoming variants list before saving & enforce strict SKU generation
    const uniqueVariants: ProductVariant[] = [];
    const seenSigs = new Set<string>();
    const seenSkus = new Set<string>();

    const parentShort = (finalProduct.name || 'PROD').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
    if (!finalProduct.sku || finalProduct.sku === '—' || !finalProduct.sku.trim()) {
      const pSeed = (finalProduct.id || '0000').slice(-4).toUpperCase();
      finalProduct.sku = `SKU-${parentShort}-${pSeed}`;
    }
    const parentSku = finalProduct.sku;

    for (let idx = 0; idx < variants.length; idx++) {
      const v = variants[idx];
      const sig = normalizeVariantAttributes(v.attributes) || `variant-${idx}`;

      // Mandatory SKU enforcement
      let vSku = (v.sku || '').trim();
      if (!vSku) {
        const attrSuffix = Object.values(v.attributes || {}).map(val => String(val).replace(/\s+/g, '').toUpperCase().slice(0, 4)).join('-') || `${idx + 1}`;
        vSku = `${parentSku}-${attrSuffix}`;
      }

      if (seenSigs.has(sig)) {
        console.warn(`[saveProductAndVariants] Duplicate attribute signature '${sig}' ignored for product ${finalProduct.id}`);
        continue;
      }
      if (seenSkus.has(vSku.toLowerCase())) {
        console.warn(`[saveProductAndVariants] Duplicate SKU '${vSku}' ignored for product ${finalProduct.id}`);
        continue;
      }

      seenSigs.add(sig);
      seenSkus.add(vSku.toLowerCase());

      uniqueVariants.push({
        ...v,
        sku: vSku,
      });
    }

    if (finalProduct.hasVariants || uniqueVariants.length > 0) {
      const activeVariants = uniqueVariants.filter(v => (v.status as any) !== 'Inactive');
      const totalStock = activeVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
      const reorderLevel = finalProduct.reorderLevel ?? 10;
      const stockStatus =
        totalStock === 0
          ? 'OUT_OF_STOCK'
          : totalStock <= reorderLevel
          ? 'LOW_STOCK'
          : 'IN_STOCK';

      finalProduct = {
        ...finalProduct,
        hasVariants: true,
        stock: totalStock,
        syncStatus: finalProduct.syncStatus ?? 'PENDING',
      };
      (finalProduct as any).availableQty = totalStock;
      (finalProduct as any).inStock = totalStock > 0;
      (finalProduct as any).stockStatus = stockStatus;
    } else {
      finalProduct.syncStatus = finalProduct.syncStatus ?? 'PENDING';
    }

    // 1. Write parent product atomically
    await db.products.put(finalProduct);

    // 2. Remove existing variants in DB for this product that are no longer retained
    const existingInDb = await db.productVariants.where('productId').equals(finalProduct.id).toArray();
    for (const ev of existingInDb) {
      const evSig = normalizeVariantAttributes(ev.attributes);
      const isRetained = uniqueVariants.some(uv => uv.id === ev.id || normalizeVariantAttributes(uv.attributes) === evSig || (uv.sku && uv.sku.toLowerCase() === ev.sku.toLowerCase()));
      if (!isRetained) {
        await db.productVariants.delete(ev.id);
      }
    }

    // 3. Write each unique variant explicitly
    for (const variant of uniqueVariants) {
      await db.productVariants.put({
        ...variant,
        productId: finalProduct.id,   // enforce FK binding
        tenant_id: variant.tenant_id || finalProduct.tenant_id,
        branch_id: variant.branch_id || finalProduct.branch_id,
        isSynced: 0,
        syncStatus: 'PENDING',
      });
    }

    // 4. Queue the product insert — variants are queued as children below
    await db.syncQueue.add({
      actionType: 'INSERT',
      entityName: 'products',
      payload: { ...finalProduct, variants: uniqueVariants.map(v => ({ ...v, productId: finalProduct.id })) },
      timestamp: Date.now(),
      status: 'Pending',
    });
  });
}

// ─── ID Mapping Reconciliation ───────────────────────────────────────────────
/**
 * Applies a server-returned ID mapping table to local IndexedDB records.
 * Must be called after every successful cloud INSERT that returns mappings.
 *
 * Implements Fix #3 from the Root Cause Matrix:
 *   "Server generated new keys and client lost track of temporary IDs."
 *
 * @param mappings  Record<clientTempId, serverPermanentId>
 * @param tenantId  Scopes the cascade to the correct tenant
 */
export async function applyIdMappings(
  mappings: Record<string, string>,
  tenantId: string
): Promise<void> {
  for (const [clientId, serverId] of Object.entries(mappings)) {
    if (clientId === serverId) continue; // Nothing to reconcile

    await db.transaction('rw',
      [db.products, db.productVariants, db.stockLedger,
      db.stockBalance, db.syncQueue, db.idMappingLedger],
      async () => {
        // 1. Log the mapping permanently
        await db.idMappingLedger.put({
          clientId,
          serverId,
          entityName: 'products',
          tenantId,
          createdAt: Date.now(),
          reconciled: false,
        });

        // 2. Update local product record
        const localProd = await db.products.get(clientId);
        if (localProd) {
          await db.products.delete(clientId);
          await db.products.put({ ...localProd, id: serverId, syncStatus: 'SYNCED', isSynced: 1 } as any);
        }

        // 3. Cascade → productVariants (update FK productId)
        const variants = await db.productVariants.where('productId').equals(clientId).toArray();
        for (const v of variants) {
          await db.productVariants.delete(v.id);
          const newVarId = v.id.replace(clientId, serverId);
          await db.productVariants.put({ ...v, id: newVarId, productId: serverId, syncStatus: 'SYNCED', isSynced: 1 });
        }

        // 4. Cascade → stockLedger
        const ledger = await db.stockLedger.where('product_id').equals(clientId).toArray();
        for (const le of ledger) {
          await db.stockLedger.update(le.id, { product_id: serverId });
        }

        // 5. Cascade → stockBalance
        const balances = await db.stockBalance.where('product_id').equals(clientId).toArray();
        for (const bal of balances) {
          await db.stockBalance.delete(bal.id);
          await db.stockBalance.put({
            ...bal,
            id: bal.id.replace(clientId, serverId),
            product_id: serverId,
          });
        }

        // 6. Cascade → pending syncQueue items still referencing the temp ID
        const pending = await db.syncQueue.where('status').anyOf('Pending', 'Failed').toArray();
        for (const ps of pending) {
          let dirty = false;
          if (ps.payload?.id === clientId) { ps.payload.id = serverId; dirty = true; }
          if (ps.payload?.productId === clientId) { ps.payload.productId = serverId; dirty = true; }
          if (dirty) await db.syncQueue.put(ps);
        }

        // 7. Mark mapping as reconciled
        const existing = await db.idMappingLedger.where('clientId').equals(clientId).first();
        if (existing?.id !== undefined) {
          await db.idMappingLedger.update(existing.id, { reconciled: true });
        }
      }
    );
  }
}

// Price Inheritance Helpers
/**
 * Resolves the effective selling price of a variant.
 * Strict Rule: Variants ONLY inherit prices FROM the parent product.
 * Variant prices NEVER apply to or overwrite the parent product's base price.
 */
export function getEffectiveVariantSellingPrice(
  variant?: Partial<ProductVariant> | null,
  parentProduct?: Partial<Product> | null
): number {
  if (!variant) return parentProduct?.sellingPrice || parentProduct?.price || 0;
  if (variant.inheritSellingPrice === true || variant.sellingPrice === undefined || variant.sellingPrice === null || variant.sellingPrice === 0) {
    return parentProduct?.sellingPrice || parentProduct?.price || 0;
  }
  return variant.sellingPrice;
}

/**
 * Resolves the effective buying price of a variant.
 * Strict Rule: Variants ONLY inherit prices FROM the parent product.
 * Variant prices NEVER apply to or overwrite the parent product's base price.
 */
export function getEffectiveVariantBuyingPrice(
  variant?: Partial<ProductVariant> | null,
  parentProduct?: Partial<Product> | null
): number {
  if (!variant) return parentProduct?.buyingPrice || parentProduct?.costPrice || 0;
  if (variant.inheritBuyingPrice === true || variant.buyingPrice === undefined || variant.buyingPrice === null || variant.buyingPrice === 0) {
    return parentProduct?.buyingPrice || parentProduct?.costPrice || 0;
  }
  return variant.buyingPrice;
}

// Automatic Parent–Variant Stock Synchronization Service
export async function syncParentStock(parentProductId: string): Promise<void> {
  if (!parentProductId) return;
  const parent = await db.products.get(parentProductId);
  if (!parent) return;

  const variants = await db.productVariants
    .where('productId')
    .equals(parentProductId)
    .toArray();

  const activeVariants = variants.filter(v => (v.status as any) !== 'Inactive' && !(v as any).deletedAt);

  if (parent.hasVariants || variants.length > 0) {
    // 1. Calculate Aggregate Stock & Variant Metrics across active variants
    const totalStock = activeVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    const reservedStock = activeVariants.reduce((sum, v) => sum + (Number(v.reservedStock || (v as any).reserved_stock) || 0), 0);
    const availableQty = Math.max(0, totalStock - reservedStock);
    const lowStockVariantCount = activeVariants.filter(v => (Number(v.stock) || 0) <= (v.reorderLevel ?? 5)).length;

    const reorderLevel = parent.reorderLevel ?? 10;
    const stockStatus =
      totalStock === 0
        ? 'OUT_OF_STOCK'
        : totalStock <= reorderLevel
        ? 'LOW_STOCK'
        : 'IN_STOCK';

    // 2. Price Range & Container Meta Calculations (for UI range display)
    const validPrices = activeVariants
      .map(v => getEffectiveVariantSellingPrice(v, parent))
      .filter((p): p is number => typeof p === 'number' && p > 0);

    const minPrice = validPrices.length > 0 ? Math.min(...validPrices) : (parent.sellingPrice || parent.price || 0);
    const maxPrice = validPrices.length > 0 ? Math.max(...validPrices) : minPrice;
    const priceRange = minPrice !== maxPrice ? `${minPrice.toLocaleString()} - ${maxPrice.toLocaleString()}` : undefined;

    // 3. Earliest Expiry Date (FEFO - First Expired, First Out)
    const validExpiries = activeVariants
      .map(v => (v as any).expiryDate)
      .filter((d): d is string => typeof d === 'string' && d.length > 0)
      .sort();
    const earliestExpiry = validExpiries[0] || parent.expiryDate;

    // 4. Update Parent Product Container
    // CRITICAL: Preserve parent.sellingPrice, parent.price, and parent.buyingPrice.
    // Variant prices NEVER overwrite or propagate back to the parent container base price!
    const hasVariantsFlag = parent.hasVariants || variants.length > 0;
    const updatedProd: Product = {
      ...parent,
      hasVariants: hasVariantsFlag,
      stock: totalStock,
      expiryDate: earliestExpiry,
      updatedAt: Date.now(),
      syncStatus: 'PENDING' as const,
    };

    (updatedProd as any).minPrice = minPrice;
    (updatedProd as any).maxPrice = maxPrice;
    (updatedProd as any).priceRange = priceRange;
    (updatedProd as any).reservedStock = reservedStock;
    (updatedProd as any).availableQty = availableQty;
    (updatedProd as any).variantCount = variants.length;
    (updatedProd as any).lowStockVariantCount = lowStockVariantCount;
    (updatedProd as any).inStock = totalStock > 0;
    (updatedProd as any).stockStatus = stockStatus;

    await db.products.put(updatedProd);

    // 5. Synchronize Branch-Level Stock Balance Table (db.stockBalance)
    try {
      const allVariantBalances = await db.stockBalance
        .where('product_id')
        .equals(parentProductId)
        .toArray();

      const branchTotals: Record<string, number> = {};
      for (const sb of allVariantBalances) {
        if (sb.variant_id && sb.variant_id !== 'no-variant') {
          const bId = sb.branch_id || 'branch-101';
          branchTotals[bId] = (branchTotals[bId] || 0) + (sb.current_quantity || 0);
        }
      }

      for (const [bId, bQty] of Object.entries(branchTotals)) {
        const parentSb = await db.stockBalance
          .where('[branch_id+product_id+variant_id]')
          .equals([bId, parentProductId, 'no-variant'])
          .first();

        if (parentSb) {
          await db.stockBalance.put({
            ...parentSb,
            current_quantity: bQty,
            stock_value: bQty * (parent.buyingPrice || 0),
            updated_at: Date.now(),
          });
        }
      }
    } catch (_) {}

    // 6. Queue Cloud Sync Payload
    const { mapProductToCloud } = await import('../services/productService');
    await db.syncQueue.add({
      actionType: 'UPDATE',
      entityName: 'products',
      payload: mapProductToCloud(updatedProd),
      timestamp: Date.now(),
      status: 'Pending',
    });
  }
}

// Recalculates Parent Product stock and price based on its child variants (alias)
export async function recalculateProductStock(productId: string): Promise<void> {
  return syncParentStock(productId);
}

/**
 * Batch synchronization helper for multiple parent products affected by stock movements.
 * Guarantees all distinct parent IDs are recalculated.
 */
export async function syncMultipleParentStocks(parentProductIds: Iterable<string>): Promise<void> {
  const uniqueParentIds = Array.from(new Set(parentProductIds)).filter(Boolean);
  for (const parentId of uniqueParentIds) {
    await syncParentStock(parentId);
  }
}

/**
 * Global Audit & Reconciliation service for Parent-Variant Stock Balances.
 * Sweeps the database to ensure every parent product's stock balance matches
 * the exact sum of its active variants, purging soft-deleted/orphan discrepancies.
 */
export async function reconcileAllParentProductStocks(): Promise<{
  reconciledCount: number;
  fixedDiscrepancies: number;
}> {
  let reconciledCount = 0;
  let fixedDiscrepancies = 0;

  // 1. Sanitize all variant stocks in database to numeric values
  const allVariants = await db.productVariants.toArray();
  for (const v of allVariants) {
    if (typeof v.stock !== 'number' || isNaN(v.stock)) {
      const cleanStock = Number(v.stock) || 0;
      await db.productVariants.update(v.id, { stock: cleanStock });
      v.stock = cleanStock;
    }
  }

  // 2. Reconcile parent products
  const products = await db.products.toArray();
  for (const p of products) {
    const childVariants = await db.productVariants
      .where('productId')
      .equals(p.id)
      .toArray();

    if (p.hasVariants || childVariants.length > 0) {
      reconciledCount++;
      const activeVars = childVariants.filter(
        v => (v.status as any) !== 'Inactive' && !(v as any).deletedAt && !(v as any).deleted_at
      );
      const computedTotal = activeVars.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);

      const hasStringStock = typeof p.stock !== 'number' || isNaN(p.stock) || String(p.stock).length > 8;

      if (p.stock !== computedTotal || hasStringStock || (p.hasVariants && activeVars.length === 0)) {
        fixedDiscrepancies++;
        await syncParentStock(p.id);
      }
    } else {
      // Simple product without variants
      if (typeof p.stock !== 'number' || isNaN(p.stock) || String(p.stock).length > 8) {
        const cleanStock = Number(p.stock) || 0;
        await db.products.update(p.id, { stock: cleanStock });
        fixedDiscrepancies++;
      }
    }
  }

  return { reconciledCount, fixedDiscrepancies };
}

// Module-level lock to prevent concurrent initialization collisions
let isSeedingInProgress = false;

// ─── PRODUCTION DATABASE INITIALIZATION ─────────────────────────────────────
// Seeds only system-level reference data (RBAC roles, permissions, subscription
// plans, industries, and the platform super admin). NO tenant or demo data.
// Called once on app startup. Safe to call multiple times — fully idempotent.
export async function initProductionDatabase() {
  if (isSeedingInProgress) return;
  isSeedingInProgress = true;

  if (typeof window !== 'undefined') {
    localStorage.setItem('DUKAPOS_PRODUCTION_LOCKED', 'true');
  }

  try {
    // ── Orphan & Partial Registration Cleanup ────────────────────────────────
    // Purges any partial/unfinalized tenant records missing required credentials or marked as draft
    try {
      const existingTenants = await db.tenants.toArray();
      for (const t of existingTenants) {
        if (
          t.status === 'Draft' || 
          t.status === 'DRAFT' || 
          t.registration_completed === false || 
          (!t.email && !(t as any).owner_email)
        ) {
          await db.tenants.delete(t.id).catch(() => {});
        }
      }
    } catch (_) {}

    const rolesCount = await db.roles.count();

    // ── Incremental RBAC Seed ────────────────────────────────────────────────
    // Runs independently so existing installations get RBAC tables populated
    // even if the main product seed was already applied previously.
    if (rolesCount === 0) {
      const NOW_RBAC = Date.now();

      // Seed Permissions
      const seedPermissions: Permission[] = [
        // POS & Sales
        { id: 'perm-sales-create', module: 'POS & Sales', resource: 'sale', action: 'create', slug: 'sales.create', description: 'Create new POS invoices & orders' },
        { id: 'perm-sales-refund', module: 'POS & Sales', resource: 'sale', action: 'refund', slug: 'sales.refund', description: 'Process customer product returns & refunds' },
        { id: 'perm-sales-void', module: 'POS & Sales', resource: 'sale', action: 'void', slug: 'sales.void', description: 'Void or cancel active/past transactions' },
        { id: 'perm-disc-override', module: 'POS & Sales', resource: 'discount', action: 'override', slug: 'discount.override', description: 'Override automated pricing or discount limits' },
        { id: 'perm-pos-shift', module: 'POS & Sales', resource: 'shift', action: 'manage', slug: 'pos.shift.manage', description: 'Open, reconcile, and close POS cash shifts' },

        // Products & Categories
        { id: 'perm-prod-create', module: 'Products', resource: 'product', action: 'create', slug: 'inventory.product.create', description: 'Create new core products and variants' },
        { id: 'perm-prod-edit', module: 'Products', resource: 'product', action: 'edit', slug: 'inventory.product.edit', description: 'Modify existing product details and pricing' },
        { id: 'perm-prod-delete', module: 'Products', resource: 'product', action: 'delete', slug: 'inventory.product.delete', description: 'Remove or archive products' },
        { id: 'perm-cat-manage', module: 'Categories', resource: 'category', action: 'manage', slug: 'inventory.category.create', description: 'Create, organize, and edit product categories' },

        // Inventory & Stock
        { id: 'perm-inv-view', module: 'Inventory', resource: 'stock', action: 'view', slug: 'inventory.stock.view', description: 'View stock balances and product quantities' },
        { id: 'perm-inv-receive', module: 'Inventory', resource: 'stock', action: 'receive', slug: 'inventory.stock.receive', description: 'Receive new stock deliveries into inventory' },
        { id: 'perm-inv-transfer', module: 'Inventory', resource: 'stock', action: 'transfer', slug: 'inventory.stock.transfer', description: 'Initiate stock movement between branches' },
        { id: 'perm-inv-adjust', module: 'Inventory', resource: 'stock', action: 'adjust', slug: 'inventory.stock.adjust', description: 'Authorize stock level additions/deductions' },
        { id: 'perm-inv-count', module: 'Inventory', resource: 'stock', action: 'count', slug: 'inventory.stock.count', description: 'Perform physical stock audits and counts' },
        { id: 'perm-inv-wastage', module: 'Inventory', resource: 'stock', action: 'wastage', slug: 'inventory.stock.wastage', description: 'Log damaged, expired, or spoiled inventory' },
        { id: 'perm-inv-barcode', module: 'Inventory', resource: 'barcode', action: 'print', slug: 'inventory.barcode.print', description: 'Generate and print SKU barcode labels' },

        // Purchasing & Suppliers
        { id: 'perm-pur-create', module: 'Purchasing', resource: 'purchase', action: 'create', slug: 'purchase.create', description: 'Initiate supplier purchase orders' },
        { id: 'perm-pur-approve', module: 'Purchasing', resource: 'purchase', action: 'approve', slug: 'purchase.approve', description: 'Approve and release purchase orders' },
        { id: 'perm-pur-manage', module: 'Suppliers', resource: 'supplier', action: 'manage', slug: 'supplier.manage', description: 'Manage supplier ledgers & contract details' },

        // Customers
        { id: 'perm-cust-view', module: 'Customers', resource: 'customer', action: 'view', slug: 'customer.view', description: 'Access customer list and contact details' },
        { id: 'perm-cust-manage', module: 'Customers', resource: 'customer', action: 'manage', slug: 'customer.create', description: 'Register and update customer accounts' },

        // Finance, Expenses & Taxes
        { id: 'perm-fin-expense', module: 'Finance', resource: 'expense', action: 'manage', slug: 'expense.manage', description: 'Log operational costs, permits, and bills' },
        { id: 'perm-fin-approve', module: 'Finance', resource: 'expense', action: 'approve', slug: 'expense.approve', description: 'Authorize and approve company expenses' },
        { id: 'perm-fin-payment', module: 'Finance', resource: 'payment', action: 'manage', slug: 'payment.manage', description: 'Record general payments & accounts' },
        { id: 'perm-fin-banking', module: 'Finance', resource: 'banking', action: 'manage', slug: 'banking.manage', description: 'Manage bank accounts and cash channels' },
        { id: 'perm-fin-taxes', module: 'Finance', resource: 'taxes', action: 'manage', slug: 'taxes.manage', description: 'Configure VAT rules and tax structures' },
        { id: 'perm-fin-reports', module: 'Finance', resource: 'financial_reports', action: 'view', slug: 'financial_reports.view', description: 'Access profit/loss, balance sheet, and ledgers' },

        // Reports
        { id: 'perm-rep-view', module: 'Reports', resource: 'reports', action: 'view', slug: 'reports.view', description: 'Access global analytics and business forecasts' },
        { id: 'perm-rep-branch', module: 'Reports', resource: 'reports', action: 'branch', slug: 'reports.branch', description: 'Access single-branch localized sales reports' },
        { id: 'perm-rep-inv', module: 'Reports', resource: 'reports', action: 'inventory', slug: 'reports.inventory.view', description: 'View stock velocity, low stock, and shrinkage reports' },
        { id: 'perm-rep-sales', module: 'Reports', resource: 'reports', action: 'sales', slug: 'reports.sales.view', description: 'View turnover, margins, and sales channel reports' },

        // Access & Organization
        { id: 'perm-set-users', module: 'Access', resource: 'users', action: 'manage', slug: 'users.manage', description: 'Invite, suspend, and configure system users' },
        { id: 'perm-set-roles', module: 'Access', resource: 'roles', action: 'manage', slug: 'roles.manage', description: 'Build and customize tenant role capability maps' },
        { id: 'perm-set-branches', module: 'Access', resource: 'branches', action: 'manage', slug: 'branches.manage', description: 'Add and configure business locations' },
        { id: 'perm-set-config', module: 'Access', resource: 'settings', action: 'manage', slug: 'settings.manage', description: 'Modify SaaS configurations and operational rules' },
        { id: 'perm-audit-logs', module: 'Access', resource: 'audit', action: 'view', slug: 'audit.logs.view', description: 'Inspect security audit trails and system logs' },

        // Platform & Subscription
        { id: 'perm-plat-tenants', module: 'Platform', resource: 'tenant', action: 'manage', slug: 'tenant.manage', description: 'Manage platform business workspaces' },
        { id: 'perm-plat-billing', module: 'Platform', resource: 'billing', action: 'manage', slug: 'billing.manage', description: 'Oversee subscriber invoicing and cycles' },
        { id: 'perm-plat-subs', module: 'Platform', resource: 'subscription', action: 'manage', slug: 'subscription.manage', description: 'Update plan levels and offline grace rules' },
        { id: 'perm-plat-flags', module: 'Platform', resource: 'feature_flag', action: 'manage', slug: 'feature_flag.manage', description: 'Activate system features per subscriber' },
        { id: 'perm-plat-logs', module: 'Platform', resource: 'system', action: 'logs.view', slug: 'system.logs.view', description: 'View system-level logs and diagnostics' },
      ];
      await db.permissions.bulkPut(seedPermissions);

      // Seed System Roles
      const systemRoles: Role[] = [
        { id: 'role-owner', tenant_id: null, name: 'Tenant Owner', slug: 'tenant_owner', description: 'Owns the business with complete, unrestricted workspace control.', is_system_role: true, is_custom: false, created_at: NOW_RBAC },
        { id: 'role-admin', tenant_id: null, name: 'Business Administrator', slug: 'business_administrator', description: 'Runs day-to-day operations, staff, inventory, and reporting.', is_system_role: true, is_custom: false, created_at: NOW_RBAC },
        { id: 'role-manager', tenant_id: null, name: 'Branch Manager', slug: 'branch_manager', description: 'Manages branch staff, daily sales, stock, and local reports.', is_system_role: true, is_custom: false, created_at: NOW_RBAC },
        { id: 'role-accountant', tenant_id: null, name: 'Accountant', slug: 'accountant', description: 'Financial control, expenses, taxes, P&L, and balance sheet.', is_system_role: true, is_custom: false, created_at: NOW_RBAC },
        { id: 'role-inventory', tenant_id: null, name: 'Inventory Officer', slug: 'inventory_officer', description: 'Stock receiving, transfers, purchase orders, counts, and barcode printing.', is_system_role: true, is_custom: false, created_at: NOW_RBAC },
        { id: 'role-cashier', tenant_id: null, name: 'Cashier', slug: 'cashier', description: 'Processes POS customer sales, receipts, and shift reconciliation.', is_system_role: true, is_custom: false, created_at: NOW_RBAC },
      ];
      await db.roles.bulkPut(systemRoles);

      // Seed Role Permissions
      const adminPermIds = ['perm-sales-create', 'perm-sales-refund', 'perm-sales-void', 'perm-disc-override', 'perm-prod-create', 'perm-prod-edit', 'perm-cat-manage', 'perm-inv-view', 'perm-inv-receive', 'perm-inv-transfer', 'perm-inv-adjust', 'perm-pur-create', 'perm-pur-approve', 'perm-pur-manage', 'perm-cust-view', 'perm-cust-manage', 'perm-fin-expense', 'perm-fin-approve', 'perm-fin-banking', 'perm-fin-taxes', 'perm-rep-view', 'perm-rep-branch', 'perm-rep-inv', 'perm-rep-sales', 'perm-set-users', 'perm-set-roles', 'perm-set-branches', 'perm-set-config', 'perm-audit-logs'];
      const mgrPermIds   = ['perm-sales-create', 'perm-sales-refund', 'perm-sales-void', 'perm-prod-create', 'perm-inv-view', 'perm-inv-receive', 'perm-inv-transfer', 'perm-inv-adjust', 'perm-inv-count', 'perm-pur-create', 'perm-pur-manage', 'perm-cust-view', 'perm-cust-manage', 'perm-fin-expense', 'perm-rep-branch', 'perm-set-users', 'perm-audit-logs'];
      const accPermIds   = ['perm-fin-expense', 'perm-fin-approve', 'perm-fin-payment', 'perm-fin-banking', 'perm-fin-taxes', 'perm-fin-reports', 'perm-rep-view', 'perm-rep-branch', 'perm-inv-view', 'perm-cust-view', 'perm-pur-manage', 'perm-audit-logs'];
      const invPermIds   = ['perm-prod-create', 'perm-prod-edit', 'perm-cat-manage', 'perm-inv-view', 'perm-inv-receive', 'perm-inv-transfer', 'perm-inv-adjust', 'perm-inv-count', 'perm-inv-wastage', 'perm-inv-barcode', 'perm-pur-create', 'perm-pur-approve', 'perm-pur-manage', 'perm-rep-inv', 'perm-audit-logs'];
      const cshPermIds   = ['perm-sales-create', 'perm-fin-payment', 'perm-pos-shift', 'perm-cust-view', 'perm-cust-manage', 'perm-inv-view'];

      const seedRolePermissions: RolePermission[] = [
        ...seedPermissions.filter(p => p.module !== 'Platform').map(p => ({ id: `rp-owner-${p.id}`, role_id: 'role-owner', permission_id: p.id })),
        ...adminPermIds.map(pid => ({ id: `rp-admin-${pid}`, role_id: 'role-admin', permission_id: pid })),
        ...mgrPermIds.map(pid => ({ id: `rp-mgr-${pid}`, role_id: 'role-manager', permission_id: pid })),
        ...accPermIds.map(pid => ({ id: `rp-acc-${pid}`, role_id: 'role-accountant', permission_id: pid })),
        ...invPermIds.map(pid => ({ id: `rp-inv-${pid}`, role_id: 'role-inventory', permission_id: pid })),
        ...cshPermIds.map(pid => ({ id: `rp-csh-${pid}`, role_id: 'role-cashier', permission_id: pid })),
      ];
      await db.rolePermissions.bulkPut(seedRolePermissions);

      // Seed Super Admin UserSecurity (if empty)
      const secCount = await db.userSecurity.count();
      if (secCount === 0) {
        await db.userSecurity.put({ user_id: 'usr-superadmin', pin_hash: '0000', failed_attempts: 0, two_factor_enabled: false });
      }
      console.log('[DukaPos] System security & RBAC permissions initialized.');
    }
    // ────────────────────────────────────────────────────────────────────────

    // ────────────────────────────────────────────────────────────────────────

    // ── Incremental Control Plane Seed — REMOVED (production environment) ───
    // ────────────────────────────────────────────────────────────────────────

    // ── Incremental Subscription Plans Seed ─────────────────────────────────
    const subPlansCount = await db.subscriptionPlans.count();
    if (subPlansCount === 0) {
      const NOW_SP = Date.now();
      const DAY_SP = 24 * 60 * 60 * 1000;
      const initialPlans: SubscriptionPlan[] = [
        {
          id: 'plan-trial',
          name: 'Free Trial',
          code: 'TRIAL',
          description: '14-day full platform access trial for new business evaluation.',
          price: 0,
          currency: 'TZS',
          billing_cycle: 'monthly',
          max_users: 2,
          max_branches: 1,
          max_products: 100,
          max_storage_mb: 100,
          is_trial: true,
          is_active: true,
          created_at: NOW_SP - 60 * DAY_SP,
          updated_at: NOW_SP
        },
        {
          id: 'plan-starter',
          name: 'Starter Plan',
          code: 'STARTER',
          description: 'For small single-shop businesses looking to start digitization.',
          price: 12000,
          currency: 'TZS',
          billing_cycle: 'monthly',
          max_users: 3,
          max_branches: 1,
          max_products: 1000,
          max_storage_mb: 500,
          is_trial: false,
          is_active: true,
          created_at: NOW_SP - 60 * DAY_SP,
          updated_at: NOW_SP
        },
        {
          id: 'plan-business',
          name: 'Business Plan',
          code: 'BUSINESS',
          description: 'Perfect for retail stores with multiple branches and staff teams.',
          price: 16000,
          currency: 'TZS',
          billing_cycle: 'monthly',
          max_users: 10,
          max_branches: 5,
          max_products: 50000,
          max_storage_mb: 2000,
          is_trial: false,
          is_active: true,
          created_at: NOW_SP - 60 * DAY_SP,
          updated_at: NOW_SP
        },
        {
          id: 'plan-enterprise',
          name: 'Enterprise Plan',
          code: 'ENTERPRISE',
          description: 'Custom setups, infinite scale, and offline micro-service sync.',
          price: 30000,
          currency: 'TZS',
          billing_cycle: 'monthly',
          max_users: 9999,
          max_branches: 9999,
          max_products: 999999,
          max_storage_mb: 50000,
          is_trial: false,
          is_active: true,
          created_at: NOW_SP - 60 * DAY_SP,
          updated_at: NOW_SP
        }
      ];
      await db.subscriptionPlans.bulkPut(initialPlans);
      console.log('[DukaPos] Initial subscription plans seeded into IndexedDB.');
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Production Ready: No demo tenant/branch/user/product data seeded ────
    // All tenant data is created at runtime via the provisioning wizard.
    // ────────────────────────────────────────────────────────────────────────

    const usersCount = await db.users.count();
    if (usersCount === 0) {
      console.log('[DukaPos] First-time setup: seeding production baseline (no demo data)...');

      // Clear all tables for a clean slate
      await db.products.clear();
      await db.productVariants.clear();
      await db.customers.clear();
      await db.orders.clear();
      await db.tenants.clear();
      await db.branches.clear();
      await db.industries.clear();
      await db.tenantIndustries.clear();
      await db.users.clear();
      await db.userBranchRoles.clear();
      await db.stockLedger.clear();
      await db.stockBalance.clear();
      await db.tenantModules.clear();
      await db.tenantSettings.clear();
      await db.featureFlags.clear();
      await db.auditLogs.clear();

      // ── SYSTEM-LEVEL MASTER DATA ─────────────────────────────────────────────
      // These are platform-wide reference records, NOT tenant-specific.

      // 1. Seed industry master catalogue (used during onboarding)
      await db.industries.bulkPut([
        { id: 'ind-retail',      name: 'Retail',             schema_preset: { features: ['inventory', 'pos', 'customers'] } },
        { id: 'ind-pharmacy',   name: 'Pharmacy',           schema_preset: { features: ['inventory', 'pos', 'customers', 'expiry_check'] } },
        { id: 'ind-restaurant', name: 'Restaurant',         schema_preset: { features: ['pos', 'tables', 'kitchen'] } },
        { id: 'ind-sacco',      name: 'SACCO',              schema_preset: { features: ['savings', 'loans', 'shares'] } },
        { id: 'ind-bar',        name: 'Bar',                schema_preset: { features: ['counter_pos', 'open_tabs', 'pour_tracking', 'excise_duty', 'empty_bottles', 'happy_hour'] } },
        { id: 'ind-hotel',      name: 'Hotel',              schema_preset: { features: ['reservations', 'housekeeping', 'pos', 'dining'] } },
        { id: 'ind-garage',     name: 'Garage',             schema_preset: { features: ['inventory', 'services', 'pos', 'customers'] } },
        { id: 'ind-consulting', name: 'BusinessConsultant', schema_preset: { features: ['client_management', 'project_management', 'contracts', 'invoicing'] } },
        { id: 'ind-wholesale',  name: 'Wholesale',          schema_preset: { features: ['inventory', 'pos', 'customers', 'purchase_orders'] } },
        { id: 'ind-salon',      name: 'Salon & Spa',        schema_preset: { features: ['services', 'appointments', 'pos', 'customers'] } }
      ]);

      // 2. Seed Super Admin platform user ONLY (no tenant users — those are created via onboarding)
      await db.users.bulkPut([
        {
          id: 'usr-superadmin',
          email: 'admin@dukapos.com',
          password_hash: 'admin123',
          is_super_admin: true,
          name: 'System Platform Owner',
          phone: '+255799999999',
          tenant_id: 'tenant-admin-system'
        }
      ]);

      // 3. Seed subscription plans (platform pricing — not tenant data)
      await db.subscriptionPlans.bulkPut([
        {
          id: 'plan-trial',
          name: 'Free Trial',
          code: 'TRIAL',
          description: '14-day full platform access trial for new business evaluation.',
          price: 0,
          currency: 'TZS',
          billing_cycle: 'monthly',
          max_users: 2,
          max_branches: 1,
          max_products: 100,
          max_storage_mb: 100,
          is_trial: true,
          is_active: true,
          created_at: Date.now(),
          updated_at: Date.now()
        },
        {
          id: 'plan-starter',
          name: 'Starter Plan',
          code: 'STARTER',
          description: 'For small single-shop businesses looking to start digitization.',
          price: 12000,
          currency: 'TZS',
          billing_cycle: 'monthly',
          max_users: 3,
          max_branches: 1,
          max_products: 1000,
          max_storage_mb: 500,
          is_trial: false,
          is_active: true,
          created_at: Date.now(),
          updated_at: Date.now()
        },
        {
          id: 'plan-business',
          name: 'Business Plan',
          code: 'BUSINESS',
          description: 'Perfect for retail stores with multiple branches and staff teams.',
          price: 16000,
          currency: 'TZS',
          billing_cycle: 'monthly',
          max_users: 10,
          max_branches: 5,
          max_products: 50000,
          max_storage_mb: 2000,
          is_trial: false,
          is_active: true,
          created_at: Date.now(),
          updated_at: Date.now()
        },
        {
          id: 'plan-enterprise',
          name: 'Enterprise Plan',
          code: 'ENTERPRISE',
          description: 'Custom setups, infinite scale, and offline micro-service sync.',
          price: 30000,
          currency: 'TZS',
          billing_cycle: 'monthly',
          max_users: 9999,
          max_branches: 9999,
          max_products: 999999,
          max_storage_mb: 50000,
          is_trial: false,
          is_active: true,
          created_at: Date.now(),
          updated_at: Date.now()
        }
      ]);

      console.log('[DukaPos] Production baseline seeded. No demo data injected.');
    }

    // == PRODUCTION READY: No demo data seeded. All tenant/user/operational data is created at runtime via provisioning. ==

    // Reconcile and audit all parent product stock balances on database initialization
    await reconcileAllParentProductStocks().catch(() => {});
  } catch (error) {
    console.error('Database seeding error: ', error);
  } finally {
    isSeedingInProgress = false;
  }
}

// clearDatabaseAndForceReseed REMOVED — destructive reset operations are
// not permitted in the production environment.

export async function recordStockMovement(entryInput: Omit<StockLedgerEntry, 'id' | 'created_at' | 'synced' | 'quantity_before' | 'quantity_after'> & { created_at?: number }): Promise<StockLedgerEntry> {
  const id = `sl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const created_at = entryInput.created_at || Date.now();
  const synced = false;

  const variantKey = entryInput.variant_id || 'no-variant';
  
  // 1. Fetch current balance cache
  const cacheKey = [entryInput.branch_id, entryInput.product_id, variantKey];
  let balance = await db.stockBalance.where('[branch_id+product_id+variant_id]').equals(cacheKey).first();

  const quantity_before = balance ? balance.current_quantity : 0;
  const quantity_after = quantity_before + entryInput.quantity_change;

  // 2. Cost calculations
  let average_cost = balance ? balance.average_cost : 0;
  const isIncoming = entryInput.quantity_change > 0;
  if (isIncoming) {
    const oldTotalCost = quantity_before * average_cost;
    const newTotalCost = entryInput.quantity_change * entryInput.unit_cost;
    const totalQty = quantity_after;
    if (totalQty > 0) {
      average_cost = (oldTotalCost + newTotalCost) / totalQty;
    } else {
      average_cost = entryInput.unit_cost;
    }
  }
  
  const stock_value = quantity_after * average_cost;

  const idempotency_key = (entryInput as any).idempotency_key || `idem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const sync_status = (entryInput as any).sync_status || 'PENDING';
  const event_version = (entryInput as any).event_version || Date.now();

  // 3. Save Ledger Entry
  const ledgerEntry: StockLedgerEntry = {
    ...entryInput,
    id,
    quantity_before,
    quantity_after,
    created_at,
    synced,
    idempotency_key,
    event_version,
    sync_status,
    retry_count: 0
  };

  await db.stockLedger.put(ledgerEntry);

  // 4. Update Balance Cache
  const updatedBalance: ProductBranchStock = {
    id: balance ? balance.id : `sb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    tenant_id: entryInput.tenant_id,
    branch_id: entryInput.branch_id,
    warehouse_id: entryInput.warehouse_id,
    product_id: entryInput.product_id,
    variant_id: variantKey,
    current_quantity: quantity_after,
    average_cost,
    stock_value,
    updated_at: created_at
  };

  await db.stockBalance.put(updatedBalance);

  // 5. Update Simple Display Stock in Products / ProductVariants tables
  if (entryInput.variant_id) {
    const variant = await db.productVariants.get(entryInput.variant_id);
    if (variant) {
      const updatedVariant = { ...variant, stock: quantity_after, syncStatus: 'PENDING' as const, isSynced: 0 };
      await db.productVariants.put(updatedVariant);
      
      await db.syncQueue.add({
        actionType: 'UPDATE',
        entityName: 'productVariants',
        payload: updatedVariant,
        timestamp: Date.now(),
        status: 'Pending'
      });
      
      const effectiveParentId = variant.productId || entryInput.product_id;
      if (effectiveParentId) {
        await syncParentStock(effectiveParentId);
      }
    }
  } else {
    const product = await db.products.get(entryInput.product_id);
    if (product) {
      if (product.hasVariants) {
        await syncParentStock(entryInput.product_id);
      } else {
        const updatedProd = { ...product, stock: quantity_after, syncStatus: 'PENDING' as const };
        await db.products.put(updatedProd);

        const { mapProductToCloud } = await import('../services/productService');
        await db.syncQueue.add({
          actionType: 'UPDATE',
          entityName: 'products',
          payload: mapProductToCloud(updatedProd),
          timestamp: Date.now(),
          status: 'Pending'
        });
      }
    }
  }

  // 6. Enqueue into Transactional Outbox for resilient background delivery
  try {
    await db.syncOutbox.put({
      outbox_id: `outbox-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      operation_id: `op-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      idempotency_key,
      tenant_id: entryInput.tenant_id,
      branch_id: entryInput.branch_id,
      entity: 'stockLedger',
      action: 'INSERT_EVENT',
      payload: ledgerEntry,
      status: 'PENDING',
      retry_count: 0,
      max_retries: 5,
      created_at: created_at,
      updated_at: created_at,
    });
  } catch (_) {}

  return ledgerEntry;
}

export async function recalculateStockFromLedger(productId: string, branchId: string) {
  const movements = await db.stockLedger
    .where('product_id')
    .equals(productId)
    .toArray();
    
  const branchMovements = movements
    .filter(m => m.branch_id === branchId)
    .sort((a, b) => a.created_at - b.created_at);

  const balancesToDelete = await db.stockBalance
    .where('product_id')
    .equals(productId)
    .toArray();
  for (const b of balancesToDelete) {
    if (b.branch_id === branchId) {
      await db.stockBalance.delete(b.id);
    }
  }

  const movementsByVariant: Record<string, StockLedgerEntry[]> = {};
  for (const m of branchMovements) {
    const key = m.variant_id || 'no-variant';
    if (!movementsByVariant[key]) movementsByVariant[key] = [];
    movementsByVariant[key].push(m);
  }

  for (const [vKey, mList] of Object.entries(movementsByVariant)) {
    let current_qty = 0;
    let avg_cost = 0;

    for (const m of mList) {
      const q_before = current_qty;
      const q_after = current_qty + m.quantity_change;

      if (m.quantity_change > 0) {
        const oldCost = q_before * avg_cost;
        const newCost = m.quantity_change * m.unit_cost;
        if (q_after > 0) {
          avg_cost = (oldCost + newCost) / q_after;
        } else {
          avg_cost = m.unit_cost;
        }
      }

      current_qty = q_after;

      await db.stockLedger.update(m.id, {
        quantity_before: q_before,
        quantity_after: q_after
      });
    }

    const vId = vKey === 'no-variant' ? undefined : vKey;
    const cache: ProductBranchStock = {
      id: `sb-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      tenant_id: mList[0].tenant_id,
      branch_id: branchId,
      warehouse_id: mList[0].warehouse_id,
      product_id: productId,
      variant_id: vKey,
      current_quantity: current_qty,
      average_cost: avg_cost,
      stock_value: current_qty * avg_cost,
      updated_at: Date.now()
    };
    await db.stockBalance.put(cache);

    if (vId) {
      await db.productVariants.update(vId, { stock: current_qty });
    } else {
      await db.products.update(productId, { stock: current_qty });
    }
  }

  const product = await db.products.get(productId);
  if (product && product.hasVariants) {
    await recalculateProductStock(productId);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// DEVELOPER OPTIONS PURGE ROUTINES
// ──────────────────────────────────────────────────────────────────────────

/**
 * Developer Purge 1: Completely wipes all product catalog items, variants,
 * stock balances, and stock ledger entries for the current tenant.
 */
export async function purgeAllProducts(tenantId?: string): Promise<void> {
  console.info('[DeveloperPurge] Beginning purgeAllProducts for tenantId:', tenantId);
  return db.transaction('rw', [db.products, db.productVariants, db.stockBalance, db.stockLedger], async () => {
    if (tenantId) {
      const products = await db.products.where('tenant_id').equals(tenantId).toArray();
      const pIds = new Set(products.map(p => p.id));
      
      await db.products.where('tenant_id').equals(tenantId).delete();
      await db.productVariants.where('tenant_id').equals(tenantId).delete();
      await db.stockBalance.where('tenant_id').equals(tenantId).delete();
      await db.stockLedger.where('tenant_id').equals(tenantId).delete();
      
      for (const pid of pIds) {
        await db.productVariants.where('productId').equals(pid).delete();
      }
    } else {
      await db.products.clear();
      await db.productVariants.clear();
      await db.stockBalance.clear();
      await db.stockLedger.clear();
    }
    console.info('[DeveloperPurge] purgeAllProducts completed successfully.');
  });
}

/**
 * Developer Purge 2: Permanently deletes all point-of-sale receipt history,
 * orders, and cashier shift logs for the current tenant.
 */
export async function purgeAllSales(tenantId?: string): Promise<void> {
  console.info('[DeveloperPurge] Beginning purgeAllSales for tenantId:', tenantId);
  const tables = [
    db.orders,
    db.receipts,
    db.receiptItems,
    db.receiptPrintLogs,
    db.receiptShareLogs,
    db.receiptAuditLogs,
    db.receiptQrCodes,
    db.receiptSignatures,
    db.receiptNumberSequences,
    db.heldCarts,
    db.posShifts,
    db.tabs,
  ];
  const dbAny = db as any;
  if (dbAny.cashMovements) tables.push(dbAny.cashMovements);
  if (dbAny.cashShifts) tables.push(dbAny.cashShifts);

  return db.transaction('rw', tables, async () => {
    if (tenantId) {
      await db.orders.where('tenant_id').equals(tenantId).delete();
      await db.receipts.where('tenant_id').equals(tenantId).delete();
      await db.receiptItems.where('tenant_id').equals(tenantId).delete();
      await db.receiptPrintLogs.where('tenant_id').equals(tenantId).delete();
      await db.receiptShareLogs.where('tenant_id').equals(tenantId).delete();
      await db.receiptAuditLogs.where('tenant_id').equals(tenantId).delete();
      await db.receiptQrCodes.where('tenant_id').equals(tenantId).delete();
      await db.receiptSignatures.where('tenant_id').equals(tenantId).delete();
      await db.receiptNumberSequences.where('tenant_id').equals(tenantId).delete();
      await db.heldCarts.where('tenant_id').equals(tenantId).delete();
      await db.posShifts.where('tenant_id').equals(tenantId).delete();
      await db.tabs.where('tenant_id').equals(tenantId).delete();
      if (dbAny.cashMovements) await dbAny.cashMovements.where('tenant_id').equals(tenantId).delete();
      if (dbAny.cashShifts) await dbAny.cashShifts.where('tenant_id').equals(tenantId).delete();
    } else {
      await db.orders.clear();
      await db.receipts.clear();
      await db.receiptItems.clear();
      await db.receiptPrintLogs.clear();
      await db.receiptShareLogs.clear();
      await db.receiptAuditLogs.clear();
      await db.receiptQrCodes.clear();
      await db.receiptSignatures.clear();
      await db.receiptNumberSequences.clear();
      await db.heldCarts.clear();
      await db.posShifts.clear();
      await db.tabs.clear();
      if (dbAny.cashMovements) await dbAny.cashMovements.clear();
      if (dbAny.cashShifts) await dbAny.cashShifts.clear();
    }

    try {
      localStorage.removeItem('dukapos_deleted_receipt_numbers');
    } catch (_) {}

    console.info('[DeveloperPurge] purgeAllSales completed successfully.');
  });
}

/**
 * Developer Purge 3: Clears customer directories, supplier records, attendance,
 * and expense ledgers.
 */
export async function purgeAllDefaultsAndUsers(tenantId?: string): Promise<void> {
  console.info('[DeveloperPurge] Beginning purgeAllDefaultsAndUsers for tenantId:', tenantId);
  return db.transaction('rw', [db.customers, db.suppliers, db.expenses, db.auditLogs], async () => {
    if (tenantId) {
      await db.customers.where('tenant_id').equals(tenantId).delete();
      await db.suppliers.where('tenant_id').equals(tenantId).delete();
      await db.expenses.where('tenant_id').equals(tenantId).delete();
      await db.auditLogs.where('tenant_id').equals(tenantId).delete();
    } else {
      await db.customers.clear();
      await db.suppliers.clear();
      await db.expenses.clear();
      await db.auditLogs.clear();
    }
    console.info('[DeveloperPurge] purgeAllDefaultsAndUsers completed successfully.');
  });
}

/**
 * Safe Dexie table lookup that guards against undefined/null/empty string keys
 * which throw TypeError: Invalid argument to table.get() in Dexie.
 */
export async function safeGet<T>(table: Table<T, any>, key: any): Promise<T | undefined> {
  if (key === undefined || key === null || key === '' || key === 'undefined' || key === 'null') {
    return undefined;
  }
  try {
    return await table.get(key);
  } catch (err) {
    console.warn(`[Dexie safeGet] Caught invalid key lookup on table ${table?.name || 'unknown'}:`, key);
    return undefined;
  }
}

// ── Law Firm / Legal Services Module Interfaces ──────────────────────────────
export interface LegalClient {
  id: string;
  tenant_id: string;
  branch_id?: string;
  type: 'INDIVIDUAL' | 'CORPORATE';
  name: string;
  company_name?: string;
  reg_number?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_id?: string;
  status: 'Active' | 'Inactive' | 'Deleted';
  is_deleted?: boolean;
  notes?: string;
  created_at: number;
  updated_at: number;
}

export interface LegalCase {
  id: string;
  tenant_id: string;
  branch_id?: string;
  case_number: string;
  title: string;
  description?: string;
  client_id: string;
  client_name?: string;
  opposing_party?: string;
  court_name?: string;
  judge_name?: string;
  filing_number?: string;
  responsible_lawyer_id?: string;
  responsible_lawyer_name?: string;
  assigned_lawyer_ids?: string[];
  status: 'INTAKE' | 'CONFLICT_CHECK' | 'OPEN' | 'IN_PROGRESS' | 'ON_HOLD' | 'SETTLED' | 'WON' | 'LOST' | 'CLOSED' | 'ARCHIVED';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  confidentiality_level?: 'Standard' | 'Confidential' | 'Highly Confidential';
  is_deleted?: boolean;
  notes?: string;
  created_at: number;
  updated_at: number;
}

export interface LegalConflictCheck {
  id: string;
  tenant_id: string;
  case_title: string;
  party_searched: string;
  match_found: boolean;
  match_type?: string;
  related_case_id?: string;
  acknowledged_by?: string;
  acknowledgment_notes?: string;
  timestamp: number;
}

export interface LegalHearing {
  id: string;
  tenant_id: string;
  case_id: string;
  case_number?: string;
  event_type: 'HEARING' | 'MENTION' | 'FILING_DEADLINE' | 'MEDIATION' | 'CONFERENCE' | 'OTHER';
  title: string;
  date_time: string;
  location?: string;
  judge_name?: string;
  notes?: string;
  status: 'Scheduled' | 'Completed' | 'Postponed' | 'Cancelled';
  created_at: number;
}

export interface LegalTask {
  id: string;
  tenant_id: string;
  case_id: string;
  title: string;
  description?: string;
  assigned_user_id?: string;
  assigned_user_name?: string;
  due_date: string;
  status: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
  priority: 'Low' | 'Medium' | 'High';
  created_at: number;
}

export interface LegalDocument {
  id: string;
  tenant_id: string;
  case_id: string;
  title: string;
  category: 'Pleadings' | 'Contracts' | 'Affidavits' | 'Court Filings' | 'Evidence' | 'Correspondence' | 'Invoices' | 'Other';
  file_path?: string;
  file_size?: number;
  mime_type?: string;
  version: number;
  uploaded_by: string;
  confidentiality: 'Internal' | 'Client Visible' | 'Confidential';
  created_at: number;
}

export interface LegalTimeEntry {
  id: string;
  tenant_id: string;
  case_id: string;
  lawyer_id: string;
  lawyer_name?: string;
  date: string;
  duration_minutes: number;
  hourly_rate: number;
  billable_amount: number;
  is_billed: boolean;
  description: string;
  created_at: number;
}

export interface LegalRetainer {
  id: string;
  tenant_id: string;
  client_id: string;
  case_id?: string;
  total_deposited: number;
  current_balance: number;
  minimum_threshold: number;
  status: 'Active' | 'Low Balance' | 'Depleted';
  updated_at: number;
}


export interface LegalTimelineEntry {
  id: string;
  tenant_id: string;
  case_id: string;
  actor_name: string;
  event_type: string;
  description: string;
  timestamp: number;
}

// ─── Pharmacy Management Module Interfaces (v36) ──────────────────────────────

export interface PharmacyPatient {
  id: string;
  tenant_id: string;
  branch_id?: string;
  patient_code: string;
  name: string;
  gender?: 'Male' | 'Female' | 'Other';
  date_of_birth?: string;
  phone?: string;
  email?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  allergies?: string[];
  chronic_diseases?: string[];
  blood_group?: string;
  nhif_number?: string;
  insurance_provider_id?: string;
  insurance_member_no?: string;
  credit_limit?: number;
  outstanding_credit?: number;
  loyalty_points?: number;
  notes?: string;
  status: 'Active' | 'Inactive';
  created_at: number;
  updated_at: number;
}

export interface PharmacyDoctor {
  id: string;
  tenant_id: string;
  registration_number: string;
  name: string;
  specialty?: string;
  hospital?: string;
  clinic?: string;
  phone?: string;
  email?: string;
  address?: string;
  status: 'Active' | 'Inactive';
  notes?: string;
  created_at: number;
  updated_at: number;
}

export interface MedicineBatch {
  id: string;
  tenant_id: string;
  branch_id: string;
  product_id: string;
  product_name?: string;
  batch_number: string;
  manufacturing_date?: string;
  expiry_date: string;
  supplier_id?: string;
  supplier_name?: string;
  purchase_order_id?: string;
  goods_receipt_id?: string;
  quantity_received: number;
  quantity_remaining: number;
  cost_price: number;
  selling_price?: number;
  warehouse_id?: string;
  warehouse_name?: string;
  is_controlled?: boolean;
  is_locked?: boolean;
  lock_reason?: string;
  status: 'Active' | 'Low' | 'Expired' | 'Recalled' | 'Disposed' | 'Locked';
  created_at: number;
  updated_at: number;
}

export interface Prescription {
  id: string;
  tenant_id: string;
  branch_id: string;
  prescription_number: string;
  patient_id?: string;
  patient_name?: string;
  doctor_id?: string;
  doctor_name?: string;
  hospital?: string;
  diagnosis?: string;
  prescription_date: string;
  expiry_date?: string;
  image_url?: string;
  attachment_url?: string;
  is_repeat?: boolean;
  repeat_count?: number;
  refills_allowed?: number;
  refills_used?: number;
  notes?: string;
  status: 'Pending' | 'Verified' | 'Dispensing' | 'Partial' | 'Completed' | 'Expired' | 'Cancelled';
  created_by?: string;
  created_at: number;
  updated_at: number;
}

export interface PrescriptionItem {
  id: string;
  prescription_id: string;
  tenant_id: string;
  product_id: string;
  product_name?: string;
  generic_name?: string;
  dosage_form?: string;
  strength?: string;
  quantity_prescribed: number;
  quantity_dispensed: number;
  batch_id?: string;
  batch_number?: string;
  dosage_instructions?: string;
  frequency?: string;
  duration?: string;
  status: 'Pending' | 'Partial' | 'Dispensed';
  created_at: number;
}

export interface Dispensing {
  id: string;
  tenant_id: string;
  branch_id: string;
  dispensing_number?: string;
  prescription_id?: string;
  patient_id?: string;
  patient_name?: string;
  pharmacist_id?: string;
  pharmacist_name?: string;
  is_otc: boolean;
  total_amount: number;
  insurance_amount?: number;
  patient_amount?: number;
  insurance_provider_id?: string;
  claim_id?: string;
  payment_method?: string;
  notes?: string;
  status: 'In Progress' | 'Completed' | 'Cancelled';
  created_at: number;
  updated_at: number;
}

export interface DispensingItem {
  id: string;
  dispensing_id: string;
  tenant_id: string;
  product_id: string;
  product_name?: string;
  batch_id: string;
  batch_number?: string;
  expiry_date?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  label_printed?: boolean;
  dosage_instructions?: string;
  created_at: number;
}

export interface DrugInteraction {
  id: string;
  tenant_id: string;
  drug_a_id: string;
  drug_a_name?: string;
  drug_b_id: string;
  drug_b_name?: string;
  severity: 'Mild' | 'Moderate' | 'Severe' | 'Contraindicated';
  description: string;
  clinical_effect?: string;
  management?: string;
  created_at: number;
}

export interface InsuranceProvider {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  type: 'NHIF' | 'Private' | 'Corporate' | 'Government';
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  claim_submission_email?: string;
  payment_terms_days?: number;
  coverage_percentage?: number;
  status: 'Active' | 'Inactive';
  created_at: number;
  updated_at: number;
}

export interface InsuranceClaim {
  id: string;
  tenant_id: string;
  branch_id: string;
  claim_number?: string;
  provider_id: string;
  provider_name?: string;
  patient_id?: string;
  patient_name?: string;
  insurance_member_no?: string;
  sale_id?: string;
  dispensing_id?: string;
  prescription_id?: string;
  claim_amount: number;
  approved_amount?: number;
  rejection_reason?: string;
  submitted_at?: number;
  approved_at?: number;
  paid_at?: number;
  notes?: string;
  status: 'Draft' | 'Submitted' | 'Approved' | 'Rejected' | 'Paid' | 'Cancelled';
  created_at: number;
  updated_at: number;
}

export interface ControlledDrugEntry {
  id: string;
  tenant_id: string;
  branch_id: string;
  product_id: string;
  product_name?: string;
  batch_id: string;
  batch_number?: string;
  prescription_id?: string;
  prescription_number?: string;
  patient_id?: string;
  patient_name?: string;
  patient_id_number?: string;
  doctor_id?: string;
  doctor_name?: string;
  doctor_registration?: string;
  pharmacist_id?: string;
  pharmacist_name?: string;
  quantity_dispensed: number;
  balance_before: number;
  balance_after: number;
  witness_name?: string;
  notes?: string;
  approved_by?: string;
  created_at: number;
}

export interface MedicineRecall {
  id: string;
  tenant_id: string;
  product_id: string;
  product_name?: string;
  batch_id?: string;
  batch_number?: string;
  recall_type: 'Voluntary' | 'Regulatory' | 'Precautionary';
  reason: string;
  regulatory_body?: string;
  notice_number?: string;
  affected_quantity?: number;
  returned_quantity?: number;
  status: 'Initiated' | 'In Progress' | 'Completed' | 'Closed';
  initiated_by?: string;
  initiated_at: number;
  completed_at?: number;
  notes?: string;
  created_at: number;
}

// ExpiryAlert is defined earlier in this file — do not redefine here.

export interface PharmacyAuditLog {
  id: string;
  tenant_id: string;
  branch_id?: string;
  user_id: string;
  user_name?: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  old_value?: string;
  new_value?: string;
  ip_address?: string;
  notes?: string;
  created_at: number;
}

// ─── Enterprise Document Handling ─────────────────────────────────────────────
export interface DocumentAttachment {
  id: string;
  tenant_id: string;
  branch_id?: string;
  module: 'General' | 'POS' | 'Inventory' | 'Purchasing' | 'Expenses' | 'Pharmacy' | 'PoultryLivestock' | 'LawFirm';
  entity_type: string; // 'Animal' | 'BirdBatch' | 'VeterinaryVisit' | 'Prescription' | 'PurchaseOrder' | 'Expense' | 'Customer' | 'Employee'
  entity_id: string;
  file_name: string;
  file_type: string;
  file_size_bytes: number;
  storage_provider: 'local_indexeddb' | 'gcs_cloud' | 's3_aws';
  storage_path: string; // Remote URL or Base64 / Blob Data key
  data_base64?: string; // Offline preview payload
  sha256_hash?: string;
  ocr_extracted_text?: string;
  tags?: string[];
  is_confidential?: boolean;
  uploaded_by?: string;
  created_at: number;
  updated_at?: number;
  deleted_at?: number | null;
}

// ─── Poultry & Livestock Module Schemas ────────────────────────────────────────

export interface Farm {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_name: string;
  farm_code: string;
  farm_type: 'Poultry' | 'Dairy' | 'Beef Cattle' | 'Goat' | 'Sheep' | 'Piggery' | 'Rabbit' | 'Hatchery' | 'Mixed';
  owner_name?: string;
  manager_name?: string;
  address?: string;
  gps_coordinates?: string;
  capacity_units?: number;
  status: 'Active' | 'Inactive' | 'Under Maintenance';
  description?: string;
  created_at: number;
}

export interface FarmHouse {
  id: string;
  tenant_id: string;
  farm_id: string;
  house_name: string;
  house_type: 'Poultry House' | 'Dairy Unit' | 'Pig Pen' | 'Goat House' | 'Sheep Barn' | 'Hatchery' | 'Storage' | 'Paddock';
  capacity: number;
  current_occupancy: number;
  temperature_celsius?: number;
  humidity_percent?: number;
  status: 'Active' | 'Sanitizing' | 'Empty' | 'Maintenance';
  created_at: number;
}

export interface BirdBatch {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_id: string;
  house_id?: string;
  batch_number: string;
  bird_type: 'Broiler' | 'Layer' | 'Breeder' | 'Duck' | 'Turkey' | 'Quail';
  breed: string;
  supplier?: string;
  arrival_date: string;
  initial_quantity: number;
  current_quantity: number;
  accumulated_mortality: number;
  accumulated_culled: number;
  initial_cost: number;
  total_feed_consumed_kg: number;
  current_total_weight_kg: number;
  fcr?: number; // Feed Conversion Ratio
  status: 'Active' | 'Sold' | 'Closed' | 'Quarantined';
  created_at: number;
}

export interface LivestockAnimal {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_id: string;
  house_id?: string;
  animal_id: string; // e.g. COW-0042
  tag_number: string;
  rfid_tag?: string;
  qr_code?: string;
  name?: string;
  species: 'Cattle' | 'Goat' | 'Sheep' | 'Pig' | 'Horse' | 'Rabbit';
  breed: string;
  gender: 'Male' | 'Female';
  birth_date?: string;
  color?: string;
  weight_kg: number;
  dam_id?: string; // Mother
  sire_id?: string; // Father
  purchase_date?: string;
  purchase_cost?: number;
  status: 'Healthy' | 'Sick' | 'Pregnant' | 'Lactating' | 'Quarantined' | 'Sold' | 'Deceased';
  created_at: number;
}

export interface LivestockBreed {
  id: string;
  tenant_id: string;
  species: string;
  breed_name: string;
  avg_weight_kg?: number;
  avg_production_daily?: string;
  expected_lifespan_months?: number;
  created_at: number;
}

export interface FeedItem {
  id: string;
  tenant_id: string;
  branch_id: string;
  feed_name: string;
  category: 'Starter' | 'Grower' | 'Finisher' | 'Layer Mash' | 'Dairy Meal' | 'Silage' | 'Hay' | 'Concentrate';
  manufacturer?: string;
  protein_percent?: number;
  energy_kcal?: number;
  unit_of_measure: 'KG' | 'BAG_50KG' | 'TON';
  stock_quantity: number;
  reorder_level: number;
  cost_per_unit: number;
  created_at: number;
}

export interface FeedConsumption {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_id: string;
  batch_id?: string;
  animal_id?: string;
  feed_id: string;
  feed_name: string;
  quantity_kg: number;
  cost_amount: number;
  date: string;
  created_at: number;
}

export interface WaterConsumption {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_id: string;
  house_id?: string;
  liters_used: number;
  water_source?: string;
  cost_amount: number;
  date: string;
  created_at: number;
}

export interface VaccinationRecord {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_id: string;
  batch_id?: string;
  animal_id?: string;
  vaccine_name: string;
  dosage: string;
  scheduled_date: string;
  administered_date?: string;
  administered_by?: string;
  status: 'Scheduled' | 'Completed' | 'Overdue' | 'Skipped';
  notes?: string;
  created_at: number;
}

export interface LivestockHealthRecord {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_id: string;
  batch_id?: string;
  animal_id?: string;
  diagnosis: string;
  symptoms?: string;
  treatment_administered?: string;
  medication_name?: string;
  cost: number;
  veterinarian_name?: string;
  status: 'Under Treatment' | 'Recovered' | 'Quarantined' | 'Deceased';
  created_at: number;
}

export interface VeterinaryVisit {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_id: string;
  veterinarian_name: string;
  clinic_company?: string;
  visit_date: string;
  purpose: string;
  findings?: string;
  recommendations?: string;
  total_cost: number;
  created_at: number;
}

export interface BreedingRecord {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_id: string;
  female_animal_id: string;
  male_animal_id?: string;
  mating_type: 'Natural' | 'Artificial Insemination';
  mating_date: string;
  expected_delivery_date: string;
  actual_delivery_date?: string;
  offspring_count?: number;
  status: 'Serviced' | 'Confirmed Pregnant' | 'Delivered' | 'Failed / Repeat';
  notes?: string;
  created_at: number;
}

export interface HatcheryIncubator {
  id: string;
  tenant_id: string;
  farm_id: string;
  incubator_name: string;
  capacity_eggs: number;
  temperature_setting: number;
  humidity_setting: number;
  status: 'Running' | 'Idle' | 'Maintenance';
  created_at: number;
}

export interface HatchCycle {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_id: string;
  incubator_id: string;
  batch_number: string;
  total_eggs_set: number;
  fertile_eggs_candled?: number;
  hatched_chicks?: number;
  cull_chicks?: number;
  hatchability_percent?: number;
  fertility_percent?: number;
  set_date: string;
  expected_hatch_date: string;
  actual_hatch_date?: string;
  status: 'Incubating' | 'Candled' | 'Hatched' | 'Failed';
  created_at: number;
}

export interface EggProduction {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_id: string;
  house_id?: string;
  batch_id?: string;
  collection_date: string;
  grade_a_count: number;
  grade_b_count: number;
  damaged_count: number;
  total_eggs: number;
  trays_count: number; // 30 eggs per tray
  collector_name?: string;
  created_at: number;
}

export interface MilkProduction {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_id: string;
  animal_id: string;
  session: 'Morning' | 'Afternoon' | 'Evening';
  liters_yield: number;
  fat_percent?: number;
  protein_percent?: number;
  session_date: string;
  milker_name?: string;
  created_at: number;
}

export interface WeightRecord {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_id: string;
  batch_id?: string;
  animal_id?: string;
  weigh_date: string;
  weight_kg: number;
  average_daily_gain_kg?: number;
  notes?: string;
  created_at: number;
}

export interface LivestockTask {
  id: string;
  tenant_id: string;
  branch_id: string;
  farm_id: string;
  task_title: string;
  task_type: 'Feeding' | 'Cleaning' | 'Vaccination' | 'Milking' | 'Egg Collection' | 'Inspection' | 'Maintenance';
  assigned_to?: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  due_date: string;
  status: 'Pending' | 'In Progress' | 'Completed' | 'Overdue';
  notes?: string;
  created_at: number;
}
