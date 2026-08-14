import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db } from '../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';

import { getActiveSessionRaw } from '../utils/sessionStorage';

/**
 * Dev/testing superuser accounts that get access to ALL industry modules
 * simultaneously, with persistent module+tab state across logout/login.
 */
const DEV_SUPERUSER_EMAILS = new Set(['yannick@kwakoko.co.tz']);

/** Returns the currently logged-in user's email from session storage (no React dependency). */
function getSessionEmail(): string | null {
  try {
    const raw = getActiveSessionRaw();
    if (!raw) return null;
    const sess = JSON.parse(raw);
    return sess?.user?.email || null;
  } catch {
    return null;
  }
}

export type IndustryModule =
  | 'Retail'
  | 'Restaurant'
  | 'SACCO'
  | 'Workforce'
  | 'Pharmacy'
  | 'Hardware'
  | 'Construction'
  | 'Law'
  | 'RealEstate'
  | 'Microfinance'
  | 'Agriculture'
  | 'Electronics'
  | 'Garage'
  | 'FuelStation'
  | 'School'
  | 'Bookshop'
  | 'Security'
  | 'Water'
  | 'Transport'
  | 'FleetManagement'
  | 'Waste'
  | 'Wholesale'
  | 'Fashion'
  | 'Service'
  | 'Cosmetics'
  | 'Salon'
  | 'Hotel'
  | 'Poultry'
  | 'Bar'
  | 'BusinessConsultant'
  | 'TechnicalCompany';

export interface NestedSidebarItem {
  name: string;
  subItems?: string[];
}

export type SidebarItem = string | NestedSidebarItem;

export interface ModuleManifest {
  name: string;
  icon: string;
  sidebar: SidebarItem[];
  widgets: string[];
  description: string;
}

export const MODULE_MANIFESTS: Record<IndustryModule, ModuleManifest> = {
  Retail: {
    name: 'Retail Shop / General Store',
    icon: 'Store',
    sidebar: [
      'Dashboard',
      { name: 'POS', subItems: ['New Sale', 'Sales History', 'Returns'] },
      { name: 'Inventory', subItems: ['Inventory Overview', 'Products', 'Categories & Brands', 'Stock Adjustment', 'Stock Transfer', 'Stock Alerts', 'Stock Sync Engine', 'Product Bundles & Kits', 'Stock Count', 'Ledger Drilldown', 'Inventory Reports'] },
      { name: 'Receipts', subItems: ['Receipt History', 'Receipt Templates', 'Receipt Analytics', 'Receipt Verification', 'Receipt Archive'] },
      'Customers',
      { name: 'Purchasing', subItems: ['Suppliers', 'Purchase Orders', 'Goods Received', 'Supplier Ledgers', 'Warehouses'] },
      'Expenses',
      { name: 'Reports', subItems: ['Sales', 'Profit', 'Inventory Valuation', 'Tax', 'Customers Report', 'Expenses Report', 'Payment Methods', 'Stock Movement', 'Purchasing Report', 'Discounts', 'Returns & Refunds', 'Branch Comparison', 'Cashier Performance', 'Receivables Aging'] },
      'Employees',
      'Settings'
    ],
    widgets: ['SalesToday', 'ProfitToday', 'InventoryValue', 'LowStock'],
    description: 'Retail inventory count, sales, receipts, and client reward points.'
  },
  Restaurant: {
    name: 'Restaurant / Cafe',
    icon: 'Utensils',
    sidebar: [
      'Dashboard',
      'POS',
      'Tables',
      'Kitchen Display',
      { name: 'Orders', subItems: ['Open Orders', 'Completed Orders', 'Cancelled Orders'] },
      { name: 'Menu Management', subItems: ['Food Items', 'Categories', 'Recipes'] },
      { name: 'Receipts', subItems: ['Receipt History', 'Receipt Templates', 'Receipt Analytics', 'Receipt Verification', 'Receipt Archive'] },
      'Inventory',
      'Ingredients',
      'Suppliers',
      'Reservations',
      'Employees',
      'Reports',
      'Settings'
    ],
    widgets: ['SalesToday', 'OpenTables', 'PendingOrders', 'KitchenStatus'],
    description: 'Table dining coordinates, kitchen ticket flows, and recipe costs.'
  },
  SACCO: {
    name: 'SACCO / VICOBA',
    icon: 'Coins',
    sidebar: [
      'Dashboard',
      'Members',
      'Groups',
      { name: 'Savings', subItems: ['Deposits', 'Withdrawals', 'Statements'] },
      { name: 'Loans', subItems: ['Loan Applications', 'Approval', 'Repayments', 'Loan Reports'] },
      'Shares',
      'Meetings',
      'Fines',
      'Reports',
      'Settings'
    ],
    widgets: ['TotalSavings', 'LoanDisbursements', 'OutstandingRepayments', 'MembersJoined'],
    description: 'Cooperative member capital, savings programs, and lending terms.'
  },
  Workforce: {
    name: 'Workforce Tracking & Time Management',
    icon: 'Users',
    sidebar: [
      'Dashboard',
      'Employees',
      'Attendance',
      'Time Tracking',
      'GPS Tracking',
      'Schedules',
      'Leave Management',
      'Payroll',
      'Performance',
      'Reports',
      'Settings'
    ],
    widgets: ['ClockedInCount', 'TotalAttendanceRate', 'ActiveOvertime', 'PayrollTotal'],
    description: 'Clock-in locations, GPS routes, payroll calculations, and leaves.'
  },
  Pharmacy: {
    name: 'Pharmacy / Chemist / Dispensary',
    icon: 'Pills',
    sidebar: [
      'Pharmacy Dashboard',
      'Pharmacy POS',
      'Patients',
      { name: 'Medicines', subItems: ['Medicines Master', 'Medicine Categories', 'Price Lists', 'Barcode & Labels'] },
      { name: 'Batch & Expiry', subItems: ['Batch Management', 'Expiry Tracking', 'Near Expiry', 'Batch Recalls', 'Expired Disposal'] },
      'Prescriptions',
      'Doctors',
      'Drug Safety',
      { name: 'Pharmacy Inventory', subItems: ['Stock Overview', 'Stock Transfer', 'Stock Count', 'Dead Stock', 'Auto-Reorder'] },
      { name: 'Receipts', subItems: ['Receipt History', 'Receipt Templates', 'Receipt Analytics', 'Receipt Verification', 'Receipt Archive'] },
      { name: 'Purchasing', subItems: ['Suppliers', 'Purchase Orders', 'Goods Received', 'Supplier Ledgers', 'Warehouses'] },
      { name: 'Insurance & NHIF', subItems: ['Insurance Providers', 'Claims Management', 'NHIF Claims', 'Corporate Accounts', 'Claim Reports'] },
      'Controlled Drugs',
      { name: 'Pharmacy Reports', subItems: ['Sales Report', 'Prescription Report', 'Expiry Report', 'Batch History', 'Insurance Claims Report', 'Controlled Drugs Report', 'Supplier Performance', 'Patient History Report'] },
      'Settings'
    ],
    widgets: ['SalesToday', 'PrescriptionsPending', 'ExpiryAlerts', 'LowStock', 'NHIFClaims', 'OTCSales'],
    description: 'Full-stack pharmacy management: prescriptions, batch/expiry FEFO, patient CRM, drug safety engine, NHIF/insurance billing, and controlled drug register.'
  },
  Hardware: {
    name: 'Hardware & Building Materials',
    icon: 'Hammer',
    sidebar: [
      'Dashboard',
      'POS',
      'Products',
      'Inventory',
      'Categories',
      { name: 'Measurement Units', subItems: ['Pieces', 'Bags', 'Meters', 'Tons'] },
      { name: 'Receipts', subItems: ['Receipt History', 'Receipt Templates', 'Receipt Analytics', 'Receipt Verification', 'Receipt Archive'] },
      { name: 'Purchasing', subItems: ['Suppliers', 'Purchase Orders', 'Goods Received', 'Supplier Ledgers', 'Warehouses'] },
      'Customers',
      'Quotations',
      'Reports',
      'Settings'
    ],
    widgets: ['SalesToday', 'QuotationsPending', 'InventoryValue', 'LowStock'],
    description: 'Bulk material measurements, custom quotes, and supplier invoices.'
  },
  Construction: {
    name: 'Construction Company',
    icon: 'HardHat',
    sidebar: [
      'Dashboard',
      'Projects',
      'Sites',
      'Employees',
      'Equipment',
      'Materials',
      'Expenses',
      'Invoices',
      'Contracts',
      'Clients',
      'Reports',
      'Settings'
    ],
    widgets: ['ActiveProjects', 'SiteExpenses', 'EquipmentUtilization', 'InvoiceCollections'],
    description: 'Project sheets, machinery utilization logs, and site materials.'
  },
  Law: {
    name: 'Law Firm / Legal Practice',
    icon: 'Scale',
    sidebar: [
      'Legal Dashboard',
      'Clients',
      'Cases',
      'Court Calendar',
      'Legal Documents',
      'Legal Tasks',
      'Billing & Retainers',
      'Legal Reports',
      'Legal Settings'
    ],
    widgets: ['ActiveCases', 'NewClients', 'UpcomingHearings', 'OverdueDeadlines', 'PendingTasks', 'OutstandingLegalFees', 'RetainerBalances', 'RecentCaseActivity'],
    description: 'Multi-tenant legal practice management platform for law firms, advocates, legal consultants, and lawyers.'
  },
  RealEstate: {
    name: 'Real Estate / Property Management',
    icon: 'Home',
    sidebar: [
      'Dashboard',
      'Properties',
      'Units',
      'Tenants',
      'Rent Collection',
      'Maintenance',
      'Contracts',
      'Expenses',
      'Payments',
      'Reports',
      'Settings'
    ],
    widgets: ['TotalOccupancyRate', 'RentCollected', 'PendingMaintenance', 'OperatingExpenses'],
    description: 'Apartment listings, tenant rent collections, and work orders.'
  },
  Microfinance: {
    name: 'Microfinance & Lending',
    icon: 'TrendingUp',
    sidebar: [
      'Dashboard',
      'Customers',
      'Loans',
      'Loan Applications',
      'Approval',
      'Repayments',
      'Interest Calculator',
      'Collections',
      'Reports',
      'Settings'
    ],
    widgets: ['LoanBookValue', 'RepaymentsRate', 'DisbursalsToday', 'ParRatio'],
    description: 'Lending risk audits, interest calculations, and collections.'
  },
  Agriculture: {
    name: 'Agriculture / Farm Business',
    icon: 'Sprout',
    sidebar: [
      'Dashboard',
      'Farms',
      'Crops',
      'Livestock',
      'Inventory',
      'Seeds',
      'Fertilizer',
      'Harvest',
      'Expenses',
      'Workers',
      'Reports',
      'Settings'
    ],
    widgets: ['HarvestYield', 'LivestockCount', 'FertilizerStock', 'FarmOperatingExpenses'],
    description: 'Crop yields tracking, feed inventories, and workforce hours.'
  },
  Electronics: {
    name: 'Electronics Store',
    icon: 'Tv',
    sidebar: [
      'Dashboard',
      'POS',
      'Products',
      'Serial Numbers',
      'Warranty',
      'Inventory',
      { name: 'Receipts', subItems: ['Receipt History', 'Receipt Templates', 'Receipt Analytics', 'Receipt Verification', 'Receipt Archive'] },
      'Repairs',
      { name: 'Purchasing', subItems: ['Suppliers', 'Purchase Orders', 'Goods Received', 'Supplier Ledgers', 'Warehouses'] },
      'Customers',
      'Reports',
      'Settings'
    ],
    widgets: ['SalesToday', 'SerialAudited', 'RepairsCompleted', 'WarrantyClaims'],
    description: 'Warranty logs, repair status trackers, and serial barcodes.'
  },
  Garage: {
    name: 'Garage / Vehicle Workshop',
    icon: 'Wrench',
    sidebar: [
      'Dashboard',
      'Vehicles',
      'Customers',
      'Repair Orders',
      'Mechanics',
      'Parts Inventory',
      'Service History',
      'Invoices',
      'Reports',
      'Settings'
    ],
    widgets: ['ActiveRepairOrders', 'MechanicLoad', 'ServiceRevenues', 'PartsUsed'],
    description: 'Vehicle diagnostics logs, mechanic assignments, and repair invoicing.'
  },
  FuelStation: {
    name: 'Fuel Station',
    icon: 'Fuel',
    sidebar: [
      'Dashboard',
      'Fuel Pump',
      'Fuel Inventory',
      'Tank Monitoring',
      'Price Management',
      'Sales',
      'Attendants',
      'Shift Management',
      'Expenses',
      'Reports',
      'Settings'
    ],
    widgets: ['SalesToday', 'TankLitresRemaining', 'PricePerLitre', 'ShiftProfit'],
    description: 'Pump volume readings, digital tank monitors, and price sets.'
  },
  School: {
    name: 'School Management Lite',
    icon: 'GraduationCap',
    sidebar: [
      'Dashboard',
      'Students',
      'Classes',
      'Attendance',
      'Fees',
      'Exams',
      'Teachers',
      'Parents',
      'Reports',
      'Settings'
    ],
    widgets: ['EnrolledStudents', 'DailyAttendance', 'FeesCollectedYTD', 'ExamAverages'],
    description: 'Student catalogs, classroom attendances, and tuition statements.'
  },
  Bookshop: {
    name: 'Bookshop / Stationery',
    icon: 'BookOpen',
    sidebar: [
      'Dashboard',
      'POS',
      'Books',
      'Stationery',
      'Inventory',
      { name: 'Receipts', subItems: ['Receipt History', 'Receipt Templates', 'Receipt Analytics', 'Receipt Verification', 'Receipt Archive'] },
      { name: 'Purchasing', subItems: ['Suppliers', 'Purchase Orders', 'Goods Received', 'Supplier Ledgers', 'Warehouses'] },
      'Customers',
      'Reports',
      'Settings'
    ],
    widgets: ['SalesToday', 'BooksValuation', 'SuppliersCount', 'LowStock'],
    description: 'Book inventories, school stationeries POS, and supplier orders.'
  },
  Security: {
    name: 'Security Company Management',
    icon: 'Shield',
    sidebar: [
      'Dashboard',
      'Guards',
      'Clients',
      'Sites',
      'Schedules',
      'Attendance',
      'Payroll',
      'Incidents',
      'Reports',
      'Settings'
    ],
    widgets: ['GuardsDeployed', 'PatrolledSites', 'ReportedIncidents', 'PayrollTotal'],
    description: 'Guard rosters, client patrol routes, and incident logs.'
  },
  Water: {
    name: 'Water Supply Management',
    icon: 'Droplet',
    sidebar: [
      'Dashboard',
      'Customers',
      'Meters',
      'Billing',
      'Payments',
      'Routes',
      'Water Usage',
      'Complaints',
      'Reports',
      'Settings'
    ],
    widgets: ['TotalWaterUsage', 'BilledAmount', 'OutstandingPayments', 'ResolvedComplaints'],
    description: 'Water meter consumption, utility billings, and repair routes.'
  },
  Transport: {
    name: 'Vehicle & Fleet Management',
    icon: 'Truck',
    sidebar: [
      { 
        name: 'Dashboard', 
        subItems: ['Fleet Overview', 'Fleet Health', 'Alerts & Expiring Documents', 'Utilization Overview', 'Fuel & Cost Summary'] 
      },
      { 
        name: 'Vehicles', 
        subItems: ['All Vehicles', 'Add Vehicle', 'Vehicle Groups', 'Vehicle Types', 'Vehicle Documents', 'Vehicle Inspection', 'Vehicle Status'] 
      },
      { 
        name: 'Fleet Operations', 
        subItems: ['Trip Management', 'Dispatch', 'Assign Vehicle', 'Assign Driver', 'Trip History', 'Route Management', 'Mileage / Odometer'] 
      },
      { 
        name: 'Drivers', 
        subItems: ['All Drivers', 'Add Driver', 'Driver Profiles', 'Driver Assignments', 'Driver Licenses', 'Driver Performance', 'Driver Incidents'] 
      },
      { 
        name: 'Fuel Management', 
        subItems: ['Fuel Dashboard', 'Fuel Transactions', 'Fuel Stations / Suppliers', 'Fuel Consumption', 'Fuel Efficiency', 'Fuel Cost Analysis'] 
      },
      { 
        name: 'Maintenance', 
        subItems: ['Maintenance Dashboard', 'Maintenance Schedule', 'Service Records', 'Repair Orders', 'Preventive Maintenance', 'Parts & Materials', 'Maintenance Costs', 'Workshop'] 
      },
      { 
        name: 'Expenses', 
        subItems: ['Fleet Expenses', 'Vehicle Expenses', 'Driver Expenses', 'Tolls & Parking', 'Insurance Costs', 'Registration Costs', 'Other Expenses'] 
      },
      { 
        name: 'Compliance', 
        subItems: ['Vehicle Registration', 'Insurance', 'Road License', 'Inspection Certificates', 'Driver Licenses', 'Compliance Calendar', 'Expiring Documents'] 
      },
      { 
        name: 'Incidents', 
        subItems: ['Accidents', 'Traffic Violations', 'Damage Reports', 'Claims', 'Incident History'] 
      },
      { 
        name: 'Tracking', 
        subItems: ['Live Fleet Tracking', 'Vehicle Location', 'Trip Tracking', 'Geofencing', 'Mileage Tracking', 'GPS History'] 
      },
      { 
        name: 'Reports', 
        subItems: ['Fleet Report', 'Vehicle Utilization', 'Fuel Consumption', 'Fuel Cost', 'Maintenance', 'Vehicle Profitability', 'Driver Performance', 'Trip Report', 'Expense Report', 'Compliance Report', 'Cost per Kilometer'] 
      },
      { 
        name: 'Settings', 
        subItems: ['Fleet Settings', 'Vehicle Types', 'Fuel Types', 'Maintenance Categories', 'Expense Categories', 'Document Types', 'Trip Settings', 'Tracking Settings'] 
      }
    ],
    widgets: ['TotalVehicles', 'ActiveTrips', 'FuelEfficiency', 'MaintenanceAlerts', 'FleetProfitability'],
    description: 'Complete vehicle lifecycle, driver management, dispatch, fuel anomalies, maintenance stock integration, telematics, and profitability analytics.'
  },
  FleetManagement: {
    name: 'Vehicle & Fleet Management',
    icon: 'Truck',
    sidebar: [
      { 
        name: 'Dashboard', 
        subItems: ['Fleet Overview', 'Fleet Health', 'Alerts & Expiring Documents', 'Utilization Overview', 'Fuel & Cost Summary'] 
      },
      { 
        name: 'Vehicles', 
        subItems: ['All Vehicles', 'Add Vehicle', 'Vehicle Groups', 'Vehicle Types', 'Vehicle Documents', 'Vehicle Inspection', 'Vehicle Status'] 
      },
      { 
        name: 'Fleet Operations', 
        subItems: ['Trip Management', 'Dispatch', 'Assign Vehicle', 'Assign Driver', 'Trip History', 'Route Management', 'Mileage / Odometer'] 
      },
      { 
        name: 'Drivers', 
        subItems: ['All Drivers', 'Add Driver', 'Driver Profiles', 'Driver Assignments', 'Driver Licenses', 'Driver Performance', 'Driver Incidents'] 
      },
      { 
        name: 'Fuel Management', 
        subItems: ['Fuel Dashboard', 'Fuel Transactions', 'Fuel Stations / Suppliers', 'Fuel Consumption', 'Fuel Efficiency', 'Fuel Cost Analysis'] 
      },
      { 
        name: 'Maintenance', 
        subItems: ['Maintenance Dashboard', 'Maintenance Schedule', 'Service Records', 'Repair Orders', 'Preventive Maintenance', 'Parts & Materials', 'Maintenance Costs', 'Workshop'] 
      },
      { 
        name: 'Expenses', 
        subItems: ['Fleet Expenses', 'Vehicle Expenses', 'Driver Expenses', 'Tolls & Parking', 'Insurance Costs', 'Registration Costs', 'Other Expenses'] 
      },
      { 
        name: 'Compliance', 
        subItems: ['Vehicle Registration', 'Insurance', 'Road License', 'Inspection Certificates', 'Driver Licenses', 'Compliance Calendar', 'Expiring Documents'] 
      },
      { 
        name: 'Incidents', 
        subItems: ['Accidents', 'Traffic Violations', 'Damage Reports', 'Claims', 'Incident History'] 
      },
      { 
        name: 'Tracking', 
        subItems: ['Live Fleet Tracking', 'Vehicle Location', 'Trip Tracking', 'Geofencing', 'Mileage Tracking', 'GPS History'] 
      },
      { 
        name: 'Reports', 
        subItems: ['Fleet Report', 'Vehicle Utilization', 'Fuel Consumption', 'Fuel Cost', 'Maintenance', 'Vehicle Profitability', 'Driver Performance', 'Trip Report', 'Expense Report', 'Compliance Report', 'Cost per Kilometer'] 
      },
      { 
        name: 'Settings', 
        subItems: ['Fleet Settings', 'Vehicle Types', 'Fuel Types', 'Maintenance Categories', 'Expense Categories', 'Document Types', 'Trip Settings', 'Tracking Settings'] 
      }
    ],
    widgets: ['TotalVehicles', 'ActiveTrips', 'FuelEfficiency', 'MaintenanceAlerts', 'FleetProfitability'],
    description: 'Complete vehicle lifecycle, driver management, dispatch, fuel anomalies, maintenance stock integration, telematics, and profitability analytics.'
  },
  Waste: {
    name: 'Waste Management',
    icon: 'Trash2',
    sidebar: [
      'Dashboard',
      'Customers',
      'Collection Routes',
      'Vehicles',
      'Workers',
      'Invoices',
      'Payments',
      'Reports',
      'Settings'
    ],
    widgets: ['SubscribedCustomers', 'ActiveRoutes', 'CollectionTonnage', 'InvoicedBalances'],
    description: 'Garbage disposal routes, customer invoice billings, and work shifts.'
  },
  Wholesale: {
    name: 'Wholesale Business',
    icon: 'Boxes',
    sidebar: [
      'Dashboard',
      'POS',
      'Bulk Orders',
      'Inventory',
      'Warehouses',
      { name: 'Receipts', subItems: ['Receipt History', 'Receipt Templates', 'Receipt Analytics', 'Receipt Verification', 'Receipt Archive'] },
      'Customers',
      'Suppliers',
      'Pricing',
      'Credit Sales',
      'Reports',
      'Settings'
    ],
    widgets: ['SalesToday', 'BulkOrderBacklog', 'WarehouseInventoryValue', 'CreditSalesOutstanding'],
    description: 'Bulk product pricing, warehouse splits, and credit lines.'
  },
  Fashion: {
    name: 'Fashion / Clothing Store',
    icon: 'Shirt',
    sidebar: [
      'Dashboard',
      'POS',
      'Products',
      'Sizes',
      'Colors',
      'Variants',
      'Inventory',
      { name: 'Receipts', subItems: ['Receipt History', 'Receipt Templates', 'Receipt Analytics', 'Receipt Verification', 'Receipt Archive'] },
      'Customers',
      'Suppliers',
      'Promotions',
      'Reports',
      'Settings'
    ],
    widgets: ['SalesToday', 'VariantsStocked', 'PromotionsApplied', 'CustomersCount'],
    description: 'Clothing size/color variants matrices and promotional codes.'
  },
  Service: {
    name: 'Service Business',
    icon: 'Briefcase',
    sidebar: [
      'Dashboard',
      'Services',
      'Appointments',
      'Customers',
      'Staff',
      'Invoices',
      'Payments',
      'Expenses',
      'Reports',
      'Settings'
    ],
    widgets: ['BookedAppointments', 'ServiceSales', 'StaffHours', 'ClientRetentionRate'],
    description: 'Appointment schedules, staff timesheets, and service invoicing.'
  },
  Cosmetics: {
    name: 'Beauty & Cosmetics Shop',
    icon: 'Sparkles',
    sidebar: [
      'Dashboard',
      'POS',
      'Products',
      'Inventory',
      'Customers',
      { name: 'Receipts', subItems: ['Receipt History', 'Receipt Templates', 'Receipt Analytics', 'Receipt Verification', 'Receipt Archive'] },
      'Suppliers',
      'Promotions',
      'Sales',
      'Reports',
      'Settings'
    ],
    widgets: ['SalesToday', 'InventoryValue', 'CustomersLoyalty', 'PromotionsCount'],
    description: 'Cosmetics POS sales, batch stock tracker, and rewards.'
  },
  Salon: {
    name: 'Salon & Barber Shop',
    icon: 'Scissors',
    sidebar: [
      'Dashboard',
      'Appointments',
      'Customers',
      'Services',
      'Staff',
      'POS',
      { name: 'Receipts', subItems: ['Receipt History', 'Receipt Templates', 'Receipt Analytics', 'Receipt Verification', 'Receipt Archive'] },
      'Commission',
      'Inventory',
      'Reports',
      'Settings'
    ],
    widgets: ['DailyAppointments', 'POSSalesToday', 'StaffCommissionEarned', 'RepeatClients'],
    description: 'Stylists schedules, checkout POS, and commission payouts.'
  },
  Hotel: {
    name: 'Guest House / Hotel',
    icon: 'Bed',
    sidebar: [
      'Dashboard',
      'Rooms',
      'Reservations',
      'Guests',
      'Check In',
      'Check Out',
      'Housekeeping',
      'Restaurant',
      'Payments',
      'Reports',
      'Settings'
    ],
    widgets: ['OccupiedRooms', 'PendingReservations', 'HousekeepingQueues', 'DailyHotelRevenue'],
    description: 'Room guest reservations, check-ins, and housekeeping schedules.'
  },
  Poultry: {
    name: 'Poultry & Livestock Management',
    icon: 'Egg',
    sidebar: [
      'Poultry Dashboard',
      'Farm Management',
      { name: 'Poultry Flocks', subItems: ['Batch Management', 'Flock Timeline', 'Mortality & Culling', 'FCR Analytics'] },
      { name: 'Livestock Registry', subItems: ['Animal Register', 'Tagging & QR', 'Genealogy Tree', 'Weight ADG Curves'] },
      { name: 'Feed & Water', subItems: ['Feed Inventory', 'Recipe Formulation', 'Water Meter Logs', 'Feed Cost Analysis'] },
      { name: 'Health & Veterinary', subItems: ['Vaccination Schedule', 'Disease Diagnosis', 'Vet Portal', 'Quarantine Records'] },
      { name: 'Breeding & Hatchery', subItems: ['Mating & AI', 'Pregnancy Check', 'Incubator Settings', 'Hatch Cycles'] },
      { name: 'Production Ledger', subItems: ['Daily Egg Collection', 'Milk Sessions', 'Weight Gain Logs', 'Production Trends'] },
      'Farm Tasks',
      { name: 'Sales & Checkout', subItems: ['Livestock POS', 'Live Animal Sales', 'Egg & Milk Invoices', 'Fertilizer Sales'] },
      { name: 'Purchasing', subItems: ['Feed Suppliers', 'Purchase Orders', 'Goods Received', 'Supplier Ledgers'] },
      { name: 'Reports', subItems: ['Production Report', 'Mortality Report', 'FCR Efficiency', 'Cost per Unit', 'Farm Profit & Loss'] },
      'Poultry Settings'
    ],
    widgets: ['TotalAnimals', 'ActiveFlocks', 'EggProduction', 'MilkYield', 'FeedConsumption', 'MortalityRate', 'VaccinationDue', 'LowFeedStock', 'FarmProfit'],
    description: 'Complete commercial livestock & poultry suite: flock lifecycle, FCR feed formulation, hatchery incubators, dairy milking sessions, vet lab reports, and POS integration.'
  },

  Bar: {
    name: 'Bar & Beverage Lounge',
    icon: 'Beer',
    sidebar: [
      'Dashboard',
      { name: 'Counter POS', subItems: ['Active Tables', 'Bar Counter POS', 'Open Tabs & Bills', 'Order History', 'Complimentary / Spoils'] },
      { name: 'Beverage Inventory', subItems: ['Stock Register', 'Liquid Volume Tracking', 'Empty Bottle Return', 'Stock Adjustments', 'Low Stock Alerts'] },
      { name: 'Recipe & Pour Control', subItems: ['Cocktail Recipes', 'Cost-Per-Pour Mapping', 'Batch Mixing', 'Spillage Logs'] },
      { name: 'Purchasing & Supplies', subItems: ['Distributors & Suppliers', 'Purchase Orders', 'Crate/Case Received', 'Supplier Ledgers'] },
      { name: 'Receipts', subItems: ['Receipt History', 'Receipt Templates', 'Receipt Analytics', 'Receipt Verification', 'Receipt Archive'] },
      { name: 'Shift & Counter Management', subItems: ['Cashier Shifts', 'Counter Handover', 'Float Management', 'Audit & Variance Logs'] },
      { name: 'Staff & Commissions', subItems: ['Bartenders & Waiters', 'Attendance Register', 'Waiter Sales Tracking', 'Tips & Commissions'] },
      { name: 'Expenses', subItems: ['Licensing & Permits', 'Operational Costs', 'Damaged/Broken Stock'] },
      { name: 'Reports & Analytics', subItems: ['Daily Sales Summary', 'Fast-Moving Drinks', 'Pour Variance Report', 'Profit Margin Analysis', 'Tax & Excise Duty'] },
      { name: 'Settings', subItems: ['Bar Setup & Tables', 'Measurement Units (Pours/Bottles)', 'Happy Hour Rules', 'Role Permissions'] }
    ],
    widgets: ['SalesToday', 'ActiveOpenTabs', 'EstimatedLiquidVariance', 'TopSellingBeverage', 'HappyHourStatus'],
    description: 'Counter POS with open-tab billing, pour tracking, cocktail recipe costs, and excise duty reporting for bars, pubs, and nightclubs.'
  },
  BusinessConsultant: {
    name: 'Business Consultant / Firm',
    icon: 'Briefcase',
    sidebar: [
      { name: 'Dashboard', subItems: ['Executive Dashboard', 'KPI Overview', 'Revenue Analytics', 'Client Health Score', 'Upcoming Deadlines', 'Recent Activities'] },
      { name: 'Clients', subItems: ['Client Directory', 'Organizations', 'Individual Clients', 'Contact Persons', 'Client Notes', 'Client Documents', 'Client Portal Access'] },
      { name: 'Engagements', subItems: ['Active Projects', 'Consulting Engagements', 'Business Assessments', 'Strategy Sessions', 'Advisory Plans', 'Deliverables', 'Project Timeline'] },
      { name: 'Proposals', subItems: ['Create Proposal', 'Proposal Templates', 'Sent Proposals', 'Accepted', 'Rejected', 'Proposal Analytics'] },
      { name: 'Contracts', subItems: ['Contracts', 'Digital Signatures', 'Renewals', 'Contract Templates', 'Expiring Contracts'] },
      { name: 'Services', subItems: ['Service Catalog', 'Pricing Packages', 'Retainer Plans', 'Hourly Services', 'Custom Services', 'Service Categories'] },
      { name: 'Time Tracking', subItems: ['Timesheets', 'Billable Hours', 'Team Time Logs', 'Productivity Report', 'Approval Queue'] },
      { name: 'Meetings', subItems: ['Calendar', 'Client Meetings', 'Online Meetings', 'Follow-ups', 'Agenda', 'Meeting Minutes'] },
      { name: 'Assessments', subItems: ['SWOT Analysis', 'Business Health Check', 'Risk Assessment', 'Compliance Review', 'Financial Analysis', 'Assessment Templates'] },
      { name: 'Strategy', subItems: ['Strategic Plans', 'OKRs', 'Roadmaps', 'Action Plans', 'Milestones', 'Progress Tracking'] },
      { name: 'Invoicing', subItems: ['Quotes', 'Invoices', 'Payments', 'Outstanding', 'Recurring Billing', 'Expenses'] },
      { name: 'Team', subItems: ['Consultants', 'Skills Matrix', 'Certifications', 'Capacity Planning', 'Performance', 'Leave Calendar'] },
      { name: 'Knowledge Base', subItems: ['Templates', 'Best Practices', 'SOPs', 'Research Library', 'Case Studies', 'Internal Documents'] },
      { name: 'Reports', subItems: ['Client Reports', 'Project Reports', 'Financial Reports', 'Consultant Utilization', 'Revenue Reports', 'Profitability', 'Export Center'] },
      { name: 'AI Consultant', subItems: ['Business Insights', 'SWOT Generator', 'Proposal Generator', 'Business Plan Generator', 'Financial Recommendations', 'Meeting Summary', 'AI Chat'] },
      { name: 'Communications', subItems: ['Email Center', 'SMS', 'WhatsApp', 'Notifications', 'Activity Feed'] },
      { name: 'Administration', subItems: ['Branches', 'Users & Roles', 'Permissions', 'Workflow Automation', 'Approval Rules', 'Custom Fields', 'Integrations', 'Audit Logs', 'Settings'] }
    ],
    widgets: [
      'TotalClients', 'ActiveEngagements', 'MonthlyRevenue', 'ConsultantUtilization', 'BillableHours',
      'ProposalConversionRate', 'UpcomingMeetings', 'ExpiringContracts', 'OutstandingInvoices',
      'ClientSatisfactionScore', 'ProjectCompletion', 'TasksDueToday', 'RecentActivities', 'AIConsultantInsights'
    ],
    description: 'Automatic client portals, proposals, contracts, project deliverables, timesheets, and AI business analysis.'
  },
  TechnicalCompany: {
    name: 'Technical & Engineering Company',
    icon: 'Wrench',
    sidebar: [
      { name: 'Dashboard', subItems: ['Business Overview', 'Revenue Analytics', 'Active Projects', 'Pending Jobs', 'Team Productivity', 'KPI Dashboard'] },
      { name: 'Customers', subItems: ['Customer Directory', 'Corporate Clients', 'Individual Clients', 'Customer Contracts', 'Service History', 'Customer Communication'] },
      { name: 'Sales & Quotations', subItems: ['Quotations', 'Estimates', 'Proforma Invoices', 'Sales Orders', 'Contracts', 'Invoices', 'Payments', 'Credit Notes'] },
      { name: 'Projects', subItems: ['Project List', 'Active Projects', 'Completed Projects', 'Milestones', 'Tasks', 'Project Calendar', 'Resource Allocation', 'Budget Tracking', 'Project Documents'] },
      { name: 'Field Service', subItems: ['Service Requests', 'Work Orders', 'Site Visits', 'Maintenance Jobs', 'Installation Jobs', 'Emergency Calls', 'Technician Schedule', 'Job Completion Reports'] },
      { name: 'Technical Services', subItems: ['Repairs', 'Installations', 'Preventive Maintenance', 'Equipment Inspection', 'Testing & Commissioning', 'Calibration', 'Troubleshooting', 'Service Checklists'] },
      { name: 'Assets & Equipment', subItems: ['Company Equipment', 'Customer Equipment', 'Asset Register', 'Equipment Maintenance', 'Warranty Tracking', 'Serial Numbers', 'Asset History'] },
      { name: 'Inventory', subItems: ['Products', 'Spare Parts', 'Consumables', 'Stock Movement', 'Purchase Orders', 'Suppliers', 'Goods Received', 'Stock Transfers', 'Stock Adjustment'] },
      { name: 'Procurement', subItems: ['Supplier Management', 'RFQs', 'Purchase Requests', 'Purchase Orders', 'Supplier Payments', 'Supplier Performance'] },
      { name: 'Workforce', subItems: ['Employees', 'Technicians', 'Engineers', 'Teams', 'Attendance', 'Timesheets', 'Leave Management', 'Payroll Integration'] },
      { name: 'Scheduling', subItems: ['Daily Schedule', 'Weekly Planner', 'Technician Assignment', 'Route Planning', 'Calendar', 'Job Queue'] },
      { name: 'Fleet Management', subItems: ['Company Vehicles', 'Driver Assignment', 'Fuel Usage', 'Vehicle Maintenance', 'GPS Tracking', 'Travel Logs'] },
      { name: 'Finance', subItems: ['Income', 'Expenses', 'Project Costing', 'Profit Analysis', 'Cash Flow', 'Accounts Receivable', 'Accounts Payable', 'General Ledger'] },
      { name: 'Documents', subItems: ['Contracts', 'Technical Drawings', 'Blueprints', 'Site Photos', 'Certificates', 'Compliance Documents', 'File Manager'] },
      { name: 'Reports', subItems: ['Sales Report', 'Project Report', 'Technician Performance', 'Equipment Report', 'Inventory Report', 'Financial Report', 'Customer Report', 'Job Completion Report', 'Profitability Report'] },
      { name: 'AI Insights', subItems: ['Revenue Forecast', 'Predictive Maintenance', 'Inventory Forecast', 'Customer Insights', 'Technician Performance', 'Project Risk Analysis', 'Smart Recommendations', 'AI Assistant'] },
      { name: 'Notifications', subItems: ['Service Reminders', 'Warranty Expiry', 'Low Stock Alerts', 'Project Alerts', 'Customer Messages', 'System Notifications'] },
      { name: 'Settings', subItems: ['Business Profile', 'Branches', 'Tax Settings', 'Departments', 'Service Categories', 'Job Types', 'User Roles', 'Workflow Automation', 'Integrations', 'Feature Flags'] },
      { name: 'Administration', subItems: ['Audit Logs', 'Activity Logs', 'User Management', 'Permissions', 'Backup & Restore', 'API Access', 'System Health', 'Developer Options'] }
    ],
    widgets: [
      'Revenue', 'Active Projects', "Today's Jobs", 'Technician Availability',
      'Outstanding Quotations', 'Inventory Status', 'Equipment Health', 'AI Insights'
    ],
    description: 'Project management, field service work orders, equipment tracking, technician scheduling, and AI predictive maintenance.'
  }
};

export interface ModuleState {
  enabled: boolean;
  version: string;
}

interface ModuleContextType {
  activeModule: IndustryModule;
  setActiveModule: (module: IndustryModule) => void;
  manifest: ModuleManifest;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  moduleStates: Record<string, ModuleState>;
  toggleModuleState: (moduleKey: string) => void;
  enabledModules: IndustryModule[];
  isModuleEnabled: (moduleKey: string) => boolean;
  isMobileSidebarOpen: boolean;
  setIsMobileSidebarOpen: (open: boolean) => void;
  /** True when the logged-in user is a dev superuser with access to all modules. */
  isDevSuperuser: boolean;
}

const defaultModuleContext: ModuleContextType = {
  activeModule: 'Retail',
  setActiveModule: () => {},
  manifest: MODULE_MANIFESTS['Retail'],
  activeTab: 'Dashboard',
  setActiveTab: () => {},
  moduleStates: {},
  toggleModuleState: () => {},
  enabledModules: Object.keys(MODULE_MANIFESTS) as IndustryModule[],
  isModuleEnabled: () => true,
  isMobileSidebarOpen: false,
  setIsMobileSidebarOpen: () => {},
  isDevSuperuser: false
};

const ModuleContext = createContext<ModuleContextType>(defaultModuleContext);

export const ModuleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeModule, setActiveModuleState] = useState<IndustryModule>(() => {
    try {
      const saved = localStorage.getItem('dukapos_active_module');
      if (saved && MODULE_MANIFESTS[saved as IndustryModule]) {
        return saved as IndustryModule;
      }
    } catch (_) {}
    return 'Retail';
  });

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const [activeTab, setActiveTabState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('dukapos_active_tab');
      if (saved) return saved;
    } catch (_) {}
    return 'Dashboard';
  });

  const setActiveTab = useCallback((tab: string) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('dukapos_active_tab', tab);
    } catch (_) {}
  }, []);

  const [moduleStates, setModuleStates] = useState<Record<string, ModuleState>>(() => {
    try {
      const saved = localStorage.getItem('dukapos_global_module_states');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to parse dukapos_global_module_states from localStorage', e);
    }
    const initial: Record<string, ModuleState> = {};
    (Object.keys(MODULE_MANIFESTS) as IndustryModule[]).forEach((key, index) => {
      // Default Retail to enabled, all other industry modules to disabled until explicitly installed/enabled
      initial[key] = { enabled: key === 'Retail', version: `v2.4.${index + 1}` };
    });
    return initial;
  });

  // Live query for persistent tenant modules from IndexedDB
  const liveTenantModules = useLiveQuery(async () => {
    try {
      const sessionStr = getActiveSessionRaw();
      let tenantId: string | null = null;
      if (sessionStr) {
        const sess = JSON.parse(sessionStr);
        tenantId = sess?.tenant?.id || sess?.user?.tenant_id || null;
      }
      if (tenantId) {
        return db.tenantModules.where('tenant_id').equals(tenantId).toArray();
      }
      return db.tenantModules.toArray();
    } catch (_) {
      return [];
    }
  });

  // Synchronize live DB tenant modules with React state and localStorage
  useEffect(() => {
    if (liveTenantModules && liveTenantModules.length > 0) {
      setModuleStates(prev => {
        let changed = false;
        const updated = { ...prev };
        for (const tm of liveTenantModules) {
          if (tm.module_key && (!updated[tm.module_key] || updated[tm.module_key].enabled !== tm.enabled)) {
            updated[tm.module_key] = {
              ...(updated[tm.module_key] || { version: 'v2.4.1' }),
              enabled: !!tm.enabled
            };
            changed = true;
          }
        }
        if (changed) {
          try {
            localStorage.setItem('dukapos_global_module_states', JSON.stringify(updated));
          } catch (_) {}
          return updated;
        }
        return prev;
      });
    }
  }, [liveTenantModules]);

  const toggleModuleState = async (moduleKey: string) => {
    const currentEnabled = moduleStates[moduleKey]?.enabled ?? (moduleKey === 'Retail');
    const newEnabled = !currentEnabled;

    setModuleStates(prev => {
      const updated = {
        ...prev,
        [moduleKey]: {
          ...(prev[moduleKey] || { version: 'v2.4.1' }),
          enabled: newEnabled
        }
      };
      try {
        localStorage.setItem('dukapos_global_module_states', JSON.stringify(updated));
      } catch (e) {
        console.warn('Failed to save module states to localStorage', e);
      }
      return updated;
    });

    // Persist changes to IndexedDB and authoritative PostgreSQL server
    try {
      const sessionStr = getActiveSessionRaw();
      let activeTenantId: string | null = null;
      if (sessionStr) {
        try {
          const sess = JSON.parse(sessionStr);
          activeTenantId = sess?.tenant?.id || sess?.user?.tenant_id || null;
        } catch (_) {}
      }

      const tenants = await db.tenants.toArray();
      const targetTenantIds = activeTenantId
        ? Array.from(new Set([activeTenantId, ...tenants.map(t => t.id)]))
        : (tenants.length > 0 ? tenants.map(t => t.id) : ['tenant-101']);

      for (const tid of targetTenantIds) {
        const existing = await db.tenantModules.where('tenant_id').equals(tid).filter(m => m.module_key === moduleKey).first();
        const now = Date.now();
        const updatedRecord = {
          id: existing?.id || `tm-${tid}-${moduleKey.toLowerCase()}`,
          tenant_id: tid,
          module_key: moduleKey,
          installed: true,
          enabled: newEnabled,
          status: newEnabled ? 'ENABLED' : 'DISABLED',
          version: (existing?.version || 1) + 1,
          updated_at: now
        };

        await db.tenantModules.put(updatedRecord);

        // Execute explicit server transaction
        fetch(`/api/tenant/modules/${moduleKey}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-tenant-id': tid },
          body: JSON.stringify({ enabled: newEnabled, installed: true, status: newEnabled ? 'ENABLED' : 'DISABLED' })
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[ModuleContext] Error persisting module toggle:', err);
    }
  };

  // Dev superuser gets every module; everyone else gets their enabled subset.
  // Must be declared BEFORE isModuleEnabled which references it.
  const isDevSuperuser = DEV_SUPERUSER_EMAILS.has(getSessionEmail() || '');

  const isModuleEnabled = (moduleKey: string) => {
    if (isDevSuperuser) return true; // dev superuser always has all modules
    if (moduleStates[moduleKey] !== undefined) {
      return !!moduleStates[moduleKey].enabled;
    }
    return moduleKey === 'Retail';
  };

  const enabledModules = isDevSuperuser
    ? (Object.keys(MODULE_MANIFESTS) as IndustryModule[])
    : (Object.keys(MODULE_MANIFESTS) as IndustryModule[]).filter(key => isModuleEnabled(key));

  const rawManifest = MODULE_MANIFESTS[activeModule] || MODULE_MANIFESTS['Retail'];
  const manifest: ModuleManifest = {
    ...rawManifest,
    sidebar: rawManifest.sidebar.map(item => {
      if (item === 'Settings') {
        return {
          name: 'Settings',
          subItems: ['General Settings', 'Users & Roles']
        };
      }
      if (typeof item !== 'string' && item.name === 'Settings') {
        return {
          ...item,
          subItems: [...(item.subItems || []).filter(s => s !== 'Users & Roles'), 'Users & Roles']
        };
      }
      return item;
    }).filter(item => {
      // Remove any existing Subscriptions entry to avoid duplicates
      return typeof item === 'string' ? item !== 'Subscriptions' : (item as NestedSidebarItem).name !== 'Subscriptions';
    })
  };

  const setActiveModule = useCallback((module: IndustryModule) => {
    setActiveModuleState(module);
    try {
      localStorage.setItem('dukapos_active_module', module);
    } catch (_) {}
  }, []);

  return (
    <ModuleContext.Provider value={{ 
      activeModule, 
      setActiveModule, 
      manifest, 
      activeTab, 
      setActiveTab,
      moduleStates,
      toggleModuleState,
      enabledModules,
      isModuleEnabled,
      isMobileSidebarOpen,
      setIsMobileSidebarOpen,
      isDevSuperuser
    }}>
      {children}
    </ModuleContext.Provider>
  );
};

export const useModule = () => {
  const context = useContext(ModuleContext);
  return context || defaultModuleContext;
};
