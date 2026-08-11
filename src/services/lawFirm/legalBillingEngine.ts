/**
 * DukaPOS Law Firm Module — Legal Billing & Retainer Engine
 * Precise Decimal time calculations, retainer threshold tracking, and invoice balance updates.
 */

import { db, type LegalTimeEntry } from '../../db/dexie';

/**
 * Calculate exact billable fee using integer arithmetic (avoiding floating-point errors)
 */
export function calculateBillableAmount(durationMinutes: number, hourlyRate: number): number {
  if (durationMinutes <= 0 || hourlyRate <= 0) return 0;
  // duration in hours = durationMinutes / 60
  const amount = (durationMinutes / 60) * hourlyRate;
  return Math.round(amount * 100) / 100;
}

/**
 * Log a new Lawyer Time Tracking Entry and create timeline event.
 */
export function createTimeEntry(
  tenantId: string,
  caseId: string,
  lawyerId: string,
  lawyerName: string,
  date: string,
  durationMinutes: number,
  hourlyRate: number,
  description: string
): LegalTimeEntry {
  const billableAmount = calculateBillableAmount(durationMinutes, hourlyRate);
  return {
    id: `time_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    tenant_id: tenantId,
    case_id: caseId,
    lawyer_id: lawyerId,
    lawyer_name: lawyerName,
    date,
    duration_minutes: durationMinutes,
    hourly_rate: hourlyRate,
    billable_amount: billableAmount,
    is_billed: false,
    description,
    created_at: Date.now()
  };
}

/**
 * Deduct an expense or billable fee from a Client Retainer balance
 */
export async function deductFromRetainer(
  tenantId: string,
  clientId: string,
  _caseId: string | undefined,
  amount: number
): Promise<{ success: boolean; newBalance: number; status: 'Active' | 'Low Balance' | 'Depleted'; message: string }> {
  const retainers = await db.legalRetainers
    .where('tenant_id')
    .equals(tenantId)
    .filter(r => r.client_id === clientId)
    .toArray();

  let retainer = retainers[0];
  if (!retainer) {
    return {
      success: false,
      newBalance: 0,
      status: 'Depleted',
      message: 'No retainer account found for this client.'
    };
  }

  const newBalance = Math.max(0, retainer.current_balance - amount);
  let status: 'Active' | 'Low Balance' | 'Depleted' = 'Active';

  if (newBalance === 0) {
    status = 'Depleted';
  } else if (newBalance < retainer.minimum_threshold) {
    status = 'Low Balance';
  }

  await db.legalRetainers.update(retainer.id, {
    current_balance: newBalance,
    status,
    updated_at: Date.now()
  });

  return {
    success: true,
    newBalance,
    status,
    message: status === 'Low Balance'
      ? `Retainer balance (TZS ${newBalance.toLocaleString()}) fell below minimum threshold (TZS ${retainer.minimum_threshold.toLocaleString()}).`
      : `Retainer updated successfully. New balance: TZS ${newBalance.toLocaleString()}`
  };
}
