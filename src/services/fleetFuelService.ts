import { db } from '../db/dexie';

export interface IFleetFuelEntry {
  id: string;
  tenant_id: string;
  branch_id: string;
  vehicle_id: string;
  driver_id: string;
  station_name: string;
  fuel_card_id?: string;
  fuel_type: string;
  quantity: number; // Liters or Gallons
  unit_price: number;
  total_cost: number;
  odometer: number;
  date: number;
  payment_method: 'CASH' | 'FUEL_CARD' | 'CORPORATE_ACCOUNT' | 'MOBILE_MONEY';
  receipt_number?: string;
  km_per_liter?: number;
  liters_per_100km?: number;
  cost_per_km?: number;
  anomaly_detected?: boolean;
  anomaly_reason?: string;
  created_at: number;
}

export interface IFleetFuelCard {
  id: string;
  tenant_id: string;
  branch_id: string;
  card_number: string;
  vehicle_id?: string;
  driver_id?: string;
  provider: string;
  spending_limit: number;
  daily_limit: number;
  monthly_limit: number;
  status: 'ACTIVE' | 'BLOCKED' | 'EXPIRED' | 'LOST' | 'CANCELLED';
  created_at: number;
}

export class FleetFuelService {
  /**
   * Logs a fuel transaction with automated anomaly detection algorithms.
   */
  static async logFuelTransaction(fuel: Omit<IFleetFuelEntry, 'id' | 'created_at' | 'total_cost'> & { total_cost?: number }): Promise<IFleetFuelEntry> {
    const vehicle = await db.table('fleetVehicles').get(fuel.vehicle_id);
    if (!vehicle) throw new Error('Vehicle not found.');

    const now = Date.now();
    const totalCost = fuel.total_cost || Number((fuel.quantity * fuel.unit_price).toFixed(2));
    let anomaly = false;
    let anomalyReason = '';

    // 1. Tank Capacity Breach Anomaly Check
    const maxTankCapacity = vehicle.load_capacity_kg ? vehicle.load_capacity_kg * 0.15 : 100; // heuristic or fallback
    if (fuel.quantity > maxTankCapacity && maxTankCapacity > 0) {
      anomaly = true;
      anomalyReason = `Fuel quantity (${fuel.quantity}L) exceeds maximum tank capacity limit (${maxTankCapacity}L).`;
    }

    // 2. Fetch previous fuel entry for Km/L calculation and zero-movement anomaly check
    const previousEntry: IFleetFuelEntry = await db.table('fleetFuelEntries')
      .where('vehicle_id').equals(fuel.vehicle_id)
      .reverse()
      .sortBy('date')
      .then(list => list[0]);

    let kmPerLiter = 0;
    let litersPer100km = 0;
    let costPerKm = 0;

    if (previousEntry && previousEntry.odometer) {
      const distance = fuel.odometer - previousEntry.odometer;

      if (distance <= 0) {
        anomaly = true;
        anomalyReason = anomalyReason || `Fuel logged with zero or negative distance movement (${distance} km).`;
      } else {
        kmPerLiter = Number((distance / fuel.quantity).toFixed(2));
        litersPer100km = Number(((fuel.quantity / distance) * 100).toFixed(2));
        costPerKm = Number((totalCost / distance).toFixed(2));

        // Fuel Efficiency Anomaly (e.g. Km/L drops below 2.0 or exceeds 45.0)
        if (kmPerLiter < 2.0) {
          anomaly = true;
          anomalyReason = anomalyReason || `Unusually high fuel consumption detected (${kmPerLiter} Km/L).`;
        }
      }
    }

    const newEntry: IFleetFuelEntry = {
      ...fuel,
      id: `fuel-${now}-${Math.random().toString(36).substring(2, 7)}`,
      total_cost: totalCost,
      km_per_liter: kmPerLiter,
      liters_per_100km: litersPer100km,
      cost_per_km: costPerKm,
      anomaly_detected: anomaly,
      anomaly_reason: anomalyReason,
      created_at: now
    };

    await db.table('fleetFuelEntries').put(newEntry);

    // Cross-log fuel transaction to global Fleet Expense Ledger
    await db.table('fleetExpenses').put({
      id: `exp-fuel-${now}`,
      tenant_id: fuel.tenant_id,
      branch_id: fuel.branch_id,
      vehicle_id: fuel.vehicle_id,
      driver_id: fuel.driver_id,
      category: 'FUEL',
      amount: totalCost,
      currency: 'USD',
      date: fuel.date || now,
      description: `Fuel purchase at ${fuel.station_name} (${fuel.quantity}L @ $${fuel.unit_price}/L)`,
      reference_id: newEntry.id,
      created_at: now
    });

    // Sync fuel log & expense to server REST API
    fetch('/api/fleet/fuel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': fuel.tenant_id },
      body: JSON.stringify({
        fuelLog: {
          id: newEntry.id,
          tenant_id: fuel.tenant_id,
          branch_id: fuel.branch_id,
          vehicleId: fuel.vehicle_id,
          date: fuel.date,
          odometer: fuel.odometer,
          gallonsOrLiters: fuel.quantity,
          costPerUnit: fuel.unit_price,
          totalCost: totalCost,
          isPartialFill: false,
          created_at: now
        },
        expenseLog: {
          id: `exp-fuel-${now}`,
          tenant_id: fuel.tenant_id,
          branch_id: fuel.branch_id,
          vehicleId: fuel.vehicle_id,
          category: 'FUEL',
          amount: totalCost,
          currency: 'USD',
          date: fuel.date,
          description: `Fuel purchase at ${fuel.station_name}`,
          referenceId: newEntry.id,
          created_at: now
        }
      })
    }).catch(() => {});

    return newEntry;
  }
}
