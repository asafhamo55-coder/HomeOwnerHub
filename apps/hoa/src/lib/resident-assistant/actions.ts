'use server'

// Settings → Notifications → "Resident portal" → "Resident assistant"
// (BL-096): the board's switch for the chat assistant on the resident Ask
// tab, one per association in the org (SEC-003). Storage, signing and the
// fail-closed default: ./settings.ts.
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
import { readResidentAssistantSettings, residentAssistantOn, signResidentAssistantSettings, withResidentAssistantSettings } from './settings'

export interface BoardResidentAssistantAssociation {
  association: { id: string; name: string }
  state: 'configured' | 'not_configured' | 'unverified'
  /** What the resident portal acts on: a verified, saved ON. */
  on: boolean
  /** Never saved: the screen shows "Recommended: turn on" (the default itself is OFF, SEC-002). */
  recommendOn: boolean
}

export interface BoardResidentAssistantSettings {
  /** Every association in the org, by name. */
  associations: BoardResidentAssistantAssociation[]
  aiConfigured: boolean
}

export type BoardResidentAssistantLoad =
  | { ok: true; data: BoardResidentAssistantSettings }
  | { ok: false; reason: 'forbidden' | 'no_association' | 'failed' }

type AssocRow = { id: string; name: string; compliance_settings: unknown }

/** The current org's associations; with an id, only that one and only if it is the org's. */
async function loadOrgAssociations(associationId?: string): Promise<{ ok: true; rows: AssocRow[] } | { ok: false }> {
  const org = await getCurrentOrg()
  if (!org) return { ok: true, rows: [] }
  const supabase = await getSupabaseServerClient()
  let q = supabase.from('associations').select('id, name, compliance_settings').eq('organization_id', org.id)
  if (associationId !== undefined) q = q.eq('id', associationId)
  const res = await loadOrFail('resident assistant settings association', q.order('name', { ascending: true }))
  if (!res.ok) return { ok: false }
  return { ok: true, rows: (res.data ?? []) as AssocRow[] }
}

export async function getBoardResidentAssistantSettings(): Promise<BoardResidentAssistantLoad> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, reason: 'forbidden' }
  const assoc = await loadOrgAssociations()
  if (!assoc.ok) return { ok: false, reason: 'failed' }
  if (assoc.rows.length === 0) return { ok: false, reason: 'no_association' }
  const secret = paySettingsSecret()
  return {
    ok: true,
    data: {
      associations: assoc.rows.map((row) => {
        const read = readResidentAssistantSettings(row.id, row.compliance_settings, secret)
        return {
          association: { id: row.id, name: row.name },
          state: read.state,
          on: residentAssistantOn(row.id, row.compliance_settings, secret),
          recommendOn: read.state === 'not_configured',
        }
      }),
      aiConfigured: Boolean(process.env.AI_API_KEY),
    },
  }
}

export type SaveResidentAssistantResult = { ok: true } | { ok: false; error: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function saveResidentAssistantSettings(input: {
  associationId: string
  on: boolean
}): Promise<SaveResidentAssistantResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof input?.on !== 'boolean' || typeof input.associationId !== 'string' || !UUID.test(input.associationId)) {
    return { ok: false, error: 'Invalid input.' }
  }

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

  const stored = signResidentAssistantSettings(
    row.id,
    input.on,
    { updatedAt: new Date().toISOString(), updatedBy: user?.id ?? null },
    secret,
  )
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withResidentAssistantSettings(row.compliance_settings, stored) as never })
    .eq('id', row.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[resident-assistant-settings] save failed', { code: error?.code ?? 'no_rows', associationId: row.id })
    return { ok: false, error: 'Couldn’t save the setting. Try again.' }
  }

  revalidatePath('/settings/notifications')
  revalidatePath('/resident/ask')
  return { ok: true }
}
