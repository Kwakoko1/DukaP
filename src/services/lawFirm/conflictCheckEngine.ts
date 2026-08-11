/**
 * DukaPOS Law Firm Module — Conflict-of-Interest Engine
 * Performs fuzzy conflict-checking across clients, opposing parties, and previous cases
 * before opening new legal matters.
 */

import { db, type LegalConflictCheck } from '../../db/dexie';

export interface ConflictCheckResult {
  hasConflict: boolean;
  matchType?: 'CLIENT' | 'OPPOSING_PARTY' | 'PREVIOUS_CASE';
  matchedEntityName?: string;
  relatedCaseId?: string;
  relatedCaseTitle?: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  description: string;
}

/**
 * Execute a conflict-of-interest check against active clients, former clients, opposing parties, and previous cases.
 */
export async function performConflictCheck(
  tenantId: string,
  partySearched: string,
  _proposedCaseTitle: string
): Promise<ConflictCheckResult> {
  if (!partySearched.trim()) {
    return {
      hasConflict: false,
      severity: 'NONE',
      description: 'No party name specified for conflict check.'
    };
  }

  const query = partySearched.toLowerCase().trim();

  // 1. Search Clients
  const clients = await db.legalClients.where('tenant_id').equals(tenantId).toArray();
  const matchedClient = clients.find(c => 
    c.name.toLowerCase().includes(query) || 
    (c.company_name && c.company_name.toLowerCase().includes(query))
  );

  if (matchedClient) {
    return {
      hasConflict: true,
      matchType: 'CLIENT',
      matchedEntityName: matchedClient.name,
      severity: 'HIGH',
      description: `Potential Conflict Detected: "${partySearched}" matches existing client "${matchedClient.name}" (${matchedClient.type}).`
    };
  }

  // 2. Search Opposing Parties & Case Titles
  const cases = await db.legalCases.where('tenant_id').equals(tenantId).toArray();
  for (const c of cases) {
    if (c.opposing_party && c.opposing_party.toLowerCase().includes(query)) {
      return {
        hasConflict: true,
        matchType: 'OPPOSING_PARTY',
        matchedEntityName: c.opposing_party,
        relatedCaseId: c.id,
        relatedCaseTitle: c.title,
        severity: 'MEDIUM',
        description: `Potential Conflict Detected: "${partySearched}" is listed as opposing party in Case #${c.case_number} ("${c.title}").`
      };
    }

    if (c.title.toLowerCase().includes(query)) {
      return {
        hasConflict: true,
        matchType: 'PREVIOUS_CASE',
        matchedEntityName: c.title,
        relatedCaseId: c.id,
        relatedCaseTitle: c.title,
        severity: 'LOW',
        description: `Matching Case Title Found: "${c.title}" (Case #${c.case_number}).`
      };
    }
  }

  return {
    hasConflict: false,
    severity: 'NONE',
    description: `Zero conflicts found for party "${partySearched}". Safe to proceed with intake.`
  };
}

/**
 * Record conflict check acknowledgment in legalConflictChecks audit table.
 */
export async function logConflictCheckAcknowledgment(
  tenantId: string,
  caseTitle: string,
  partySearched: string,
  result: ConflictCheckResult,
  userEmail: string,
  notes: string
): Promise<void> {
  const entry: LegalConflictCheck = {
    id: `conf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenant_id: tenantId,
    case_title: caseTitle,
    party_searched: partySearched,
    match_found: result.hasConflict,
    match_type: result.matchType,
    related_case_id: result.relatedCaseId,
    acknowledged_by: userEmail,
    acknowledgment_notes: notes,
    timestamp: Date.now()
  };

  await db.legalConflictChecks.add(entry);
}
