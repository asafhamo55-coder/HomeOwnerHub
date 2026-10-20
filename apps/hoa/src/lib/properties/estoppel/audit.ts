/**
 * audit_log rows for the estoppel certificate (BL-087): one when the
 * board opens the prepared certificate, one each time it prints.
 * Ids, days, choices and cents only — never a name, an address, the
 * requestor or anything the board typed into a free-text field.
 * A failed insert is returned so the caller refuses: the page isn't
 * shown, and the print dialog doesn't open, without a record.
 */

export const ESTOPPEL_PREPARED = 'estoppel_prepared'
export const ESTOPPEL_PRINTED = 'estoppel_printed'

export interface EstoppelAuditMetadata {
  property_id: string
  unit_id: string | null
  jurisdiction: 'FL' | 'CA' | 'TX' | 'GA' | 'generic'
  balance_cents: number
  past_due_cents: number
  not_yet_due_cents: number
  open_violation_ids: string[]
  payment_plan_id: string | null
  collection_case_id: string | null
  /** Printed only. */
  request_date?: string
  issue_date?: string
  delivery?: 'electronic' | 'hand' | 'mail'
  expedited?: boolean
  fee_cents?: number
  response_due?: string | null
  effective_through?: string | null
}

export function estoppelAuditRow(args: {
  action: typeof ESTOPPEL_PREPARED | typeof ESTOPPEL_PRINTED
  orgId: string
  userId: string
  metadata: EstoppelAuditMetadata
}) {
  return {
    action: args.action,
    org_id: args.orgId,
    user_id: args.userId,
    entity_type: 'hoa_property',
    entity_id: args.metadata.property_id,
    metadata: args.metadata,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Insertable = { from: (t: string) => any }

export async function recordEstoppelAudit(
  db: Insertable,
  args: Parameters<typeof estoppelAuditRow>[0],
): Promise<{ ok: true } | { ok: false; code: string | null }> {
  const { error } = (await db.from('audit_log').insert(estoppelAuditRow(args))) as { error: { code?: string } | null }
  if (error) {
    console.error('[properties.estoppel] audit insert failed', { orgId: args.orgId, action: args.action, code: error.code ?? null })
    return { ok: false, code: error.code ?? null }
  }
  return { ok: true }
}
