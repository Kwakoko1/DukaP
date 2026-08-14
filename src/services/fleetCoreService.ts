import { db } from '../db/dexie';

export type VehicleStatus = 
  | 'ACTIVE' | 'AVAILABLE' | 'ASSIGNED' | 'ON_TRIP' 
  | 'IN_SERVICE' | 'UNDER_REPAIR' | 'ACCIDENT' | 'GROUNDED' 
  | 'SOLD' | 'DISPOSED' | 'LOST' | 'INACTIVE';

export type DriverStatus = 
  | 'AVAILABLE' | 'ASSIGNED' | 'ON_TRIP' | 'OFF_DUTY' 
  | 'SUSPENDED' | 'LEAVE' | 'INACTIVE';

export type VehicleType = 
  | 'SEDAN' | 'SUV' | 'PICKUP' | 'VAN' | 'TRUCK' 
  | 'BUS' | 'MOTORCYCLE' | 'TRAILER' | 'HEAVY_EQUIPMENT';

export type FuelType = 'GASOLINE' | 'DIESEL' | 'ELECTRIC' | 'HYBRID' | 'CNG';

export type TripStatus = 'DRAFT' | 'DISPATCHED' | 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';

export interface IFleetVehicle {
  id: string;
  tenant_id: string;
  branch_id: string;
  fleet_number: string;
  registration_number: string;
  vin: string;
  engine_number?: string;
  vehicle_type: VehicleType;
  make: string;
  model: string;
  year: number;
  color?: string;
  fuel_type: FuelType;
  transmission?: 'MANUAL' | 'AUTOMATIC';
  engine_capacity_cc?: number;
  seating_capacity?: number;
  load_capacity_kg?: number;
  current_odometer: number;
  acquisition_date?: number;
  acquisition_cost?: number;
  purchase_type?: 'OWNED' | 'LEASED' | 'FINANCED';
  ownership_type?: 'COMPANY' | 'THIRD_PARTY';
  current_driver_id?: string;
  status: VehicleStatus;
  notes?: string;
  created_at: number;
  updated_at: number;
  deleted_at?: number;
}

export interface IFleetDriver {
  id: string;
  tenant_id: string;
  branch_id: string;
  user_id?: string;
  employee_number: string;
  full_name: string;
  phone: string;
  email?: string;
  license_number: string;
  license_category: string;
  license_issue_date?: number;
  license_expiry: number;
  medical_cert_expiry?: number;
  employment_status: 'FULL_TIME' | 'CONTRACT' | 'TEMPORARY';
  hire_date?: number;
  assigned_vehicle_id?: string;
  status: DriverStatus;
  emergency_contact?: string;
  created_at: number;
  updated_at: number;
  deleted_at?: number;
}

export interface IFleetAssignment {
  id: string;
  tenant_id: string;
  branch_id: string;
  vehicle_id: string;
  driver_id: string;
  start_date: number;
  end_date?: number;
  assignment_type: 'PRIMARY' | 'TEMPORARY' | 'SHIFT';
  starting_odometer: number;
  ending_odometer?: number;
  approved_by: string;
  notes?: string;
  created_at: number;
}

export class FleetCoreService {
  /**
   * Registers a new vehicle with strict tenant uniqueness constraints.
   */
  static async registerVehicle(vehicle: Omit<IFleetVehicle, 'id' | 'created_at' | 'updated_at'>): Promise<IFleetVehicle> {
    const existing = await db.table('fleetVehicles')
      .where('tenant_id').equals(vehicle.tenant_id)
      .filter((v: any) => v.registration_number === vehicle.registration_number || v.vin === vehicle.vin)
      .first();

    if (existing) {
      throw new Error(`Vehicle with registration "${vehicle.registration_number}" or VIN "${vehicle.vin}" already exists.`);
    }

    const now = Date.now();
    const newVehicle: IFleetVehicle = {
      ...vehicle,
      id: `vh-${now}-${Math.random().toString(36).substring(2, 7)}`,
      created_at: now,
      updated_at: now,
      deleted_at: 0
    };

    await db.table('fleetVehicles').put(newVehicle);
    
    // Sync to PostgreSQL backend
    fetch('/api/fleet/vehicles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': vehicle.tenant_id },
      body: JSON.stringify(newVehicle)
    }).catch(() => {});

    return newVehicle;
  }

  /**
   * Registers or updates a Fleet Driver profile.
   */
  static async registerDriver(driver: Omit<IFleetDriver, 'id' | 'created_at' | 'updated_at'>): Promise<IFleetDriver> {
    const now = Date.now();
    const newDriver: IFleetDriver = {
      ...driver,
      id: `drv-${now}-${Math.random().toString(36).substring(2, 7)}`,
      created_at: now,
      updated_at: now,
      deleted_at: 0
    };

    await db.table('fleetDrivers').put(newDriver);

    fetch('/api/fleet/drivers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': driver.tenant_id },
      body: JSON.stringify(newDriver)
    }).catch(() => {});

    return newDriver;
  }

  /**
   * Controlled vehicle-driver assignment preserving historical audit trail.
   */
  static async assignVehicleToDriver(
    tenantId: string,
    branchId: string,
    vehicleId: string,
    driverId: string,
    approvedBy: string,
    notes?: string
  ): Promise<IFleetAssignment> {
    const vehicle = await db.table('fleetVehicles').get(vehicleId);
    const driver = await db.table('fleetDrivers').get(driverId);

    if (!vehicle || !driver) throw new Error('Vehicle or Driver record not found.');

    const now = Date.now();

    // Close any previous open assignment for this vehicle
    const activeAssignments = await db.table('fleetAssignments')
      .where('vehicle_id').equals(vehicleId)
      .filter((a: any) => !a.end_date)
      .toArray();

    for (const a of activeAssignments) {
      await db.table('fleetAssignments').update(a.id, {
        end_date: now,
        ending_odometer: vehicle.current_odometer
      });
    }

    const assignment: IFleetAssignment = {
      id: `asg-${now}-${Math.random().toString(36).substring(2, 7)}`,
      tenant_id: tenantId,
      branch_id: branchId,
      vehicle_id: vehicleId,
      driver_id: driverId,
      start_date: now,
      assignment_type: 'PRIMARY',
      starting_odometer: vehicle.current_odometer,
      approved_by: approvedBy,
      notes,
      created_at: now
    };

    await db.table('fleetAssignments').put(assignment);

    // Update current vehicle and driver statuses
    await db.table('fleetVehicles').update(vehicleId, {
      current_driver_id: driverId,
      status: 'ASSIGNED',
      updated_at: now
    });

    await db.table('fleetDrivers').update(driverId, {
      assigned_vehicle_id: vehicleId,
      status: 'ASSIGNED',
      updated_at: now
    });

    return assignment;
  }
}
