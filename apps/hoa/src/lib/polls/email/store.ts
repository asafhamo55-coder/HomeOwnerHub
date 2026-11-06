/**
 * The Supabase side of the poll email runner (./run.ts).
 *
 * Two callers, two clients:
 *   * the board's server action, with the BOARD MEMBER's own RLS client. The
 *     board can read polls, units, ownerships and preferences, and writes
 *     communications rows like every other board send. It has no read on
 *     the answer tables, so the tally comes from poll_results() (the caller
 *     passes `loadTally`).
 *   * the daily job, with the service-role client and a direct tally read
 *     (poll_results() needs a signed-in user).
 *
 * Reads and writes throw on error with the code only: a PostgrestError
 * message can echo row values.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PollResultRow } from '@homeowner-portal/db/polls-types'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { associationTimeZone } from '@/lib/association-time'
import { resolveAudience } from '@/lib/communications/audience'
import { loadPreferenceMap, prefsFor } from '@/lib/communications/preferences'
import { supabaseResidentNotifyStore } from '@/lib/resident-notify/store'
import {
  POLL_EMAIL_RESOURCE_TYPE,
  pollEmailCommunicationId,
  type PollEmailContext,
  type PollEmailKind,
  type PollEmailStore,
  type PollRecipient,
} from './run'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }

function fail(what: string, error: { code?: string } | null): Error {
  return new Error(`poll-email: ${what} failed (${error?.code ?? 'unknown'})`)
}

/** The tally straight from the answer tables. Service-role only (no RLS read for the board). */
export async function tallyFromTables(db: Db, pollId: string): Promise<PollResultRow[]> {
  const opts = await db.from('poll_options').select('id, label, position').eq('poll_id', pollId).order('position', { ascending: true })
  if (opts.error) throw fail('options read', opts.error)
  const votes = new Map<string, number>()
  let homes = 0
  for (let from = 0; ; from += 1000) {
    const page = await db
      .from('poll_responses')
      .select('id, poll_response_choices(option_id)')
      .eq('poll_id', pollId)
      .order('id')
      .range(from, from + 999)
    if (page.error) throw fail('responses read', page.error)
    const rows = (page.data ?? []) as Array<{ poll_response_choices: Array<{ option_id: string }> | null }>
    for (const r of rows) {
      homes += 1
      for (const c of r.poll_response_choices ?? []) votes.set(c.option_id, (votes.get(c.option_id) ?? 0) + 1)
    }
    if (rows.length < 1000) break
  }
  return ((opts.data ?? []) as Array<{ id: string; label: string; position: number }>).map((o) => ({
    option_id: o.id,
    label: o.label,
    option_position: o.position,
    votes: votes.get(o.id) ?? 0,
    homes_answered: homes,
  }))
}

type PollRow = {
  id: string
  organization_id: string
  association_id: string
  title: string
  description: string | null
  allow_multiple: boolean
  results_visibility: 'after_close' | 'live'
  status: 'draft' | 'open' | 'closed'
  closes_at: string | null
}

export function supabasePollEmailStore(
  db: Db,
  loadTally: (pollId: string) => Promise<PollResultRow[]>,
): PollEmailStore {
  const shared = supabaseResidentNotifyStore(db)
  return {
    async loadContext(pollId): Promise<PollEmailContext | null> {
      const p = await db
        .from('polls')
        .select('id, organization_id, association_id, title, description, allow_multiple, results_visibility, status, closes_at')
        .eq('id', pollId)
        .maybeSingle()
      if (p.error) throw fail('poll read', p.error)
      const poll = p.data as PollRow | null
      if (!poll) return null

      const a = await db
        .from('associations')
        .select('id, name, type, organization_id, state')
        .eq('id', poll.association_id)
        .maybeSingle()
      if (a.error) throw fail('association read', a.error)
      const assoc = a.data as { id: string; name: string; type: string | null; organization_id: string; state: string | null } | null
      if (!assoc || assoc.organization_id !== poll.organization_id) return null

      const o = await db.from('poll_options').select('label, position').eq('poll_id', pollId).order('position', { ascending: true })
      if (o.error) throw fail('options read', o.error)

      return {
        association: {
          id: assoc.id,
          name: assoc.name,
          type: assoc.type,
          organizationId: assoc.organization_id,
          timeZone: associationTimeZone(assoc),
        },
        poll: {
          id: poll.id,
          associationId: poll.association_id,
          title: poll.title,
          description: poll.description,
          allowMultiple: poll.allow_multiple,
          resultsVisibility: poll.results_visibility,
          status: poll.status,
          closesAt: poll.closes_at,
        },
        options: ((o.data ?? []) as Array<{ label: string }>).map((r) => r.label),
      }
    },

    loadTally,

    async loadRecipients(association) {
      // The same audience the board's "everyone" announcement uses: the
      // owner (else the tenant) of each home in THIS association.
      const audience = await resolveAudience(db as unknown as SupabaseClient<never>, association.id, { kind: 'everyone' })
      const prefs = await loadPreferenceMap(db as unknown as SupabaseClient<never>, association.organizationId)
      // Refuse rather than default to "send to everyone".
      if (!prefs.ok) throw fail('preferences read', { code: 'prefs_read' })
      const seen = new Set<string>()
      const out: PollRecipient[] = []
      let optedOut = 0
      for (const r of audience.recipients) {
        const email = r.email?.trim()
        if (!email) continue
        const key = email.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        if (!prefsFor(r.userId, prefs.map).email) {
          optedOut += 1
          continue
        }
        out.push({ unitId: r.unitId, userId: r.userId, name: r.recipientName, email })
      }
      return { recipients: out, optedOut }
    },

    async communicationStatus(id) {
      const { data, error } = await db.from('communications').select('status').eq('id', id).maybeSingle()
      if (error) throw fail('communication read', error)
      return (data as { status: string } | null)?.status ?? null
    },

    orgSandbox(organizationId) {
      return fetchOrgSandbox(db, organizationId)
    },

    async claim(c) {
      const summary = `Poll ${c.kind === 'opened' ? 'invitation' : 'results'}: ${c.recipientCount} ${c.recipientCount === 1 ? 'home' : 'homes'}`
      const { error } = await db.from('communications').insert({
        id: c.id,
        organization_id: c.organizationId,
        association_id: c.associationId,
        category: 'announcement',
        subject: c.subject,
        body_html: c.html,
        body_text: c.text,
        channels: ['email'],
        // Ids only: the addresses live on the recipient rows.
        audience_definition: { kind: 'everyone', summary },
        audience_summary: summary,
        status: 'sending',
        source: 'workflow',
        related_resource: {
          type: POLL_EMAIL_RESOURCE_TYPE,
          id: c.pollId,
          event: c.kind,
          auto: c.trigger === 'auto',
        },
      })
      if (!error) return { ok: true }
      // 23505 unique_violation on the primary key: this email was handled.
      if (error.code === '23505') return { ok: false, reason: 'exists' }
      throw fail('claim', error)
    },

    async insertRecipients(communicationId, organizationId, rows) {
      const { data, error } = await db
        .from('communication_recipients')
        .insert(
          rows.map((r) => ({
            organization_id: organizationId,
            communication_id: communicationId,
            unit_id: r.unitId,
            user_id: r.userId,
            recipient_name: r.name,
            email: r.email,
            phone: null,
            channel: 'email',
            delivery_status: 'queued',
          })),
        )
        .select('id, email')
      if (error) throw fail('recipient insert', error)
      return (data ?? []) as Array<{ id: string; email: string }>
    },

    markRecipient: shared.markRecipient,
    finish: shared.finish,
  }
}

// ─── the board's "Emailed N homes on <date>" ────────────────────────

export interface PollEmailSummaryItem {
  /** Homes the email reached. */
  homes: number
  /** ISO instant the send finished (or started, if the finish was not recorded). */
  at: string
  status: string
}

export interface PollEmailSummary {
  opened: PollEmailSummaryItem | null
  results: PollEmailSummaryItem | null
}

async function summaryFor(db: Db, pollId: string, kind: PollEmailKind): Promise<PollEmailSummaryItem | null> {
  const id = pollEmailCommunicationId(pollId, kind)
  const c = await db.from('communications').select('status, sent_at, created_at').eq('id', id).maybeSingle()
  if (c.error) throw fail('communication read', c.error)
  const row = c.data as { status: string; sent_at: string | null; created_at: string } | null
  if (!row) return null
  const n = await db
    .from('communication_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('communication_id', id)
    .eq('delivery_status', 'sent')
  if (n.error) throw fail('recipient count', n.error)
  return { homes: Number(n.count ?? 0), at: row.sent_at ?? row.created_at, status: row.status }
}

/** What has gone out for this poll. Board client. Null on a failed read: the page just shows nothing. */
export async function loadPollEmailSummary(db: Db, pollId: string): Promise<PollEmailSummary | null> {
  try {
    const [opened, results] = await Promise.all([summaryFor(db, pollId, 'opened'), summaryFor(db, pollId, 'results')])
    return { opened, results }
  } catch (err) {
    console.error('[poll-email] summary failed', { error: err instanceof Error ? err.name : 'unknown' })
    return null
  }
}
