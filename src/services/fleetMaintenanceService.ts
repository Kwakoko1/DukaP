import { db } from '../db/dexie';

export type WorkOrderStatus = 'REQUESTED' | 'APPROVED' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSED';
export type WorkOrderPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface IFleetMaintenancePartItem {
  product_id: string;
  variant_id: string;
  part_name: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

export interface IFleetWorkOrder {
  id: string;
  tenant_id: string;
  branch_id: string;
  work_order_number: string;
  vehicle_id: string;
  issue_description: string;
  priority: WorkOrderPriority;
  workshop_name?: string;
  technician_name?: string;
  start_date?: number;
  completion_date?: number;
  labor_cost: number;
  parts_cost: number;
  other_cost: number;
  total_cost: number;
  odometer_at_service: number;
  parts_consumed: IFleetMaintenancePartItem[];
  status: WorkOrderStatus;
  warranty_days?: number;
  notes?: string;
  created_at: number;
  updated_at: number;
}

export class FleetMaintenanceService {
  /**
   * Creates and schedules a new Fleet Maintenance Work Order.
   */
  static async createWorkOrder(order: Omit<IFleetWorkOrder, 'id' | 'work_order_number' | 'status' | 'created_at' | 'updated_at'>): Promise<IFleetWorkOrder> {
    const now = Date.now();
    const woNumber = `WO-${now.toString().substring(6)}-${Math.floor(100 + Math.random() * 900)}`;

    const newWO: IFleetWorkOrder = {
      ...order,
      id: `wo-${now}-${Math.random().toString(36).substring(2, 7)}`,
      work_order_number: woNumber,
      status: 'APPROVED',
      created_at: now,
      updated_at: now
    };

    await db.table('fleetMaintenanceOrders').put(newWO);

    // If work order is high/critical priority, flag vehicle status as UNDER_REPAIR
    if (order.priority === 'HIGH' || order.priority === 'CRITICAL') {
      await db.table('fleetVehicles').update(order.vehicle_id, { status: 'UNDER_REPAIR', updated_at: now });
    }

    return newWO;
  }

  /**
   * Completes a Work Order, deducting consumed spare parts from KwakoPos Inventory Stock Ledger.
   */
  static async completeWorkOrder(workOrderId: string): Promise<IFleetWorkOrder> {
    const wo: IFleetWorkOrder = await db.table('fleetMaintenanceOrders').get(workOrderId);
    if (!wo) throw new Error('Work order not found.');

    const now = Date.now();

    // 1. Consume Spare Parts from KwakoPos Inventory Stock Ledger
    if (wo.parts_consumed && wo.parts_consumed.length > 0) {
      for (const part of wo.parts_consumed) {
        // Record Stock Ledger Movement
        await db.table('stockLedger').put({
          id: `stk-maint-${now}-${Math.random().toString(36).substring(2, 5)}`,
          tenant_id: wo.tenant_id,
          branch_id: wo.branch_id,
          product_id: part.product_id,
          variant_id: part.variant_id || 'no-variant',
          movement_type: 'FLEET_MAINTENANCE',
          quantity_change: -Math.abs(part.quantity),
          unit_cost: part.unit_cost,
          notes: `Consumed for Work Order ${wo.work_order_number}`,
          idempotency_key: `maint-${wo.id}-${part.product_id}`,
          created_at: now
        });

        // Deduct inventory stock quantity in productVariants or products
        const variant = await db.table('productVariants').get(part.variant_id);
        if (variant) {
          const newQty = Math.max(0, (variant.stock_quantity || 0) - part.quantity);
          await db.table('productVariants').update(variant.id, { stock_quantity: newQty });
        }
      }
    }

    const updatedWO: IFleetWorkOrder = {
      ...wo,
      status: 'COMPLETED',
      completion_date: now,
      updated_at: now
    };

    await db.table('fleetMaintenanceOrders').put(updatedWO);

    // Record Maintenance Cost into Fleet Expense Ledger
    await db.table('fleetExpenses').put({
      id: `exp-maint-${now}`,
      tenant_id: wo.tenant_id,
      branch_id: wo.branch_id,
      vehicle_id: wo.vehicle_id,
      category: 'MAINTENANCE',
      amount: wo.total_cost,
      currency: 'USD',
      date: now,
      description: `Maintenance Work Order ${wo.work_order_number}: ${wo.issue_description}`,
      reference_id: wo.id,
      created_at: now
    });

    // Reset vehicle status back to AVAILABLE
    await db.table('fleetVehicles').update(wo.vehicle_id, {
      status: 'AVAILABLE',
      current_odometer: Math.max(wo.odometer_at_service, (await db.table('fleetVehicles').get(wo.vehicle_id))?.current_odometer || 0),
      updated_at: now
    });

    // Sync work order to backend REST API
    fetch('/api/fleet/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-tenant-id': wo.tenant_id },
      body: JSON.stringify({
        id: wo.id,
        tenant_id: wo.tenant_id,
        branch_id: wo.branch_id,
        vehicleId: wo.vehicle_id,
        title: wo.issue_description,
        description: `WO ${wo.work_order_number}`,
        cost: wo.total_cost,
        odometerAtService: wo.odometer_at_service,
        serviceDate: now,
        status: 'COMPLETED',
        created_at: now
      })
    }).catch(() => {});

    return updatedWO;
  }
}
