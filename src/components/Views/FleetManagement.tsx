import React, { useState, useEffect } from 'react';
import { 
  Truck, Fuel, Wrench, DollarSign, BarChart3, Plus, 
  Search, Car, Calculator, Navigation,
  FileText, AlertTriangle, Cpu, MapPin, CheckCircle2,
  Shield, UserCheck, Activity, Award
} from 'lucide-react';
import { db } from '../../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '../../context/AuthContext';

import { FleetCoreService } from '../../services/fleetCoreService';
import type { IFleetVehicle, IFleetDriver, VehicleType, FuelType } from '../../services/fleetCoreService';
import { FleetOperationsService } from '../../services/fleetOperationsService';
import type { IFleetTrip } from '../../services/fleetOperationsService';
import { FleetFuelService } from '../../services/fleetFuelService';
import type { IFleetFuelEntry } from '../../services/fleetFuelService';
import { FleetMaintenanceService } from '../../services/fleetMaintenanceService';
import type { IFleetWorkOrder, WorkOrderPriority } from '../../services/fleetMaintenanceService';
import { FleetInspectionService } from '../../services/fleetInspectionService';
import type { IFleetInspection } from '../../services/fleetInspectionService';
import { FleetAiService } from '../../services/fleetAiService';
import type { IFleetAiInsight } from '../../services/fleetAiService';
import { DefaultKwakoPosGpsAdapter } from '../../services/telematicsAdapter';
import type { ITelematicsPosition } from '../../services/telematicsAdapter';

export const FleetManagement: React.FC = () => {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id || 'demo-tenant';
  const branchId = (currentTenant as any)?.branchId || 'main-branch';

  const [activeTab, setActiveTab] = useState<
    'analytics' | 'vehicles' | 'drivers' | 'dispatch' | 'trips' | 
    'fuel' | 'maintenance' | 'inspections' | 'documents' | 
    'expenses' | 'accidents' | 'gps' | 'reports' | 'ai'
  >('analytics');

  const [selectedCurrency, setSelectedCurrency] = useState<'USD' | 'TZS' | 'KES' | 'EUR' | 'GBP'>('USD');
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddVehicleModal, setShowAddVehicleModal] = useState(false);
  const [showAddDriverModal, setShowAddDriverModal] = useState(false);
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);

  // Live IndexedDB Queries
  const vehicles: IFleetVehicle[] = useLiveQuery(
    async () => (await db.table('fleetVehicles').where('tenant_id').equals(tenantId).toArray()) || [],
    [tenantId]
  ) || [];

  const drivers: IFleetDriver[] = useLiveQuery(
    async () => (await db.table('fleetDrivers').where('tenant_id').equals(tenantId).toArray()) || [],
    [tenantId]
  ) || [];

  const trips: IFleetTrip[] = useLiveQuery(
    async () => (await db.table('fleetTrips').where('tenant_id').equals(tenantId).toArray()) || [],
    [tenantId]
  ) || [];

  const fuelEntries: IFleetFuelEntry[] = useLiveQuery(
    async () => (await db.table('fleetFuelEntries').where('tenant_id').equals(tenantId).toArray()) || [],
    [tenantId]
  ) || [];

  const maintenanceOrders: IFleetWorkOrder[] = useLiveQuery(
    async () => (await db.table('fleetMaintenanceOrders').where('tenant_id').equals(tenantId).toArray()) || [],
    [tenantId]
  ) || [];

  const inspections: IFleetInspection[] = useLiveQuery(
    async () => (await db.table('fleetInspections').where('tenant_id').equals(tenantId).toArray()) || [],
    [tenantId]
  ) || [];

  const expenses = useLiveQuery(
    async () => (await db.table('fleetExpenses').where('tenant_id').equals(tenantId).toArray()) || [],
    [tenantId]
  ) || [];

  // Form States
  const [vehicleForm, setVehicleForm] = useState({
    fleet_number: '',
    registration_number: '',
    vin: '',
    vehicle_type: 'TRUCK' as VehicleType,
    make: 'Isuzu',
    model: 'NPR 75',
    year: 2024,
    fuel_type: 'DIESEL' as FuelType,
    current_odometer: 12500,
    acquisition_cost: 45000
  });

  const [driverForm, setDriverForm] = useState({
    employee_number: 'EMP-001',
    full_name: '',
    phone: '',
    license_number: '',
    license_category: 'C',
    license_expiry: Date.now() + 365 * 24 * 3600 * 1000,
    employment_status: 'FULL_TIME' as const
  });

  const [tripForm, setTripForm] = useState({
    vehicle_id: '',
    driver_id: '',
    origin: 'Dar es Salaam',
    destination: 'Morogoro',
    route: 'A104 Highway',
    trip_type: 'CARGO' as const,
    trip_revenue: 1500
  });

  const [fuelForm, setFuelForm] = useState({
    vehicle_id: '',
    driver_id: '',
    station_name: 'Shell Mwenge',
    quantity: 85,
    unit_price: 1.45,
    odometer: 12600,
    payment_method: 'FUEL_CARD' as const
  });

  const [workOrderForm, setWorkOrderForm] = useState({
    vehicle_id: '',
    issue_description: 'Standard 10,000km Preventive Maintenance Service & Oil Change',
    priority: 'MEDIUM' as WorkOrderPriority,
    labor_cost: 150,
    parts_cost: 220,
    odometer_at_service: 12600
  });

  // Telematics Position State
  const [telematicsPos, setTelematicsPos] = useState<ITelematicsPosition | null>(null);
  const [aiInsights, setAiInsights] = useState<IFleetAiInsight[]>([]);

  useEffect(() => {
    const gpsAdapter = new DefaultKwakoPosGpsAdapter();
    gpsAdapter.fetchLatestPosition('vh-active').then(setTelematicsPos);
    FleetAiService.generateFleetInsights(tenantId).then(setAiInsights);
  }, [tenantId, vehicles.length, trips.length, fuelEntries.length]);

  // Derived Analytics Metrics
  const totalVehicles = vehicles.length;
  const activeVehicles = vehicles.filter(v => v.status === 'ACTIVE' || v.status === 'ASSIGNED').length;
  const availableVehicles = vehicles.filter(v => v.status === 'AVAILABLE').length;
  const onTripVehicles = vehicles.filter(v => v.status === 'ON_TRIP').length;
  const inServiceVehicles = vehicles.filter(v => v.status === 'IN_SERVICE' || v.status === 'UNDER_REPAIR').length;
  const groundedVehicles = vehicles.filter(v => v.status === 'GROUNDED').length;

  const totalFuelCost = fuelEntries.reduce((sum, f) => sum + (f.total_cost || 0), 0);
  const totalMaintenanceCost = maintenanceOrders.reduce((sum, m) => sum + (m.total_cost || 0), 0);
  const totalOperatingCost = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalRevenue = trips.reduce((sum, t) => sum + (t.trip_revenue || 0), 0);
  const fleetProfit = totalRevenue - totalOperatingCost;

  const availabilityPercent = totalVehicles > 0 ? Math.round(((totalVehicles - groundedVehicles - inServiceVehicles) / totalVehicles) * 100) : 100;
  const healthScore = Math.min(100, Math.max(50, Math.round(availabilityPercent * 0.9 + (100 - groundedVehicles * 15))));

  // Handlers
  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await FleetCoreService.registerVehicle({
        tenant_id: tenantId,
        branch_id: branchId,
        fleet_number: vehicleForm.fleet_number || `FLT-${Math.floor(100 + Math.random() * 900)}`,
        registration_number: vehicleForm.registration_number,
        vin: vehicleForm.vin || `VIN${Date.now()}`,
        vehicle_type: vehicleForm.vehicle_type,
        make: vehicleForm.make,
        model: vehicleForm.model,
        year: Number(vehicleForm.year),
        fuel_type: vehicleForm.fuel_type,
        current_odometer: Number(vehicleForm.current_odometer),
        acquisition_cost: Number(vehicleForm.acquisition_cost),
        status: 'AVAILABLE'
      });
      setShowAddVehicleModal(false);
      alert('Vehicle successfully registered into fleet database!');
    } catch (err: any) {
      alert(err.message || 'Failed registering vehicle');
    }
  };

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await FleetCoreService.registerDriver({
        tenant_id: tenantId,
        branch_id: branchId,
        employee_number: driverForm.employee_number,
        full_name: driverForm.full_name,
        phone: driverForm.phone,
        license_number: driverForm.license_number,
        license_category: driverForm.license_category,
        license_expiry: driverForm.license_expiry,
        employment_status: driverForm.employment_status,
        status: 'AVAILABLE'
      });
      setShowAddDriverModal(false);
      alert('Driver successfully registered!');
    } catch (err: any) {
      alert(err.message || 'Failed registering driver');
    }
  };

  const handleDispatchTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedV = vehicles.find(v => v.id === tripForm.vehicle_id) || vehicles[0];
      const selectedD = drivers.find(d => d.id === tripForm.driver_id) || drivers[0];

      if (!selectedV || !selectedD) {
        alert('Please select both a vehicle and a driver.');
        return;
      }

      await FleetOperationsService.createAndDispatchTrip({
        tenant_id: tenantId,
        branch_id: branchId,
        vehicle_id: selectedV.id,
        driver_id: selectedD.id,
        origin: tripForm.origin,
        destination: tripForm.destination,
        route: tripForm.route,
        trip_type: tripForm.trip_type,
        departure_time: Date.now(),
        starting_odometer: selectedV.current_odometer,
        trip_revenue: Number(tripForm.trip_revenue)
      });
      setShowDispatchModal(false);
      alert('Trip successfully dispatched!');
    } catch (err: any) {
      alert(err.message || 'Failed dispatching trip');
    }
  };

  const handleLogFuel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedV = vehicles.find(v => v.id === fuelForm.vehicle_id) || vehicles[0];
      const selectedD = drivers.find(d => d.id === fuelForm.driver_id) || drivers[0];

      if (!selectedV) {
        alert('Please register or select a vehicle first.');
        return;
      }

      await FleetFuelService.logFuelTransaction({
        tenant_id: tenantId,
        branch_id: branchId,
        vehicle_id: selectedV.id,
        driver_id: selectedD?.id || 'drv-unassigned',
        station_name: fuelForm.station_name,
        fuel_type: selectedV.fuel_type,
        quantity: Number(fuelForm.quantity),
        unit_price: Number(fuelForm.unit_price),
        odometer: Number(fuelForm.odometer),
        date: Date.now(),
        payment_method: fuelForm.payment_method
      });
      setShowFuelModal(false);
      alert('Fuel transaction recorded!');
    } catch (err: any) {
      alert(err.message || 'Failed recording fuel log');
    }
  };

  const handleCreateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const selectedV = vehicles.find(v => v.id === workOrderForm.vehicle_id) || vehicles[0];
      if (!selectedV) {
        alert('Please register or select a vehicle first.');
        return;
      }

      const totalCost = Number(workOrderForm.labor_cost) + Number(workOrderForm.parts_cost);

      await FleetMaintenanceService.createWorkOrder({
        tenant_id: tenantId,
        branch_id: branchId,
        vehicle_id: selectedV.id,
        issue_description: workOrderForm.issue_description,
        priority: workOrderForm.priority,
        labor_cost: Number(workOrderForm.labor_cost),
        parts_cost: Number(workOrderForm.parts_cost),
        other_cost: 0,
        total_cost: totalCost,
        odometer_at_service: Number(workOrderForm.odometer_at_service),
        parts_consumed: []
      });
      setShowMaintenanceModal(false);
      alert('Maintenance Work Order created!');
    } catch (err: any) {
      alert(err.message || 'Failed creating work order');
    }
  };

  const handleCreateInspection = async () => {
    const selectedV = vehicles[0];
    const selectedD = drivers[0];
    if (!selectedV || !selectedD) {
      alert('Please register at least 1 vehicle and driver to perform inspection.');
      return;
    }

    try {
      await FleetInspectionService.submitInspection({
        tenant_id: tenantId,
        branch_id: branchId,
        vehicle_id: selectedV.id,
        driver_id: selectedD.id,
        template_name: 'Pre-Trip Safety Inspection',
        inspection_date: Date.now(),
        items: [
          { key: 'brakes', name: 'Service Brakes', category: 'BRAKES', result: 'PASS', is_safety_critical: true },
          { key: 'tyres', name: 'Tyre Pressure & Tread', category: 'TYRES', result: 'PASS', is_safety_critical: true },
          { key: 'lights', name: 'Headlights & Indicators', category: 'LIGHTS', result: 'PASS', is_safety_critical: false }
        ]
      });
      alert('Safety Inspection submitted!');
    } catch (err: any) {
      alert(err.message || 'Failed submitting inspection');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1600px] mx-auto min-h-screen text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gradient-to-br from-indigo-600 to-blue-600 rounded-xl text-white shadow-lg shadow-indigo-500/20">
            <Truck className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Vehicle & Fleet Operating System</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                v2.0 Enterprise
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              360° Vehicle Lifecycle • Drivers • Dispatch • Fuel Ledger • Maintenance • Telematics • Profitability Matrix
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-1 border border-slate-200 dark:border-slate-700">
            {(['USD', 'TZS', 'KES', 'EUR', 'GBP'] as const).map(curr => (
              <button
                key={curr}
                onClick={() => setSelectedCurrency(curr)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  selectedCurrency === curr
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>

          <button onClick={() => setShowAddVehicleModal(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs">
            <Plus className="h-4 w-4" /> Add Vehicle
          </button>
          <button onClick={() => setShowAddDriverModal(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs">
            <Plus className="h-4 w-4" /> Register Driver
          </button>
          <button onClick={() => setShowDispatchModal(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs">
            <Navigation className="h-4 w-4" /> Dispatch Trip
          </button>
        </div>
      </div>

      {/* 14-Tab Navigation Bar */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2 scrollbar-none border-b border-slate-200 dark:border-slate-800">
        {[
          { id: 'analytics', label: 'Dashboard & KPIs', icon: BarChart3 },
          { id: 'vehicles', label: 'Vehicle Register', icon: Car },
          { id: 'drivers', label: 'Driver Roster', icon: UserCheck },
          { id: 'dispatch', label: 'Dispatch Board', icon: Navigation },
          { id: 'trips', label: 'Trips & Mileage', icon: Activity },
          { id: 'fuel', label: 'Fuel Ledger', icon: Fuel },
          { id: 'maintenance', label: 'Maintenance & Parts', icon: Wrench },
          { id: 'inspections', label: 'Safety Inspections', icon: CheckCircle2 },
          { id: 'documents', label: 'Compliance Docs', icon: FileText },
          { id: 'expenses', label: 'Expense Ledger', icon: DollarSign },
          { id: 'accidents', label: 'Accident Reports', icon: AlertTriangle },
          { id: 'gps', label: 'Live Telematics & Map', icon: MapPin },
          { id: 'reports', label: 'Profitability Matrix', icon: Calculator },
          { id: 'ai', label: 'AI Insights', icon: Cpu },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: ANALYTICS & KPIS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Total Registered Fleet</span>
                <Car className="h-4 w-4 text-blue-500" />
              </div>
              <div className="text-2xl font-bold mt-2">{totalVehicles}</div>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <span className="text-emerald-500 font-semibold">{activeVehicles} Active</span> • 
                <span className="text-blue-500 font-semibold">{availableVehicles} Available</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Active Dispatches / On Trip</span>
                <Navigation className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-bold mt-2">{onTripVehicles}</div>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <span className="text-amber-500 font-semibold">{inServiceVehicles} In Workshop</span> • 
                <span className="text-red-500 font-semibold">{groundedVehicles} Grounded</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Total Fleet Expenses</span>
                <DollarSign className="h-4 w-4 text-amber-500" />
              </div>
              <div className="text-2xl font-bold mt-2">{selectedCurrency} {totalOperatingCost.toLocaleString()}</div>
              <div className="text-xs text-slate-500 mt-1">
                Fuel: ${totalFuelCost} | Maint: ${totalMaintenanceCost}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
                <span>Fleet Net Profit</span>
                <Award className="h-4 w-4 text-indigo-500" />
              </div>
              <div className={`text-2xl font-bold mt-2 ${fleetProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600'}`}>
                {selectedCurrency} {fleetProfit.toLocaleString()}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Health Score: <span className="font-bold text-blue-600">{healthScore}%</span>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <h2 className="text-sm font-bold tracking-tight mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-500" /> Fleet Health & Compliance Scorecard
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-xs text-slate-500">Fleet Availability</div>
                <div className="text-xl font-bold text-blue-600 mt-1">{availabilityPercent}%</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-xs text-slate-500">Maintenance Compliance</div>
                <div className="text-xl font-bold text-emerald-600 mt-1">94%</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-xs text-slate-500">Fuel Efficiency Rating</div>
                <div className="text-xl font-bold text-amber-600 mt-1">88%</div>
              </div>
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-xs text-slate-500">Document Compliance</div>
                <div className="text-xl font-bold text-indigo-600 mt-1">98%</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: VEHICLE REGISTER */}
      {activeTab === 'vehicles' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <h2 className="text-sm font-bold">Vehicle Master Register</h2>
            <div className="relative max-w-md w-full">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Registration, VIN, Make, Model..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase font-semibold border-b border-slate-200 dark:border-slate-700">
                <tr>
                  <th className="p-3.5">Fleet / Reg No</th>
                  <th className="p-3.5">Type & Model</th>
                  <th className="p-3.5">VIN / Chassis</th>
                  <th className="p-3.5">Odometer</th>
                  <th className="p-3.5">Fuel Type</th>
                  <th className="p-3.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No vehicles registered yet. Click "Add Vehicle" to create your first vehicle profile.
                    </td>
                  </tr>
                ) : (
                  vehicles
                    .filter(v => v.registration_number.toLowerCase().includes(searchTerm.toLowerCase()) || v.make.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(v => (
                      <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="p-3.5 font-bold">
                          <div>{v.registration_number}</div>
                          <div className="text-[10px] text-slate-400 font-normal">{v.fleet_number}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold">{v.make} {v.model} ({v.year})</div>
                          <div className="text-[10px] text-slate-400">{v.vehicle_type}</div>
                        </td>
                        <td className="p-3.5 font-mono text-slate-500">{v.vin}</td>
                        <td className="p-3.5 font-semibold tabular-nums">{v.current_odometer.toLocaleString()} km</td>
                        <td className="p-3.5 font-medium">{v.fuel_type}</td>
                        <td className="p-3.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            v.status === 'AVAILABLE' ? 'bg-emerald-500/10 text-emerald-600' :
                            v.status === 'ON_TRIP' ? 'bg-blue-500/10 text-blue-600' :
                            v.status === 'UNDER_REPAIR' ? 'bg-amber-500/10 text-amber-600' :
                            v.status === 'GROUNDED' ? 'bg-red-500/10 text-red-600' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {v.status}
                          </span>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: DRIVERS */}
      {activeTab === 'drivers' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">Fleet Driver Roster & Licensing</h2>
            <button onClick={() => setShowAddDriverModal(true)} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg">
              + Register Driver
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {drivers.length === 0 ? (
              <div className="col-span-3 p-8 text-center text-slate-400 border border-dashed rounded-xl">
                No drivers registered. Click "+ Register Driver" above.
              </div>
            ) : (
              drivers.map(d => (
                <div key={d.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="font-bold text-sm">{d.full_name}</div>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-600 rounded-full">{d.status}</span>
                  </div>
                  <div className="text-xs text-slate-500">License: <span className="font-semibold text-slate-800 dark:text-slate-200">{d.license_number} ({d.license_category})</span></div>
                  <div className="text-xs text-slate-500">Phone: {d.phone || 'N/A'}</div>
                  <div className="text-[11px] text-slate-400">Expires: {new Date(d.license_expiry).toLocaleDateString()}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 4: DISPATCH BOARD */}
      {activeTab === 'dispatch' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold">Today's Fleet Dispatch Board</h2>
              <p className="text-xs text-slate-500">Real-time vehicle-driver trip assignment matrix with double-booking prevention.</p>
            </div>
            <button onClick={() => setShowDispatchModal(true)} className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 text-white rounded-xl">
              + Dispatch Trip
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="p-3">Trip #</th>
                  <th className="p-3">Route / Purpose</th>
                  <th className="p-3">Departure Time</th>
                  <th className="p-3">Revenue</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {trips.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      No active dispatches scheduled today.
                    </td>
                  </tr>
                ) : (
                  trips.map(t => (
                    <tr key={t.id}>
                      <td className="p-3 font-bold">{t.trip_number}</td>
                      <td className="p-3">{t.origin} ➔ {t.destination} ({t.trip_type})</td>
                      <td className="p-3">{new Date(t.departure_time).toLocaleTimeString()}</td>
                      <td className="p-3 font-semibold text-emerald-600">${t.trip_revenue}</td>
                      <td className="p-3 font-bold text-blue-600">{t.status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: FUEL LEDGER */}
      {activeTab === 'fuel' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold">Fuel Ledger & Anomaly Detection</h2>
              <p className="text-xs text-slate-500">Monitors fuel fill-ups, Km/L efficiency, and automated consumption anomaly flags.</p>
            </div>
            <button onClick={() => setShowFuelModal(true)} className="px-3.5 py-2 text-xs font-semibold bg-amber-600 text-white rounded-xl">
              + Log Fuel Transaction
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase font-semibold">
                <tr>
                  <th className="p-3">Station</th>
                  <th className="p-3">Quantity</th>
                  <th className="p-3">Total Cost</th>
                  <th className="p-3">Km / Liter</th>
                  <th className="p-3">Anomaly Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {fuelEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400">
                      No fuel transactions recorded yet.
                    </td>
                  </tr>
                ) : (
                  fuelEntries.map(f => (
                    <tr key={f.id}>
                      <td className="p-3 font-bold">{f.station_name}</td>
                      <td className="p-3">{f.quantity} L @ ${f.unit_price}/L</td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">${f.total_cost}</td>
                      <td className="p-3 font-semibold text-blue-600">{f.km_per_liter || 'N/A'} Km/L</td>
                      <td className="p-3">
                        {f.anomaly_detected ? (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-red-500/10 text-red-600 rounded-full flex items-center gap-1 w-fit">
                            <AlertTriangle className="h-3 w-3" /> Anomaly Flagged
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/10 text-emerald-600 rounded-full">Normal</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 7: MAINTENANCE & PARTS */}
      {activeTab === 'maintenance' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold">Preventive Maintenance & Stock Ledger Integration</h2>
              <p className="text-xs text-slate-500">Work order management linked directly to KwakoPos Inventory Stock Ledger.</p>
            </div>
            <button onClick={() => setShowMaintenanceModal(true)} className="px-3.5 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-xl">
              + New Work Order
            </button>
          </div>

          <div className="space-y-3">
            {maintenanceOrders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 border border-dashed rounded-xl">
                No active work orders found.
              </div>
            ) : (
              maintenanceOrders.map(wo => (
                <div key={wo.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-xs">{wo.work_order_number}: {wo.issue_description}</div>
                    <div className="text-[11px] text-slate-500 mt-1">Priority: {wo.priority} | Cost: ${wo.total_cost}</div>
                  </div>
                  <span className="px-2.5 py-1 text-xs font-bold bg-amber-500/10 text-amber-600 rounded-lg">{wo.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 8: SAFETY INSPECTIONS */}
      {activeTab === 'inspections' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold">Safety & Pre-Trip Inspections</h2>
              <p className="text-xs text-slate-500">Automated vehicle grounding upon critical safety failure.</p>
            </div>
            <button onClick={handleCreateInspection} className="px-3.5 py-2 text-xs font-semibold bg-blue-600 text-white rounded-xl">
              + Conduct Safety Inspection
            </button>
          </div>

          <div className="space-y-3">
            {inspections.length === 0 ? (
              <div className="p-8 text-center text-slate-400 border border-dashed rounded-xl">
                No safety inspection logs recorded yet.
              </div>
            ) : (
              inspections.map(insp => (
                <div key={insp.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-xs">{insp.template_name} ({new Date(insp.inspection_date).toLocaleDateString()})</div>
                    <div className="text-[11px] text-slate-500 mt-1">{insp.items.length} checklist items evaluated</div>
                  </div>
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-lg ${insp.overall_status === 'PASS' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600'}`}>
                    {insp.overall_status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 12: GPS TELEMATICS */}
      {activeTab === 'gps' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
            <div>
              <h2 className="text-sm font-bold">Live Telematics & Geofencing</h2>
              <p className="text-xs text-slate-500">Real-time GPS adapter feed, speed monitoring, and geofence security alerts.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-emerald-600 font-semibold bg-emerald-500/10 px-3 py-1 rounded-full">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Telematics Live
            </div>
          </div>

          <div className="p-6 bg-slate-900 text-white rounded-xl space-y-4 border border-slate-800">
            <div className="flex items-center justify-between">
              <div className="font-mono text-xs text-blue-400">GPS ADAPTER FEED: Dar es Salaam Zone</div>
              <div className="text-xs text-slate-400">Last Latency: 12ms</div>
            </div>
            {telematicsPos && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                <div className="bg-slate-800/80 p-3 rounded-lg">Latitude: {telematicsPos.latitude.toFixed(4)}</div>
                <div className="bg-slate-800/80 p-3 rounded-lg">Longitude: {telematicsPos.longitude.toFixed(4)}</div>
                <div className="bg-slate-800/80 p-3 rounded-lg text-emerald-400">Speed: {telematicsPos.speed_kmh} km/h</div>
                <div className="bg-slate-800/80 p-3 rounded-lg text-amber-400">Fuel Level: {telematicsPos.fuel_level_percent}%</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 14: AI INSIGHTS */}
      {activeTab === 'ai' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Cpu className="h-5 w-5 text-indigo-500" /> AI Fleet Intelligence Feed
          </div>
          <div className="space-y-3">
            {aiInsights.map(insight => (
              <div key={insight.id} className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 space-y-1">
                <div className="font-bold text-xs text-indigo-600 dark:text-indigo-400">{insight.title}</div>
                <p className="text-xs text-slate-600 dark:text-slate-300">{insight.description}</p>
                <div className="text-[11px] font-semibold text-slate-500 mt-2">Action: {insight.actionable_step}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: ADD VEHICLE */}
      {showAddVehicleModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-bold">Register New Fleet Vehicle</h3>
            <form onSubmit={handleCreateVehicle} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Registration Number</label>
                <input required type="text" value={vehicleForm.registration_number} onChange={e => setVehicleForm({...vehicleForm, registration_number: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" placeholder="T-123 ABC" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">Make</label>
                  <input type="text" value={vehicleForm.make} onChange={e => setVehicleForm({...vehicleForm, make: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Model</label>
                  <input type="text" value={vehicleForm.model} onChange={e => setVehicleForm({...vehicleForm, model: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">Current Odometer (km)</label>
                  <input type="number" value={vehicleForm.current_odometer} onChange={e => setVehicleForm({...vehicleForm, current_odometer: Number(e.target.value)})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Acquisition Cost ($)</label>
                  <input type="number" value={vehicleForm.acquisition_cost} onChange={e => setVehicleForm({...vehicleForm, acquisition_cost: Number(e.target.value)})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddVehicleModal(false)} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold">Save Vehicle</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD DRIVER */}
      {showAddDriverModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-bold">Register Fleet Driver</h3>
            <form onSubmit={handleCreateDriver} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Full Name</label>
                <input required type="text" value={driverForm.full_name} onChange={e => setDriverForm({...driverForm, full_name: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" placeholder="John Doe" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">License Number</label>
                  <input required type="text" value={driverForm.license_number} onChange={e => setDriverForm({...driverForm, license_number: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" placeholder="DL-987654" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Phone</label>
                  <input type="text" value={driverForm.phone} onChange={e => setDriverForm({...driverForm, phone: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" placeholder="+255..." />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddDriverModal(false)} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold">Save Driver</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DISPATCH TRIP */}
      {showDispatchModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-bold">Dispatch New Fleet Trip</h3>
            <form onSubmit={handleDispatchTrip} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Select Vehicle</label>
                <select value={tripForm.vehicle_id} onChange={e => setTripForm({...tripForm, vehicle_id: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg">
                  <option value="">Select Available Vehicle</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.registration_number} ({v.make} {v.model})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Select Driver</label>
                <select value={tripForm.driver_id} onChange={e => setTripForm({...tripForm, driver_id: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg">
                  <option value="">Select Driver</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name} ({d.license_number})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">Origin</label>
                  <input type="text" value={tripForm.origin} onChange={e => setTripForm({...tripForm, origin: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Destination</label>
                  <input type="text" value={tripForm.destination} onChange={e => setTripForm({...tripForm, destination: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" />
                </div>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">Trip Revenue ($)</label>
                <input type="number" value={tripForm.trip_revenue} onChange={e => setTripForm({...tripForm, trip_revenue: Number(e.target.value)})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowDispatchModal(false)} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold">Dispatch Trip</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: FUEL LOG */}
      {showFuelModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-bold">Log Fuel Transaction</h3>
            <form onSubmit={handleLogFuel} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Station Name</label>
                <input type="text" value={fuelForm.station_name} onChange={e => setFuelForm({...fuelForm, station_name: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">Quantity (Liters)</label>
                  <input type="number" value={fuelForm.quantity} onChange={e => setFuelForm({...fuelForm, quantity: Number(e.target.value)})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Unit Price ($/L)</label>
                  <input type="number" step="0.01" value={fuelForm.unit_price} onChange={e => setFuelForm({...fuelForm, unit_price: Number(e.target.value)})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowFuelModal(false)} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-amber-600 text-white font-semibold">Save Fuel Log</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MAINTENANCE WORK ORDER */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-bold">Create Maintenance Work Order</h3>
            <form onSubmit={handleCreateWorkOrder} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">Issue Description</label>
                <input required type="text" value={workOrderForm.issue_description} onChange={e => setWorkOrderForm({...workOrderForm, issue_description: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-500 mb-1">Labor Cost ($)</label>
                  <input type="number" value={workOrderForm.labor_cost} onChange={e => setWorkOrderForm({...workOrderForm, labor_cost: Number(e.target.value)})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-slate-500 mb-1">Parts Cost ($)</label>
                  <input type="number" value={workOrderForm.parts_cost} onChange={e => setWorkOrderForm({...workOrderForm, parts_cost: Number(e.target.value)})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border rounded-lg" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowMaintenanceModal(false)} className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold">Create Work Order</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
