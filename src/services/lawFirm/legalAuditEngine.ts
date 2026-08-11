/**
 * DukaPOS Law Firm Module — Immutable Legal Audit & Case Timeline Logger
 */

import { db, type LegalTimelineEntry } from '../../db/dexie';

/**
 * Log an immutable entry to the case timeline
 */
export async function logCaseTimeline(
  tenantId: string,
  caseId: string,
  actorName: string,
  eventType: string,
  description: string
): Promise<void> {
  const entry: LegalTimelineEntry = {
    id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenant_id: tenantId,
    case_id: caseId,
    actor_name: actorName,
    event_type: eventType,
    description,
    timestamp: Date.now()
  };

  await db.legalTimeline.add(entry);
}
