import React, { useState } from 'react';
import { 
  Truck, Fuel, Wrench, DollarSign, BarChart3, Plus, 
  Search, ShieldAlert, Car, Filter, Calculator
} from 'lucide-react';
import { db } from '../../db/dexie';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  fleetService, VehicleType, VehicleStatus, FuelType, ExpenseCategory 
} from '../../services/fleetService';
import type { IVehicle, IFuelLog, IExpenseLog, IMaintenanceLog } from '../../services/fleetService';
import { useAuth } from '../../context/AuthContext';

export const FleetManagement: React.FC = () => {
  const { currentTenant } = useAuth();
  const tenantId = currentTenant?.id || 'demo-tenant';

  const [activeTab, setActiveTab] = useState<'analytics' | 'vehicles' | 'fuel' | 'maintenance' | 'expenses'>('analytics');
  const [currency, setCurrency] = useState<'USD' | 'TZS' | 'KES' | 'EUR' | 'GBP'>('USD');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals state
  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [isFuelModalOpen, setIsFuelModalOpen] = useState(false);
  const [isMaintModalOpen, setIsMaintModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  // Form states
  const [vehicleForm, setVehicleForm] = useState({
    name: '',
    type: VehicleType.COMMERCIAL,
    vin: '',
    licensePlate: '',
    status: VehicleStatus.AVAILABLE,
    fuelType: FuelType.DIESEL,
    odometer: 0
  });

  const [fuelForm, setFuelForm] = useState({
    vehicleId: '',
    odometer: 0,
    gallonsOrLiters: 0,
    costPerUnit: 0,
    isPartialFill: false
  });

  const [maintForm, setMaintForm] = useState({
    vehicleId: '',
    title: '',
    description: '',
    cost: 0,
    odometerAtService: 0,
    status: 'SCHEDULED' as 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED'
  });

  const [expenseForm, setExpenseForm] = useState({
    vehicleId: '',
    category: ExpenseCategory.INSURANCE,
    amount: 0,
    description: ''
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Live queries from Dexie IndexedDB
  const vehicles = useLiveQuery<IVehicle[]>(
    () => db.table('vehicles').where('tenant_id').equals(tenantId).toArray(),
    [tenantId]
  ) || [];

  const fuelLogs = useLiveQuery<IFuelLog[]>(
    () => db.table('fuelLogs').where('tenant_id').equals(tenantId).reverse().toArray(),
    [tenantId]
  ) || [];

  const maintLogs = useLiveQuery<IMaintenanceLog[]>(
    () => db.table('maintenanceLogs').where('tenant_id').equals(tenantId).reverse().toArray(),
    [tenantId]
  ) || [];

  const expenseLogs = useLiveQuery<IExpenseLog[]>(
    () => db.table('expenseLogs').where('tenant_id').equals(tenantId).reverse().toArray(),
    [tenantId]
  ) || [];

  // TCO analytics calculations
  const totalFleetCost = expenseLogs.reduce((sum, e) => sum + (e.amount || 0), 0);
  const totalFuelCost = expenseLogs.filter(e => e.category === ExpenseCategory.FUEL).reduce((sum, e) => sum + e.amount, 0);
  const totalMaintCost = expenseLogs.filter(e => e.category === ExpenseCategory.MAINTENANCE).reduce((sum, e) => sum + e.amount, 0);
  const totalOdometer = vehicles.reduce((sum, v) => sum + (v.odometer || 0), 0);
  const avgCostPerVehicle = vehicles.length > 0 ? totalFleetCost / vehicles.length : 0;
  const costPerKm = totalOdometer > 0 ? totalFleetCost / totalOdometer : 0;

  // Filtered vehicles
  const filteredVehicles = vehicles.filter(v => {
    const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          v.licensePlate.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (v.vin && v.vin.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === 'ALL' || v.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Handle vehicle submission
  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg(null);
      await fleetService.registerVehicle({
        ...vehicleForm,
        tenant_id: tenantId,
        ownerId: tenantId
      });
      setIsVehicleModalOpen(false);
      setVehicleForm({
        name: '',
        type: VehicleType.COMMERCIAL,
        vin: '',
        licensePlate: '',
        status: VehicleStatus.AVAILABLE,
        fuelType: FuelType.DIESEL,
        odometer: 0
      });
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle fuel fill submission
  const handleLogFuel = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg(null);
      await fleetService.logFuelFill({
        ...fuelForm,
        tenant_id: tenantId,
        date: Date.now(),
        currency
      });
      setIsFuelModalOpen(false);
      setFuelForm({ vehicleId: '', odometer: 0, gallonsOrLiters: 0, costPerUnit: 0, isPartialFill: false });
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle maintenance submission
  const handleLogMaintenance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg(null);
      await fleetService.logMaintenance({
        ...maintForm,
        tenant_id: tenantId,
        serviceDate: Date.now(),
        currency
      });
      setIsMaintModalOpen(false);
      setMaintForm({ vehicleId: '', title: '', description: '', cost: 0, odometerAtService: 0, status: 'SCHEDULED' });
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Handle expense submission
  const handleLogExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg(null);
      await fleetService.logExpense({
        ...expenseForm,
        tenant_id: tenantId,
        date: Date.now(),
        currency
      });
      setIsExpenseModalOpen(false);
      setExpenseForm({ vehicleId: '', category: ExpenseCategory.INSURANCE, amount: 0, description: '' });
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto animate-in fade-in duration-200">
      
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white dark:bg-darkbg-card p-6 rounded-3xl border border-slate-200 dark:border-darkbg-border shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-500/20">
            <Truck className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest uppercase text-indigo-600 dark:text-indigo-400">Enterprise Asset Module</span>
              <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-500/20">ACID Financial TCO</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">Vehicle & Fleet Management</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Currency Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-darkbg p-1 rounded-xl border border-slate-200 dark:border-darkbg-border">
            {(['USD', 'TZS', 'KES', 'EUR', 'GBP'] as const).map(curr => (
              <button
                key={curr}
                onClick={() => setCurrency(curr)}
                className={`px-2.5 py-1 text-xs font-bold rounded-lg transition ${
                  currency === curr 
                    ? 'bg-indigo-600 text-white shadow-sm' 
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {curr}
              </button>
            ))}
          </div>

          <button
            onClick={() => setIsVehicleModalOpen(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-md shadow-indigo-600/20 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Vehicle</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-darkbg-card p-5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total Fleet Cost (TCO)</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
              {currency} {totalFleetCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">Cross-logged ledger total</span>
          </div>
          <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-darkbg-card p-5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Fleet Size</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
              {vehicles.length} Vehicles
            </div>
            <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold mt-1 block">
              {vehicles.filter(v => v.status === VehicleStatus.AVAILABLE).length} Available | {vehicles.filter(v => v.status === VehicleStatus.MAINTENANCE).length} In Maintenance
            </span>
          </div>
          <div className="p-3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Car className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-darkbg-card p-5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Avg Cost / Vehicle</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">
              {currency} {avgCostPerVehicle.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
              Cost/Km: {currency} {costPerKm.toFixed(3)}
            </span>
          </div>
          <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl">
            <Calculator className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white dark:bg-darkbg-card p-5 rounded-2xl border border-slate-200 dark:border-darkbg-border shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Fuel vs Maintenance</span>
            <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-1">
              Fuel: {currency} {totalFuelCost.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
              Maint: {currency} {totalMaintCost.toLocaleString()}
            </div>
          </div>
          <div className="p-3 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl">
            <Fuel className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-darkbg-border overflow-x-auto pb-2">
        {[
          { id: 'analytics', label: 'TCO & Analytics', icon: BarChart3 },
          { id: 'vehicles', label: 'Vehicle Registry', icon: Truck },
          { id: 'fuel', label: 'Fuel Fill-ups', icon: Fuel },
          { id: 'maintenance', label: 'Service & Maintenance', icon: Wrench },
          { id: 'expenses', label: 'Expense Ledger', icon: DollarSign },
        ].map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'bg-white dark:bg-darkbg-card text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-darkbg border border-slate-200 dark:border-darkbg-border'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Error Notice if any */}
      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-600 dark:text-rose-400 text-xs font-bold">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* TAB 1: TCO & ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-darkbg-card p-6 rounded-3xl border border-slate-200 dark:border-darkbg-border space-y-4">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Total Cost of Ownership (TCO) Breakdown by Category</span>
            </h2>

            <div className="space-y-3">
              {Object.values(ExpenseCategory).map(cat => {
                const catSpent = expenseLogs.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0);
                const pct = totalFleetCost > 0 ? (catSpent / totalFleetCost) * 100 : 0;
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-700 dark:text-slate-300">{cat}</span>
                      <span className="text-slate-900 dark:text-white">
                        {currency} {catSpent.toLocaleString()} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 dark:bg-darkbg rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-600 rounded-full transition-all duration-500" 
                        style={{ width: `${pct}%` }} 
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-darkbg-card p-6 rounded-3xl border border-slate-200 dark:border-darkbg-border space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Vehicle Cost Matrix</h3>
              <div className="divide-y divide-slate-100 dark:divide-darkbg-border">
                {vehicles.map(v => {
                  const vCost = expenseLogs.filter(e => e.vehicleId === v.id).reduce((sum, e) => sum + e.amount, 0);
                  const vCostPerKm = v.odometer > 0 ? vCost / v.odometer : 0;
                  return (
                    <div key={v.id} className="py-3 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block">{v.name}</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{v.licensePlate} • {v.fuelType}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-indigo-600 dark:text-indigo-400 block">{currency} {vCost.toLocaleString()}</span>
                        <span className="text-[10px] text-slate-400">{currency} {vCostPerKm.toFixed(2)}/km</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white dark:bg-darkbg-card p-6 rounded-3xl border border-slate-200 dark:border-darkbg-border space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">Recent Telemetry Fills & Work Orders</h3>
              <div className="space-y-2">
                {fuelLogs.slice(0, 3).map(f => (
                  <div key={f.id} className="p-3 bg-slate-50 dark:bg-darkbg/50 rounded-2xl flex items-center justify-between text-xs border border-slate-100 dark:border-darkbg-border">
                    <div className="flex items-center gap-2">
                      <Fuel className="w-4 h-4 text-emerald-500" />
                      <span>{f.gallonsOrLiters} Units @ {f.odometer} km</span>
                    </div>
                    <span className="font-bold">{currency} {f.totalCost}</span>
                  </div>
                ))}
                {maintLogs.slice(0, 3).map(m => (
                  <div key={m.id} className="p-3 bg-slate-50 dark:bg-darkbg/50 rounded-2xl flex items-center justify-between text-xs border border-slate-100 dark:border-darkbg-border">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-amber-500" />
                      <span>{m.title}</span>
                    </div>
                    <span className="font-bold">{currency} {m.cost}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: VEHICLE REGISTRY */}
      {activeTab === 'vehicles' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, plate, VIN..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-slate-50 dark:bg-darkbg border border-slate-200 dark:border-darkbg-border text-xs rounded-xl px-3 py-2 font-bold"
              >
                <option value="ALL">All Statuses</option>
                {Object.values(VehicleStatus).map(st => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVehicles.map(v => (
              <div key={v.id} className="bg-white dark:bg-darkbg-card p-5 rounded-3xl border border-slate-200 dark:border-darkbg-border shadow-sm space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-mono uppercase font-bold text-indigo-600 dark:text-indigo-400">{v.type}</span>
                    <h3 className="font-extrabold text-sm text-slate-900 dark:text-white mt-0.5">{v.name}</h3>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                    v.status === VehicleStatus.AVAILABLE ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                    v.status === VehicleStatus.MAINTENANCE ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                    'bg-slate-500/10 text-slate-600 border-slate-500/20'
                  }`}>
                    {v.status}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 border-t border-b border-slate-100 dark:border-darkbg-border py-2">
                  <div className="flex justify-between">
                    <span>License Plate:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">{v.licensePlate}</span>
                  </div>
                  {v.vin && (
                    <div className="flex justify-between">
                      <span>VIN:</span>
                      <span className="font-mono text-[11px]">{v.vin}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Fuel Type:</span>
                    <span className="font-bold">{v.fuelType}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Odometer:</span>
                    <span className="font-bold text-indigo-600 dark:text-indigo-400">{v.odometer.toLocaleString()} km</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setFuelForm(prev => ({ ...prev, vehicleId: v.id, odometer: v.odometer }));
                      setIsFuelModalOpen(true);
                    }}
                    className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Fuel className="w-3.5 h-3.5" />
                    <span>Fill Fuel</span>
                  </button>

                  <button
                    onClick={() => {
                      setMaintForm(prev => ({ ...prev, vehicleId: v.id, odometerAtService: v.odometer }));
                      setIsMaintModalOpen(true);
                    }}
                    className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Wrench className="w-3.5 h-3.5" />
                    <span>Service</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: FUEL LOGS */}
      {activeTab === 'fuel' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Fuel Fill-up Telemetry Logs</h2>
            <button
              onClick={() => setIsFuelModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Fuel className="w-4 h-4" />
              <span>Log Fuel Fill</span>
            </button>
          </div>

          <div className="bg-white dark:bg-darkbg-card rounded-3xl border border-slate-200 dark:border-darkbg-border overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-darkbg/50 border-b border-slate-200 dark:border-darkbg-border font-extrabold text-slate-500">
                <tr>
                  <th className="p-4">Vehicle</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Odometer</th>
                  <th className="p-4">Volume</th>
                  <th className="p-4">Cost / Unit</th>
                  <th className="p-4">Total Cost</th>
                  <th className="p-4">Partial Fill</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
                {fuelLogs.map(f => {
                  const v = vehicles.find(item => item.id === f.vehicleId);
                  return (
                    <tr key={f.id} className="hover:bg-slate-50/50 dark:hover:bg-darkbg/30">
                      <td className="p-4 font-bold">{v?.name || f.vehicleId} ({v?.licensePlate})</td>
                      <td className="p-4 text-slate-500">{new Date(f.date).toLocaleDateString()}</td>
                      <td className="p-4 font-mono">{f.odometer.toLocaleString()} km</td>
                      <td className="p-4 font-bold">{f.gallonsOrLiters} L/Gal</td>
                      <td className="p-4">{currency} {f.costPerUnit}</td>
                      <td className="p-4 font-black text-indigo-600 dark:text-indigo-400">{currency} {f.totalCost}</td>
                      <td className="p-4">
                        {f.isPartialFill ? (
                          <span className="text-[10px] bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full font-bold">Partial</span>
                        ) : (
                          <span className="text-[10px] bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full font-bold">Full</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: MAINTENANCE */}
      {activeTab === 'maintenance' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Maintenance Work Orders</h2>
            <button
              onClick={() => setIsMaintModalOpen(true)}
              className="bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Wrench className="w-4 h-4" />
              <span>Schedule Service</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {maintLogs.map(m => {
              const v = vehicles.find(item => item.id === m.vehicleId);
              return (
                <div key={m.id} className="bg-white dark:bg-darkbg-card p-5 rounded-3xl border border-slate-200 dark:border-darkbg-border space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase">{v?.name} ({v?.licensePlate})</span>
                      <h3 className="font-extrabold text-sm text-slate-900 dark:text-white mt-0.5">{m.title}</h3>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      m.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600' :
                      m.status === 'IN_PROGRESS' ? 'bg-amber-500/10 text-amber-600' :
                      'bg-indigo-500/10 text-indigo-600'
                    }`}>
                      {m.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400">{m.description}</p>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-darkbg-border text-xs">
                    <span>Odometer: <strong className="font-mono">{m.odometerAtService} km</strong></span>
                    <span className="font-black text-indigo-600 dark:text-indigo-400">{currency} {m.cost}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: EXPENSE LEDGER */}
      {activeTab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-darkbg-card p-4 rounded-2xl border border-slate-200 dark:border-darkbg-border">
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Unified Financial Expense Ledger</h2>
            <button
              onClick={() => setIsExpenseModalOpen(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <DollarSign className="w-4 h-4" />
              <span>Log Fleet Expense</span>
            </button>
          </div>

          <div className="bg-white dark:bg-darkbg-card rounded-3xl border border-slate-200 dark:border-darkbg-border overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-darkbg/50 border-b border-slate-200 dark:border-darkbg-border font-extrabold text-slate-500">
                <tr>
                  <th className="p-4">Category</th>
                  <th className="p-4">Vehicle</th>
                  <th className="p-4">Description</th>
                  <th className="p-4">Date</th>
                  <th className="p-4">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-darkbg-border">
                {expenseLogs.map(e => {
                  const v = vehicles.find(item => item.id === e.vehicleId);
                  return (
                    <tr key={e.id} className="hover:bg-slate-50/50 dark:hover:bg-darkbg/30">
                      <td className="p-4">
                        <span className="font-extrabold text-[10px] uppercase bg-indigo-500/10 text-indigo-600 px-2 py-0.5 rounded-full">
                          {e.category}
                        </span>
                      </td>
                      <td className="p-4 font-bold">{v?.name || e.vehicleId}</td>
                      <td className="p-4 text-slate-600 dark:text-slate-400">{e.description}</td>
                      <td className="p-4 text-slate-500">{new Date(e.date).toLocaleDateString()}</td>
                      <td className="p-4 font-black text-indigo-600 dark:text-indigo-400">{e.currency || currency} {e.amount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE VEHICLE MODAL */}
      {isVehicleModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border p-6 rounded-3xl max-w-md w-full space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Register New Fleet Asset</h3>
            <form onSubmit={handleCreateVehicle} className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Vehicle Name / Label</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Delivery Truck 01"
                  value={vehicleForm.name}
                  onChange={e => setVehicleForm({ ...vehicleForm, name: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">Vehicle Type</label>
                  <select
                    value={vehicleForm.type}
                    onChange={e => setVehicleForm({ ...vehicleForm, type: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border"
                  >
                    <option value={VehicleType.COMMERCIAL}>COMMERCIAL</option>
                    <option value={VehicleType.PERSONAL}>PERSONAL</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold block mb-1">License Plate</label>
                  <input
                    type="text"
                    required
                    placeholder="T 123 ABC"
                    value={vehicleForm.licensePlate}
                    onChange={e => setVehicleForm({ ...vehicleForm, licensePlate: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">Fuel Type</label>
                  <select
                    value={vehicleForm.fuelType}
                    onChange={e => setVehicleForm({ ...vehicleForm, fuelType: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border"
                  >
                    <option value={FuelType.DIESEL}>DIESEL</option>
                    <option value={FuelType.GASOLINE}>GASOLINE</option>
                    <option value={FuelType.ELECTRIC}>ELECTRIC</option>
                    <option value={FuelType.HYBRID}>HYBRID</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold block mb-1">Initial Odometer (km)</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={vehicleForm.odometer}
                    onChange={e => setVehicleForm({ ...vehicleForm, odometer: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">VIN (Optional)</label>
                <input
                  type="text"
                  placeholder="1HGCR2F83HA000000"
                  value={vehicleForm.vin}
                  onChange={e => setVehicleForm({ ...vehicleForm, vin: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsVehicleModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-darkbg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Save Vehicle
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOG FUEL MODAL */}
      {isFuelModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border p-6 rounded-3xl max-w-md w-full space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Log Fuel Fill-up</h3>
            <form onSubmit={handleLogFuel} className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Select Vehicle</label>
                <select
                  required
                  value={fuelForm.vehicleId}
                  onChange={e => {
                    const selected = vehicles.find(v => v.id === e.target.value);
                    setFuelForm({ ...fuelForm, vehicleId: e.target.value, odometer: selected?.odometer || 0 });
                  }}
                  className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-bold"
                >
                  <option value="">-- Choose Vehicle --</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.licensePlate})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">Odometer (km)</label>
                  <input
                    type="number"
                    required
                    value={fuelForm.odometer}
                    onChange={e => setFuelForm({ ...fuelForm, odometer: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold block mb-1">Volume (Liters/Gal)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={fuelForm.gallonsOrLiters}
                    onChange={e => setFuelForm({ ...fuelForm, gallonsOrLiters: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">Cost Per Unit ({currency})</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={fuelForm.costPerUnit}
                  onChange={e => setFuelForm({ ...fuelForm, costPerUnit: Number(e.target.value) })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-mono"
                />
              </div>

              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl flex items-center justify-between text-indigo-900 dark:text-indigo-200 font-bold">
                <span>Calculated Total Cost:</span>
                <span className="text-sm font-black">{currency} {(fuelForm.gallonsOrLiters * fuelForm.costPerUnit).toFixed(2)}</span>
              </div>

              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={fuelForm.isPartialFill}
                  onChange={e => setFuelForm({ ...fuelForm, isPartialFill: e.target.checked })}
                  className="rounded text-indigo-600"
                />
                <span>Partial Fill (Not Tank Full)</span>
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFuelModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-darkbg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Save Fuel Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOG MAINTENANCE MODAL */}
      {isMaintModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border p-6 rounded-3xl max-w-md w-full space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Schedule / Complete Maintenance</h3>
            <form onSubmit={handleLogMaintenance} className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Select Vehicle</label>
                <select
                  required
                  value={maintForm.vehicleId}
                  onChange={e => {
                    const selected = vehicles.find(v => v.id === e.target.value);
                    setMaintForm({ ...maintForm, vehicleId: e.target.value, odometerAtService: selected?.odometer || 0 });
                  }}
                  className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-bold"
                >
                  <option value="">-- Choose Vehicle --</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.licensePlate})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold block mb-1">Service Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Oil Change & Brake Inspection"
                  value={maintForm.title}
                  onChange={e => setMaintForm({ ...maintForm, title: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border"
                />
              </div>

              <div>
                <label className="font-bold block mb-1">Work Description</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Replaced front brake pads, 5W-30 synthetic oil..."
                  value={maintForm.description}
                  onChange={e => setMaintForm({ ...maintForm, description: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">Cost ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={maintForm.cost}
                    onChange={e => setMaintForm({ ...maintForm, cost: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold block mb-1">Odometer (km)</label>
                  <input
                    type="number"
                    required
                    value={maintForm.odometerAtService}
                    onChange={e => setMaintForm({ ...maintForm, odometerAtService: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">Status</label>
                <select
                  value={maintForm.status}
                  onChange={e => setMaintForm({ ...maintForm, status: e.target.value as any })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-bold"
                >
                  <option value="SCHEDULED">SCHEDULED</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="COMPLETED">COMPLETED (Auto-logs to Expenses)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMaintModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-darkbg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Save Service Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LOG GENERAL EXPENSE MODAL */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-darkbg-card border border-slate-200 dark:border-darkbg-border p-6 rounded-3xl max-w-md w-full space-y-4">
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">Log Standalone Fleet Expense</h3>
            <form onSubmit={handleLogExpense} className="space-y-3 text-xs">
              <div>
                <label className="font-bold block mb-1">Select Vehicle</label>
                <select
                  required
                  value={expenseForm.vehicleId}
                  onChange={e => setExpenseForm({ ...expenseForm, vehicleId: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-bold"
                >
                  <option value="">-- Choose Vehicle --</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.name} ({v.licensePlate})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold block mb-1">Expense Category</label>
                  <select
                    value={expenseForm.category}
                    onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value as any })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-bold"
                  >
                    <option value={ExpenseCategory.INSURANCE}>INSURANCE</option>
                    <option value={ExpenseCategory.TAX}>TAX</option>
                    <option value={ExpenseCategory.TOLL}>TOLL</option>
                    <option value={ExpenseCategory.FINES}>FINES</option>
                    <option value={ExpenseCategory.OTHER}>OTHER</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold block mb-1">Amount ({currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={expenseForm.amount}
                    onChange={e => setExpenseForm({ ...expenseForm, amount: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold block mb-1">Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Annual Insurance Policy Renewal"
                  value={expenseForm.description}
                  onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-darkbg rounded-xl border border-slate-200 dark:border-darkbg-border"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-darkbg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow-md cursor-pointer"
                >
                  Log Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
