/**
 * The audit_log row written each time an approved collections letter is
 * printed (BL-089). Ids, days, the letter kind and cents only — never a
 * name, an address, or anything the board typed into a BLANK.
 * A failed insert is returned so the caller refuses: the print dialog
 * doesn't open without a record.
 */

export const LETTER_PRINTED = 'collections_letter_printed'
export const LETTER_AUDIT_ENTITY = 'collections_letter'

export interface LetterAuditMetadata {
  approval_request_id: string
  collection_case_id: string
  /** The collections event the first print recorded; null on a reprint. */
  collection_event_id: string | null
  property_id: string
  unit_id: string | null
  kind: string
  jurisdiction: string
  letter_date: string
  ledger_cents: number
  entered_cents: number
  total_cents: number
  charge_ids: string[]
  reprint: boolean
}

export function letterAuditRow(args: { orgId: string; userId: string; metadata: LetterAuditMetadata }) {
  return {
    action: LETTER_PRINTED,
    org_id: args.orgId,
    user_id: args.userId,
    entity_type: LETTER_AUDIT_ENTITY,
    entity_id: args.metadata.approval_request_id,
    metadata: args.metadata,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Insertable = { from: (t: string) => any }

export async function recordLetterAudit(
  db: Insertable,
  args: Parameters<typeof letterAuditRow>[0],
): Promise<{ ok: true } | { ok: false; code: string | null }> {
  const { error } = (await db.from('audit_log').insert(letterAuditRow(args))) as { error: { code?: string } | null }
  if (error) {
    console.error('[collections.letters] audit insert failed', { orgId: args.orgId, code: error.code ?? null })
    return { ok: false, code: error.code ?? null }
  }
  return { ok: true }
}
