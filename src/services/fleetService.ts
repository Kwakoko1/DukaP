/**
 * fleetService.ts
 * Enterprise Vehicle & Fleet Management Service for Kwakoko / KwakoPos.
 * 
 * Provides:
 * 1. Multi-currency total-cost-of-ownership (TCO) analytics.
 * 2. ACID-compliant local-first Dexie transactions + background REST API synchronization.
 * 3. Odometer validation & financial cross-logging for fuel fills and maintenance events.
 */

import { db } from '../db/dexie';

export type VehicleType = 'PERSONAL' | 'COMMERCIAL';
export const VehicleType = {
  PERSONAL: 'PERSONAL' as VehicleType,
  COMMERCIAL: 'COMMERCIAL' as VehicleType
};

export type VehicleStatus = 'AVAILABLE' | 'ACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED';
export const VehicleStatus = {
  AVAILABLE: 'AVAILABLE' as VehicleStatus,
  ACTIVE: 'ACTIVE' as VehicleStatus,
  MAINTENANCE: 'MAINTENANCE' as VehicleStatus,
  DECOMMISSIONED: 'DECOMMISSIONED' as VehicleStatus
};

export type FuelType = 'GASOLINE' | 'DIESEL' | 'ELECTRIC' | 'HYBRID';
export const FuelType = {
  GASOLINE: 'GASOLINE' as FuelType,
  DIESEL: 'DIESEL' as FuelType,
  ELECTRIC: 'ELECTRIC' as FuelType,
  HYBRID: 'HYBRID' as FuelType
};

export type ExpenseCategory = 'FUEL' | 'MAINTENANCE' | 'INSURANCE' | 'TAX' | 'TOLL' | 'FINES' | 'OTHER';
export const ExpenseCategory = {
  FUEL: 'FUEL' as ExpenseCategory,
  MAINTENANCE: 'MAINTENANCE' as ExpenseCategory,
  INSURANCE: 'INSURANCE' as ExpenseCategory,
  TAX: 'TAX' as ExpenseCategory,
  TOLL: 'TOLL' as ExpenseCategory,
  FINES: 'FINES' as ExpenseCategory,
  OTHER: 'OTHER' as ExpenseCategory
};

export interface IVehicle {
  id: string;
  tenant_id: string;
  branch_id?: string;
  name: string;
  type: VehicleType;
  vin?: string;
  licensePlate: string;
  status: VehicleStatus;
  fuelType: FuelType;
  odometer: number;
  ownerId: string;
  metadata?: Record<string, any>;
  created_at?: number;
  updated_at?: number;
}

export interface IFuelLog {
  id: string;
  tenant_id: string;
  branch_id?: string;
  vehicleId: string;
  date: number;
  odometer: number;
  gallonsOrLiters: number;
  costPerUnit: number;
  totalCost: number;
  isPartialFill: boolean;
  currency?: string;
  created_at?: number;
}

export interface IExpenseLog {
  id: string;
  tenant_id: string;
  branch_id?: string;
  vehicleId: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  date: number;
  description: string;
  referenceId?: string;
  created_at?: number;
}

export interface IMaintenanceLog {
  id: string;
  tenant_id: string;
  branch_id?: string;
  vehicleId: string;
  title: string;
  description: string;
  cost: number;
  currency?: string;
  odometerAtService: number;
  serviceDate: number;
  status: 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED';
  created_at?: number;
}

export class FleetManagementService {

  /**
   * Safe Odometer Update Engine
   * Validates input odometer against stored asset tracking.
   */
  private async validateAndGetOdometer(vehicleId: string, inputOdometer: number): Promise<number> {
    const vehicle = await db.table('vehicles').get(vehicleId);
    if (!vehicle) {
      throw new Error('Vehicle record not found.');
    }
    if (inputOdometer < vehicle.odometer) {
      throw new Error(`Odometer mismatch. Input (${inputOdometer} km) cannot be lower than current vehicle tracking (${vehicle.odometer} km).`);
    }
    return vehicle.odometer;
  }

  /**
   * Registers a new vehicle entity in the fleet.
   */
  async registerVehicle(vehicleData: Omit<IVehicle, 'id'>): Promise<IVehicle> {
    const id = `veh-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const newVehicle: IVehicle = {
      ...vehicleData,
      id,
      created_at: now,
      updated_at: now
    };

    await db.table('vehicles').put(newVehicle);

    // Sync to PostgreSQL backend
    fetch('/api/fleet/vehicles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': vehicleData.tenant_id,
        'X-Bypass-Replica': 'true'
      },
      body: JSON.stringify(newVehicle)
    }).catch(err => console.warn('[FleetSync] Vehicle push notice:', err.message));

    return newVehicle;
  }

  /**
   * Registers a Fuel Fill-up entry and cross-logs it to general expenses.
   */
  async logFuelFill(fuelData: Omit<IFuelLog, 'id' | 'totalCost'> & { totalCost?: number }): Promise<IFuelLog> {
    await this.validateAndGetOdometer(fuelData.vehicleId, fuelData.odometer);

    const totalCost = Number((fuelData.gallonsOrLiters * fuelData.costPerUnit).toFixed(2));
    const fuelLogId = `fuel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const expenseLogId = `exp-fuel-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const currency = fuelData.currency || 'USD';

    const newFuelLog: IFuelLog = {
      ...fuelData,
      id: fuelLogId,
      totalCost,
      currency,
      created_at: now
    };

    const newExpenseLog: IExpenseLog = {
      id: expenseLogId,
      tenant_id: fuelData.tenant_id,
      branch_id: fuelData.branch_id,
      vehicleId: fuelData.vehicleId,
      category: ExpenseCategory.FUEL,
      amount: totalCost,
      currency,
      date: fuelData.date,
      description: `Fuel Fill-up: ${fuelData.gallonsOrLiters} units at ${currency} ${fuelData.costPerUnit}/unit`,
      referenceId: fuelLogId,
      created_at: now
    };

    // Atomic local Dexie transaction write
    await db.transaction('rw', [db.table('vehicles'), db.table('fuelLogs'), db.table('expenseLogs')], async () => {
      await db.table('fuelLogs').put(newFuelLog);
      await db.table('expenseLogs').put(newExpenseLog);
      await db.table('vehicles').update(fuelData.vehicleId, {
        odometer: fuelData.odometer,
        updated_at: now
      });
    });

    // Background push to REST API
    fetch('/api/fleet/fuel', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': fuelData.tenant_id,
        'X-Bypass-Replica': 'true'
      },
      body: JSON.stringify({ fuelLog: newFuelLog, expenseLog: newExpenseLog })
    }).catch(err => console.warn('[FleetSync] Fuel log push notice:', err.message));

    return newFuelLog;
  }

  /**
   * Provisions maintenance events and auto-routes expenses securely.
   */
  async logMaintenance(maintenanceData: Omit<IMaintenanceLog, 'id'>): Promise<IMaintenanceLog> {
    await this.validateAndGetOdometer(maintenanceData.vehicleId, maintenanceData.odometerAtService);

    const maintId = `maint-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const expenseLogId = `exp-maint-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const currency = maintenanceData.currency || 'USD';

    const newMaintLog: IMaintenanceLog = {
      ...maintenanceData,
      id: maintId,
      currency,
      created_at: now
    };

    await db.transaction('rw', [db.table('vehicles'), db.table('maintenanceLogs'), db.table('expenseLogs')], async () => {
      await db.table('maintenanceLogs').put(newMaintLog);

      if (maintenanceData.status === 'COMPLETED') {
        const newExpenseLog: IExpenseLog = {
          id: expenseLogId,
          tenant_id: maintenanceData.tenant_id,
          branch_id: maintenanceData.branch_id,
          vehicleId: maintenanceData.vehicleId,
          category: ExpenseCategory.MAINTENANCE,
          amount: maintenanceData.cost,
          currency,
          date: maintenanceData.serviceDate,
          description: `Completed Maintenance Work: ${maintenanceData.title}`,
          referenceId: maintId,
          created_at: now
        };
        await db.table('expenseLogs').put(newExpenseLog);
        await db.table('vehicles').update(maintenanceData.vehicleId, {
          odometer: maintenanceData.odometerAtService,
          status: VehicleStatus.AVAILABLE,
          updated_at: now
        });
      } else {
        await db.table('vehicles').update(maintenanceData.vehicleId, {
          status: VehicleStatus.MAINTENANCE,
          updated_at: now
        });
      }
    });

    fetch('/api/fleet/maintenance', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': maintenanceData.tenant_id,
        'X-Bypass-Replica': 'true'
      },
      body: JSON.stringify(newMaintLog)
    }).catch(err => console.warn('[FleetSync] Maintenance log push notice:', err.message));

    return newMaintLog;
  }

  /**
   * Logs a standalone general fleet expense (Tolls, Tax, Insurance, Fines, etc.)
   */
  async logExpense(expenseData: Omit<IExpenseLog, 'id'>): Promise<IExpenseLog> {
    const id = `exp-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const now = Date.now();
    const newExpense: IExpenseLog = {
      ...expenseData,
      id,
      created_at: now
    };

    await db.table('expenseLogs').put(newExpense);

    fetch('/api/fleet/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-ID': expenseData.tenant_id,
        'X-Bypass-Replica': 'true'
      },
      body: JSON.stringify(newExpense)
    }).catch(err => console.warn('[FleetSync] Expense log push notice:', err.message));

    return newExpense;
  }

  /**
   * High-Utility TCO Dashboard Engine: Computes analytical cost matrix breakdowns across timeframe.
   */
  async getFleetAnalytics(ownerId: string, startDateMs: number, endDateMs: number) {
    const vehicles: IVehicle[] = await db.table('vehicles')
      .where('tenant_id').equals(ownerId)
      .toArray();

    const vehicleIds = new Set(vehicles.map(v => v.id));

    const allExpenses: IExpenseLog[] = await db.table('expenseLogs')
      .where('tenant_id').equals(ownerId)
      .filter(exp => vehicleIds.has(exp.vehicleId) && exp.date >= startDateMs && exp.date <= endDateMs)
      .toArray();

    const breakdownMap: Record<string, { totalSpent: number; transactions: number }> = {};

    let totalFleetCost = 0;

    for (const exp of allExpenses) {
      if (!breakdownMap[exp.category]) {
        breakdownMap[exp.category] = { totalSpent: 0, transactions: 0 };
      }
      breakdownMap[exp.category].totalSpent += exp.amount;
      breakdownMap[exp.category].transactions += 1;
      totalFleetCost += exp.amount;
    }

    const breakdownByCategory = Object.entries(breakdownMap).map(([cat, data]) => ({
      category: cat as ExpenseCategory,
      total: data.totalSpent,
      percentageOfTotal: totalFleetCost > 0 ? Number(((data.totalSpent / totalFleetCost) * 100).toFixed(2)) : 0,
      transactions: data.transactions
    }));

    // Calculate Fleet Odometer & Cost Per Km
    const totalOdometer = vehicles.reduce((sum, v) => sum + (v.odometer || 0), 0);
    const avgCostPerVehicle = vehicles.length > 0 ? totalFleetCost / vehicles.length : 0;
    const costPerKm = totalOdometer > 0 ? totalFleetCost / totalOdometer : 0;

    return {
      timeframe: { startDateMs, endDateMs },
      vehicleCount: vehicles.length,
      totalFleetCost,
      totalOdometer,
      avgCostPerVehicle,
      costPerKm,
      breakdownByCategory
    };
  }
}

export const fleetService = new FleetManagementService();
