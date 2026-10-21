'use server'

/**
 * BL-133: the fine hearing's two writes (migration 0068, M4_APPLIED).
 *
 *   saveViolationHearing — the board records or updates the hearing for a
 *     violation (date, time, place, panel, notice-sent day, outcome,
 *     findings and payment-due days). Board/admin only, re-checked first
 *     (a server action is a public endpoint); written with the board's own
 *     client (0068 board-only RLS), one row per violation.
 *   requestViolationHearing — the resident asks for a hearing from their
 *     violation page. Written with the resident's OWN client through
 *     request_violation_hearing(), which checks in the database that the
 *     violation is on their home and still open, and never writes the
 *     board's columns. An impersonating admin reads but never writes.
 *
 * Flag off: both refuse with a plain message and touch nothing.
 *   cancelHearingAfterCure — BL-140: the violation was resolved before its
 *     hearing; the board cancels the hearing and records why (a reason
 *     code). Board/admin only. Every condition the card showed is
 *     re-checked here (violation resolved, hearing still requested or
 *     scheduled, cure not after the hearing day, reason allowed for the
 *     state). The audit row (ids and codes only) is written BEFORE the
 *     status change: no record, no cancellation.
 *
 * Nothing here sends anything to anyone: the hearing notice is drafted
 * from the violation page into the composer, where the board sends it.
 * Logs carry ids and error codes only (names and statements never).
 */

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { M4_APPLIED } from '@homeowner-portal/db/m4'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getResidentActor, IMPERSONATION_READONLY_MSG } from '@/lib/impersonation'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  HEARING_OUTCOMES,
  HEARING_STATUSES,
  HEARING_TABLE,
  MAX_LOCATION,
  MAX_PANEL,
  MAX_PANEL_NAME,
  MAX_STATEMENT,
  PANEL_ROLES,
  REQUEST_HEARING_RPC,
  HEARINGS_NOT_LIVE,
  hearingShapeErrors,
  hearingFromRow,
  HEARING_COLUMNS,
} from './rules'
import {
  CURE_CANCEL_AUDIT_ACTION,
  CURE_CANCEL_REASONS,
  cureBeforeHearingOffer,
  cureCancelAuditMetadata,
} from './cure'
import { loadOrgStateRules } from '@/lib/violation-cure-commitment'
import { currentTimeZone } from '@/lib/association-time-current'
import { dayOf } from '@/lib/association-time'

export type SaveHearingResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }
export type RequestHearingResult = { ok: true; requestedAt: string | null } | { ok: false; error: string; fieldErrors?: Record<string, string> }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any; rpc: (fn: string, args: Record<string, unknown>) => any }

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.')
  .nullable()
  .transform((v) => v || null)
const optionalText = (max: number, msg: string) =>
  z
    .string()
    .trim()
    .max(max, msg)
    .nullable()
    .transform((v) => (v ? v : null))

const SaveSchema = z.object({
  violationId: z.string().uuid('That violation isn’t valid.'),
  status: z.enum(HEARING_STATUSES),
  hearingOn: day,
  hearingTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Pick a time.')
    .nullable()
    .transform((v) => v || null),
  location: optionalText(MAX_LOCATION, `Keep the place under ${MAX_LOCATION} characters.`),
  panel: z
    .array(z.object({ name: z.string().trim().min(1, 'Enter a name.').max(MAX_PANEL_NAME, 'That name is too long.'), role: z.enum(PANEL_ROLES) }))
    .max(MAX_PANEL, `Up to ${MAX_PANEL} panel members.`),
  noticeSentOn: day,
  outcome: z.enum(HEARING_OUTCOMES).nullable(),
  decidedOn: day,
  findingsSentOn: day,
  paymentDueOn: day,
})
export type SaveHearingInput = z.input<typeof SaveSchema>

const FIELD = new Set(['hearingOn', 'hearingTime', 'location', 'panel', 'noticeSentOn', 'outcome', 'decidedOn', 'findingsSentOn', 'paymentDueOn', 'status'])

export async function saveViolationHearing(input: SaveHearingInput): Promise<SaveHearingResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!M4_APPLIED) return { ok: false, error: HEARINGS_NOT_LIVE }

  const parsed = SaveSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (FIELD.has(key) && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { ok: false, error: 'Some fields need attention.', fieldErrors }
  }
  const h = parsed.data
  const shape = hearingShapeErrors(h)
  if (Object.keys(shape).length > 0) return { ok: false, error: 'Some fields need attention.', fieldErrors: shape }

  const supabase = await getSupabaseServerClient()
  // The violation must be this org's (the 0068 trigger refuses another
  // org's too; this gives a plain message instead of a 23503).
  const { data: violation, error: vErr } = await supabase
    .from('hoa_violations')
    .select('id')
    .eq('id', h.violationId)
    .eq('org_id', gate.orgId)
    .is('deleted_at', null)
    .maybeSingle()
  if (vErr) {
    console.error('[violation-hearings] violation read failed', { code: vErr.code ?? null, violationId: h.violationId })
    return { ok: false, error: 'Couldn’t load the violation. Try again.' }
  }
  if (!violation) return { ok: false, error: 'We could not find that violation.' }

  const row = {
    organization_id: gate.orgId,
    violation_id: h.violationId,
    status: h.status,
    hearing_on: h.hearingOn,
    hearing_time: h.hearingTime,
    location: h.location,
    panel: h.panel,
    notice_sent_on: h.noticeSentOn,
    outcome: h.status === 'held' ? h.outcome : null,
    decided_on: h.status === 'held' ? h.decidedOn : null,
    findings_sent_on: h.findingsSentOn,
    payment_due_on: h.paymentDueOn,
    updated_at: new Date().toISOString(),
  }
  const { error } = await (supabase as unknown as LooseDb).from(HEARING_TABLE).upsert(row, { onConflict: 'violation_id' })
  if (error) {
    // Code only: a Postgres message can embed row values (names).
    console.error('[violation-hearings] save failed', { code: error.code ?? null, violationId: h.violationId })
    return { ok: false, error: 'Couldn’t save the hearing. Try again.' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    const { error: auditErr } = await supabase.from('audit_log').insert({
      action: 'violation.hearing_saved',
      org_id: gate.orgId,
      user_id: user.id,
      entity_type: 'hoa_violation',
      entity_id: h.violationId,
      metadata: { status: h.status, outcome: row.outcome, panel_size: h.panel.length },
    } as never)
    if (auditErr) console.error('[violation-hearings] audit failed', { code: auditErr.code ?? null, violationId: h.violationId })
  }

  revalidatePath(`/violations/${h.violationId}`)
  revalidatePath(`/resident/violations/${h.violationId}`)
  return { ok: true }
}

const RequestSchema = z.object({
  violationId: z.string().uuid('That notice isn’t valid.'),
  statement: z
    .string()
    .trim()
    .max(MAX_STATEMENT, 'Keep it under 4,000 characters.')
    .nullable()
    .transform((v) => (v ? v : null)),
})

export async function requestViolationHearing(violationId: string, statement: string | null): Promise<RequestHearingResult> {
  // Gate first: an impersonating admin reads the portal but never writes as the owner.
  const actor = await getResidentActor()
  if (actor.impersonating) return { ok: false, error: IMPERSONATION_READONLY_MSG }
  if (!M4_APPLIED) return { ok: false, error: 'Hearing requests aren’t available yet. Use Respond to the board below to ask for one.' }

  const parsed = RequestSchema.safeParse({ violationId, statement })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = String(issue?.path[0] ?? '')
    return { ok: false, error: issue?.message ?? 'Invalid input.', ...(field === 'statement' ? { fieldErrors: { statement: issue!.message } } : {}) }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data, error } = (await (supabase as unknown as LooseDb).rpc(REQUEST_HEARING_RPC, {
    p_violation_id: parsed.data.violationId,
    p_statement: parsed.data.statement,
  })) as { data: string | null; error: { code?: string } | null }
  if (error) {
    console.error('[violation-hearings] request failed', { code: error.code ?? null, violationId: parsed.data.violationId })
    if (error.code === '42501') return { ok: false, error: 'We couldn’t find that notice on your home.' }
    if (error.code === '22023') return { ok: false, error: 'This violation is closed, so a hearing can’t be requested.' }
    // 0068 (SEC-N5): only a violation the board has sent a notice for.
    if (error.code === '55000') return { ok: false, error: 'The board hasn’t sent a notice for this violation yet, so there is no hearing to request.' }
    return { ok: false, error: 'Couldn’t send your request. Try again.' }
  }

  revalidatePath(`/resident/violations/${parsed.data.violationId}`)
  revalidatePath(`/violations/${parsed.data.violationId}`)
  return { ok: true, requestedAt: typeof data === 'string' ? data : null }
}

// ─── BL-140: cancel the hearing after a cure ─────────────────────────

export type CancelAfterCureResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }

const CancelSchema = z.object({
  violationId: z.string().uuid('That violation isn’t valid.'),
  reason: z.enum(CURE_CANCEL_REASONS, { errorMap: () => ({ message: 'Pick why the hearing is cancelled.' }) }),
})

export async function cancelHearingAfterCure(input: { violationId: string; reason: string }): Promise<CancelAfterCureResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (!M4_APPLIED) return { ok: false, error: HEARINGS_NOT_LIVE }

  const parsed = CancelSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = String(issue?.path[0] ?? '')
    return {
      ok: false,
      error: issue?.message ?? 'Invalid input.',
      ...(field === 'reason' ? { fieldErrors: { reason: issue!.message } } : {}),
    }
  }
  const { violationId, reason } = parsed.data

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { data: violation, error: vErr } = (await supabase
    .from('hoa_violations')
    .select('id, status, resolved_at')
    .eq('id', violationId)
    .eq('org_id', gate.orgId)
    .is('deleted_at', null)
    .maybeSingle()) as { data: { id: string; status: string | null; resolved_at: string | null } | null; error: { code?: string } | null }
  if (vErr) {
    console.error('[violation-hearings] cure: violation read failed', { code: vErr.code ?? null, violationId })
    return { ok: false, error: 'Couldn’t load the violation. Try again.' }
  }
  if (!violation) return { ok: false, error: 'We could not find that violation.' }

  const db = supabase as unknown as LooseDb
  const { data: hRow, error: hErr } = (await db
    .from(HEARING_TABLE)
    .select(HEARING_COLUMNS)
    .eq('organization_id', gate.orgId)
    .eq('violation_id', violationId)
    .maybeSingle()) as { data: Record<string, unknown> | null; error: { code?: string } | null }
  if (hErr) {
    console.error('[violation-hearings] cure: hearing read failed', { code: hErr.code ?? null, violationId })
    return { ok: false, error: 'Couldn’t load the hearing. Try again.' }
  }
  const hearing = hRow ? hearingFromRow(hRow) : null
  if (!hearing) return { ok: false, error: 'There is no hearing on record for this violation.' }

  let state: string | null
  let timeZone: string
  try {
    ;[state, timeZone] = await Promise.all([loadOrgStateRules(supabase as never, gate.orgId).then((r) => r.state ?? null), currentTimeZone()])
  } catch {
    return { ok: false, error: 'We could not check state law for this violation. Try again.' }
  }

  const offer = cureBeforeHearingOffer({
    state,
    violationStatus: violation.status,
    resolvedOn: dayOf(violation.resolved_at, timeZone),
    hearing,
  })
  if (!offer) {
    return {
      ok: false,
      error:
        hearing.status === 'held' || hearing.status === 'cancelled'
          ? 'This hearing is already held or cancelled.'
          : 'Mark the violation resolved first. A hearing is cancelled for a cure only when the cure came before the hearing.',
    }
  }
  if (!offer.reasons.includes(reason)) {
    return { ok: false, error: 'That reason doesn’t apply in your state.', fieldErrors: { reason: 'Pick one of the listed reasons.' } }
  }

  // Recorded first: no record, no cancellation. Ids and codes only.
  const { error: auditErr } = await supabase.from('audit_log').insert({
    action: CURE_CANCEL_AUDIT_ACTION,
    org_id: gate.orgId,
    user_id: user.id,
    entity_type: 'hoa_violation',
    entity_id: violationId,
    metadata: cureCancelAuditMetadata({ hearingId: hearing.id, reason, state: offer.state, priorStatus: hearing.status }),
  } as never)
  if (auditErr) {
    console.error('[violation-hearings] cure: audit failed', { code: auditErr.code ?? null, violationId })
    return { ok: false, error: 'We could not record why, so the hearing was not cancelled. Try again.' }
  }

  // Security review #3 (SEC3-M1): compare-and-swap on what the checks above
  // saw. Only the row still in the status and on the day that was checked
  // is cancelled, so a hearing another board member marked held (with its
  // outcome) or moved in the meantime is never overwritten; and a write
  // that changed no row is a failure, not a silent success.
  let cancel = db
    .from(HEARING_TABLE)
    .update({ status: 'cancelled', outcome: null, decided_on: null, updated_at: new Date().toISOString() })
    .eq('id', hearing.id)
    .eq('organization_id', gate.orgId)
    .eq('status', hearing.status)
  cancel = hearing.hearingOn ? cancel.eq('hearing_on', hearing.hearingOn) : cancel.is('hearing_on', null)
  const { data: cancelled, error: upErr } = (await cancel.select('id')) as {
    data: Array<{ id: string }> | null
    error: { code?: string } | null
  }
  if (upErr) {
    console.error('[violation-hearings] cure: cancel failed', { code: upErr.code ?? null, violationId })
    return { ok: false, error: 'Couldn’t cancel the hearing. Try again.' }
  }
  if (!cancelled || cancelled.length === 0) {
    console.error('[violation-hearings] cure: cancel matched no row', { violationId, hearingId: hearing.id })
    return { ok: false, error: 'The hearing changed while you were looking at it, so it was not cancelled. Reload the page and check it.' }
  }

  revalidatePath(`/violations/${violationId}`)
  revalidatePath(`/resident/violations/${violationId}`)
  return { ok: true }
}
