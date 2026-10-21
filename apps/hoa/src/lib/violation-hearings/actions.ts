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
} from './rules'

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
    return { ok: false, error: 'Couldn’t send your request. Try again.' }
  }

  revalidatePath(`/resident/violations/${parsed.data.violationId}`)
  revalidatePath(`/violations/${parsed.data.violationId}`)
  return { ok: true, requestedAt: typeof data === 'string' ? data : null }
}
