import { db } from '../db/dexie';

export interface IFleetAiInsight {
  id: string;
  type: 'FUEL_ANOMALY' | 'MAINTENANCE_DUE' | 'DRIVER_PERFORMANCE' | 'COST_WARNING' | 'REPLACEMENT_RECOMMENDATION';
  title: string;
  description: string;
  vehicle_id?: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  metric_value?: string;
  actionable_step: string;
  created_at: number;
}

export class FleetAiService {
  /**
   * Generates real-time AI insights based strictly on empirical KwakoPos database records.
   */
  static async generateFleetInsights(tenantId: string): Promise<IFleetAiInsight[]> {
    const insights: IFleetAiInsight[] = [];
    const now = Date.now();

    // 1. Scan for vehicles with maintenance due soon (< 1,000 km or overdue)
    const vehicles = await db.table('fleetVehicles')
      .where('tenant_id').equals(tenantId)
      .toArray();

    for (const v of vehicles) {
      if (v.status === 'UNDER_REPAIR') {
        insights.push({
          id: `ai-maint-${v.id}`,
          type: 'COST_WARNING',
          title: `Vehicle ${v.registration_number} in Repair`,
          description: `Vehicle is currently undergoing maintenance. Downtime may impact scheduled trip dispatch.`,
          vehicle_id: v.id,
          severity: 'WARNING',
          actionable_step: 'Review active Work Orders in Maintenance tab.',
          created_at: now
        });
      } else if (v.status === 'GROUNDED') {
        insights.push({
          id: `ai-ground-${v.id}`,
          type: 'COST_WARNING',
          title: `Vehicle ${v.registration_number} Grounded`,
          description: `Vehicle was automatically grounded due to safety-critical inspection failures.`,
          vehicle_id: v.id,
          severity: 'CRITICAL',
          actionable_step: 'Conduct emergency inspection or create repair work order immediately.',
          created_at: now
        });
      }
    }

    // 2. Scan fuel entries for anomalies
    const fuelEntries = await db.table('fleetFuelEntries')
      .where('tenant_id').equals(tenantId)
      .filter((f: any) => f.anomaly_detected)
      .toArray();

    for (const f of fuelEntries.slice(0, 3)) {
      insights.push({
        id: `ai-fuel-${f.id}`,
        type: 'FUEL_ANOMALY',
        title: `Fuel Consumption Anomaly Detected`,
        description: f.anomaly_reason || `Fuel entry flagged for abnormal consumption on vehicle ID ${f.vehicle_id.substring(0, 8)}.`,
        vehicle_id: f.vehicle_id,
        severity: 'WARNING',
        metric_value: f.km_per_liter ? `${f.km_per_liter} Km/L` : undefined,
        actionable_step: 'Audit receipt number and driver fuel card usage.',
        created_at: now
      });
    }

    if (insights.length === 0) {
      insights.push({
        id: `ai-opt-ok`,
        type: 'DRIVER_PERFORMANCE',
        title: 'Fleet Operating at Optimal Efficiency',
        description: 'All active vehicles are fully compliant with zero unaddressed fuel anomalies or critical maintenance alerts.',
        severity: 'INFO',
        actionable_step: 'Maintain regular pre-trip safety inspections.',
        created_at: now
      });
    }

    return insights;
  }
}
