import { db } from '../db/dexie';

export interface IVehicleProfitabilityMatrix {
  vehicle_id: string;
  registration_number: string;
  fleet_number: string;
  total_trips: number;
  total_distance_km: number;
  total_revenue: number;
  fuel_cost: number;
  maintenance_cost: number;
  insurance_cost: number;
  registration_cost: number;
  other_expenses: number;
  total_operating_cost: number;
  net_contribution: number;
  cost_per_km: number;
  revenue_per_km: number;
  profit_per_km: number;
  roi_percent: number;
}

export class FleetFinancialService {
  /**
   * Computes comprehensive vehicle profitability and total-cost-of-ownership (TCO) matrix for a given vehicle.
   */
  static async getVehicleProfitability(_tenantId: string, vehicleId: string): Promise<IVehicleProfitabilityMatrix> {
    const vehicle = await db.table('fleetVehicles').get(vehicleId);
    if (!vehicle) throw new Error('Vehicle not found.');

    // Fetch all trips for vehicle
    const trips = await db.table('fleetTrips')
      .where('vehicle_id').equals(vehicleId)
      .toArray();

    const activeTrips = trips.filter((t: any) => t.status === 'COMPLETED' || t.status === 'CLOSED');
    const totalDistance = activeTrips.reduce((sum: number, t: any) => sum + (t.distance || 0), 0);
    const totalRevenue = activeTrips.reduce((sum: number, t: any) => sum + (t.trip_revenue || 0), 0);

    // Fetch all expenses for vehicle
    const expenses = await db.table('fleetExpenses')
      .where('vehicle_id').equals(vehicleId)
      .toArray();

    const fuelCost = expenses.filter((e: any) => e.category === 'FUEL').reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
    const maintenanceCost = expenses.filter((e: any) => e.category === 'MAINTENANCE' || e.category === 'REPAIR').reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
    const insuranceCost = expenses.filter((e: any) => e.category === 'INSURANCE').reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
    const registrationCost = expenses.filter((e: any) => e.category === 'REGISTRATION' || e.category === 'LICENSE').reduce((sum: number, e: any) => sum + (e.amount || 0), 0);
    const otherExpenses = expenses.filter((e: any) => !['FUEL', 'MAINTENANCE', 'REPAIR', 'INSURANCE', 'REGISTRATION', 'LICENSE'].includes(e.category)).reduce((sum: number, e: any) => sum + (e.amount || 0), 0);

    const totalOperatingCost = Number((fuelCost + maintenanceCost + insuranceCost + registrationCost + otherExpenses).toFixed(2));
    const netContribution = Number((totalRevenue - totalOperatingCost).toFixed(2));

    const safeDistance = totalDistance > 0 ? totalDistance : 1;
    const costPerKm = Number((totalOperatingCost / safeDistance).toFixed(2));
    const revenuePerKm = Number((totalRevenue / safeDistance).toFixed(2));
    const profitPerKm = Number((netContribution / safeDistance).toFixed(2));

    const acqCost = vehicle.acquisition_cost && vehicle.acquisition_cost > 0 ? vehicle.acquisition_cost : 1;
    const roiPercent = Number(((netContribution / acqCost) * 100).toFixed(2));

    return {
      vehicle_id: vehicleId,
      registration_number: vehicle.registration_number,
      fleet_number: vehicle.fleet_number || vehicle.registration_number,
      total_trips: activeTrips.length,
      total_distance_km: totalDistance,
      total_revenue: totalRevenue,
      fuel_cost: fuelCost,
      maintenance_cost: maintenanceCost,
      insurance_cost: insuranceCost,
      registration_cost: registrationCost,
      other_expenses: otherExpenses,
      total_operating_cost: totalOperatingCost,
      net_contribution: netContribution,
      cost_per_km: costPerKm,
      revenue_per_km: revenuePerKm,
      profit_per_km: profitPerKm,
      roi_percent: roiPercent
    };
  }
}
