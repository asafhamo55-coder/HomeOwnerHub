'use server'

// Settings → Vendors (BL-083 / BL-084): the board's insurance minimums
// (general liability, workers' comp, auto, umbrella) and the opt-out for the
// board's COI-expiry notices. Storage, signing and why it is signed:
// packages/workflows/src/vendor-insurance/settings.ts.
//
// Board/admin only: every action re-checks the role
// (requireBoardOrAdminForAction) because a server action is a public
// endpoint.

import { revalidatePath } from 'next/cache'
import {
  COVERAGE_MAX,
  effectiveVendorInsuranceSettings,
  readVendorInsuranceSettings,
  signVendorInsuranceSettings,
  validateVendorInsuranceInput,
  withVendorInsuranceSettings,
  type VendorInsuranceSettings,
} from '@homeowner-portal/workflows/vendor-insurance'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getCurrentOrg } from '@/lib/orgs'
import { loadOrFail } from '@/lib/load-or-fail'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface BoardVendorInsuranceSettings {
  association: { id: string; name: string }
  state: 'configured' | 'not_configured' | 'unverified'
  settings: VendorInsuranceSettings
  updatedAt: string | null
  coverageMax: number
}

export type BoardVendorInsuranceLoad =
  | { ok: true; data: BoardVendorInsuranceSettings }
  | { ok: false; reason: 'forbidden' | 'no_association' | 'failed' }

type AssocRow = { id: string; name: string; compliance_settings: unknown }

async function loadPrimaryAssociation(): Promise<{ ok: true; row: AssocRow | null } | { ok: false }> {
  const org = await getCurrentOrg()
  if (!org) return { ok: true, row: null }
  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'vendor insurance settings association',
    supabase
      .from('associations')
      .select('id, name, compliance_settings')
      .eq('organization_id', org.id)
      .order('name', { ascending: true })
      .limit(1),
  )
  if (!res.ok) return { ok: false }
  return { ok: true, row: ((res.data ?? []) as AssocRow[])[0] ?? null }
}

export async function getBoardVendorInsuranceSettings(): Promise<BoardVendorInsuranceLoad> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, reason: 'forbidden' }
  const assoc = await loadPrimaryAssociation()
  if (!assoc.ok) return { ok: false, reason: 'failed' }
  if (!assoc.row) return { ok: false, reason: 'no_association' }
  const { row } = assoc

  const read = readVendorInsuranceSettings(row.id, row.compliance_settings, paySettingsSecret())
  return {
    ok: true,
    data: {
      association: { id: row.id, name: row.name },
      state: read.state,
      settings: effectiveVendorInsuranceSettings(read, row.compliance_settings),
      updatedAt: read.state === 'configured' ? read.updatedAt : null,
      coverageMax: COVERAGE_MAX,
    },
  }
}

export type SaveVendorInsuranceResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export async function saveVendorInsuranceSettings(input: {
  coiRemindersEnabled: boolean
  glPerOccurrenceMin: string
  glAggregateMin: string
  workersCompRequired: boolean
  autoLiabilityMin: string
  umbrellaMin: string
}): Promise<SaveVendorInsuranceResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }

  const parsed = validateVendorInsuranceInput(input)
  if (!parsed.ok) return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.fieldErrors }

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'Vendor settings can’t be saved on this server yet. Contact support.' }

  const assoc = await loadPrimaryAssociation()
  if (!assoc.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  if (!assoc.row) return { ok: false, error: 'No association is set up for this organization yet.' }
  const row = assoc.row

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const stored = signVendorInsuranceSettings(
    row.id,
    parsed.value,
    { updatedAt: new Date().toISOString(), updatedBy: user?.id ?? null },
    secret,
  )
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withVendorInsuranceSettings(row.compliance_settings, stored) as never })
    .eq('id', row.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[vendor-insurance-settings] save failed', { code: error?.code ?? 'no_rows', associationId: row.id })
    return { ok: false, error: 'Couldn’t save the vendor settings. Try again.' }
  }

  revalidatePath('/settings/vendors')
  revalidatePath('/vendors')
  return { ok: true }
}
