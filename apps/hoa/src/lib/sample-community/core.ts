/**
 * Fill and remove the sample community (PayHOA parity A4).
 *
 * Plain module, no 'use server': the gated entry points are in actions.ts.
 * Every function takes the CALLER'S client (RLS is the second wall) and an
 * org id the caller's gate already resolved. Every query below names that
 * org.
 *
 * Nothing in here sends anything. This file imports no email, SMS, push,
 * Inngest or outbound-guard code (a test reads the source to prove it),
 * and every row is written straight to its table: no helper that notifies
 * is called. No sample resident gets an auth account: owners are plain
 * text on the home, and the ticket, request and message rows use the
 * signed-in board member's own id as the author, which is the only
 * account that exists.
 *
 * How rows are marked: see data.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { addCalendarDays } from '@/lib/association-time'
import { chunk, readAll } from '@/lib/supabase/read-all'
import { createLot } from '@/lib/properties/lot'
import { unitIdsForProperties } from '@/lib/properties/resolve'
import { setUpAssociationCore } from '@/lib/association-setup'
import { draftRowFields, DRAFT_STATE_VERSION, type ComposerDraftState } from '@/lib/communications/drafts'
import {
  SAMPLE_ANNOUNCEMENT,
  SAMPLE_ARC,
  SAMPLE_DRAFT_PREFIX,
  SAMPLE_DUES_AMOUNT,
  SAMPLE_DUES_RATE_NOTE,
  SAMPLE_EMAIL_DOMAIN,
  SAMPLE_MEETING,
  SAMPLE_MEMO_PREFIX,
  SAMPLE_NOTES_PREFIX,
  SAMPLE_TEXT_PREFIX,
  SAMPLE_TICKETS,
  SAMPLE_VIOLATIONS,
  isSampleHome,
  sampleHomeNote,
  sampleHomes,
  samplePaidFlags,
} from './data'

type Db = SupabaseClient<Database>
// dues_rates is not in the generated types (CLAUDE.md footgun 3).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any }

export interface SampleState {
  /** Sample homes that still exist (live or not). */
  sampleHomes: number
  /** Live homes that are NOT sample homes. Above 0 means the fill is refused. */
  realHomes: number
}

function logFailure(step: string, error: unknown): void {
  // Codes only: no names, addresses or row values in logs.
  const e = error as { code?: string } | null
  console.error('[sample-community] step failed', { step, code: e?.code ?? null })
}

// ─── Reading what exists ────────────────────────────────────────────

interface SampleHomeRow {
  id: string
  deleted_at: string | null
}

/** Every sample home in the org, soft-deleted ones too. Both markers must match. */
async function readSampleHomes(db: Db, orgId: string): Promise<SampleHomeRow[]> {
  const rows = await readAll<{ id: string; notes: string | null; owner_email: string | null; deleted_at: string | null }>(
    (from, to) =>
      db
        .from('hoa_properties')
        .select('id, notes, owner_email, deleted_at')
        .eq('org_id', orgId)
        .ilike('notes', `${SAMPLE_NOTES_PREFIX}%`)
        .ilike('owner_email', `%${SAMPLE_EMAIL_DOMAIN}`)
        .order('id')
        .range(from, to),
    (error) => Object.assign(new Error('sample homes read failed'), { code: error.code }),
  )
  // Re-check in code too: the filter above is a narrowing, not the rule.
  return rows.filter(isSampleHome).map((r) => ({ id: r.id, deleted_at: r.deleted_at ?? null }))
}

async function readSampleUnitIds(db: Db, orgId: string, propertyIds: string[]): Promise<string[]> {
  // Through the bridge module (the ratchet forbids reading the column here).
  // createLot makes exactly one unit per home, so the canonical unit is the unit.
  const map = await unitIdsForProperties(db, orgId, propertyIds)
  return [...map.values()]
}

/** How many sample homes there are and whether any real homes exist. Null when a read failed. */
export async function loadSampleState(db: Db, orgId: string): Promise<SampleState | null> {
  try {
    const head = { count: 'exact', head: true } as const
    const [homes, liveProps, allUnits] = await Promise.all([
      readSampleHomes(db, orgId),
      db.from('hoa_properties').select('id', head).eq('org_id', orgId).is('deleted_at', null),
      db.from('units').select('id', head).eq('organization_id', orgId),
    ])
    if (liveProps.error || allUnits.error) {
      logFailure('state.counts', liveProps.error ?? allUnits.error)
      return null
    }
    const unitIds = await readSampleUnitIds(
      db,
      orgId,
      homes.map((h) => h.id),
    )
    const sampleLive = homes.filter((h) => h.deleted_at === null).length
    const realProps = Math.max(0, (liveProps.count ?? 0) - sampleLive)
    const realUnits = Math.max(0, (allUnits.count ?? 0) - unitIds.length)
    return { sampleHomes: homes.length, realHomes: realProps + realUnits }
  } catch (err) {
    logFailure('state', err)
    return null
  }
}

// ─── Fill ───────────────────────────────────────────────────────────

export interface FillContext {
  orgId: string
  /** The signed-in board member. Authors the sample tickets and requests. */
  userId: string
  /** The association's today, YYYY-MM-DD. */
  today: string
}

export type FillResult =
  | { ok: true; homes: number }
  | { ok: false; error: string }

const FILL_FAILED = 'We couldn’t add the sample community. Nothing was kept. Try again in a minute.'

async function insertRows(db: Db, step: string, table: string, rows: Record<string, unknown>[]): Promise<string[] | null> {
  const { data, error } = await (db as unknown as LooseDb).from(table).insert(rows).select('id')
  if (error || !data) {
    logFailure(step, error)
    return null
  }
  return (data as Array<{ id: string }>).map((r) => r.id)
}

export function sampleComposerState(): ComposerDraftState {
  return {
    v: DRAFT_STATE_VERSION,
    step: 0,
    templateId: '',
    baseCategory: 'announcement',
    audience: 'everyone',
    selectedPropertyId: '',
    checkedResidentIds: [],
    checkedBoardIds: [],
    manualContacts: [],
    selectedStreetKey: '',
    streetOwnersOnly: false,
    answers: {},
    subject: SAMPLE_ANNOUNCEMENT.subject,
    bodyHtml: SAMPLE_ANNOUNCEMENT.bodyHtml,
    channels: ['email'],
    urgency: 'routine',
    channelsTouched: false,
    scheduledFor: '',
    spanish: null,
    officialNotice: false,
    followUp: null,
    meetingNotice: null,
  }
}

export async function fillSampleCommunity(db: Db, ctx: FillContext): Promise<FillResult> {
  const { orgId, userId, today } = ctx

  // Refuse while real data exists, and refuse a second fill.
  const state = await loadSampleState(db, orgId)
  if (!state) return { ok: false, error: 'We couldn’t check your homes just now. Try again.' }
  if (state.realHomes > 0) {
    return { ok: false, error: 'You already have homes in your account, so the sample community is not available.' }
  }
  if (state.sampleHomes > 0) {
    return { ok: false, error: 'The sample community is already here. Remove it first if you want to start it again.' }
  }

  // The association and an open fiscal year are needed for dues.
  const { data: assocRows, error: assocErr } = await db
    .from('associations')
    .select('id')
    .eq('organization_id', orgId)
    .order('name', { ascending: true })
    .limit(1)
  if (assocErr) {
    logFailure('association.read', assocErr)
    return { ok: false, error: 'We couldn’t check your association just now. Try again.' }
  }
  const associationId = (assocRows ?? [])[0]?.id as string | undefined
  if (!associationId) {
    return { ok: false, error: 'Set up your association first (step 1 of the checklist), then try the sample community.' }
  }

  const readPeriod = () =>
    db
      .from('fiscal_periods')
      .select('id, start_date')
      .eq('organization_id', orgId)
      .eq('association_id', associationId)
      .eq('status', 'open')
      .lte('start_date', today)
      .gte('end_date', today)
      .order('start_date', { ascending: false })
      .limit(1)
  let period = await readPeriod()
  if (period.error) {
    logFailure('period.read', period.error)
    return { ok: false, error: 'We couldn’t check your fiscal year just now. Try again.' }
  }
  if (!(period.data ?? [])[0]) {
    // Idempotent: only adds the funds, chart and year that are missing.
    const opened = await setUpAssociationCore(db, { orgId, userId, year: Number(today.slice(0, 4)), associationId })
    if (!opened.ok) return { ok: false, error: opened.error }
    period = await readPeriod()
    if (period.error || !(period.data ?? [])[0]) {
      logFailure('period.reread', period.error)
      return { ok: false, error: 'We couldn’t open your fiscal year. Try again.' }
    }
  }
  const periodRow = (period.data ?? [])[0] as { id: string; start_date: string }

  const bail = async (step: string): Promise<FillResult> => {
    logFailure(step, null)
    // Take back whatever was written so far. Never leaves half a community.
    const undone = await removeSampleCommunity(db, orgId)
    if (!undone.ok) console.error('[sample-community] cleanup after a failed fill also failed')
    return { ok: false, error: FILL_FAILED }
  }

  // 1. Homes, units and owners, through the same helper the Add property form uses.
  const homes = sampleHomes()
  const propertyIds: string[] = []
  const unitIds: string[] = []
  for (const h of homes) {
    const created = await createLot(db, {
      orgId,
      associationId,
      address: h.address,
      unitNumber: h.unitNumber,
      owner: { name: h.ownerName, email: h.ownerEmail, phone: h.ownerPhone },
      notes: sampleHomeNote(),
      today,
      userId,
    })
    if (!created.ok) return bail('create.lot')
    propertyIds.push(created.data.propertyId)
    unitIds.push(created.data.unitId)
  }

  // 2. A dues rate, unless the association already has a schedule.
  if (M5_APPLIED) {
    const loose = db as unknown as LooseDb
    const existing = await loose.from('dues_rates').select('id').eq('association_id', associationId).limit(1)
    if (existing.error) {
      logFailure('dues_rate.read', existing.error)
    } else if ((existing.data ?? []).length === 0) {
      const { error } = await loose.from('dues_rates').insert({
        organization_id: orgId,
        association_id: associationId,
        effective_from: periodRow.start_date,
        basis: 'per_home',
        amount_cents: SAMPLE_DUES_AMOUNT * 100,
        frequency: 'monthly',
        notes: SAMPLE_DUES_RATE_NOTE,
      })
      // A missing rate is cosmetic; the rest of the sample still stands.
      if (error) logFailure('dues_rate.insert', error)
    }
  }

  // 3. One month of dues: written straight to assessments (no journal
  //    entries, so the sample never touches the books). Due 20 days ago, so
  //    every unpaid one reads as overdue.
  const due = addCalendarDays(today, -20) < periodRow.start_date ? periodRow.start_date : addCalendarDays(today, -20)
  const paid = samplePaidFlags()
  const assessments = await insertRows(
    db,
    'assessments.insert',
    'assessments',
    unitIds.map((unitId, i) => ({
      organization_id: orgId,
      association_id: associationId,
      unit_id: unitId,
      fiscal_period_id: periodRow.id,
      assessment_type: 'regular',
      amount: SAMPLE_DUES_AMOUNT,
      due_date: due,
      memo_code: `${SAMPLE_MEMO_PREFIX}${i + 1}-DUES`,
      status: paid[i] ? 'paid' : 'open',
    })),
  )
  if (!assessments) return bail('assessments')

  // 4. Violations at three stages.
  const violationIds = await insertRows(
    db,
    'violations.insert',
    'hoa_violations',
    SAMPLE_VIOLATIONS.map((v) => ({
      org_id: orgId,
      property_id: propertyIds[v.homeIndex],
      violation_type: v.type,
      description: v.description,
      severity: v.severity,
      status: v.stage,
      ccr_section: v.ccr,
      cure_period_days: v.curePeriodDays,
      created_by: userId,
      notice_sent_at: v.stage === 'open' ? null : new Date(`${addCalendarDays(today, -6)}T15:00:00Z`).toISOString(),
      resolved_at: v.stage === 'resolved' ? new Date(`${addCalendarDays(today, -2)}T15:00:00Z`).toISOString() : null,
      resolution_note: v.stage === 'resolved' ? `${SAMPLE_TEXT_PREFIX} the owner fixed it.` : null,
    })),
  )
  if (!violationIds) return bail('violations')

  // 5. Two tickets, one with a resident reply.
  const ticketIds = await insertRows(
    db,
    'tickets.insert',
    'tickets',
    SAMPLE_TICKETS.map((t) => ({
      organization_id: orgId,
      association_id: associationId,
      unit_id: unitIds[t.homeIndex],
      submitted_by: userId,
      category: t.category,
      priority: t.priority,
      status: t.status,
      subject: t.subject,
      description: t.description,
    })),
  )
  if (!ticketIds) return bail('tickets')
  const messages = SAMPLE_TICKETS.flatMap((t, i) =>
    t.thread.map((m) => ({
      ticket_id: ticketIds[i],
      author_id: userId,
      author_role: m.role,
      body: m.body,
      internal: false,
    })),
  )
  if (messages.length > 0 && !(await insertRows(db, 'ticket_messages.insert', 'ticket_messages', messages))) {
    return bail('ticket_messages')
  }

  // 6. Two architectural requests.
  const arcIds = await insertRows(
    db,
    'arc.insert',
    'arc_requests',
    SAMPLE_ARC.map((a) => ({
      organization_id: orgId,
      association_id: associationId,
      unit_id: unitIds[a.homeIndex],
      submitted_by: userId,
      category: a.category,
      summary: a.summary,
      scope_description: a.scope,
      contractor_name: a.contractor,
      status: a.status,
    })),
  )
  if (!arcIds) return bail('arc')

  // 7. An announcement DRAFT. status 'draft' is never delivered: the send
  //    path inserts its own row and the dispatcher claims only 'scheduled'.
  const fields = draftRowFields(sampleComposerState())
  const draft = await insertRows(db, 'communications.insert', 'communications', [
    {
      ...fields,
      organization_id: orgId,
      association_id: associationId,
      status: 'draft',
      source: 'manual',
      created_by: userId,
    },
  ])
  if (!draft) return bail('communications')

  // 8. One upcoming meeting with an agenda (a scheduled meeting is a draft
  //    minutes row; the agenda lives in ai_summary, as scheduleMeeting does).
  const meeting = await insertRows(db, 'meeting.insert', 'hoa_meeting_minutes', [
    {
      org_id: orgId,
      meeting_date: addCalendarDays(today, SAMPLE_MEETING.daysAhead),
      meeting_type: SAMPLE_MEETING.type,
      ai_summary: SAMPLE_MEETING.agenda,
      raw_transcript: SAMPLE_MEETING.marker,
      status: 'draft',
      created_by: userId,
    },
  ])
  if (!meeting) return bail('meeting')

  return { ok: true, homes: homes.length }
}

// ─── Remove ─────────────────────────────────────────────────────────

export type RemoveResult = { ok: true; removedHomes: number } | { ok: false; error: string }

const REMOVE_FAILED =
  'We couldn’t remove all of the sample data. Anything you added yourself was left alone. Try again, or contact support.'

/**
 * Delete exactly the sample rows. A child row goes only when it hangs off a
 * sample home AND carries its own sample marker; the three rows with no home
 * go only on their own marker. Real rows have neither, so they are never
 * matched. Children are deleted before the units and homes they point at.
 */
export async function removeSampleCommunity(db: Db, orgId: string): Promise<RemoveResult> {
  try {
    const homes = await readSampleHomes(db, orgId)
    const propertyIds = homes.map((h) => h.id)
    const unitIds = await readSampleUnitIds(db, orgId, propertyIds)
    const loose = db as unknown as LooseDb

    // Rows with no home: marker only. Soft-deleted where the app soft-deletes.
    const softMarkers = await Promise.all([
      loose
        .from('communications')
        .update({ deleted_at: new Date().toISOString() })
        .eq('organization_id', orgId)
        .eq('status', 'draft')
        .ilike('subject', `${SAMPLE_DRAFT_PREFIX}%`)
        .is('deleted_at', null),
      loose
        .from('hoa_meeting_minutes')
        .update({ deleted_at: new Date().toISOString() })
        .eq('org_id', orgId)
        .eq('status', 'draft')
        .ilike('raw_transcript', `${SAMPLE_NOTES_PREFIX}%`)
        .is('deleted_at', null),
    ])
    for (const r of softMarkers) if (r.error) throw Object.assign(new Error('soft delete failed'), { code: r.error.code })

    if (M5_APPLIED) {
      const rate = await loose
        .from('dues_rates')
        .delete()
        .eq('organization_id', orgId)
        .ilike('notes', `${SAMPLE_NOTES_PREFIX}%`)
      if (rate.error) throw Object.assign(new Error('dues rate delete failed'), { code: rate.error.code })
    }

    // Children of the sample homes.
    for (const ids of chunk(unitIds)) {
      const tickets = await readAll<{ id: string }>(
        (from, to) =>
          db
            .from('tickets')
            .select('id')
            .eq('organization_id', orgId)
            .in('unit_id', ids)
            .ilike('subject', `${SAMPLE_TEXT_PREFIX}%`)
            .order('id')
            .range(from, to),
        (error) => Object.assign(new Error('tickets read failed'), { code: error.code }),
      )
      for (const t of chunk(tickets.map((r) => r.id))) {
        const m = await db.from('ticket_messages').delete().in('ticket_id', t)
        if (m.error) throw Object.assign(new Error('messages delete failed'), { code: m.error.code })
        const d = await db.from('tickets').delete().eq('organization_id', orgId).in('id', t)
        if (d.error) throw Object.assign(new Error('tickets delete failed'), { code: d.error.code })
      }

      const arcs = await readAll<{ id: string }>(
        (from, to) =>
          db
            .from('arc_requests')
            .select('id')
            .eq('organization_id', orgId)
            .in('unit_id', ids)
            .ilike('summary', `${SAMPLE_TEXT_PREFIX}%`)
            .order('id')
            .range(from, to),
        (error) => Object.assign(new Error('arc read failed'), { code: error.code }),
      )
      for (const a of chunk(arcs.map((r) => r.id))) {
        const m = await db.from('arc_request_messages').delete().in('arc_request_id', a)
        if (m.error) throw Object.assign(new Error('arc messages delete failed'), { code: m.error.code })
        const d = await db.from('arc_requests').delete().eq('organization_id', orgId).in('id', a)
        if (d.error) throw Object.assign(new Error('arc delete failed'), { code: d.error.code })
      }

      const dues = await db
        .from('assessments')
        .delete()
        .eq('organization_id', orgId)
        .in('unit_id', ids)
        .ilike('memo_code', `${SAMPLE_MEMO_PREFIX}%`)
      if (dues.error) throw Object.assign(new Error('assessments delete failed'), { code: dues.error.code })

      const owners = await db
        .from('ownerships')
        .delete()
        .eq('organization_id', orgId)
        .in('unit_id', ids)
        .ilike('owner_email', `%${SAMPLE_EMAIL_DOMAIN}`)
      if (owners.error) throw Object.assign(new Error('owners delete failed'), { code: owners.error.code })
    }

    for (const ids of chunk(propertyIds)) {
      const v = await db
        .from('hoa_violations')
        .delete()
        .eq('org_id', orgId)
        .in('property_id', ids)
        .ilike('description', `${SAMPLE_TEXT_PREFIX}%`)
      if (v.error) throw Object.assign(new Error('violations delete failed'), { code: v.error.code })
    }

    // Units, then the homes themselves (re-checked by both markers).
    for (const ids of chunk(unitIds)) {
      const u = await db.from('units').delete().eq('organization_id', orgId).in('id', ids)
      if (u.error) throw Object.assign(new Error('units delete failed'), { code: u.error.code })
    }
    for (const ids of chunk(propertyIds)) {
      const p = await db
        .from('hoa_properties')
        .delete()
        .eq('org_id', orgId)
        .in('id', ids)
        .ilike('notes', `${SAMPLE_NOTES_PREFIX}%`)
        .ilike('owner_email', `%${SAMPLE_EMAIL_DOMAIN}`)
      if (p.error) throw Object.assign(new Error('homes delete failed'), { code: p.error.code })
    }

    return { ok: true, removedHomes: propertyIds.length }
  } catch (err) {
    logFailure('remove', err)
    return { ok: false, error: REMOVE_FAILED }
  }
}
