'use server'

// BL-131 stopgap: the board's "Mark as done" on a statutory deadline.
// The list, the signing and the day math: ./deadlines.ts.
//
// Board/admin only: every action re-checks the role
// (requireBoardOrAdminForAction) because a server action is a public
// endpoint. The association must be one of the current org's, and the
// deadline must apply to its state.

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getCurrentOrg } from '@/lib/orgs'
import { loadOrFail } from '@/lib/load-or-fail'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  complianceState,
  deadlinesForState,
  isKnownDeadlineCode,
  signComplianceAck,
  withComplianceAck,
} from './deadlines'

export type MarkComplianceDoneResult = { ok: true } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type AssocRow = {
  id: string
  state: string | null
  governing_law_state: string | null
  compliance_settings: unknown
}

export async function markComplianceDeadlineDone(input: {
  associationId: string
  code: string
}): Promise<MarkComplianceDoneResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof input?.associationId !== 'string' || !UUID.test(input.associationId) || !isKnownDeadlineCode(input.code)) {
    return { ok: false, error: 'Invalid input.' }
  }

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'This can’t be saved on this server yet. Contact support.' }

  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'You are not signed in to an organization.' }
  const supabase = await getSupabaseServerClient()
  // An id from another org loads nothing here and is refused before any write.
  const res = await loadOrFail(
    'compliance deadline association',
    supabase
      .from('associations')
      .select('id, state, governing_law_state, compliance_settings')
      .eq('organization_id', org.id)
      .eq('id', input.associationId),
  )
  if (!res.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  const row = ((res.data ?? []) as AssocRow[]).find((r) => r.id === input.associationId)
  if (!row) return { ok: false, error: 'That association isn’t part of your organization.' }
  const applies = deadlinesForState(complianceState(row.governing_law_state, row.state)).some(
    (d) => d.code === input.code,
  )
  if (!applies) return { ok: false, error: 'That deadline doesn’t apply to this association’s state.' }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const stored = signComplianceAck(
    row.id,
    input.code,
    { doneAt: new Date().toISOString(), doneBy: user?.id ?? null },
    secret,
  )
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withComplianceAck(row.compliance_settings, input.code, stored) as never })
    .eq('id', row.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[compliance-deadlines] mark done failed', { code: error?.code ?? 'no_rows', associationId: row.id })
    return { ok: false, error: 'Couldn’t save. Try again.' }
  }

  revalidatePath('/')
  return { ok: true }
}
