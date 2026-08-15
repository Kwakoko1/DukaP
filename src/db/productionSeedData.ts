/**
 * Production seed data for the client-side CloudDb (IndexedDB).
 * This is the committed source of truth seeded into the browser on first load.
 *
 * Rules:
 *  - NO tenant data here — tenants must register through the app.
 *  - Only Super Admin user and subscription plans are pre-seeded.
 *  - cloud_db.json is gitignored (local dev only); this file is the build-time seed.
 */

export const PRODUCTION_SEED_DATA = {
  isProductionLocked: true,

  tenants: [] as any[],
  branches: [] as any[],

  users: [
    {
      id: 'usr-superadmin',
      email: 'admin@kwakoko.co.tz',
      password_hash: 'Kwakoko@2026&$',
      is_super_admin: true,
      name: 'System Platform Owner',
      phone: '+255713296319',
      tenant_id: 'tenant-admin-system',
      role: 'Super Admin',
      status: 'Active'
    }
  ],

  userSecurity: [
    {
      user_id: 'usr-superadmin',
      pin_hash: '1911',
      failed_attempts: 0,
      two_factor_enabled: false
    }
  ],

  subscriptionPlans: [
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
      is_active: true
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
      is_active: true
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
      is_active: true
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
      is_active: true
    }
  ],

  products: [] as any[],
  variants: [] as any[],
  orders: [] as any[],
  stockLedger: [] as any[],
  customers: [] as any[],
  userBranchRoles: [] as any[],
  tenantModules: [] as any[],
  tenantSettings: [] as any[],
  featureFlags: [] as any[],
  businessProfiles: [] as any[],
  tenantSubscriptions: [] as any[],
  tenantUserBranches: [] as any[],
  tenantUsers: [] as any[],
  sync: [] as any[],
  subscriptions: [] as any[],
  auditLogs: [] as any[]
} as const;
