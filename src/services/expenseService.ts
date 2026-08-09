import { db, type Expense } from '../db/dexie';

// ─── Industry-Aware Category Taxonomy ─────────────────────────────────────────────
export interface ExpenseCategoryDef {
  name: string;
  icon?: string;
  description: string;
  isDefaultTaxDeductible: boolean;
}

// Full Taxonomy covering ALL 30 DukaP Industry Modules
export const INDUSTRY_EXPENSE_CATEGORIES: Record<string, ExpenseCategoryDef[]> = {
  Retail: [
    { name: 'Utilities', description: 'Electricity (LUKU), Water, Internet & Phone', isDefaultTaxDeductible: true },
    { name: 'Salaries & Wages', description: 'Staff payroll, overtime & sales commissions', isDefaultTaxDeductible: true },
    { name: 'Rent & Lease', description: 'Store & warehouse rent', isDefaultTaxDeductible: true },
    { name: 'Licenses & Permits', description: 'TRA, City Council (Halamashauri), BRELA', isDefaultTaxDeductible: true },
    { name: 'Transport & Freight', description: 'Stock delivery, fuel & cargo fees', isDefaultTaxDeductible: true },
    { name: 'Store Maintenance', description: 'Repairs, painting, shelf fixing & AC service', isDefaultTaxDeductible: true },
    { name: 'Packaging & Supplies', description: 'Bags, receipt rolls, tape & boxes', isDefaultTaxDeductible: true },
    { name: 'Marketing & Ads', description: 'SMS broadcasts, flyers & social media ads', isDefaultTaxDeductible: true },
    { name: 'Bank & M-Pesa Charges', description: 'M-Pesa withdrawal fees & bank ledger charges', isDefaultTaxDeductible: true },
    { name: 'Stock Waste & Damage', description: 'Expired or broken stock cost write-offs', isDefaultTaxDeductible: false },
    { name: 'Other Operational Costs', description: 'Miscellaneous operational expenses', isDefaultTaxDeductible: true },
  ],

  Restaurant: [
    { name: 'Utilities', description: 'Electricity, Water & Internet', isDefaultTaxDeductible: true },
    { name: 'Salaries & Kitchen Staff', description: 'Chefs, waitstaff & kitchen team wages', isDefaultTaxDeductible: true },
    { name: 'Rent & Space Lease', description: 'Restaurant dining & kitchen rent', isDefaultTaxDeductible: true },
    { name: 'LPG Gas & Cooking Fuel', description: 'Gas cylinders, charcoal & firewood', isDefaultTaxDeductible: true },
    { name: 'Health Permits & Inspection', description: 'Food handler health certs, TFDA inspection', isDefaultTaxDeductible: true },
    { name: 'Perishable Spoilage', description: 'Raw food spoilage & waste write-offs', isDefaultTaxDeductible: false },
    { name: 'Cleaning & Sanitation', description: 'Detergents, pest control & dishwashing supplies', isDefaultTaxDeductible: true },
    { name: 'Glassware & Crockery Breakage', description: 'Replacement plates, glasses & utensils', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous operational expenses', isDefaultTaxDeductible: true },
  ],

  SACCO: [
    { name: 'Office Rent', description: 'SACCO branch premises rent', isDefaultTaxDeductible: true },
    { name: 'Staff Salaries', description: 'Manager, loan officers & accountant pay', isDefaultTaxDeductible: true },
    { name: 'Audit & Registrar Fees', description: 'COASCO / External audit & Ministry registration', isDefaultTaxDeductible: true },
    { name: 'Board Sitting Allowances', description: 'Board meeting sitting allowances & transport', isDefaultTaxDeductible: true },
    { name: 'SMS Gateway Credits', description: 'Member notification SMS units', isDefaultTaxDeductible: true },
    { name: 'Bank Charges', description: 'Bank transfer & ledger maintenance charges', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous SACCO expenses', isDefaultTaxDeductible: true },
  ],

  Workforce: [
    { name: 'Office Rent & Utilities', description: 'HR office rent & utility bills', isDefaultTaxDeductible: true },
    { name: 'HR & Payroll Subscriptions', description: 'Cloud HR software & attendance server costs', isDefaultTaxDeductible: true },
    { name: 'GPS Tracker Subscriptions', description: 'Vehicle & employee GPS SIM card bundles', isDefaultTaxDeductible: true },
    { name: 'Staff Allowances & Overtime', description: 'Field travel allowances & overtime payouts', isDefaultTaxDeductible: true },
    { name: 'Recruitment & Vetting Costs', description: 'Job advertising, background checks & medical tests', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous workforce expenses', isDefaultTaxDeductible: true },
  ],

  Pharmacy: [
    { name: 'Utilities', description: 'Electricity, Water & Internet', isDefaultTaxDeductible: true },
    { name: 'Salaries & Wages', description: 'Pharmacist & dispenser salaries', isDefaultTaxDeductible: true },
    { name: 'Rent & Lease', description: 'Premises rent', isDefaultTaxDeductible: true },
    { name: 'TMDA / Permits', description: 'TMDA inspection, Pharmacy Council fees', isDefaultTaxDeductible: true },
    { name: 'Cold Chain Storage', description: 'Refrigerator power, backup generator & ice packs', isDefaultTaxDeductible: true },
    { name: 'Bio-Hazard Disposal', description: 'Medical waste & expired drug disposal fees', isDefaultTaxDeductible: true },
    { name: 'Packaging & Supplies', description: 'Pill bottles, bags & prescription pads', isDefaultTaxDeductible: true },
    { name: 'Professional Insurance', description: 'Pharmacy indemnity & liability insurance', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous operational expenses', isDefaultTaxDeductible: true },
  ],

  Hardware: [
    { name: 'Utilities', description: 'Power, Water & Connectivity', isDefaultTaxDeductible: true },
    { name: 'Salaries & Wages', description: 'Sales reps, loader allowances & drivers', isDefaultTaxDeductible: true },
    { name: 'Rent & Yard Lease', description: 'Hardware shop & open yard rental', isDefaultTaxDeductible: true },
    { name: 'Heavy Haulage & Logistics', description: 'Lorry hire, cement transport & offloading fees', isDefaultTaxDeductible: true },
    { name: 'Yard Machinery Fuel', description: 'Forklift & generator diesel', isDefaultTaxDeductible: true },
    { name: 'Licenses & Trade Permits', description: 'Business license & weight/measurements certification', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous operational costs', isDefaultTaxDeductible: true },
  ],

  Construction: [
    { name: 'Site Rent & Storage', description: 'Site office & equipment yard lease', isDefaultTaxDeductible: true },
    { name: 'Labour & Casual Wages', description: 'Masons, casual workers & site supervisors', isDefaultTaxDeductible: true },
    { name: 'Equipment Lease & Hire', description: 'Excavator, mixer & scaffolding rentals', isDefaultTaxDeductible: true },
    { name: 'Fuel & Generator Diesel', description: 'Site machinery & generator fuel', isDefaultTaxDeductible: true },
    { name: 'OSHA & Safety Permits', description: 'OSHA inspections, safety gear & permits', isDefaultTaxDeductible: true },
    { name: 'Subcontractor Payments', description: 'Electrical, plumbing & roofing specialists', isDefaultTaxDeductible: true },
    { name: 'Site Material Loss', description: 'Damaged or stolen site materials write-off', isDefaultTaxDeductible: false },
    { name: 'Other Operational Costs', description: 'Miscellaneous project costs', isDefaultTaxDeductible: true },
  ],

  Law: [
    { name: 'Office Rent & Chambers', description: 'Law firm office rent', isDefaultTaxDeductible: true },
    { name: 'Advocate Salaries & Draw', description: 'Legal associates & paralegal salaries', isDefaultTaxDeductible: true },
    { name: 'Court & Filing Fees', description: 'High Court filing, magistrate fees & stamp duty', isDefaultTaxDeductible: true },
    { name: 'TLS & Bar Association', description: 'Tanganyika Law Society annual practicing fees', isDefaultTaxDeductible: true },
    { name: 'Process Serving & Courier', description: 'Court summons delivery & dispatch', isDefaultTaxDeductible: true },
    { name: 'Legal Research & Subscriptions', description: 'LawAfrica, TanzLII & printing supplies', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous firm expenses', isDefaultTaxDeductible: true },
  ],

  RealEstate: [
    { name: 'Office Rent & Utilities', description: 'Agency premises rent & power', isDefaultTaxDeductible: true },
    { name: 'Property Maintenance & Repairs', description: 'Plumbing, electrical & roof repairs for managed units', isDefaultTaxDeductible: true },
    { name: 'Land Rates & Property Tax', description: 'Municipal land rates & valuation levies', isDefaultTaxDeductible: true },
    { name: 'Cleaning & Security', description: 'Estate security guards & common area cleaning', isDefaultTaxDeductible: true },
    { name: 'Legal & Eviction Fees', description: 'Tenancy agreement drafting & eviction legal fees', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous property expenses', isDefaultTaxDeductible: true },
  ],

  Microfinance: [
    { name: 'Office Rent & Utilities', description: 'Branch rent & electricity', isDefaultTaxDeductible: true },
    { name: 'Staff & Field Officer Wages', description: 'Loan officers, collectors & credit analysts', isDefaultTaxDeductible: true },
    { name: 'CRB & Credit Checks', description: 'Credit Reference Bureau check fees', isDefaultTaxDeductible: true },
    { name: 'Legal Recovery & Debt Collection', description: 'Lawyer demand letters & court auctioneer fees', isDefaultTaxDeductible: true },
    { name: 'SMS & Communication', description: 'Payment reminder SMS gateway costs', isDefaultTaxDeductible: true },
    { name: 'Bank & Disbursement Fees', description: 'BACS & bulk M-Pesa loan disbursement fees', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous microfinance expenses', isDefaultTaxDeductible: true },
  ],

  Agriculture: [
    { name: 'Farm Land Lease', description: 'Agricultural land rental', isDefaultTaxDeductible: true },
    { name: 'Seeds & Chemicals', description: 'Certified seeds, pesticides & fungicides', isDefaultTaxDeductible: true },
    { name: 'Fertilizers & Soil Boosters', description: 'DAP, CAN, Urea & organic manure', isDefaultTaxDeductible: true },
    { name: 'Irrigation & Pump Fuel', description: 'Water pump diesel & electricity', isDefaultTaxDeductible: true },
    { name: 'Casual Harvest Labor', description: 'Plucking, weeding & harvesting workers', isDefaultTaxDeductible: true },
    { name: 'Tractor & Machinery Service', description: 'Tractor ploughing, harrowing & maintenance', isDefaultTaxDeductible: true },
    { name: 'Crop Loss & Spoilage', description: 'Drought, pest or hail crop destruction', isDefaultTaxDeductible: false },
    { name: 'Other Operational Costs', description: 'Miscellaneous farm expenses', isDefaultTaxDeductible: true },
  ],

  Electronics: [
    { name: 'Store Rent & Utilities', description: 'Shop rent & showroom electricity', isDefaultTaxDeductible: true },
    { name: 'Staff & Technician Pay', description: 'Sales staff & repair technician wages', isDefaultTaxDeductible: true },
    { name: 'Warranty Claims & Replacement', description: 'Defective unit replacements & warranty costs', isDefaultTaxDeductible: true },
    { name: 'Spare Parts Cargo', description: 'Import freight for screens, batteries & ICs', isDefaultTaxDeductible: true },
    { name: 'Tools & Testing Calibration', description: 'Soldering stations, meters & software tools', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous electronics shop costs', isDefaultTaxDeductible: true },
  ],

  Garage: [
    { name: 'Workshop Rent', description: 'Garage yard & workshop rental', isDefaultTaxDeductible: true },
    { name: 'Mechanic & Electrician Wages', description: 'Mechanic commissions & daily wages', isDefaultTaxDeductible: true },
    { name: 'Hazardous Waste Disposal', description: 'Used engine oil & battery acid disposal', isDefaultTaxDeductible: true },
    { name: 'Compressor & Power Fuel', description: 'Hydraulic lift power & air compressor diesel', isDefaultTaxDeductible: true },
    { name: 'Tow Truck & Rescue Fees', description: 'Vehicle breakdown towing expenses', isDefaultTaxDeductible: true },
    { name: 'Spare Parts Sourcing', description: 'Emergency spare part procurement logistics', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous garage overhead', isDefaultTaxDeductible: true },
  ],

  FuelStation: [
    { name: 'Station Land Lease', description: 'Fuel station plot lease', isDefaultTaxDeductible: true },
    { name: 'Pump Attendant Wages', description: 'Shift attendants & cashier wages', isDefaultTaxDeductible: true },
    { name: 'EWURA & Regulatory Permits', description: 'EWURA license, TBS quality tests & WMA weights', isDefaultTaxDeductible: true },
    { name: 'Tank Cleaning & Calibration', description: 'Underground tank de-sludging & calibration', isDefaultTaxDeductible: true },
    { name: 'Sludge & Evaporation Loss', description: 'Standard fuel evaporation & tank bottom sludge loss', isDefaultTaxDeductible: false },
    { name: 'Fire & Safety Compliance', description: 'Extinguisher refills & safety audits', isDefaultTaxDeductible: true },
    { name: 'Power & Generator Diesel', description: 'Station lighting & generator fuel', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous fuel station expenses', isDefaultTaxDeductible: true },
  ],

  School: [
    { name: 'School Premises Lease', description: 'Land & school building rent', isDefaultTaxDeductible: true },
    { name: 'Teacher & Staff Salaries', description: 'Teachers, matrons, drivers & admin pay', isDefaultTaxDeductible: true },
    { name: 'Ministry & Exam Board Fees', description: 'NECTA registration & Ministry inspection', isDefaultTaxDeductible: true },
    { name: 'Catering & Student Food', description: 'Maize flour, beans & kitchen supplies', isDefaultTaxDeductible: true },
    { name: 'Exam Papers & Printing', description: 'MOCK exams, report cards & stationery', isDefaultTaxDeductible: true },
    { name: 'Lab Chemicals & Sports', description: 'Science lab consumables & sports gear', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous school expenses', isDefaultTaxDeductible: true },
  ],

  Bookshop: [
    { name: 'Store Rent & Utilities', description: 'Bookshop rent & electricity', isDefaultTaxDeductible: true },
    { name: 'Staff Wages', description: 'Sales assistants & stock keepers', isDefaultTaxDeductible: true },
    { name: 'Publisher Cargo & Freight', description: 'Book delivery freight from publishers', isDefaultTaxDeductible: true },
    { name: 'Copyright & Licensing', description: 'Educational licensing & publisher permits', isDefaultTaxDeductible: true },
    { name: 'Packaging & Receipt Rolls', description: 'Plastic bags, kraft paper & receipt rolls', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous bookshop costs', isDefaultTaxDeductible: true },
  ],

  Security: [
    { name: 'Office & Guard Base Rent', description: 'Muster station & office rent', isDefaultTaxDeductible: true },
    { name: 'Guard Uniforms & Boots', description: 'Uniforms, boots, batons & torches', isDefaultTaxDeductible: true },
    { name: 'Radio Frequency Licensing', description: 'TCRA walkie-talkie frequency permits', isDefaultTaxDeductible: true },
    { name: 'Patrol Vehicle Fuel', description: 'Inspection car & motorcycle fuel', isDefaultTaxDeductible: true },
    { name: 'Guard Night Allowance', description: 'Night shift tea allowance & rations', isDefaultTaxDeductible: true },
    { name: 'Fidelity Insurance', description: 'Insurance against guard negligence or theft', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous security firm costs', isDefaultTaxDeductible: true },
  ],

  Water: [
    { name: 'Station & Tank Rent', description: 'Water kiosk & tank plot lease', isDefaultTaxDeductible: true },
    { name: 'Pumping Electricity', description: 'Borehole & booster pump power bills', isDefaultTaxDeductible: true },
    { name: 'Pipe Maintenance & Leaks', description: 'PVC pipes, fittings & trench digging labor', isDefaultTaxDeductible: true },
    { name: 'Water Quality Testing', description: 'TBS & Govt Chemist water lab tests', isDefaultTaxDeductible: true },
    { name: 'Meter Calibration', description: 'Customer meter testing & seals', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous water supply costs', isDefaultTaxDeductible: true },
  ],

  Transport: [
    { name: 'Depot & Bus Park Rent', description: 'Depot rent & parking bay charges', isDefaultTaxDeductible: true },
    { name: 'Vehicle Maintenance & Tyres', description: 'Engine overhaul, tyres & brake pads', isDefaultTaxDeductible: true },
    { name: 'Driver & Conductor Allowances', description: 'Trip allowances & food money', isDefaultTaxDeductible: true },
    { name: 'LATRA / Road Permits', description: 'LATRA licenses, route permits & motor vehicle inspection', isDefaultTaxDeductible: true },
    { name: 'Tolls & Station Fees', description: 'Weighbridge & bus terminal entry fees', isDefaultTaxDeductible: true },
    { name: 'Passenger Insurance', description: 'Third-party passenger insurance premiums', isDefaultTaxDeductible: true },
    { name: 'Fuel & Lubricants', description: 'Diesel & engine oil', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous transport expenses', isDefaultTaxDeductible: true },
  ],

  Waste: [
    { name: 'Yard & Depot Rent', description: 'Garbage truck yard lease', isDefaultTaxDeductible: true },
    { name: 'Dumping Ground Permits', description: 'Municipal landfill dumping fees & NEMA permits', isDefaultTaxDeductible: true },
    { name: 'Worker PPE & Gloves', description: 'Heavy duty gloves, boots, masks & overalls', isDefaultTaxDeductible: true },
    { name: 'Refuse Lorry Diesel & Repairs', description: 'Compactor truck fuel & hydraulic repairs', isDefaultTaxDeductible: true },
    { name: 'Disinfectant & Fumigation', description: 'Chemical sprays & truck washdown supplies', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous waste management costs', isDefaultTaxDeductible: true },
  ],

  Wholesale: [
    { name: 'Warehouse Lease', description: 'Main wholesale warehouse rent', isDefaultTaxDeductible: true },
    { name: 'Forklift Fuel & Repairs', description: 'Warehouse forklift diesel & service', isDefaultTaxDeductible: true },
    { name: 'Staff & Offloader Wages', description: 'Wholesale clerks & heavy bag offloaders', isDefaultTaxDeductible: true },
    { name: 'Bulk Cargo Freight', description: 'Trailer container freight & port clearance', isDefaultTaxDeductible: true },
    { name: 'Pallets & Shrinkwrap', description: 'Wooden pallets & packaging stretch film', isDefaultTaxDeductible: true },
    { name: 'Credit Loss Write-Off', description: 'Bad debt write-offs from unpaid wholesale credit', isDefaultTaxDeductible: false },
    { name: 'Other Operational Costs', description: 'Miscellaneous wholesale expenses', isDefaultTaxDeductible: true },
  ],

  Fashion: [
    { name: 'Boutique Rent & Lighting', description: 'Store rent & showroom spot lighting', isDefaultTaxDeductible: true },
    { name: 'Tailoring & Alterations', description: 'In-house tailor wages & thread supplies', isDefaultTaxDeductible: true },
    { name: 'Fixtures & Mannequins', description: 'Hangers, display racks & mannequins', isDefaultTaxDeductible: true },
    { name: 'Import Freight & Clearing', description: 'Air cargo freight for imported apparel', isDefaultTaxDeductible: true },
    { name: 'Branded Bags & Packaging', description: 'Custom printed garment bags & gift boxes', isDefaultTaxDeductible: true },
    { name: 'Photoshoots & Ads', description: 'Model fees, photography & Instagram ads', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous boutique expenses', isDefaultTaxDeductible: true },
  ],

  Service: [
    { name: 'Office Rent & Utilities', description: 'Service office rent & power', isDefaultTaxDeductible: true },
    { name: 'Specialist Staff Fees', description: 'Consultant & specialist contractor pay', isDefaultTaxDeductible: true },
    { name: 'Client Travel & Hosting', description: 'Client meeting coffee, meals & taxi fares', isDefaultTaxDeductible: true },
    { name: 'Software & Cloud Tools', description: 'SaaS subscriptions, Zoom & Adobe licences', isDefaultTaxDeductible: true },
    { name: 'Professional Indemnity', description: 'Liability & indemnity insurance', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous service business costs', isDefaultTaxDeductible: true },
  ],

  Cosmetics: [
    { name: 'Shop Rent & Utilities', description: 'Cosmetics shop rent & AC power', isDefaultTaxDeductible: true },
    { name: 'Sales Attendant Pay', description: 'Beauty advisor & cashier wages', isDefaultTaxDeductible: true },
    { name: 'TFDA / Beauty Permits', description: 'Cosmetic product registration & health certs', isDefaultTaxDeductible: true },
    { name: 'Tester & Spoilage Write-Off', description: 'In-store demo testers & expired cosmetics', isDefaultTaxDeductible: false },
    { name: 'Counter Lighting & Displays', description: 'Mirrors, LED strips & acrylic stands', isDefaultTaxDeductible: true },
    { name: 'Gift Wrapping & Pouches', description: 'Ribbons, pouches & perfume samples', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous cosmetics store costs', isDefaultTaxDeductible: true },
  ],

  Salon: [
    { name: 'Salon Rent & Power', description: 'Premises rent, dryer power & water heating', isDefaultTaxDeductible: true },
    { name: 'Stylist & Barber Commissions', description: 'Staff commission & daily payouts', isDefaultTaxDeductible: true },
    { name: 'Hair Chemicals & Supplies', description: 'Shampoos, dyes, relaxers & hair oils', isDefaultTaxDeductible: true },
    { name: 'Towel Laundry Service', description: 'Daily towel washing & sterilising service', isDefaultTaxDeductible: true },
    { name: 'Sanitation & Barbicide', description: 'Razor blades, neck strips & disinfectant', isDefaultTaxDeductible: true },
    { name: 'Client Refreshments', description: 'Tea, coffee & water offered to clients', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous salon expenses', isDefaultTaxDeductible: true },
  ],

  Hotel: [
    { name: 'Hotel Premises Lease', description: 'Hotel building & garden lease', isDefaultTaxDeductible: true },
    { name: 'Housekeeping & Staff Pay', description: 'Cleaners, receptionists & manager salaries', isDefaultTaxDeductible: true },
    { name: 'Room Laundry & Linen', description: 'Bed sheets, towels & duvet cleaning', isDefaultTaxDeductible: true },
    { name: 'Guest Amenities', description: 'Soaps, shampoos, slippers & bottled water', isDefaultTaxDeductible: true },
    { name: 'Catering & Breakfast', description: 'Buffet food ingredients & beverage stock', isDefaultTaxDeductible: true },
    { name: 'Booking Engine Commissions', description: 'Booking.com, Agoda & OTA commission fees', isDefaultTaxDeductible: true },
    { name: 'Tourism Levy & Licenses', description: 'Hotel board license & municipal tourism levy', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous hotel expenses', isDefaultTaxDeductible: true },
  ],

  Poultry: [
    { name: 'Farm Land Lease', description: 'Poultry farm plot rental', isDefaultTaxDeductible: true },
    { name: 'Chick Batches & Hatchery', description: 'Day-old chicks purchase from hatchery', isDefaultTaxDeductible: true },
    { name: 'Feed & Premix Costs', description: 'Starter, grower, layer mash & concentrates', isDefaultTaxDeductible: true },
    { name: 'Vaccines & Vet Drugs', description: 'Newcastle, Gumboro vaccines & antibiotics', isDefaultTaxDeductible: true },
    { name: 'Brooding Gas & Heating', description: 'Infrared bulbs, charcoal & gas brooders', isDefaultTaxDeductible: true },
    { name: 'Egg Trays & Boxes', description: 'Paper egg trays, crates & bird boxes', isDefaultTaxDeductible: true },
    { name: 'Bird Mortality Write-Off', description: 'Cost allocation for flock disease or heat death', isDefaultTaxDeductible: false },
    { name: 'Other Operational Costs', description: 'Miscellaneous poultry farm costs', isDefaultTaxDeductible: true },
  ],

  Bar: [
    { name: 'Bar Rent & Lease', description: 'Bar lounge & counter rent', isDefaultTaxDeductible: true },
    { name: 'Bartender & Waiter Pay', description: 'Staff wages, night shift tips & commissions', isDefaultTaxDeductible: true },
    { name: 'Excise Duty & TRA Stamps', description: 'Liquor excise duty & TRA tax stamps', isDefaultTaxDeductible: true },
    { name: 'Liquid Spillage & Variance', description: 'Pour variance, keg line loss & spillage cost', isDefaultTaxDeductible: false },
    { name: 'Broken Glassware & Crates', description: 'Broken beer bottles & missing crate fees', isDefaultTaxDeductible: true },
    { name: 'Liquor Licensing & Board', description: 'Annual liquor license & Music copyright (COSOTA)', isDefaultTaxDeductible: true },
    { name: 'Night Security & Bouncers', description: 'Bouncer allowances & night guards', isDefaultTaxDeductible: true },
    { name: 'DJ & Sound Equipment', description: 'Sound system repair & DJ performance fees', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous bar costs', isDefaultTaxDeductible: true },
  ],

  BusinessConsulting: [
    { name: 'Office Rent & Utilities', description: 'Consulting firm office rent & power', isDefaultTaxDeductible: true },
    { name: 'Senior Consultant Fees', description: 'Associate consultant fees & expert payouts', isDefaultTaxDeductible: true },
    { name: 'Client Hospitality & Meals', description: 'Client strategy lunches & meeting venue hire', isDefaultTaxDeductible: true },
    { name: 'Flights, Travel & Lodging', description: 'Client site visits, airfare & hotel stay', isDefaultTaxDeductible: true },
    { name: 'Proposal Binding & Print', description: 'High quality report printing & binding', isDefaultTaxDeductible: true },
    { name: 'Industry Subscriptions', description: 'Gartner, Statista & database access', isDefaultTaxDeductible: true },
    { name: 'Other Operational Costs', description: 'Miscellaneous consultancy expenses', isDefaultTaxDeductible: true },
  ],

  TechnicalCompany: [
    { name: 'Office & Workshop Lease', description: 'Engineering workshop & office rent', isDefaultTaxDeductible: true },
    { name: 'Field Technician Wages', description: 'Technician daily allowances & site pay', isDefaultTaxDeductible: true },
    { name: 'Engineering Software', description: 'AutoCAD, SolidWorks & MATLAB licenses', isDefaultTaxDeductible: true },
    { name: 'Testing & Calibration', description: 'Equipment calibration & lab testing certificates', isDefaultTaxDeductible: true },
    { name: 'Site Vehicle Fuel & Repairs', description: 'Service van fuel & maintenance', isDefaultTaxDeductible: true },
    { name: 'Safety Equipment & PPE', description: 'Helmets, safety harnesses & gas detectors', isDefaultTaxDeductible: true },
    { name: 'Project Material Scrap', description: 'Wasted engineering material cost', isDefaultTaxDeductible: false },
    { name: 'Other Operational Costs', description: 'Miscellaneous engineering expenses', isDefaultTaxDeductible: true },
  ],
};

// ─── Dynamic Module Alias & Future-Proof Resolver ─────────────────────────────────
export function getCategoriesForModule(moduleName?: string): ExpenseCategoryDef[] {
  if (!moduleName) return INDUSTRY_EXPENSE_CATEGORIES.Retail;

  // Direct exact match
  if (INDUSTRY_EXPENSE_CATEGORIES[moduleName]) {
    return INDUSTRY_EXPENSE_CATEGORIES[moduleName];
  }

  // Fuzzy / Alias resolution for future or alternative module names
  const norm = moduleName.toLowerCase().trim();

  if (norm.includes('store') || norm.includes('shop') || norm.includes('mart') || norm.includes('supermarket')) {
    return INDUSTRY_EXPENSE_CATEGORIES.Retail;
  }
  if (norm.includes('food') || norm.includes('cafe') || norm.includes('coffee') || norm.includes('bakery') || norm.includes('bistro')) {
    return INDUSTRY_EXPENSE_CATEGORIES.Restaurant;
  }
  if (norm.includes('drug') || norm.includes('med') || norm.includes('health') || norm.includes('clinic') || norm.includes('hospital')) {
    return INDUSTRY_EXPENSE_CATEGORIES.Pharmacy;
  }
  if (norm.includes('build') || norm.includes('timber') || norm.includes('steel') || norm.includes('cement')) {
    return INDUSTRY_EXPENSE_CATEGORIES.Hardware;
  }
  if (norm.includes('site') || norm.includes('civil') || norm.includes('contractor')) {
    return INDUSTRY_EXPENSE_CATEGORIES.Construction;
  }
  if (norm.includes('legal') || norm.includes('attorney') || norm.includes('advocate')) {
    return INDUSTRY_EXPENSE_CATEGORIES.Law;
  }
  if (norm.includes('property') || norm.includes('tenant') || norm.includes('apartment') || norm.includes('realty')) {
    return INDUSTRY_EXPENSE_CATEGORIES.RealEstate;
  }
  if (norm.includes('loan') || norm.includes('credit') || norm.includes('bank') || norm.includes('finance')) {
    return INDUSTRY_EXPENSE_CATEGORIES.Microfinance;
  }
  if (norm.includes('farm') || norm.includes('crop') || norm.includes('dairy') || norm.includes('horticulture')) {
    return INDUSTRY_EXPENSE_CATEGORIES.Agriculture;
  }
  if (norm.includes('tech') || norm.includes('repair') || norm.includes('it') || norm.includes('computer')) {
    return INDUSTRY_EXPENSE_CATEGORIES.Electronics;
  }
  if (norm.includes('auto') || norm.includes('car') || norm.includes('motor') || norm.includes('vehicle')) {
    return INDUSTRY_EXPENSE_CATEGORIES.Garage;
  }
  if (norm.includes('petrol') || norm.includes('oil') || norm.includes('gas station') || norm.includes('energy')) {
    return INDUSTRY_EXPENSE_CATEGORIES.FuelStation;
  }
  if (norm.includes('education') || norm.includes('college') || norm.includes('academy') || norm.includes('tuition')) {
    return INDUSTRY_EXPENSE_CATEGORIES.School;
  }
  if (norm.includes('pub') || norm.includes('club') || norm.includes('lounge') || norm.includes('liquor')) {
    return INDUSTRY_EXPENSE_CATEGORIES.Bar;
  }
  if (norm.includes('consulting') || norm.includes('advisory') || norm.includes('agency')) {
    return INDUSTRY_EXPENSE_CATEGORIES.BusinessConsulting;
  }
  if (norm.includes('engineering') || norm.includes('industrial') || norm.includes('solar')) {
    return INDUSTRY_EXPENSE_CATEGORIES.TechnicalCompany;
  }

  // Generic fallback if module is completely novel / unknown
  return INDUSTRY_EXPENSE_CATEGORIES.Retail;
}

// ─── Expense Service Methods ──────────────────────────────────────────────────
export class ExpenseService {
  /**
   * Log a new expense record with full audit metadata
   */
  static async createExpense(payload: Omit<Expense, 'id' | 'created_at' | 'sync_status'>): Promise<Expense> {
    const id = `exp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = Date.now();

    const expense: Expense = {
      ...payload,
      id,
      created_at: now,
      updated_at: now,
      sync_status: 'PENDING',
      origin: 'PRODUCTION',
    };

    await db.expenses.put(expense);

    // Queue sync outbox item
    try {
      await db.syncOutbox.put({
        outbox_id: `sync-exp-${id}`,
        operation_id: `op-exp-${id}`,
        idempotency_key: `idemp-exp-${id}`,
        tenant_id: expense.tenant_id,
        branch_id: expense.branch_id,
        entity: 'expenses' as any,
        action: 'INSERT_EVENT' as any,
        payload: expense,
        status: 'PENDING',
        retry_count: 0,
        max_retries: 5,
        created_at: now,
        updated_at: now,
      });
    } catch {
      // Sync outbox failsafe
    }

    return expense;
  }

  /**
   * Mark a pending expense bill as paid with optional payment reference
   */
  static async markAsPaid(id: string, paymentMethod?: string, paymentReference?: string): Promise<void> {
    const item = await db.expenses.get(id);
    if (!item) throw new Error(`Expense record ${id} not found.`);

    const now = Date.now();
    const updateData: Partial<Expense> = {
      status: 'Paid',
      updated_at: now,
      sync_status: 'PENDING',
    };
    if (paymentMethod) updateData.paymentMethod = paymentMethod;
    if (paymentReference) updateData.payment_reference = paymentReference;

    await db.expenses.update(id, updateData);

    try {
      await db.syncOutbox.put({
        outbox_id: `sync-exp-paid-${id}`,
        operation_id: `op-exp-paid-${id}`,
        idempotency_key: `idemp-exp-paid-${id}`,
        tenant_id: item.tenant_id,
        branch_id: item.branch_id,
        entity: 'expenses' as any,
        action: 'RECALCULATE_BALANCE' as any,
        payload: { ...item, ...updateData },
        status: 'PENDING',
        retry_count: 0,
        max_retries: 5,
        created_at: now,
        updated_at: now,
      });
    } catch {
      // Failsafe
    }
  }

  /**
   * One-click duplicate / re-log a monthly expense for current month
   */
  static async duplicateExpense(id: string, newDate?: string): Promise<Expense> {
    const original = await db.expenses.get(id);
    if (!original) throw new Error(`Expense record ${id} not found.`);

    const today = newDate || new Date().toISOString().split('T')[0];
    return this.createExpense({
      tenant_id: original.tenant_id,
      branch_id: original.branch_id,
      category: original.category,
      sub_category: original.sub_category,
      description: `(Re-logged) ${original.description}`,
      amount: original.amount,
      date: today,
      paymentMethod: original.paymentMethod,
      payment_reference: '',
      payee_name: original.payee_name,
      status: original.status === 'Paid' ? 'Paid' : 'Pending',
      tax_deductible: original.tax_deductible,
      is_hq: original.is_hq,
      is_recurring: original.is_recurring,
      recurring_frequency: original.recurring_frequency,
      created_by: original.created_by,
    });
  }

  /**
   * Approve a high-value expense record
   */
  static async approveExpense(id: string, approverId: string): Promise<void> {
    const item = await db.expenses.get(id);
    if (!item) throw new Error(`Expense record ${id} not found.`);

    const now = Date.now();
    await db.expenses.update(id, {
      status: 'Approved',
      approved_by: approverId,
      approved_at: now,
      updated_at: now,
      sync_status: 'PENDING',
    });
  }

  /**
   * Delete / void an expense record
   */
  static async deleteExpense(id: string): Promise<void> {
    const item = await db.expenses.get(id);
    if (!item) return;

    await db.expenses.delete(id);

    try {
      const now = Date.now();
      await db.syncOutbox.put({
        outbox_id: `sync-exp-del-${id}`,
        operation_id: `op-exp-del-${id}`,
        idempotency_key: `idemp-exp-del-${id}`,
        tenant_id: item.tenant_id,
        branch_id: item.branch_id,
        entity: 'expenses' as any,
        action: 'REBUILD_BRANCH' as any,
        payload: { id },
        status: 'PENDING',
        retry_count: 0,
        max_retries: 5,
        created_at: now,
        updated_at: now,
      });
    } catch {
      // Failsafe
    }
  }

  /**
   * Export expense list to CSV formatted for TRA tax reporting
   */
  static exportToCSV(expenses: Expense[], filename = 'operating_expenses.csv'): void {
    if (!expenses.length) return;

    const headers = [
      'ID', 'Date', 'Branch', 'Category', 'Payee / Recipient', 'Description',
      'Payment Method', 'Ref Code (M-Pesa/Bank)', 'Status', 'Tax Deductible', 'HQ Overhead', 'Amount (TZS)'
    ];

    const rows = expenses.map(e => [
      e.id,
      e.date,
      e.is_hq ? 'HQ Corporate' : e.branch_id,
      JSON.stringify(e.category),
      JSON.stringify(e.payee_name || '—'),
      JSON.stringify(e.description || '—'),
      e.paymentMethod,
      JSON.stringify(e.payment_reference || '—'),
      e.status,
      e.tax_deductible ? 'YES' : 'NO',
      e.is_hq ? 'YES' : 'NO',
      e.amount
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
