'use server'

import { z } from 'zod'
import { getCurrentUserRole } from '@/lib/auth'
import { BOARD_ONLY_DENIED } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { asPropertyId } from '../resolve'
import { ESTOPPEL_PRINTED, recordEstoppelAudit } from './audit'
import { loadEstoppelInput } from './load'
import { FIGURES_CHANGED, auditFigures, buildCertificate, checkFee, requestProblem, snapshotMatches, statuteProblem } from './model'

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Cents = z.number().int().min(-1_000_000_000).max(1_000_000_000)

const PrintSchema = z.object({
  propertyId: z.string().uuid(),
  requestDate: Day,
  delivery: z.enum(['electronic', 'hand', 'mail']),
  expedited: z.boolean(),
  feeCents: z.number().int().min(0).max(10_000_000),
  /** What the page shows (model.printSnapshot): refused unless it still matches. */
  figures: z.object({
    issueDate: Day,
    balance_cents: Cents,
    not_yet_due_cents: Cents,
    charge_ids: z.array(z.string().max(64)).max(10_000),
  }),
  /**
   * GA: the board's yes/no answers to "submitted to the POA Act?" and
   * "does the declaration provide for a fee?" (model.statuteAnswers).
   * Booleans only, never free text.
   */
  statute: z
    .object({
      poaAct: z.boolean().nullable().optional(),
      // BL-155: a Georgia condominium answers the Condominium Act question instead.
      condoAct: z.boolean().nullable().optional(),
      feeAuthorized: z.boolean().nullable().optional(),
    })
    .optional(),
})

export type PrintResult = { ok: true } | { ok: false; error: string }

/**
 * Called by "Print / Save as PDF" before the print dialog opens. The
 * figures in the audit row are recomputed here from the database, not
 * taken from the browser, and the fee is checked against the cap again.
 * The browser sends the figures it shows (issue day, balance, not yet
 * due, charge ids); any difference from the recomputed certificate is
 * refused, because the browser prints its own page-load copy — the same
 * check recordLetterPrinted makes. Nothing is sent anywhere: the board
 * prints or saves the page itself.
 */
export async function recordEstoppelPrinted(input: z.input<typeof PrintSchema>): Promise<PrintResult> {
  const parsed = PrintSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the request date, delivery and fee.' }
  const v = parsed.data

  const ctx = await getCurrentUserRole()
  if (!ctx) return { ok: false, error: 'You are not signed in to an organization.' }
  if (ctx.role !== 'admin' && ctx.role !== 'board') return { ok: false, error: BOARD_ONLY_DENIED }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }

  let loaded
  try {
    loaded = await loadEstoppelInput(supabase, ctx.org.id, asPropertyId(v.propertyId))
  } catch {
    return { ok: false, error: 'Couldn’t re-check the figures. Nothing was printed. Try again.' }
  }
  if (!loaded) return { ok: false, error: 'This property was not found.' }

  const issueDate = loaded.today
  const problem = requestProblem({ requestDate: v.requestDate, issueDate })
  if (problem) return { ok: false, error: problem }

  const req = { requestDate: v.requestDate, issueDate, delivery: v.delivery, expedited: v.expedited }
  const cert = buildCertificate(loaded.input, req)
  if (!snapshotMatches(cert, v.figures)) return { ok: false, error: FIGURES_CHANGED }
  const answers = v.statute ?? {}
  // GA: the statement cites § 44-3-232(d), which needs a Yes to the POA Act;
  // a condominium's cites § 44-3-109(d), which needs a Yes to the Condominium Act (BL-155).
  const statute = statuteProblem(cert.jurisdiction, answers, cert.gaCondo)
  if (statute) return { ok: false, error: statute }
  if (cert.jurisdiction === 'GA' && cert.gaCondo && answers.condoAct !== true) {
    return { ok: false, error: 'Answer whether the condominium is submitted to the Georgia Condominium Act.' }
  }
  if (cert.jurisdiction === 'GA' && !cert.gaCondo && answers.poaAct !== true) {
    return { ok: false, error: 'Answer whether the association is submitted to the Georgia Property Owners’ Association Act.' }
  }
  const fee = checkFee(cert.jurisdiction, cert.deadlines, cert.figures, req, v.feeCents, answers, cert.gaCondo)
  if (fee.problem) return { ok: false, error: fee.problem }

  const audit = await recordEstoppelAudit(supabase, {
    action: ESTOPPEL_PRINTED,
    orgId: ctx.org.id,
    userId: user.id,
    metadata: {
      property_id: v.propertyId,
      unit_id: loaded.input.unitId,
      ...auditFigures(cert),
      request_date: v.requestDate,
      issue_date: issueDate,
      delivery: v.delivery,
      expedited: v.expedited,
      fee_cents: v.feeCents,
      response_due: cert.deadlines.responseDue,
      effective_through: cert.deadlines.effectiveThrough,
    },
  })
  if (!audit.ok) return { ok: false, error: 'Couldn’t record this certificate, so it wasn’t printed. Try again.' }
  return { ok: true }
}
