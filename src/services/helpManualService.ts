/**
 * DukaPOS SaaS — Role-Based Manual Data & Security Guard Engine
 * Structurally defines operations documentation and enforces strict role-gated access control.
 */

export interface ManualStep {
  stepNumber: number;
  title: string;
  description: string;
  tip?: string;
  warning?: string;
}

export interface ManualTopic {
  id: string;
  title: string;
  category: string;
  requiredRole: 'ALL' | 'CASHIER' | 'MANAGER' | 'FINANCE' | 'LAWYER' | 'ADMIN_OWNER' | 'SUPER_ADMIN';
  description: string;
  steps: ManualStep[];
}

export const MANUAL_TOPICS: ManualTopic[] = [
  // 1. CASHIER MANUAL (Accessible by ALL staff)
  {
    id: 'pos_counter_sale',
    title: 'Processing Register Sales & Checkout',
    category: '🛒 POS & Cashier Operations',
    requiredRole: 'ALL',
    description: 'Standard procedure for adding items to register cart, applying customer discounts, and tendering payments.',
    steps: [
      { stepNumber: 1, title: 'Scan or Select Product', description: 'Use barcode scanner or tap catalog items on the POS grid to populate the register cart.' },
      { stepNumber: 2, title: 'Attach Customer (Optional)', description: 'Search existing customer name or click "+ Customer" to record loyalty credit.' },
      { stepNumber: 3, title: 'Select Payment Method', description: 'Choose Cash, M-Pesa/Mobile Money, Card, or Split Payment.' },
      { stepNumber: 4, title: 'Tender & Issue Receipt', description: 'Enter tender amount, compute exact change, and click "Complete Sale" to trigger thermal printing.' }
    ]
  },
  {
    id: 'cash_drawer_shifts',
    title: 'Opening & Closing Cash Drawer Shifts',
    category: '🛒 POS & Cashier Operations',
    requiredRole: 'ALL',
    description: 'Daily cash opening float registration and end-of-shift reconciliation.',
    steps: [
      { stepNumber: 1, title: 'Open Shift Float', description: 'At start of shift, navigate to Cash Drawer and enter initial opening float amount.' },
      { stepNumber: 2, title: 'Log Cash In / Out', description: 'Record petty cash outflows or cash drops throughout the shift.' },
      { stepNumber: 3, title: 'Close & Count Shift', description: 'At end of shift, count physical cash in drawer and record variance reconciliation.' }
    ]
  },
  {
    id: 'receipt_returns',
    title: 'Customer Receipt Refunds & Item Returns',
    category: '🛒 POS & Cashier Operations',
    requiredRole: 'ALL',
    description: 'Processing customer product returns and issuing cash/credit refunds.',
    steps: [
      { stepNumber: 1, title: 'Lookup Original Receipt', description: 'Search receipt number or barcode in Receipts History view.' },
      { stepNumber: 2, title: 'Select Return Items', description: 'Check return quantities and select return condition (Restock or Damaged).' },
      { stepNumber: 3, title: 'Process Refund', description: 'Confirm refund payment method and print return voucher.' }
    ]
  },

  // 2. STORE MANAGER MANUAL
  {
    id: 'inventory_stock_intake',
    title: 'Inventory Stock Intake & Reorder Levels',
    category: '📦 Inventory & Purchasing',
    requiredRole: 'MANAGER',
    description: 'Updating product stock levels, setting reorder thresholds, and managing SKUs.',
    steps: [
      { stepNumber: 1, title: 'Navigate to Inventory', description: 'Open Inventory Overview tab to view unified stock ledger.' },
      { stepNumber: 2, title: 'Log Stock Receive / Purchase Order', description: 'Click "Receive Stock", select supplier, and enter batch cost price & quantities.' },
      { stepNumber: 3, title: 'Set Reorder Thresholds', description: 'Configure minimum stock alert levels to trigger automatic supplier reorder warnings.' }
    ]
  },
  {
    id: 'shift_audits',
    title: 'Cashier Shift Reconciliation & Over/Short Audit',
    category: '📦 Inventory & Purchasing',
    requiredRole: 'MANAGER',
    description: 'Auditing cashier shifts, verifying drawer cash variance, and approving drawer closures.',
    steps: [
      { stepNumber: 1, title: 'Review Shift Ledger', description: 'Open Cash Drawer -> Shift History to review cashier drawer closure logs.' },
      { stepNumber: 2, title: 'Verify Discrepancies', description: 'Compare expected cash from sales vs physical cashier drawer count.' },
      { stepNumber: 3, title: 'Sign-off Audit Log', description: 'Mark shift audited and file supervisor notes for cash overages/shortages.' }
    ]
  },

  // 3. FINANCIAL ACCOUNTANT MANUAL
  {
    id: 'tax_vat_reporting',
    title: 'VAT & Tax Invoices Reconciliation',
    category: '📊 Financial Ledger & Reports',
    requiredRole: 'FINANCE',
    description: 'Generating monthly tax registers, VAT breakdown reports, and pre-tax invoice ledgers.',
    steps: [
      { stepNumber: 1, title: 'Open Reports -> Tax Report', description: 'Access Tax Report tab to view 18% VAT collected across completed sales.' },
      { stepNumber: 2, title: 'Filter Taxable Date Range', description: 'Select start and end dates matching tax filing period.' },
      { stepNumber: 3, title: 'Export Tax Ledger', description: 'Click Export PDF/CSV to download tax invoice registration table.' }
    ]
  },
  {
    id: 'expenses_tracking',
    title: 'Operating Expense Allocation & Profit Calculation',
    category: '📊 Financial Ledger & Reports',
    requiredRole: 'FINANCE',
    description: 'Logging operational expenses, rent, utilities, and calculating net gross profit margins.',
    steps: [
      { stepNumber: 1, title: 'Record Expense Voucher', description: 'Open Expenses module and click "+ Add Expense". Enter category, vendor, amount, and receipt copy.' },
      { stepNumber: 2, title: 'Review Profit & Loss', description: 'Compare gross sales revenue against operating outflows to monitor net profitability.' }
    ]
  },

  // 4. LAW FIRM MANUAL
  {
    id: 'law_firm_matters',
    title: 'Legal Case Intake & Pre-Intake Conflict Checking',
    category: '⚖️ Law Firm Practice Management',
    requiredRole: 'LAWYER',
    description: 'Mandatory conflict-of-interest searching across clients and opposing parties before opening case matters.',
    steps: [
      { stepNumber: 1, title: 'Run Conflict Search', description: 'Open Law Firm -> Cases -> Open New Case. Search opposing party or client company.' },
      { stepNumber: 2, title: 'Acknowledge Clearance', description: 'If conflict check returns zero matches, record clearance notes.' },
      { stepNumber: 3, title: 'Open Case Matter', description: 'Assign case title, filing reference, court jurisdiction, and client account.' }
    ]
  },
  {
    id: 'lawyer_time_retainers',
    title: 'Lawyer Time Tracking & Retainer Balance Deductions',
    category: '⚖️ Law Firm Practice Management',
    requiredRole: 'LAWYER',
    description: 'Logging billable hours and managing client retainer account thresholds.',
    steps: [
      { stepNumber: 1, title: 'Log Time Entry', description: 'Navigate to Billing & Retainers -> Log Time Entry. Record duration in minutes and hourly rate.' },
      { stepNumber: 2, title: 'Deposit / Deduct Retainer', description: 'Deposit client retainer funds and monitor minimum alert threshold warnings.' }
    ]
  },

  // 5. BUSINESS OWNER / TENANT ADMIN MANUAL
  {
    id: 'staff_role_permissions',
    title: 'Managing Staff Accounts & Role Access Controls',
    category: '⚙️ Tenant Administration & Security',
    requiredRole: 'ADMIN_OWNER',
    description: 'Adding business staff, assigning branch roles (Cashier, Manager, Accountant), and configuring security PINs.',
    steps: [
      { stepNumber: 1, title: 'Open Users & Roles', description: 'Navigate to Settings -> Users & Roles.' },
      { stepNumber: 2, title: 'Create Staff Account', description: 'Enter staff name, email, phone, and assign specific branch role.' },
      { stepNumber: 3, title: 'Configure Security PIN', description: 'Assign 4-digit supervisor override PIN for cash register approvals.' }
    ]
  },
  {
    id: 'trash_can_recovery',
    title: 'KwakoPOS Trash Can & Data Loss Prevention (DLP)',
    category: '⚙️ Tenant Administration & Security',
    requiredRole: 'ADMIN_OWNER',
    description: 'Restoring deleted receipts, products, customers, and executing role-gated permanent purges.',
    steps: [
      { stepNumber: 1, title: 'Access Trash Can Console', description: 'Navigate to Settings -> Trash Can & Recovery.' },
      { stepNumber: 2, title: '1-Click Restore', description: 'Select deleted receipt or product and click "Restore Record".' },
      { stepNumber: 3, title: 'Permanent Hard Purge', description: 'Business Owners can permanently purge records with explicit confirmation.' }
    ]
  },

  // 6. PHARMACY MODULE MANUAL
  {
    id: 'pharmacy_pos_fefo_dispensing',
    title: 'Pharmacy POS FEFO Batch Selection & Prescriptions',
    category: '💊 Pharmacy & Medical Operations',
    requiredRole: 'CASHIER',
    description: 'Processing OTC and prescription medicine sales with automated FEFO batch selection and drug warnings.',
    steps: [
      { stepNumber: 1, title: 'Scan or Select Medicine', description: 'Search medicine name, barcode, or generic formulation in Pharmacy POS.' },
      { stepNumber: 2, title: 'Verify FEFO Batch', description: 'System automatically selects earliest expiring batch. Verify batch number.' },
      { stepNumber: 3, title: 'Check Prescription Status', description: 'For prescription-required drugs, attach doctor prescription and patient profile.' },
      { stepNumber: 4, title: 'Dispense & Issue Label', description: 'Complete sale and trigger automated dispensing receipt with dosage instructions.' }
    ]
  },
  {
    id: 'pharmacy_controlled_drugs_nhif',
    title: 'Controlled Drug Register & NHIF Insurance Claims',
    category: '💊 Pharmacy & Medical Operations',
    requiredRole: 'MANAGER',
    description: 'Registering controlled narcotics dispensing and filing NHIF/corporate insurance claim vouchers.',
    steps: [
      { stepNumber: 1, title: 'Log Controlled Medicine Entry', description: 'Record pharmacist approval, doctor license #, and patient ID in Controlled Register.' },
      { stepNumber: 2, title: 'Submit Insurance Claim', description: 'Link prescription sale to Insurance Provider / NHIF code for reimbursement tracking.' }
    ]
  },

  // 7. POULTRY & LIVESTOCK MANUAL
  {
    id: 'poultry_batch_fcr_tracking',
    title: 'Poultry Flock Batch Lifecycle & FCR Calculation',
    category: '🚜 Poultry & Livestock Operations',
    requiredRole: 'MANAGER',
    description: 'Receiving day-old chick batches, daily mortality logs, feed intake recording, and FCR ratio analysis.',
    steps: [
      { stepNumber: 1, title: 'Receive Flock Batch', description: 'Navigate to Poultry Flocks -> Receive New Batch. Enter chick count, breed, and supplier.' },
      { stepNumber: 2, title: 'Log Daily Feed & Mortality', description: 'Enter daily mortality numbers and feed consumed (kg) to update live flock count.' },
      { stepNumber: 3, title: 'Review FCR Efficiency', description: 'System automatically computes Feed Conversion Ratio (Total Feed / Total Weight Gain).' }
    ]
  },
  {
    id: 'dairy_egg_production_ledger',
    title: 'Dairy Milking Sessions & Daily Egg Collections',
    category: '🚜 Poultry & Livestock Operations',
    requiredRole: 'CASHIER',
    description: 'Recording morning/evening milk yield liters and daily egg tray grade collections.',
    steps: [
      { stepNumber: 1, title: 'Log Egg Collection', description: 'Open Production Ledger -> Egg Collection. Enter Grade A, Grade B, and damaged egg counts.' },
      { stepNumber: 2, title: 'Record Milking Session', description: 'Enter liters yield per cow for morning or evening milking sessions.' }
    ]
  },

  // 8. SUPER ADMIN MANUAL (Super Admin Only)
  {
    id: 'super_admin_cpanel_ops',
    title: 'Super Admin CPanel & Global Tenant Provisioning',
    category: '🛡️ Super Admin Master Platform Operations',
    requiredRole: 'SUPER_ADMIN',
    description: 'Platform tenant provisioning, multi-tenant database cleanup, subscription plan management, and global audit logs.',
    steps: [
      { stepNumber: 1, title: 'Access CPanel Hub', description: 'Tap Super Admin CPanel icon in top navigation header.' },
      { stepNumber: 2, title: 'Provision / Lock Tenants', description: 'Manage active SaaS tenant subscriptions, activate enterprise modules, or suspend overdue accounts.' },
      { stepNumber: 3, title: 'Execute Disk Cleanup', description: 'Run production database purge scripts and inspect global platform security logs.' }
    ]
  }
];

/**
 * Filter manual topics strictly according to user role & permissions
 */
export function getAccessibleManualTopics(
  userRole?: string,
  isSuperAdmin?: boolean,
  isOwner?: boolean
): ManualTopic[] {
  const role = (userRole || 'CASHIER').toUpperCase();

  return MANUAL_TOPICS.filter((topic) => {
    // Super Admin gets everything
    if (isSuperAdmin) return true;

    // Non-super admins NEVER see SUPER_ADMIN manual
    if (topic.requiredRole === 'SUPER_ADMIN') return false;

    // Business Owner / Tenant Admin gets all tenant topics (ALL, CASHIER, MANAGER, FINANCE, LAWYER, ADMIN_OWNER)
    if (isOwner || role === 'SUPER ADMIN' || role === 'BUSINESS OWNER' || role === 'ADMINISTRATOR' || role === 'TENANT ADMIN') {
      return true;
    }

    // Role-specific evaluation
    if (topic.requiredRole === 'ALL') return true;

    if (role === 'CASHIER' || role === 'POS OPERATOR') {
      return topic.requiredRole === 'CASHIER';
    }

    if (role === 'STORE MANAGER' || role === 'MANAGER') {
      return topic.requiredRole === 'CASHIER' || topic.requiredRole === 'MANAGER';
    }

    if (role === 'ACCOUNTANT' || role === 'FINANCE') {
      return topic.requiredRole === 'CASHIER' || topic.requiredRole === 'FINANCE';
    }

    if (role === 'LAWYER' || role === 'ADVOCATE' || role === 'LEGAL COUNSEL') {
      return topic.requiredRole === 'CASHIER' || topic.requiredRole === 'LAWYER';
    }

    // Fallback: unknown/unlisted roles see no additional topics
    return false;
  });
}
