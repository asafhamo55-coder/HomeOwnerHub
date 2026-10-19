'use server'

import { z } from 'zod'
import { getCurrentUserRole } from '@/lib/auth'
import { BOARD_ONLY_DENIED } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { asPropertyId } from '../resolve'
import { ESTOPPEL_PRINTED, recordEstoppelAudit } from './audit'
import { loadEstoppelInput } from './load'
import { auditFigures, buildCertificate, checkFee, requestProblem } from './model'

const PrintSchema = z.object({
  propertyId: z.string().uuid(),
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  delivery: z.enum(['electronic', 'hand', 'mail']),
  expedited: z.boolean(),
  feeCents: z.number().int().min(0).max(10_000_000),
})

export type PrintResult = { ok: true } | { ok: false; error: string }

/**
 * Called by "Print / Save as PDF" before the print dialog opens. The
 * figures in the audit row are recomputed here from the database, not
 * taken from the browser, and the fee is checked against the cap again.
 * Nothing is sent anywhere: the board prints or saves the page itself.
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
  const fee = checkFee(cert.jurisdiction, cert.deadlines, cert.figures, req, v.feeCents)
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
