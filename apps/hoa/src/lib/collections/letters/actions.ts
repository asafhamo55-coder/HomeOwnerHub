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
import { loadLetterContext, type LetterContext } from './load'
import {
  LETTER_KINDS,
  blankValues,
  buildLetter,
  letterBlocked,
  letterChargeIds,
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

const SaveSchema = z.object({
  propertyId: z.string().uuid(),
  kind: z.enum(LETTER_KINDS),
  values: Values,
  verified: z.boolean(),
})

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
  }

  try {
    await proposeApproval(createAdminClient(), {
      organizationId: gate.orgId,
      workflowId: LETTER_WORKFLOW,
      actionType: LETTER_ACTION,
      subjectType: LETTER_SUBJECT,
      subjectId: randomUUID(),
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
