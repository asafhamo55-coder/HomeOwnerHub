// BL-080: after a payment is recorded against a unit's charge, close any
// active payment plan on that unit whose installments are now paid in
// full. Best effort by design — the payment is already on the books, so a
// failure here never fails the payment; the nightly run (dues-reminders
// job) completes the plan instead. Logs carry ids and an error code only.

import { completePaidOffPlans, type PlanDb } from '@homeowner-portal/workflows/payment-plans'

export async function completePlansAfterPayment(
  db: PlanDb & { auth?: { getUser: () => Promise<{ data: { user: { id: string } | null } }> } },
  input: { organizationId: string; associationId: string; unitId: string | null; today: string },
): Promise<string[]> {
  if (!input.unitId) return []
  try {
    // audit_log's insert policy requires user_id = auth.uid().
    const actor = db.auth ? ((await db.auth.getUser()).data.user?.id ?? null) : null
    const r = await completePaidOffPlans(db, {
      organizationId: input.organizationId,
      associationId: input.associationId,
      unitIds: [input.unitId],
      today: input.today,
      actorUserId: actor,
      trigger: 'payment',
    })
    if (r.auditFailed > 0) {
      console.error('[payment-plans] completion audit row failed', { associationId: input.associationId, count: r.auditFailed })
    }
    return r.completed
  } catch (err) {
    console.error('[payment-plans] completion check failed', {
      associationId: input.associationId,
      unitId: input.unitId,
      error: err instanceof Error ? err.message : 'unknown',
    })
    return []
  }
}
