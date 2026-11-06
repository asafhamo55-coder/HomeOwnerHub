'use server'

import { z } from 'zod'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociationResult } from '@/lib/primary-association'
import { todayIn } from '@/lib/association-time'
import { violationLetterAuditRow } from './letter-print-audit'

const Schema = z.object({ violationId: z.string().uuid() })

export type ViolationPrintResult = { ok: true } | { ok: false; error: string }

/**
 * Records that the board printed this violation's notice. Board and admin
 * only. Refuses when the violation is not in the caller's org or has no
 * approved letter, and refuses when the record can't be written, so the
 * print dialog never opens without a record.
 */
export async function recordViolationLetterPrinted(input: z.input<typeof Schema>): Promise<ViolationPrintResult> {
  const parsed = Schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'That letter isn’t valid.' }
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }

  const { data, error } = (await supabase
    .from('hoa_violations')
    .select('id, property_id, approved_letter')
    .eq('id', parsed.data.violationId)
    .eq('org_id', gate.orgId)
    .is('deleted_at', null)
    .maybeSingle()) as { data: { id: string; property_id: string | null; approved_letter: string | null } | null; error: { code?: string } | null }
  if (error) {
    console.error('[violations.letter-print] read failed', { orgId: gate.orgId, code: error.code ?? null })
    return { ok: false, error: 'Couldn’t check this notice, so it wasn’t printed. Try again.' }
  }
  if (!data || !data.approved_letter) return { ok: false, error: 'This violation has no approved notice to print.' }

  // The day is decided here, in the association's zone, never by the client.
  const assoc = await getPrimaryAssociationResult()
  const letterDate = todayIn(assoc.ok && assoc.data ? assoc.data.timeZone : 'America/New_York')

  const { error: auditErr } = (await supabase.from('audit_log').insert(
    violationLetterAuditRow({ orgId: gate.orgId, userId: user.id, violationId: data.id, propertyId: data.property_id, letterDate }),
  )) as { error: { code?: string } | null }
  if (auditErr) {
    console.error('[violations.letter-print] audit insert failed', { orgId: gate.orgId, code: auditErr.code ?? null })
    return { ok: false, error: 'Couldn’t record this print, so it wasn’t printed. Try again.' }
  }
  return { ok: true }
}
