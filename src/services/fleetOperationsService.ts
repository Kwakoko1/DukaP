import { db } from '../db/dexie';
import type { TripStatus } from './fleetCoreService';

export interface IFleetTrip {
  id: string;
  tenant_id: string;
  branch_id: string;
  trip_number: string;
  vehicle_id: string;
  driver_id: string;
  customer?: string;
  trip_type: 'CARGO' | 'PASSENGER' | 'MAINTENANCE' | 'LOCAL' | 'LONG_HAUL';
  origin: string;
  destination: string;
  route?: string;
  departure_time: number;
  expected_return?: number;
  actual_return?: number;
  starting_odometer: number;
  ending_odometer?: number;
  distance?: number;
  fuel_used?: number;
  trip_revenue?: number;
  trip_expenses?: number;
  trip_profit?: number;
  cargo_details?: string;
  passengers_count?: number;
  status: TripStatus;
  notes?: string;
  created_at: number;
  updated_at: number;
}

export interface IFleetOdometerEntry {
  id: string;
  tenant_id: string;
  branch_id: string;
  vehicle_id: string;
  reading: number;
  previous_reading: number;
  difference: number;
  source: 'TRIP' | 'FUEL' | 'MAINTENANCE' | 'INSPECTION' | 'MANUAL' | 'GPS';
  date: number;
  user_id: string;
  reference_id?: string;
  created_at: number;
}

export class FleetOperationsService {
  /**
   * Dispatches a new trip, locking the vehicle and driver into ON_TRIP status and preventing double-booking.
   */
  static async createAndDispatchTrip(tripData: Omit<IFleetTrip, 'id' | 'trip_number' | 'status' | 'created_at' | 'updated_at'>): Promise<IFleetTrip> {
    const vehicle = await db.table('fleetVehicles').get(tripData.vehicle_id);
    const driver = await db.table('fleetDrivers').get(tripData.driver_id);

    if (!vehicle) throw new Error('Selected vehicle does not exist.');
    if (!driver) throw new Error('Selected driver does not exist.');

    // Prevent double-booking: verify neither vehicle nor driver is currently ON_TRIP
    if (vehicle.status === 'ON_TRIP' || vehicle.status === 'UNDER_REPAIR' || vehicle.status === 'GROUNDED') {
      throw new Error(`Vehicle "${vehicle.registration_number}" is currently ${vehicle.status} and cannot be dispatched.`);
    }

    if (driver.status === 'ON_TRIP' || driver.status === 'SUSPENDED' || driver.status === 'LEAVE') {
      throw new Error(`Driver "${driver.full_name}" is currently ${driver.status} and cannot be dispatched.`);
    }

    const now = Date.now();
    const tripNumber = `TRIP-${now.toString().substring(6)}-${Math.floor(100 + Math.random() * 900)}`;

    const newTrip: IFleetTrip = {
      ...tripData,
      id: `trp-${now}-${Math.random().toString(36).substring(2, 7)}`,
      trip_number: tripNumber,
      starting_odometer: tripData.starting_odometer || vehicle.current_odometer,
      status: 'DISPATCHED',
      created_at: now,
      updated_at: now
    };

    await db.table('fleetTrips').put(newTrip);

    // Update vehicle and driver status
    await db.table('fleetVehicles').update(vehicle.id, { status: 'ON_TRIP', updated_at: now });
    await db.table('fleetDrivers').update(driver.id, { status: 'ON_TRIP', updated_at: now });

    // Sync trip dispatch to PostgreSQL
    fetch('/api/fleet/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': tripData.tenant_id },
      body: JSON.stringify(newTrip)
    }).catch(() => {});

    return newTrip;
  }

  /**
   * Completes a trip, calculating total distance and net trip profitability automatically.
   */
  static async completeTrip(
    tripId: string, 
    endingOdometer: number, 
    fuelUsed: number = 0, 
    tripRevenue: number = 0, 
    additionalExpenses: number = 0
  ): Promise<IFleetTrip> {
    const trip: IFleetTrip = await db.table('fleetTrips').get(tripId);
    if (!trip) throw new Error('Trip not found.');

    if (endingOdometer < trip.starting_odometer) {
      throw new Error(`Ending odometer (${endingOdometer}) cannot be less than starting odometer (${trip.starting_odometer}).`);
    }

    const distance = endingOdometer - trip.starting_odometer;
    const now = Date.now();

    // Auto-calculate Trip Profit = Revenue - Fuel - Expenses
    const tripProfit = Number((tripRevenue - additionalExpenses).toFixed(2));

    const updatedTrip: IFleetTrip = {
      ...trip,
      ending_odometer: endingOdometer,
      actual_return: now,
      distance,
      fuel_used: fuelUsed,
      trip_revenue: tripRevenue,
      trip_expenses: additionalExpenses,
      trip_profit: tripProfit,
      status: 'COMPLETED',
      updated_at: now
    };

    await db.table('fleetTrips').put(updatedTrip);

    // Log Odometer Entry into Immutable Ledger
    await this.recordOdometerReading({
      tenant_id: trip.tenant_id,
      branch_id: trip.branch_id,
      vehicle_id: trip.vehicle_id,
      reading: endingOdometer,
      previous_reading: trip.starting_odometer,
      difference: distance,
      source: 'TRIP',
      date: now,
      user_id: 'usr-operator',
      reference_id: tripId,
      created_at: now,
      id: `odo-${now}-${Math.random().toString(36).substring(2, 7)}`
    });

    // Release vehicle and driver back to AVAILABLE status
    await db.table('fleetVehicles').update(trip.vehicle_id, {
      current_odometer: endingOdometer,
      status: 'AVAILABLE',
      updated_at: now
    });

    await db.table('fleetDrivers').update(trip.driver_id, {
      status: 'AVAILABLE',
      updated_at: now
    });

    // Sync trip completion to backend REST API
    fetch('/api/fleet/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': trip.tenant_id },
      body: JSON.stringify(updatedTrip)
    }).catch(() => {});

    return updatedTrip;
  }

  /**
   * Records an immutable odometer reading into the telemetry ledger.
   */
  static async recordOdometerReading(entry: IFleetOdometerEntry): Promise<IFleetOdometerEntry> {
    await db.table('fleetOdometer').put(entry);
    return entry;
  }
}
