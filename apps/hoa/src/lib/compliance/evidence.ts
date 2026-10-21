/**
 * BL-145: the reads behind "done, with evidence" on /compliance.
 *
 * compliance_deadlines_done (0067, M3_APPLIED) holds when each deadline was
 * marked done; 0069 part 4 (M5_APPLIED) adds `document_id`, the board's
 * evidence (an hoa_documents row of the same org, enforced by a trigger).
 *
 *   M3 off: no table read at all (empty map: the signed acknowledgments
 *           alone count, as before 0067).
 *   M5 off: `document_id` is never selected — the column doesn't exist in
 *           production until 0069 is applied, and selecting it would fail
 *           the whole read.
 *
 * Every query filters by the org explicitly (the monthly report reads with
 * the service role). Ids and error codes only in logs.
 */

import { M3_APPLIED } from '@homeowner-portal/db/m3'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { COMPLIANCE_DONE_TABLE, isKnownDeadlineCode } from './deadlines'
import type { DoneWithEvidence } from './obligations'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LooseDb = { from: (table: string) => any }

export interface EvidenceDocument {
  id: string
  name: string
}

/** How many of the org's documents the evidence picker offers (newest first). */
export const EVIDENCE_PICKER_LIMIT = 500

/**
 * The org's done rows, with evidence when `evidence` (M5_APPLIED). null when
 * the read failed (the page then counts the acknowledgments alone and says
 * nothing is wrong — the same fallback as the dashboard card).
 */
export async function loadComplianceDoneWithEvidence(
  db: LooseDb,
  orgId: string,
  opts: { live?: boolean; evidence?: boolean; associationId?: string } = {},
): Promise<DoneWithEvidence | null> {
  const live = opts.live ?? M3_APPLIED
  const evidence = opts.evidence ?? M5_APPLIED
  if (!live) return new Map()
  let q = db
    .from(COMPLIANCE_DONE_TABLE)
    .select(evidence ? 'association_id, code, done_at, document_id' : 'association_id, code, done_at')
    .eq('organization_id', orgId)
  if (opts.associationId) q = q.eq('association_id', opts.associationId)
  const { data, error } = (await q) as { data: unknown[] | null; error: { code?: string } | null }
  if (error) {
    console.error('[compliance] done rows read failed', { orgId, code: error.code ?? null })
    return null
  }
  const out: DoneWithEvidence = new Map()
  for (const raw of data ?? []) {
    const r = raw as Record<string, unknown> | null
    if (!r || typeof r.association_id !== 'string' || !isKnownDeadlineCode(r.code) || typeof r.done_at !== 'string') continue
    const byCode = out.get(r.association_id) ?? new Map()
    byCode.set(r.code, { doneAt: r.done_at, documentId: evidence && typeof r.document_id === 'string' ? r.document_id : null })
    out.set(r.association_id, byCode)
  }
  return out
}

/**
 * The org's documents for the evidence picker, newest first, plus the
 * names of any already-attached document older than the picker's window.
 * Flag off: [] without a read. null when the read failed.
 */
export async function loadEvidenceDocuments(
  db: LooseDb,
  orgId: string,
  attachedIds: readonly string[],
  live: boolean = M5_APPLIED,
): Promise<EvidenceDocument[] | null> {
  if (!live) return []
  const { data, error } = (await db
    .from('hoa_documents')
    .select('id, name')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .range(0, EVIDENCE_PICKER_LIMIT - 1)) as { data: Array<{ id: string; name: string | null }> | null; error: { code?: string } | null }
  if (error) {
    console.error('[compliance] evidence documents read failed', { orgId, code: error.code ?? null })
    return null
  }
  const docs = (data ?? []).map((d) => ({ id: d.id, name: d.name?.trim() || 'Untitled document' }))
  const missing = [...new Set(attachedIds)].filter((id) => !docs.some((d) => d.id === id))
  if (missing.length === 0) return docs
  const extra = (await db.from('hoa_documents').select('id, name').eq('org_id', orgId).in('id', missing)) as {
    data: Array<{ id: string; name: string | null }> | null
    error: { code?: string } | null
  }
  if (extra.error) {
    // The picker still works; an older attached document shows as "Attached document".
    console.error('[compliance] attached documents read failed', { orgId, code: extra.error.code ?? null })
    return docs
  }
  return [...docs, ...(extra.data ?? []).map((d) => ({ id: d.id, name: d.name?.trim() || 'Untitled document' }))]
}

/** Every evidence document id in the done rows. */
export function attachedDocumentIds(done: DoneWithEvidence | null): string[] {
  const out: string[] = []
  for (const byCode of done?.values() ?? []) for (const e of byCode.values()) if (e.documentId) out.push(e.documentId)
  return out
}
