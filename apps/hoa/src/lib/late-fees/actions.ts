'use server'

// BL-147: Settings → Late fees. The board's one write: save the late-fee
// policy the nightly job (packages/jobs/src/hoa-late-fees.ts) charges under.
// Storage and signing: ./store.ts. The model and state caps: ./policy.ts,
// ./law.ts.
//
// Board/admin only: every call re-checks the role
// (requireBoardOrAdminForAction) before any client exists, because a server
// action is a public endpoint. The state cap is checked here and again by
// the job. Every save writes an audit row with ids, enums and numbers only
// (never the declaration reference the board typed). Nothing is sent to
// anyone and nothing is charged by saving.

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { loadOrFail } from '@/lib/load-or-fail'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { lateFeeLaw, lateFeeStateOf, type LateFeeLaw } from './law'
import { LATE_FEE_POLICY_AUDIT_ACTION, validateLateFeePolicy, type LateFeePolicy } from './policy'
import { readLateFeePolicy, signLateFeePolicy, withLateFeePolicy } from './store'

type AssocRow = {
  id: string
  name: string
  state: string | null
  governing_law_state: string | null
  compliance_settings: unknown
}

async function loadAssociation(orgId: string): Promise<{ ok: true; row: AssocRow | null } | { ok: false }> {
  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'late fee policy association',
    supabase
      .from('associations')
      .select('id, name, state, governing_law_state, compliance_settings')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
      .limit(1),
  )
  if (!res.ok) return { ok: false }
  return { ok: true, row: ((res.data ?? []) as AssocRow[])[0] ?? null }
}

export interface BoardLateFeePolicy {
  association: { id: string; name: string }
  state: 'saved' | 'none' | 'unverified'
  policy: LateFeePolicy
  updatedAt: string | null
  usState: string | null
  law: LateFeeLaw | null
}

export type BoardLateFeePolicyLoad =
  | { ok: true; data: BoardLateFeePolicy }
  | { ok: false; reason: 'forbidden' | 'no_association' | 'failed' }

export async function getBoardLateFeePolicy(): Promise<BoardLateFeePolicyLoad> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, reason: 'forbidden' }
  const assoc = await loadAssociation(gate.orgId)
  if (!assoc.ok) return { ok: false, reason: 'failed' }
  if (!assoc.row) return { ok: false, reason: 'no_association' }
  const row = assoc.row
  const read = readLateFeePolicy(row.id, row.compliance_settings, paySettingsSecret())
  const usState = lateFeeStateOf(row)
  return {
    ok: true,
    data: {
      association: { id: row.id, name: row.name },
      state: read.state,
      policy: read.policy,
      updatedAt: read.state === 'saved' ? read.updatedAt : null,
      usState,
      law: lateFeeLaw(usState),
    },
  }
}

export type SaveLateFeePolicyResult =
  | { ok: true; policy: LateFeePolicy }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export async function saveLateFeePolicy(input: {
  enabled: boolean
  mode: 'percent' | 'flat'
  percent: string
  flat: string
  graceDays: string
  excludeFines: boolean
  declarationAttested: boolean
  declarationRef: string
}): Promise<SaveLateFeePolicyResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof input !== 'object' || input === null) return { ok: false, error: 'Invalid input.' }

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'The late-fee policy can’t be saved on this server yet. Contact support.' }

  const assoc = await loadAssociation(gate.orgId)
  if (!assoc.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  if (!assoc.row) return { ok: false, error: 'No association is set up for this organization yet.' }
  const row = assoc.row
  const usState = lateFeeStateOf(row)

  // The state cap is enforced here: a policy above it is refused.
  const parsed = validateLateFeePolicy(
    {
      enabled: input.enabled,
      mode: input.mode,
      percent: input.percent,
      flat: input.flat,
      graceDays: input.graceDays,
      excludeFines: input.excludeFines,
      declarationAttested: input.declarationAttested,
      declarationRef: input.declarationRef,
    },
    usState,
  )
  if (!parsed.ok) return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.fieldErrors }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const stored = signLateFeePolicy(
    row.id,
    parsed.value,
    { updatedAt: new Date().toISOString(), updatedBy: user?.id ?? null },
    secret,
  )
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withLateFeePolicy(row.compliance_settings, stored) as never })
    .eq('id', row.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[late-fee-policy] save failed', { code: error?.code ?? 'no_rows', associationId: row.id })
    return { ok: false, error: 'Couldn’t save the late-fee policy. Try again.' }
  }

  // Ids, enums and numbers only: never the declaration reference text.
  const p = parsed.value
  const { error: auditErr } = await supabase.from('audit_log').insert({
    org_id: gate.orgId,
    user_id: user?.id ?? null,
    action: LATE_FEE_POLICY_AUDIT_ACTION,
    entity_type: 'association',
    entity_id: row.id,
    metadata: {
      enabled: p.enabled,
      mode: p.mode,
      percent_bps: p.percentBps,
      flat_cents: p.flatCents,
      grace_days: p.graceDays,
      exclude_fines: p.excludeFines,
      attested: p.declarationAttested,
      state: usState,
    },
  })
  if (auditErr) console.error('[late-fee-policy] audit failed', { associationId: row.id, code: auditErr.code ?? null })

  revalidatePath('/settings/late-fees')
  return { ok: true, policy: p }
}
