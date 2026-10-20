/**
 * Draft-on-open (BL-101 A3): decide whether opening a thread should start
 * an AI draft by itself, so the board no longer clicks "Draft a reply" and
 * waits on every thread.
 *
 * Drafting happens when a board member OPENS a thread, never at ingest:
 * spam and newsletters are never drafted unless someone looks at them, and
 * the model is not paid for threads nobody reads.
 *
 * "Once per thread version". The version is the newest inbound message.
 * A draft row created after that message already answers this version
 * whatever state it is in, so reopening the thread never spends a second
 * model call. Only a resident writing again (a new version) starts a new
 * draft. The browser keeps a per-version key too (DraftPanel), so a
 * failed or rate-limited attempt is not retried in a loop.
 *
 * Never automatic:
 *   - a live draft ('draft', 'queued', 'sending'): it would be displaced;
 *   - a 'failed' send: whether the resident already got it is unknown,
 *     and a fresh draft there must be a human's choice (see DraftPanel);
 *   - a thread filed under a vendor, or filed or trashed in Gmail;
 *   - a closed thread, or one whose newest message is the board's own;
 *   - an org that set `compliance_settings.inbox_autodraft = false`.
 *
 * Reads only, org-scoped, ids in logs.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'

type Db = SupabaseClient<Database>

export type AutoDraftSkip =
  | 'disabled_for_org'
  | 'vendor_thread'
  | 'filed_in_gmail'
  | 'closed'
  | 'no_inbound'
  | 'live_draft'
  | 'failed_send'
  | 'already_drafted'

export type AutoDraftDecision = { draft: true; version: string } | { draft: false; reason: AutoDraftSkip }

export interface AutoDraftInput {
  enabledForOrg: boolean
  vendorFiled: boolean
  gmailState: string
  threadStatus: string
  /** The thread's newest message, either direction. */
  latestMessage: { id: string; direction: string; sentAt: string | null } | null
  /** The thread's newest draft row, any kind. */
  latestDraft: { status: string; createdAt: string } | null
}

export function decideAutoDraft(input: AutoDraftInput): AutoDraftDecision {
  if (!input.enabledForOrg) return { draft: false, reason: 'disabled_for_org' }
  if (input.vendorFiled) return { draft: false, reason: 'vendor_thread' }
  if (input.gmailState === 'archived' || input.gmailState === 'trashed') {
    return { draft: false, reason: 'filed_in_gmail' }
  }
  if (input.threadStatus === 'closed') return { draft: false, reason: 'closed' }
  const latest = input.latestMessage
  if (!latest || latest.direction !== 'inbound') return { draft: false, reason: 'no_inbound' }

  const draft = input.latestDraft
  if (draft) {
    if (draft.status === 'draft' || draft.status === 'queued' || draft.status === 'sending') {
      return { draft: false, reason: 'live_draft' }
    }
    if (draft.status === 'failed') return { draft: false, reason: 'failed_send' }
    // 'sent' / 'cancelled': only a NEWER inbound message makes a new version.
    const draftAt = Date.parse(draft.createdAt)
    const messageAt = latest.sentAt ? Date.parse(latest.sentAt) : Number.NaN
    if (!Number.isFinite(messageAt) || !Number.isFinite(draftAt) || draftAt >= messageAt) {
      return { draft: false, reason: 'already_drafted' }
    }
  }
  return { draft: true, version: latest.id }
}

/** `compliance_settings.inbox_autodraft === false` on any of the org's associations turns it off. */
export function autoDraftEnabled(settingsRows: Array<{ compliance_settings: unknown }>): boolean {
  return !settingsRows.some((row) => {
    const settings = row.compliance_settings
    return (
      Boolean(settings) &&
      typeof settings === 'object' &&
      (settings as Record<string, unknown>).inbox_autodraft === false
    )
  })
}

/**
 * Loads the inputs and decides. A failed read decides "don't draft" (logged
 * by code): the cost of a missed auto-draft is one click on the manual
 * button, while drafting on a bad read could displace a live draft.
 */
export async function loadAutoDraftDecision(
  db: Db,
  orgId: string,
  threadId: string,
): Promise<AutoDraftDecision> {
  const [threadRes, messageRes, draftRes, settingsRes] = await Promise.all([
    db
      .from('inbox_threads')
      .select('id, status, vendor_id, gmail_state')
      .eq('organization_id', orgId)
      .eq('id', threadId)
      .maybeSingle(),
    db
      .from('inbox_messages')
      .select('id, direction, sent_at')
      .eq('organization_id', orgId)
      .eq('thread_id', threadId)
      .order('sent_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('inbox_drafts')
      .select('status, created_at')
      .eq('organization_id', orgId)
      .eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('associations').select('compliance_settings').eq('organization_id', orgId),
  ])

  const failed = [
    ['inbox_threads', threadRes.error],
    ['inbox_messages', messageRes.error],
    ['inbox_drafts', draftRes.error],
    ['associations', settingsRes.error],
  ].find(([, error]) => error) as [string, { code?: string }] | undefined
  if (failed) {
    console.error('loadAutoDraftDecision: read failed', { threadId, table: failed[0], code: failed[1].code })
    return { draft: false, reason: 'live_draft' }
  }
  const thread = threadRes.data
  if (!thread) return { draft: false, reason: 'no_inbound' }

  return decideAutoDraft({
    enabledForOrg: autoDraftEnabled((settingsRes.data ?? []) as Array<{ compliance_settings: unknown }>),
    vendorFiled: Boolean(thread.vendor_id),
    gmailState: thread.gmail_state ?? 'unknown',
    threadStatus: thread.status,
    latestMessage: messageRes.data
      ? { id: messageRes.data.id, direction: messageRes.data.direction, sentAt: messageRes.data.sent_at }
      : null,
    latestDraft: draftRes.data ? { status: draftRes.data.status, createdAt: draftRes.data.created_at } : null,
  })
}
