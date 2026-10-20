/**
 * BL-101 A4 — writing `inbox_thread_links`, checked.
 *
 * `inbox_thread_links.resource_id` has no foreign key: the table accepts
 * any UUID under any of its four types. So every write goes through
 * `writeThreadLink`, which checks in code (no trigger, no migration):
 *
 *   1. the thread belongs to the caller's org;
 *   2. the record exists in the table for its TYPE (a violation id filed
 *      as a "ticket" is refused), is not deleted, and belongs to the
 *      caller's org.
 *
 * The rail's reader (thread-context.ts readLinkedRecords) re-checks both
 * on the way out, so a row written before these checks still can't show
 * another org's record.
 *
 * BL-134 (inbox plan B3): migration 0067 adds the same check in the
 * database (inbox_thread_links_validate, BEFORE INSERT OR UPDATE), so a
 * write that skips this module (PostgREST directly, a future caller) is
 * refused too, with 23503. Once M3_APPLIED, that refusal is reported as
 * "record not found" (a target deleted or moved between our check and
 * the insert), not as a generic failure.
 *
 * No 'use server': the server actions that call this live in
 * lib/inbox/actions.ts and lib/inbox/convert/actions.ts. Board RLS client
 * only. Logs carry ids and error codes only.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { M3_APPLIED } from '@homeowner-portal/db/m3'

type Db = SupabaseClient<Database>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (table: string) => any }

export const LINK_TYPES = ['ticket', 'arc_request', 'violation', 'communication_thread'] as const
export type LinkType = (typeof LINK_TYPES)[number]

export function isLinkType(value: unknown): value is LinkType {
  return typeof value === 'string' && (LINK_TYPES as readonly string[]).includes(value)
}

/** Where each link type lives, and how it is org- and home-keyed. */
export const LINK_TARGETS: Record<
  LinkType,
  { table: string; orgColumn: string; homeColumn: 'unit_id' | 'property_id' | null; softDelete: boolean }
> = {
  ticket: { table: 'tickets', orgColumn: 'organization_id', homeColumn: 'unit_id', softDelete: true },
  arc_request: { table: 'arc_requests', orgColumn: 'organization_id', homeColumn: 'unit_id', softDelete: true },
  violation: { table: 'hoa_violations', orgColumn: 'org_id', homeColumn: 'property_id', softDelete: true },
  communication_thread: { table: 'communication_threads', orgColumn: 'organization_id', homeColumn: null, softDelete: false },
}

export type LinkTargetCheck =
  | { ok: true; unitId: string | null; propertyId: string | null }
  | { ok: false; reason: 'not_found' | 'failed' }

/**
 * Does `id` name a live record of `type` in `orgId`? Returns the record's
 * home key, so a caller can also require it to be on the thread's home.
 * The org is checked by the query AND on the returned row.
 */
export async function verifyLinkTarget(db: Db, orgId: string, type: LinkType, id: string): Promise<LinkTargetCheck> {
  const t = LINK_TARGETS[type]
  const columns = ['id', t.orgColumn, t.homeColumn].filter(Boolean).join(', ')
  let q = (db as unknown as Loose).from(t.table).select(columns).eq('id', id).eq(t.orgColumn, orgId)
  if (t.softDelete) q = q.is('deleted_at', null)
  const { data, error } = await q.maybeSingle()
  if (error) {
    console.error('verifyLinkTarget: read failed', { orgId, type, code: error.code ?? null })
    return { ok: false, reason: 'failed' }
  }
  const row = data as Record<string, string | null> | null
  if (!row || row.id !== id || row[t.orgColumn] !== orgId) return { ok: false, reason: 'not_found' }
  return {
    ok: true,
    unitId: t.homeColumn === 'unit_id' ? (row.unit_id ?? null) : null,
    propertyId: t.homeColumn === 'property_id' ? (row.property_id ?? null) : null,
  }
}

export type WriteLinkResult = { ok: true } | { ok: false; error: string }

export const LINK_ERRORS = {
  thread: 'Thread not found.',
  target: 'That record wasn’t found in this community.',
  failed: 'Could not link this thread. Try again.',
} as const

/** Link a thread to a record after both checks. Idempotent (a repeat link is a no-op). */
export async function writeThreadLink(
  db: Db,
  input: { orgId: string; userId: string; threadId: string; type: LinkType; resourceId: string },
): Promise<WriteLinkResult> {
  const { orgId, threadId, type, resourceId } = input
  const { data: thread, error: threadError } = await db
    .from('inbox_threads')
    .select('id')
    .eq('id', threadId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (threadError) {
    console.error('writeThreadLink: thread read failed', { orgId, threadId, code: threadError.code })
    return { ok: false, error: LINK_ERRORS.failed }
  }
  if (!thread) return { ok: false, error: LINK_ERRORS.thread }

  const target = await verifyLinkTarget(db, orgId, type, resourceId)
  if (!target.ok) return { ok: false, error: target.reason === 'failed' ? LINK_ERRORS.failed : LINK_ERRORS.target }

  const { error } = await db.from('inbox_thread_links').upsert(
    {
      organization_id: orgId,
      thread_id: threadId,
      resource_type: type,
      resource_id: resourceId,
      created_by: input.userId,
    },
    { onConflict: 'thread_id,resource_type,resource_id', ignoreDuplicates: true },
  )
  if (error) {
    console.error('writeThreadLink: insert failed', { orgId, threadId, type, code: error.code })
    return { ok: false, error: linkWriteError(error.code) }
  }
  return { ok: true }
}

/**
 * The message for a failed link insert. 23503 is 0067's validation trigger
 * (or the thread FK): the thread or the record is not in this org. Only
 * distinguished once M3_APPLIED; before that every failure is generic.
 */
export function linkWriteError(code: string | undefined, live: boolean = M3_APPLIED): string {
  return live && code === '23503' ? LINK_ERRORS.target : LINK_ERRORS.failed
}
