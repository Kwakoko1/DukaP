import { db } from '../db/dexie';

export type InspectionItemResult = 'PASS' | 'FAIL' | 'WARNING' | 'NA';

export interface IFleetInspectionItem {
  key: string;
  name: string;
  category: 'BRAKES' | 'TYRES' | 'LIGHTS' | 'ENGINE' | 'SAFETY' | 'DOCUMENTS';
  result: InspectionItemResult;
  is_safety_critical: boolean;
  notes?: string;
}

export interface IFleetInspection {
  id: string;
  tenant_id: string;
  branch_id: string;
  vehicle_id: string;
  driver_id: string;
  template_name: string;
  inspection_date: number;
  items: IFleetInspectionItem[];
  overall_status: 'PASS' | 'FAIL' | 'WARNING';
  grounded_triggered: boolean;
  notes?: string;
  created_at: number;
}

export class FleetInspectionService {
  /**
   * Conducts a pre-trip or daily inspection. Automatically grounds vehicle if safety-critical items fail.
   */
  static async submitInspection(inspection: Omit<IFleetInspection, 'id' | 'created_at' | 'overall_status' | 'grounded_triggered'>): Promise<IFleetInspection> {
    const now = Date.now();

    // Check for safety-critical failures
    const safetyCriticalFailures = inspection.items.filter(item => item.is_safety_critical && item.result === 'FAIL');
    const hasFailures = inspection.items.some(item => item.result === 'FAIL');
    const hasWarnings = inspection.items.some(item => item.result === 'WARNING');

    let overallStatus: 'PASS' | 'FAIL' | 'WARNING' = 'PASS';
    if (hasFailures) overallStatus = 'FAIL';
    else if (hasWarnings) overallStatus = 'WARNING';

    const groundedTriggered = safetyCriticalFailures.length > 0;

    const newInspection: IFleetInspection = {
      ...inspection,
      id: `insp-${now}-${Math.random().toString(36).substring(2, 7)}`,
      overall_status: overallStatus,
      grounded_triggered: groundedTriggered,
      created_at: now
    };

    await db.table('fleetInspections').put(newInspection);

    // GROUND VEHICLE IMMEDIATELY ON CRITICAL SAFETY FAILURE
    if (groundedTriggered) {
      await db.table('fleetVehicles').update(inspection.vehicle_id, {
        status: 'GROUNDED',
        updated_at: now
      });
    }

    return newInspection;
  }
}
