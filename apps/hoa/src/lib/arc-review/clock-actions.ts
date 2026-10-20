'use server'

// BL-113: the board's "Decide ARC applications within N days" setting,
// one per association in the org. Storage, signing and the default:
// ./clock.ts.
//
// Board/admin only: every action re-checks the role
// (requireBoardOrAdminForAction) because a server action is a public
// endpoint. A save names its association, and that association must be
// one of the current org's.

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getCurrentOrg } from '@/lib/orgs'
import { loadOrFail } from '@/lib/load-or-fail'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  isValidArcDecisionDays,
  readArcClockSettings,
  signArcClockSettings,
  withArcClockSettings,
  type ArcClockSettings,
  type ArcDayKind,
} from './clock'

export interface ArcClockAssociation {
  association: { id: string; name: string; state: string | null }
  state: 'configured' | 'not_configured' | 'unverified'
  settings: ArcClockSettings
}

export type ArcClockLoad =
  | { ok: true; associations: ArcClockAssociation[] }
  | { ok: false; reason: 'forbidden' | 'failed' }

type AssocRow = {
  id: string
  name: string
  state: string | null
  governing_law_state: string | null
  compliance_settings: unknown
}

async function loadOrgAssociations(associationId?: string): Promise<{ ok: true; rows: AssocRow[] } | { ok: false }> {
  const org = await getCurrentOrg()
  if (!org) return { ok: true, rows: [] }
  const supabase = await getSupabaseServerClient()
  let q = supabase
    .from('associations')
    .select('id, name, state, governing_law_state, compliance_settings')
    .eq('organization_id', org.id)
  if (associationId !== undefined) q = q.eq('id', associationId)
  const res = await loadOrFail('ARC decision clock settings', q.order('name', { ascending: true }))
  if (!res.ok) return { ok: false }
  return { ok: true, rows: (res.data ?? []) as AssocRow[] }
}

/** Every association's clock setting (default 30 calendar days when unsaved or unverified). */
export async function getArcClockSettings(): Promise<ArcClockLoad> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, reason: 'forbidden' }
  const assoc = await loadOrgAssociations()
  if (!assoc.ok) return { ok: false, reason: 'failed' }
  const secret = paySettingsSecret()
  return {
    ok: true,
    associations: assoc.rows.map((row) => {
      const read = readArcClockSettings(row.id, row.compliance_settings, secret)
      return {
        association: { id: row.id, name: row.name, state: row.governing_law_state ?? row.state ?? null },
        state: read.state,
        settings: { days: read.days, dayKind: read.dayKind },
      }
    }),
  }
}

export type SaveArcClockResult = { ok: true } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function saveArcClockSettings(input: {
  associationId: string
  days: number
  dayKind: ArcDayKind
}): Promise<SaveArcClockResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (
    typeof input?.associationId !== 'string' ||
    !UUID.test(input.associationId) ||
    (input.dayKind !== 'calendar' && input.dayKind !== 'business')
  ) {
    return { ok: false, error: 'Invalid input.' }
  }
  if (!isValidArcDecisionDays(input.days)) return { ok: false, error: 'Enter a whole number of days from 1 to 365.' }

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'This setting can’t be saved on this server yet. Contact support.' }

  // An id from another org loads nothing here and is refused before any write.
  const assoc = await loadOrgAssociations(input.associationId)
  if (!assoc.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  const row = assoc.rows.find((r) => r.id === input.associationId)
  if (!row) return { ok: false, error: 'That association isn’t part of your organization.' }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const stored = signArcClockSettings(
    row.id,
    { days: input.days, dayKind: input.dayKind },
    { updatedAt: new Date().toISOString(), updatedBy: user?.id ?? null },
    secret,
  )
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withArcClockSettings(row.compliance_settings, stored) as never })
    .eq('id', row.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[arc-clock-settings] save failed', { code: error?.code ?? 'no_rows', associationId: row.id })
    return { ok: false, error: 'Couldn’t save the setting. Try again.' }
  }

  revalidatePath('/arc')
  return { ok: true }
}
