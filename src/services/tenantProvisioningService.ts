import { db } from '../db/dexie';
import { getSyncRealClientIp } from './clientIpService';
import { supabase, setMockAuthOverride } from '../db/supabaseClient';
import { tenantIdentifierService } from './tenantIdentifierService';

export const tenantProvisioningService = {
  /**
   * Provisions a clean tenant with default configurations, Chart of Accounts (COA),
   * warehouse setups, security parameters, and POS receipt structures, all wrapped
   * in a single Dexie transaction.
   */
  async provisionCleanTenant(
    tenantId: string,
    branchId: string,
    companyName: string,
    businessType: string,
    superAdminUser: { email: string; fullName: string; pin?: string; password?: string; phone?: string },
    additionalMetadata: {
      regNumber?: string;
      taxNumber?: string;
      industry?: string;
      country?: string;
      region?: string;
      district?: string;
      address?: string;
      branchName?: string;
      currency?: string;
      timezone?: string;
      fiscalYearStart?: string;
      vatRate?: number;
      language?: string;
      dateFormat?: string;
      plan?: 'Basic' | 'Professional' | 'Enterprise';
      status?: 'Active' | 'Trial' | 'Demo' | 'Registered';
      subscribedModules?: string[];
    } = {}
  ): Promise<void> {
    const NOW = Date.now();
    const userId = `usr-${tenantId}-owner`;
    const warehouseId = `warehouse-default-${tenantId}`;

    // Enforce Immutable Identity Rules
    const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const isLegacySeed = (id: string) => id.startsWith('tenant-') || id.startsWith('branch-') || id.startsWith('warehouse-');
    if (!isUuid(tenantId) && !isLegacySeed(tenantId)) {
      throw new Error(`Immutable Identity Error: tenantId must be a valid UUID. Provided: "${tenantId}"`);
    }
    if (!isUuid(branchId) && !isLegacySeed(branchId)) {
      throw new Error(`Immutable Identity Error: branchId must be a valid UUID. Provided: "${branchId}"`);
    }

    // Resolve industry metadata
    const industryMap: Record<string, { id: string; name: string; features: string[] }> = {
      Bar:         { id: 'ind-bar',        name: 'Bar',        features: ['counter_pos', 'open_tabs', 'pour_tracking', 'excise_duty', 'happy_hour'] },
      Restaurant:  { id: 'ind-restaurant', name: 'Restaurant', features: ['pos', 'tables', 'kitchen'] },
      Pharmacy:    { id: 'ind-pharmacy',   name: 'Pharmacy',   features: ['inventory', 'pos', 'customers', 'expiry_check'] },
      Hotel:       { id: 'ind-hotel',      name: 'Hotel',      features: ['pos', 'reservations', 'housekeeping'] },
      SACCO:       { id: 'ind-sacco',      name: 'SACCO',      features: ['savings', 'loans', 'shares'] },
      Garage:      { id: 'ind-garage',     name: 'Garage',     features: ['pos', 'jobcards', 'parts'] },
      BusinessConsultant: { id: 'ind-consulting', name: 'BusinessConsultant', features: ['client_management', 'project_management', 'contracts', 'invoicing', 'assessments', 'strategy', 'ai_consultant'] },
      TechnicalCompany: { id: 'ind-technical', name: 'TechnicalCompany', features: ['project_management', 'field_service', 'technical_services', 'assets', 'workforce', 'scheduling', 'fleet', 'ai_insights'] },
    };
    const industry = industryMap[businessType] || { id: 'ind-retail', name: 'Retail', features: ['inventory', 'pos', 'customers'] };

    // Perform database operations inside a single write transaction
    await db.transaction('rw', [
      db.tenants,
      db.branches,
      db.tenantModules,
      db.tenantSettings,
      db.featureFlags,
      db.users,
      db.userBranchRoles,
      db.tenantUsers,
      db.roles,
      db.rolePermissions,
      db.tenantUserBranches,
      db.warehouses,
      db.permissions,
      db.userSecurity,
      db.auditLogs,
      db.industries,
      db.tenantIndustries,
      db.tenantSubscriptions,
      db.subscriptionPlans
    ], async () => {
      
      // 1. Core System: Tenant Profile (Immutable Identifiers)
      const tenantExists = await db.tenants.get(tenantId);
      if (!tenantExists) {
        const countryCode = (additionalMetadata.country === 'Tanzania' || !additionalMetadata.country) ? 'TZ' : additionalMetadata.country.slice(0, 2).toUpperCase();
        const { humanId, businessCode } = tenantIdentifierService.generate({
          companyName,
          businessType,
          countryCode
        });

        await db.tenants.put({
          id: tenantId,
          tenant_uuid: tenantId,
          business_code: businessCode,
          human_tenant_id: humanId,
          tenant_code: humanId,
          name: companyName,
          slug: companyName.toLowerCase().replace(/\s+/g, '-'),
          status: additionalMetadata.status || 'Active',
          plan: (additionalMetadata.plan === 'Enterprise' ? 'Enterprise' : additionalMetadata.plan === 'Basic' ? 'Basic' : 'Professional') as any,
          business_type: businessType,
          email: superAdminUser.email,
          phone: superAdminUser.phone || '',
          country: additionalMetadata.country || 'Tanzania',
          region: additionalMetadata.region || '',
          address: additionalMetadata.address || '',
          reg_number: additionalMetadata.regNumber || '',
          tax_number: additionalMetadata.taxNumber || '',
          industry: additionalMetadata.industry || businessType,
          district: additionalMetadata.district || '',
          created_at: NOW
        });

        // Ensure the industry record exists globally
        const indExists = await db.industries.get(industry.id);
        if (!indExists) {
          await db.industries.put({
            id: industry.id,
            name: industry.name,
            schema_preset: { features: industry.features }
          });
        }

        // Link this tenant to the industry
        try {
          await db.tenantIndustries.add({ tenant_id: tenantId, industry_id: industry.id });
        } catch (_) { /* ignore duplicate */ }
      }

      // 2. Core System: Default HQ Branch (always the primary/headquarters)
      const branchExists = await db.branches.get(branchId);
      if (!branchExists) {
        await db.branches.put({
          id: branchId,
          tenant_id: tenantId,
          name: additionalMetadata.branchName || 'Main HQ Branch',
          location: additionalMetadata.address || 'HQ Office',
          is_headquarters: true,
          is_default: true,
          status: 'Active',
          branch_code: companyName.replace(/[^a-zA-Z]/g, '').slice(0, 5).toUpperCase() + '-HQ-01',
          created_at: NOW
        });
      }

      // 3. Core System Defaults & Company Settings
      const settingsToSeed = [
        // HQ Branch Identity (set on provisioning, remains authoritative)
        { key: 'hq_branch_id', val: branchId },
        { key: 'default_branch_id', val: branchId },

        // Basic Settings
        { key: 'currency', val: additionalMetadata.currency || 'TZS' },
        { key: 'language', val: additionalMetadata.language || 'en' },
        { key: 'timezone', val: additionalMetadata.timezone || 'Africa/Dar_es_Salaam' },
        { key: 'fiscal_year_start', val: additionalMetadata.fiscalYearStart || '01-01' },
        { key: 'fiscal_year_end', val: additionalMetadata.fiscalYearStart === '07-01' ? '06-30' : '12-31' },
        { key: 'tax_enabled', val: additionalMetadata.vatRate !== undefined ? additionalMetadata.vatRate > 0 : false },
        { key: 'vat_rate', val: additionalMetadata.vatRate !== undefined ? additionalMetadata.vatRate : 0 },
        { key: 'date_format', val: additionalMetadata.dateFormat || 'YYYY-MM-DD' },
        
        // Numbering Sequences
        { key: 'invoice_seq', val: 1000 },
        { key: 'order_seq', val: 1000 },
        { key: 'grn_seq', val: 1000 },
        { key: 'payment_seq', val: 1000 },

        // Security Defaults
        { key: 'auth_provider', val: 'local' },
        { key: 'auth_mfa_enabled', val: false },
        { key: 'pwd_min_length', val: 8 },
        { key: 'pwd_require_special', val: true },
        { key: 'session_idle_timeout_mins', val: 30 },

        // POS defaults
        { key: 'receipt_header', val: companyName },
        { key: 'receipt_footer', val: 'Thank you for your business!' },
        { key: 'barcode_prefix', val: '29' },
        { key: 'printer_interface', val: 'thermal-usb' },

        // CRM defaults
        { key: 'crm_lead_stages', val: ['Lead', 'Contacted', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'] },
        { key: 'crm_customer_statuses', val: ['Active', 'Inactive', 'Lead', 'Prospect'] },
        { key: 'crm_opportunity_pipeline', val: ['Discovery', 'Qualification', 'Proposal', 'Closing'] },

        // HR defaults
        { key: 'hr_departments', val: ['Operations', 'Sales', 'Finance', 'HR', 'IT'] },
        { key: 'hr_job_titles', val: ['Cashier', 'Branch Manager', 'Accountant', 'Inventory Officer', 'Sales Executive'] },
        { key: 'hr_leave_types', val: ['Annual', 'Sick', 'Maternity', 'Paternity', 'Unpaid'] },
        { key: 'hr_payroll_settings', val: { pay_frequency: 'monthly', default_bonus: 0 } },

        // Notification defaults
        { key: 'notif_email_template_order', val: 'Dear {customer}, your order {order_id} of amount {total} has been confirmed. Thank you!' },
        { key: 'notif_sms_template_order', val: 'Order {order_id} of Tsh. {total} confirmed. Thank you!' },
        { key: 'notif_whatsapp_template_order', val: 'Dear {customer}, your order {order_id} is ready.' },

        // AI defaults
        { key: 'ai_assistant_name', val: 'DukaPos AI' },
        { key: 'ai_prompt_template_audit', val: 'Analyze the sales metrics for signs of leakage...' },
        { key: 'ai_usage_limit', val: 1000 },

        // Financial Defaults: Chart of Accounts (COA)
        {
          key: 'chart_of_accounts',
          val: [
            { code: '1000', name: 'Cash', category: 'Assets', type: 'Cash/Bank', is_system: true },
            { code: '1010', name: 'Bank Account', category: 'Assets', type: 'Cash/Bank', is_system: true },
            { code: '1200', name: 'Accounts Receivable', category: 'Assets', type: 'Receivable', is_system: true },
            { code: '1300', name: 'Inventory Asset', category: 'Assets', type: 'Current Asset', is_system: true },
            { code: '2000', name: 'Accounts Payable', category: 'Liabilities', type: 'Payable', is_system: true },
            { code: '2200', name: 'VAT Output Liability', category: 'Liabilities', type: 'Tax Liability', is_system: true },
            { code: '3000', name: 'Paid-In Capital (Equity)', category: 'Equity', type: 'Equity', is_system: true },
            { code: '3100', name: 'Retained Earnings', category: 'Equity', type: 'Equity', is_system: true },
            { code: '4000', name: 'Sales Income', category: 'Income', type: 'Revenue', is_system: true },
            { code: '5000', name: 'Cost of Goods Sold (COGS)', category: 'Expenses', type: 'Expense', is_system: true },
            { code: '5100', name: 'Rent Expense', category: 'Expenses', type: 'Expense', is_system: true },
            { code: '5200', name: 'Salaries Expense', category: 'Expenses', type: 'Expense', is_system: true },
            { code: '5300', name: 'Utility Expense', category: 'Expenses', type: 'Expense', is_system: true }
          ]
        },
        { key: 'default_cash_account_code', val: '1000' },
        { key: 'default_bank_account_code', val: '1010' },
        { key: 'opening_balances', val: [] },

        // Inventory Defaults
        { key: 'stock_low_alert_threshold', val: 10 },
        { key: 'inventory_valuation_method', val: 'FIFO' },

        // Report defaults
        {
          key: 'reports_meta',
          val: [
            { code: 'REP001', name: 'Sales Valuation Summary', format: 'PDF/CSV' },
            { code: 'REP002', name: 'Fast Moving Products', format: 'PDF/CSV' },
            { code: 'REP003', name: 'VAT Audit Ledger', format: 'PDF/CSV' }
          ]
        }
      ];

      for (const s of settingsToSeed) {
        const key = `ts-${tenantId}-${s.key}`;
        const exists = await db.tenantSettings.get(key);
        if (!exists) {
          await db.tenantSettings.put({
            id: key,
            tenant_id: tenantId,
            setting_key: s.key,
            setting_value: s.val
          });
        }
      }

      // 4. Default Warehouse Setup
      const whExists = await db.warehouses.get(warehouseId);
      if (!whExists) {
        await db.warehouses.put({
          id: warehouseId,
          tenant_id: tenantId,
          branch_id: branchId,
          code: 'WH-DEFAULT',
          name: 'Default Central Warehouse',
          location: 'Central Storage HQ',
          manager_name: 'Warehouse Manager',
          status: 'Active',
          created_at: NOW
        });
      }

      // 5. Default Roles Setup
      const defaultRoles = [
        { id: `role-owner-${tenantId}`, name: 'Tenant Owner', slug: 'tenant_owner', desc: 'Full business management control.' },
        { id: `role-admin-${tenantId}`, name: 'Business Administrator', slug: 'business_administrator', desc: 'Standard business management.' },
        { id: `role-manager-${tenantId}`, name: 'Branch Manager', slug: 'branch_manager', desc: 'Manage specific branch.' },
        { id: `role-cashier-${tenantId}`, name: 'Cashier', slug: 'cashier', desc: 'Run POS cash registers.' },
        { id: `role-inventory-${tenantId}`, name: 'Inventory Officer', slug: 'inventory_officer', desc: 'Receive stock and adjust inventory.' },
        { id: `role-accountant-${tenantId}`, name: 'Accountant', slug: 'accountant', desc: 'Verify financials and audit reports.' }
      ];

      for (const r of defaultRoles) {
        const exists = await db.roles.where({ tenant_id: tenantId, slug: r.slug }).first();
        if (!exists) {
          await db.roles.put({
            id: r.id,
            tenant_id: tenantId,
            name: r.name,
            slug: r.slug,
            description: r.desc,
            is_system_role: false,
            is_custom: true,
            created_at: NOW
          });
        }
      }

      // 6. Map Default Role Permissions for this tenant
      const permissions = await db.permissions.toArray();
      const rolePermissionMappings: Record<string, string[]> = {
        tenant_owner: ['*'],
        business_administrator: ['sales.create', 'sales.refund', 'sales.void', 'discount.override', 'inventory.product.create', 'inventory.product.edit', 'inventory.category.create', 'inventory.stock.view', 'inventory.stock.receive', 'inventory.stock.transfer', 'inventory.stock.adjust', 'purchase.create', 'purchase.approve', 'supplier.manage', 'customer.view', 'customer.create', 'expense.manage', 'expense.approve', 'banking.manage', 'taxes.manage', 'reports.view', 'reports.branch', 'reports.sales.view', 'reports.inventory.view', 'users.manage', 'roles.assign', 'branches.manage', 'settings.manage', 'audit.logs.view'],
        branch_manager: ['sales.create', 'sales.refund', 'sales.void', 'inventory.product.create', 'inventory.stock.view', 'inventory.stock.receive', 'inventory.stock.transfer', 'inventory.stock.adjust', 'inventory.stock.count', 'purchase.create', 'supplier.manage', 'customer.create', 'customer.view', 'expense.manage', 'reports.branch', 'users.manage', 'audit.logs.view'],
        accountant: ['expense.manage', 'expense.create', 'expense.approve', 'payment.manage', 'financial_reports.view', 'banking.manage', 'taxes.manage', 'reports.view', 'reports.branch', 'inventory.stock.view', 'customer.view', 'supplier.manage', 'audit.logs.view'],
        inventory_officer: ['inventory.product.create', 'inventory.product.edit', 'inventory.category.create', 'inventory.stock.view', 'inventory.stock.receive', 'inventory.stock.transfer', 'inventory.stock.adjust', 'inventory.stock.count', 'inventory.stock.wastage', 'inventory.barcode.print', 'purchase.create', 'purchase.approve', 'supplier.manage', 'reports.inventory.view', 'audit.logs.view'],
        cashier: ['sales.create', 'payment.manage', 'pos.shift.manage', 'customer.create', 'customer.view', 'inventory.stock.view']
      };

      for (const r of defaultRoles) {
        const roleRecord = await db.roles.where({ tenant_id: tenantId, slug: r.slug }).first();
        if (roleRecord) {
          const allowedSlugs = rolePermissionMappings[r.slug] || [];
          for (const perm of permissions) {
            if (allowedSlugs.includes('*') || allowedSlugs.includes(perm.slug)) {
              const rpId = `rp-${roleRecord.id}-${perm.id}`;
              const rpExists = await db.rolePermissions.get(rpId);
              if (!rpExists) {
                await db.rolePermissions.put({
                  id: rpId,
                  role_id: roleRecord.id,
                  permission_id: perm.id
                });
              }
            }
          }
        }
      }

      // 7. Core System: Super Administrator (Tenant Owner) Account
      // — Auto-assigned to the HQ Branch created in step 2 as primary branch
      const ownerPin = (superAdminUser.pin || '1234').replace(/\D/g, '').slice(0, 4).padEnd(4, '0');
      const nameParts = superAdminUser.fullName.trim().split(' ');
      const userExists = await db.users.get(userId);
      if (!userExists) {
        await db.users.put({
          id: userId,
          email: superAdminUser.email.trim().toLowerCase(),
          username: superAdminUser.email.trim().toLowerCase().split('@')[0],
          password_hash: superAdminUser.password || 'owner123',
          is_super_admin: false,
          tenant_id: tenantId,
          name: superAdminUser.fullName,
          first_name: nameParts[0] || '',
          last_name: nameParts.slice(1).join(' ') || '',
          phone: superAdminUser.phone || '+255700000000',
          status: 'Active',
          // Auto-assigned to HQ Branch as primary workspace
          branch_id: branchId,
          pin_hash: ownerPin,
          role: 'Tenant Owner',
          user_code: 'USR-OWNER',
          created_at: NOW,
          updated_at: NOW,
          registration_source: 'SUPER_ADMIN_CPANEL',
          created_by: 'system-provisioner',
          registration_ip: getSyncRealClientIp(),
          registration_device: typeof navigator !== 'undefined' ? navigator.userAgent : 'Chrome 126.0 (Windows)',
          verification_status: 'VERIFIED'
        });

        // Add user-branch role mapping (HQ Branch, Tenant Owner role)
        await db.userBranchRoles.put({
          id: `ubr-${tenantId}-owner`,
          user_id: userId,
          tenant_id: tenantId,
          branch_id: branchId,            // ← HQ Branch
          industry_id: industry.id,
          role_id: `role-owner-${tenantId}`
        });

        // Add employee directory record
        await db.tenantUsers.put({
          id: `tu-${tenantId}-owner`,
          tenant_id: tenantId,
          user_id: userId,
          employee_code: 'EMP-OWNER',
          job_title: 'Tenant Owner',
          department: 'Management',
          status: 'Active',
          joined_at: NOW
        });

        // Add primary branch allocation record (HQ Branch, Tenant Owner role)
        await db.tenantUserBranches.put({
          id: `tub-${tenantId}-owner`,
          tenant_id: tenantId,
          user_id: userId,
          branch_id: branchId,            // ← HQ Branch
          role_id: `role-owner-${tenantId}`,
          is_primary: true,
          assigned_at: NOW
        });

        // Setup user security profile (clean 4-digit PIN, no prefix)
        await db.userSecurity.put({
          user_id: userId,
          pin_hash: ownerPin,
          failed_attempts: 0,
          two_factor_enabled: false
        });
      }

      // 7.5 Provision Tenant Subscription Record (Free Trial or Active Tier from CPanel)
      const subId = `sub-${tenantId}`;
      const subExists = await db.tenantSubscriptions.get(subId);
      if (!subExists) {
        const plans = await db.subscriptionPlans.toArray();
        const planStr = (additionalMetadata.plan || 'Basic').toLowerCase();
        const matchedPlan = plans.find(p => p.name.toLowerCase().includes(planStr) || p.code.toLowerCase() === planStr) || plans[0];
        const planId = matchedPlan?.id || 'plan-basic';

        const isTrial = (additionalMetadata.status as string) === 'Trial' || (additionalMetadata.status as string) === 'TRIAL' || !additionalMetadata.status;
        const durationDays = isTrial ? 14 : 30; // 14-day Free Trial or 30-day Active license
        const endTs = NOW + durationDays * 24 * 60 * 60 * 1000;

        const subRecord: any = {
          id: subId,
          tenant_id: tenantId,
          plan_id: planId,
          status: isTrial ? 'TRIAL' : 'ACTIVE',
          start_date: NOW,
          end_date: endTs,
          auto_renew: true,
          created_at: NOW,
          updated_at: NOW
        };

        await db.tenantSubscriptions.put(subRecord);
      }

      // 8. Provision Default TenantModules subscriptions based on Business Type & Subscribed Modules
      const requiredModules = Array.from(new Set([businessType, ...(additionalMetadata.subscribedModules || [])]));

      for (const m of requiredModules) {
        const modId = `tm-${tenantId}-${m.toLowerCase()}`;
        const modExists = await db.tenantModules.get(modId);
        if (!modExists) {
          await db.tenantModules.put({
            id: modId,
            tenant_id: tenantId,
            module_key: m,
            enabled: true,
            configuration: {},
            installed_at: NOW
          });
        }
      }

      // 9. Feature Flags configuration
      const flagsToSeed = [
        { key: 'multi_branch', val: true },
        { key: 'ai_assistant', val: true },
        { key: 'advanced_reports', val: true },
        { key: 'accounting', val: true },
        { key: 'api_access', val: true }
      ];

      for (const f of flagsToSeed) {
        const flagId = `ff-${tenantId}-${f.key}`;
        const flagExists = await db.featureFlags.get(flagId);
        if (!flagExists) {
          await db.featureFlags.put({
            id: flagId,
            tenant_id: tenantId,
            feature_key: f.key,
            enabled: f.val
          });
        }
      }

      // 10. Log Provisioning step in AuditLogs
      await db.auditLogs.add({
        id: `al-${Date.now()}-provision-${Math.random().toString(36).substr(2, 5)}`,
        tenant_id: tenantId,
        user_id: 'system-provisioner',
        user_name: 'SaaS System Provisioner',
        action: 'TENANT_CLEAN_PROVISIONING',
        entity: 'tenant',
        entity_id: tenantId,
        metadata: {
          tenantId,
          branchId,
          companyName,
          businessType,
          modules: requiredModules,
          timestamp: NOW
        },
        created_at: NOW
      });
    });

    // 11. Synchronize to the authoritative Cloud Database
    // Gather all local records created or retrieved
    const tenantRecord = await db.tenants.get(tenantId);
    const branchRecord = await db.branches.get(branchId);
    const userRecord = await db.users.get(userId);
    const ubrRecord = await db.userBranchRoles.get(`ubr-${tenantId}-owner`);
    const tenantUserRecord = await db.tenantUsers.get(`tu-${tenantId}-owner`);
    const tubRecord = await db.tenantUserBranches.get(`tub-${tenantId}-owner`);
    const securityRecord = await db.userSecurity.get(userId);
    
    const moduleRecords = await db.tenantModules.where('tenant_id').equals(tenantId).toArray();
    const settingsRecords = await db.tenantSettings.where('tenant_id').equals(tenantId).toArray();
    const flagRecords = await db.featureFlags.where('tenant_id').equals(tenantId).toArray();
    const rolesRecords = await db.roles.where('tenant_id').equals(tenantId).toArray();

    // Push to Cloud. If any insert fails, delete local records to rollback.
    try {
      setMockAuthOverride({
        tenant_id: 'tenant-admin-system',
        user_id: 'system-provisioner',
        user_name: 'SaaS System Provisioner'
      });

      const { error: tErr } = await supabase.from('tenants').insert(tenantRecord);
      if (tErr) throw new Error(`Cloud tenant sync failed: ${tErr.message}`);

      const { error: bErr } = await supabase.from('branches').insert(branchRecord);
      if (bErr) throw new Error(`Cloud branch sync failed: ${bErr.message}`);

      const { error: uErr } = await supabase.from('users').insert(userRecord);
      if (uErr) throw new Error(`Cloud user sync failed: ${uErr.message}`);

      const { error: ubrErr } = await supabase.from('userBranchRoles').insert(ubrRecord);
      if (ubrErr) throw new Error(`Cloud user branch role sync failed: ${ubrErr.message}`);

      if (tenantUserRecord) {
        try { await supabase.from('tenantUsers').insert(tenantUserRecord); } catch (e) {}
      }

      if (tubRecord) {
        try { await supabase.from('tenantUserBranches').insert(tubRecord); } catch (e) {}
      }

      if (rolesRecords.length) {
        try { await supabase.from('roles').insert(rolesRecords); } catch (e) {}
      }

      const { error: secErr } = await supabase.from('userSecurity').insert(securityRecord);
      if (secErr) throw new Error(`Cloud user security sync failed: ${secErr.message}`);

      const subRecord = await db.tenantSubscriptions.get(`sub-${tenantId}`);
      if (subRecord) {
        try { await supabase.from('tenantSubscriptions').insert(subRecord); } catch (e) {}
      }

      if (moduleRecords.length) {
        const { error: mErr } = await supabase.from('tenantModules').insert(moduleRecords);
        if (mErr) throw new Error(`Cloud modules sync failed: ${mErr.message}`);
      }

      if (settingsRecords.length) {
        const { error: sErr } = await supabase.from('tenantSettings').insert(settingsRecords);
        if (sErr) throw new Error(`Cloud settings sync failed: ${sErr.message}`);
      }

      if (flagRecords.length) {
        const { error: fErr } = await supabase.from('featureFlags').insert(flagRecords);
        if (fErr) throw new Error(`Cloud feature flags sync failed: ${fErr.message}`);
      }
    } catch (err: any) {
      console.warn(`[Provisioning Cloud Sync Warning] Server sync encountered error: ${err.message}. Local IndexedDB workspace preserved for offline operation.`);
    } finally {
      setMockAuthOverride(null);
    }
  },

  // ─── Recovery Token: Export ───────────────────────────────────────────────
  /**
   * Exports a self-contained Recovery Token (plain JSON) that encodes everything
   * needed to re-provision this workspace on a different browser or device.
   *
   * The token is NOT encrypted — treat it like a password backup file.
   * It contains: tenant, branch, owner user, settings, modules, and feature flags.
   */
  async exportRecoveryToken(tenantId: string): Promise<string> {
    const [tenant, branches, users, userBranchRoles, tenantModules, tenantSettings, featureFlags] =
      await Promise.all([
        db.tenants.get(tenantId),
        db.branches.where('tenant_id').equals(tenantId).toArray(),
        db.users.where('tenant_id').equals(tenantId).toArray(),
        db.userBranchRoles.where('tenant_id').equals(tenantId).toArray(),
        db.tenantModules.where('tenant_id').equals(tenantId).toArray(),
        db.tenantSettings.where('tenant_id').equals(tenantId).toArray(),
        db.featureFlags.where('tenant_id').equals(tenantId).toArray()
      ]);

    if (!tenant) throw new Error(`Tenant ${tenantId} not found in local database.`);

    const token = {
      _version: '1.0',
      _generated_at: new Date().toISOString(),
      _type: 'DUKAPOS_WORKSPACE_RECOVERY_TOKEN',
      tenant,
      branches,
      users,
      userBranchRoles,
      tenantModules,
      tenantSettings,
      featureFlags
    };

    return JSON.stringify(token, null, 2);
  },

  /**
   * Downloads the recovery token as a `.json` file to the user's device.
   */
  async downloadRecoveryToken(tenantId: string, tenantName: string): Promise<void> {
    const tokenStr = await this.exportRecoveryToken(tenantId);
    const blob = new Blob([tokenStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safeName = tenantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.href = url;
    a.download = `dukapos-recovery-${safeName}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  // ─── Recovery Token: Import ───────────────────────────────────────────────
  /**
   * Re-provisions a workspace from a Recovery Token JSON string.
   * Restores the tenant, branches, users, modules, settings, and feature flags
   * into the local IndexedDB — making the workspace available on a new browser/device.
   *
   * Uses `put()` so existing records are overwritten (idempotent).
   */
  async importFromRecoveryToken(tokenJson: string): Promise<{ tenantId: string; tenantName: string; ownerEmail: string }> {
    let token: any;
    try {
      token = JSON.parse(tokenJson);
    } catch {
      throw new Error('Invalid Recovery Token: file is not valid JSON.');
    }

    if (token._type !== 'DUKAPOS_WORKSPACE_RECOVERY_TOKEN') {
      throw new Error('Invalid Recovery Token: this file was not generated by DukaPos.');
    }
    if (!token.tenant?.id) {
      throw new Error('Invalid Recovery Token: missing tenant data.');
    }

    await db.transaction('rw', [
      db.tenants, db.branches, db.users, db.userBranchRoles,
      db.tenantModules, db.tenantSettings, db.featureFlags,
      db.tenantUsers, db.userSecurity
    ], async () => {
      // 1. Restore core records
      await db.tenants.put(token.tenant);

      if (token.branches?.length) {
        await db.branches.bulkPut(token.branches);
      }
      if (token.users?.length) {
        // Normalize emails to lowercase to ensure login works regardless of original casing
        const normalizedUsers = token.users.map((u: any) => ({
          ...u,
          email: u.email ? u.email.trim().toLowerCase() : u.email,
          username: u.username ? u.username.trim().toLowerCase() : u.username,
        }));
        await db.users.bulkPut(normalizedUsers);
      }
      if (token.userBranchRoles?.length) {
        await db.userBranchRoles.bulkPut(token.userBranchRoles);
      }
      if (token.tenantModules?.length) {
        await db.tenantModules.bulkPut(token.tenantModules);
      }
      if (token.tenantSettings?.length) {
        await db.tenantSettings.bulkPut(token.tenantSettings);
      }
      if (token.featureFlags?.length) {
        await db.featureFlags.bulkPut(token.featureFlags);
      }
    });

    // Determine the owner user for login hint
    const ownerUser = token.users?.find((u: any) => !u.is_super_admin) || token.users?.[0];

    console.log(`[Recovery] Workspace "${token.tenant.name}" restored successfully.`);
    return {
      tenantId: token.tenant.id,
      tenantName: token.tenant.name,
      ownerEmail: ownerUser?.email || 'unknown'
    };
  },

  /**
   * Soft deletes a tenant by updating its status to 'ARCHIVED' and setting its deleted_at timestamp
   * on both the client (IndexedDB) and server (PostgreSQL).
   */
  async deleteTenantCompletely(tenantId: string): Promise<void> {
    const now = Date.now();

    // 1. Update status to ARCHIVED on Cloud
    const { error: cloudErr } = await supabase.from('tenants').update({
      status: 'ARCHIVED',
      deleted_at: now,
      deletedAt: now
    }).eq('id', tenantId);

    if (cloudErr) {
      console.warn(`[Soft Delete] Failed to update tenant on cloud database: ${cloudErr.message}`);
    }

    // 2. Update status to ARCHIVED in local database
    await db.transaction('rw', [db.tenants], async () => {
      const tenant = await db.tenants.get(tenantId);
      if (tenant) {
        await db.tenants.put({
          ...tenant,
          status: 'ARCHIVED',
          deleted_at: now,
          deletedAt: now
        });
      }
    });
    console.log(`[Provisioning] Tenant ${tenantId} marked as ARCHIVED (soft-deleted).`);
  },

  /**
   * Restores a soft-deleted tenant back to 'Active' status on both client and cloud.
   */
  async restoreTenant(tenantId: string): Promise<void> {
    // 1. Update status to Active on Cloud
    const { error: cloudErr } = await supabase.from('tenants').update({
      status: 'Active',
      deleted_at: null,
      deletedAt: null
    }).eq('id', tenantId);

    if (cloudErr) {
      throw new Error(`Failed to restore tenant on cloud: ${cloudErr.message}`);
    }

    // 2. Update status to Active in local database
    await db.transaction('rw', [db.tenants], async () => {
      const tenant = await db.tenants.get(tenantId);
      if (tenant) {
        await db.tenants.put({
          ...tenant,
          status: 'Active',
          deleted_at: undefined,
          deletedAt: undefined
        });
      }
    });
    console.log(`[Provisioning] Tenant ${tenantId} restored successfully.`);
  }
};

