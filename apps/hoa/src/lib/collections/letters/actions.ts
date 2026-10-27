'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { proposeApproval } from '@homeowner-portal/workflows'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'
import { letterEventNote, recordLetterAudit } from './audit'
import {
  DRIFT_CODES,
  OVERRIDE_REASON_CODES,
  blockingFindings,
  overrideAuditRow,
  resolveOverrides,
  type OverrideReason,
} from '@/lib/compliance/statute-drift'
import { loadLetterContext, type LetterContext } from './load'
import { M7_APPLIED } from '@homeowner-portal/db/m7'
import { MAIL_METHODS, clockStartOf, mailingNote, validateMailFields } from '../mail-tracking'
import {
  LETTER_KINDS,
  blankValues,
  buildLetter,
  letterBlocked,
  letterChargeIds,
  letterLawCheck,
  letterTotals,
  stageAfterPrint,
  LETTER_META,
} from './model'
import { LETTER_ACTION, LETTER_SUBJECT, LETTER_WORKFLOW, letterSummary, readLetterPayload, type LetterPayload } from './proposal'

/**
 * The two writes behind the collections letter page (BL-089). Nothing is
 * emailed, texted or mailed from here: the board saves a drafted letter
 * to Approvals, a board member approves it there, and then the board
 * prints it (or saves it as a PDF) and sends it themselves.
 *
 * Every figure is recomputed on the server from the database; the
 * browser only supplies which letter, the BLANK entries and the tick.
 */

export type LetterResult = { ok: true; message: string } | { ok: false; error: string }

const Values = z.record(z.string().max(64), z.string().max(1000))

const LawOverrides = z.record(z.enum(DRIFT_CODES), z.enum(OVERRIDE_REASON_CODES as [OverrideReason, ...OverrideReason[]]))

const SaveSchema = z.object({
  propertyId: z.string().uuid(),
  kind: z.enum(LETTER_KINDS),
  values: Values,
  verified: z.boolean(),
  /** BL-130: finding code → the board's override reason code, per blocking state-law finding. */
  lawOverrides: LawOverrides.optional(),
})

/** The case's letters already printed, for the state law check's waiting periods. */
function printedRecords(ctx: LetterContext) {
  // BL-166: a delivery date the board recorded (certified / statutory overnight only) starts the clock.
  return ctx.requests.flatMap((r) => {
    if (!r.printedAt) return []
    const deliveredOn = clockStartOf(r.mail)
    return [{ kind: r.payload.kind, printedAt: r.printedAt, ...(deliveredOn ? { deliveredOn } : {}) }]
  })
}

async function gateAndLoad(propertyId: string) {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false as const, error: gate.error }
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'You are not signed in.' }
  let ctx: LetterContext | null
  try {
    ctx = await loadLetterContext(supabase, gate.orgId, asPropertyId(propertyId))
  } catch {
    return { ok: false as const, error: 'Couldn’t re-check the account. Nothing was saved. Try again.' }
  }
  if (!ctx) return { ok: false as const, error: 'This property was not found.' }
  return { ok: true as const, gate, supabase, user, ctx }
}

function home(ctx: LetterContext): string {
  return [ctx.input.address, ctx.input.unitNumber ? `Unit ${ctx.input.unitNumber}` : null].filter(Boolean).join(', ')
}

function revalidate(propertyId: string) {
  const id = asPropertyId(propertyId)
  revalidatePath(propertyHref(id))
  revalidatePath(propertyHref(id, { collectionsLetter: true }))
  revalidatePath('/approvals')
  // The sidebar's approvals badge lives in the dashboard layout.
  revalidatePath('/', 'layout')
}

/** "Save to approvals": the drafted letter becomes a proposed approval request. */
export async function saveLetterToApprovals(input: z.input<typeof SaveSchema>): Promise<LetterResult> {
  const parsed = SaveSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the letter and try again.' }
  const v = parsed.data

  const loaded = await gateAndLoad(v.propertyId)
  if (!loaded.ok) return loaded
  const { gate, ctx } = loaded
  if (!ctx.collectionCase) return { ok: false, error: 'This home has no open collections case. Open one first.' }
  if (ctx.requests.some((r) => r.status === 'proposed')) {
    return { ok: false, error: 'A letter for this home is already waiting in Approvals. Approve or reject it first.' }
  }

  const letter = buildLetter(ctx.input, v.kind, ctx.today, ctx.events, v.values)
  const blocked = letterBlocked(letter, v.values, v.verified)
  if (blocked) return { ok: false, error: blocked }
  const totals = letterTotals(letter, v.values)
  if (totals.totalCents === null || totals.enteredCents === null) return { ok: false, error: 'Fill in every BLANK first.' }

  // BL-130: the state law check. A blocking finding goes to Approvals only
  // with the board's reason for it, recorded in audit_log first.
  const law = letterLawCheck(ctx.input, letter, v.values, ctx.events, printedRecords(ctx))
  const resolved = resolveOverrides(law, v.lawOverrides)
  if (!resolved.ok) return { ok: false, error: resolved.error }
  const subjectId = randomUUID()

  const payload: LetterPayload = {
    version: 1,
    kind: v.kind,
    jurisdiction: letter.jurisdiction,
    caseId: ctx.collectionCase.id,
    propertyId: ctx.input.propertyId,
    unitId: ctx.input.unitId,
    draftedOn: ctx.today,
    values: blankValues(letter, v.values),
    chargeIds: letterChargeIds(letter),
    ledgerCents: totals.ledgerCents,
    enteredCents: totals.enteredCents,
    totalCents: totals.totalCents,
    lawFindings: law.findings.map((f) => f.code),
    lawOverrides: resolved.applied,
  }

  if (resolved.applied.length > 0) {
    const { error: auditErr } = await loaded.supabase.from('audit_log').insert(
        overrideAuditRow({
          orgId: gate.orgId,
          userId: loaded.user.id,
          entityType: 'collections_letter',
          entityId: subjectId,
          step: 'collections_letter',
          state: law.state,
          applied: resolved.applied,
          extra: { collection_case_id: payload.caseId, property_id: payload.propertyId, kind: payload.kind },
        }) as never,
      )
    if (auditErr) {
      console.error('[collections.letters] statute override audit failed', { orgId: gate.orgId, code: auditErr.code ?? null })
      return { ok: false, error: 'Couldn’t record the board’s override, so the letter wasn’t saved. Try again.' }
    }
  }

  try {
    await proposeApproval(createAdminClient(), {
      organizationId: gate.orgId,
      workflowId: LETTER_WORKFLOW,
      actionType: LETTER_ACTION,
      subjectType: LETTER_SUBJECT,
      subjectId,
      payload: payload as unknown as Parameters<typeof proposeApproval>[1]['payload'],
      summary: letterSummary(v.kind, home(ctx)),
      amount: totals.totalCents / 100,
    })
  } catch {
    console.error('[collections.letters] propose failed', { orgId: gate.orgId, caseId: payload.caseId })
    return { ok: false, error: 'Couldn’t save the letter to Approvals. Try again.' }
  }

  revalidate(v.propertyId)
  return { ok: true, message: 'Saved to Approvals. Once a board member approves it, print it from this page. Nothing was sent.' }
}

const PrintSchema = z.object({
  propertyId: z.string().uuid(),
  approvalRequestId: z.string().uuid(),
  verified: z.boolean(),
})

/**
 * Called by "Print / Save as PDF" before the print dialog opens. The
 * letter must be approved, the account must still match the approved
 * figures, and the waiting period must still hold. The first print
 * records the collections event (and moves the case forward a rung);
 * every print writes an audit row with ids and cents only.
 */
export async function recordLetterPrinted(input: z.input<typeof PrintSchema>): Promise<LetterResult> {
  const parsed = PrintSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That letter isn’t valid.' }
  const v = parsed.data

  const loaded = await gateAndLoad(v.propertyId)
  if (!loaded.ok) return loaded
  const { gate, supabase, user, ctx } = loaded

  const request = ctx.requests.find((r) => r.id === v.approvalRequestId)
  if (!request) return { ok: false, error: 'That letter wasn’t found for this home.' }
  if (request.status !== 'posted') return { ok: false, error: 'This letter hasn’t been approved yet. Approve it in Approvals first.' }
  const payload = readLetterPayload(request.payload)
  if (!payload) return { ok: false, error: 'This letter can’t be read. Draft it again.' }
  if (!ctx.collectionCase || ctx.collectionCase.id !== payload.caseId) {
    return { ok: false, error: 'The collections case for this letter is closed, so it can’t be printed.' }
  }

  const letter = buildLetter(ctx.input, payload.kind, ctx.today, ctx.events, payload.values)
  const blocked = letterBlocked(letter, payload.values, v.verified)
  if (blocked) return { ok: false, error: blocked }
  // BL-130: re-run the state law check on today's date. Every blocking
  // finding must be one the board overrode when it saved this letter.
  const overridden = new Set((payload.lawOverrides ?? []).map((o) => o.code))
  const lawNow = letterLawCheck(ctx.input, letter, payload.values, ctx.events, printedRecords(ctx))
  const unresolved = blockingFindings(lawNow).filter((f) => !overridden.has(f.code))
  if (unresolved.length > 0) {
    return {
      ok: false,
      error: `The state law check now finds a problem the board didn’t decide when this letter was approved (${unresolved
        .map((f) => f.citations[0]?.cite ?? f.code)
        .join('; ')}). Draft a new letter so the board can review it.`,
    }
  }
  const totals = letterTotals(letter, payload.values)
  const ids = letterChargeIds(letter)
  if (totals.totalCents !== payload.totalCents || ids.join(',') !== payload.chargeIds.join(',')) {
    return {
      ok: false,
      error: 'The account has changed since this letter was approved (a payment or a new charge). Draft a new letter so the figures are current.',
    }
  }

  // Idempotent per approval request. The first print's event carries the
  // request id in its note; a retry (after a failed stage update or audit
  // insert) finds it instead of recording a second one. A print counts as
  // done only once its audit row exists (request.printedAt), so until then
  // every attempt re-runs the steps that are still missing.
  const reprint = request.printedAt !== null
  let eventId: string | null = null
  if (!reprint) {
    const note = letterEventNote(request.id)
    const existing = (await supabase
      .from('collection_events')
      .select('id')
      .eq('organization_id', gate.orgId)
      .eq('collection_case_id', payload.caseId)
      .eq('note', note)
      .limit(1)) as { data: Array<{ id: string }> | null; error: { code?: string } | null }
    if (existing.error) {
      console.error('[collections.letters] event lookup failed', { orgId: gate.orgId, code: existing.error.code ?? null })
      return { ok: false, error: 'Couldn’t check the collections case, so the letter wasn’t printed. Try again.' }
    }
    eventId = existing.data?.[0]?.id ?? null
    if (!eventId) {
      const { data, error } = await supabase
        .from('collection_events')
        .insert({
          organization_id: gate.orgId,
          collection_case_id: payload.caseId,
          event_type: LETTER_META[payload.kind].eventType,
          occurred_on: ctx.today,
          amount: payload.totalCents / 100,
          note,
          recorded_by: user.id,
        })
        .select('id')
        .single()
      if (error || !data) {
        console.error('[collections.letters] event insert failed', { orgId: gate.orgId, code: error?.code ?? null })
        return { ok: false, error: 'Couldn’t record the letter on the collections case, so it wasn’t printed. Try again.' }
      }
      eventId = data.id
    }
    // Forward only, so re-running it on a retry is safe.
    const next = stageAfterPrint(payload.kind, ctx.collectionCase.status)
    if (next) {
      const { error: stageErr } = await supabase.from('collection_cases').update({ status: next }).eq('id', payload.caseId)
      if (stageErr) {
        console.error('[collections.letters] stage update failed', { orgId: gate.orgId, code: stageErr.code ?? null })
        return {
          ok: false,
          error: 'The letter is recorded on the collections case, but the app couldn’t move the case to its next stage, so it wasn’t printed. Try again.',
        }
      }
    }
  }

  const audit = await recordLetterAudit(supabase, {
    orgId: gate.orgId,
    userId: user.id,
    metadata: {
      approval_request_id: request.id,
      collection_case_id: payload.caseId,
      collection_event_id: eventId,
      property_id: payload.propertyId,
      unit_id: payload.unitId,
      kind: payload.kind,
      jurisdiction: payload.jurisdiction,
      letter_date: ctx.today,
      ledger_cents: payload.ledgerCents,
      entered_cents: payload.enteredCents,
      total_cents: payload.totalCents,
      charge_ids: payload.chargeIds,
      reprint,
    },
  })
  if (!audit.ok) return { ok: false, error: 'Couldn’t record this letter, so it wasn’t printed. Try again.' }

  revalidate(v.propertyId)
  return {
    ok: true,
    message: reprint ? 'Reprint recorded.' : `Recorded on the collections case as “${LETTER_META[payload.kind].label}”, dated today.`,
  }
}

const DayText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const MailSchema = z.object({
  propertyId: z.string().uuid(),
  approvalRequestId: z.string().uuid(),
  mailMethod: z.enum(MAIL_METHODS),
  trackingNumber: z.string().trim().max(100).optional(),
  mailedOn: DayText.optional(),
  deliveredOn: DayText.optional(),
})

/**
 * BL-166 (M7_APPLIED): the board records how and when a PRINTED letter was
 * mailed and delivered. collection_events is append-only, so this adds an
 * event that names the letter (mailingNote); a delivery learned later is
 * another call that repeats the method. The Georgia fee-notice clock and
 * the earliest foreclosure date count from the delivery day, and only for
 * certified mail or statutory overnight delivery (mail-tracking.ts).
 */
export async function recordLetterMailing(input: z.input<typeof MailSchema>): Promise<LetterResult> {
  if (!M7_APPLIED) return { ok: false, error: 'Recording how a letter was mailed isn’t available yet.' }
  const parsed = MailSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the mailing details and try again.' }
  const v = parsed.data

  const loaded = await gateAndLoad(v.propertyId)
  if (!loaded.ok) return loaded
  const { gate, supabase, user, ctx } = loaded

  const request = ctx.requests.find((r) => r.id === v.approvalRequestId)
  if (!request) return { ok: false, error: 'That letter wasn’t found for this home.' }
  if (request.printedAt === null) return { ok: false, error: 'Print the letter first, then record how it was mailed.' }
  if (!ctx.collectionCase || ctx.collectionCase.id !== request.payload.caseId) {
    return { ok: false, error: 'The collections case for this letter is closed.' }
  }
  const mail = validateMailFields(v, ctx.today)
  if (!mail.ok) return { ok: false, error: mail.error }
  if (!mail.record) return { ok: false, error: 'Choose how it was mailed.' }

  // A delivery links to the letter's own print event, so the clock does not depend on the tracking number.
  let deliveryFor: string | null = null
  if (mail.record.deliveredOn) {
    const found = (await supabase
      .from('collection_events')
      .select('id')
      .eq('organization_id', gate.orgId)
      .eq('collection_case_id', request.payload.caseId)
      .eq('note', letterEventNote(request.id))
      .limit(1)) as { data: Array<{ id: string }> | null; error: { code?: string } | null }
    if (found.error) {
      console.error('[collections.letters] print event lookup failed', { orgId: gate.orgId, code: found.error.code ?? null })
      return { ok: false, error: 'Couldn’t record the mailing. Nothing was saved. Try again.' }
    }
    deliveryFor = found.data?.[0]?.id ?? null
  }

  const { error } = await supabase.from('collection_events').insert({
    organization_id: gate.orgId,
    collection_case_id: request.payload.caseId,
    event_type: 'note',
    occurred_on: mail.record.mailedOn ?? mail.record.deliveredOn ?? ctx.today,
    note: mailingNote(request.id),
    recorded_by: user.id,
    ...(deliveryFor ? { delivery_for_event_id: deliveryFor } : {}),
    mail_method: mail.record.method,
    tracking_number: mail.record.trackingNumber,
    mailed_on: mail.record.mailedOn,
    delivered_on: mail.record.deliveredOn,
  } as never)
  if (error) {
    console.error('[collections.letters] mailing insert failed', { orgId: gate.orgId, code: error.code ?? null })
    return { ok: false, error: 'Couldn’t record the mailing. Nothing was saved. Try again.' }
  }
  revalidate(v.propertyId)
  return { ok: true, message: mail.record.deliveredOn ? 'Mailing and delivery recorded.' : 'Mailing recorded. Add the delivery date when the green card or tracking shows it.' }
}
