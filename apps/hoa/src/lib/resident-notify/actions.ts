'use server'

// Settings → Notifications → "Resident emails" (BL-082): the board's
// association-wide switch for telling residents when the board decides
// their ARC application or replies to their ticket. Storage, signing and
// why it is signed: ./settings.ts. OFF until a board saves it ON.
//
// Board/admin only: every action re-checks the role
// (requireBoardOrAdminForAction) because a server action is a public
// endpoint.

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getCurrentOrg } from '@/lib/orgs'
import { loadOrFail } from '@/lib/load-or-fail'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readResidentNotifySettings, signResidentNotifySettings, withResidentNotifySettings } from './settings'

export interface BoardResidentNotifySettings {
  association: { id: string; name: string }
  state: 'configured' | 'not_configured' | 'unverified'
  /** What the send path acts on: a verified, saved ON. */
  on: boolean
  emailConfigured: boolean
  smsConfigured: boolean
}

export type BoardResidentNotifyLoad =
  | { ok: true; data: BoardResidentNotifySettings }
  | { ok: false; reason: 'forbidden' | 'no_association' | 'failed' }

type AssocRow = { id: string; name: string; compliance_settings: unknown }

async function loadPrimaryAssociation(): Promise<{ ok: true; row: AssocRow | null } | { ok: false }> {
  const org = await getCurrentOrg()
  if (!org) return { ok: true, row: null }
  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'resident notification settings association',
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

export async function getBoardResidentNotifySettings(): Promise<BoardResidentNotifyLoad> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, reason: 'forbidden' }
  const assoc = await loadPrimaryAssociation()
  if (!assoc.ok) return { ok: false, reason: 'failed' }
  if (!assoc.row) return { ok: false, reason: 'no_association' }
  const { row } = assoc

  const read = readResidentNotifySettings(row.id, row.compliance_settings, paySettingsSecret())
  return {
    ok: true,
    data: {
      association: { id: row.id, name: row.name },
      state: read.state,
      on: read.state === 'configured' && read.settings.decisionsAndReplies,
      emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
      smsConfigured: Boolean(
        process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET && process.env.VONAGE_FROM_NUMBER,
      ),
    },
  }
}

export type SaveResidentNotifyResult = { ok: true } | { ok: false; error: string }

export async function saveResidentNotifySettings(input: { on: boolean }): Promise<SaveResidentNotifyResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof input?.on !== 'boolean') return { ok: false, error: 'Invalid input.' }

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'This setting can’t be saved on this server yet. Contact support.' }

  const assoc = await loadPrimaryAssociation()
  if (!assoc.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  if (!assoc.row) return { ok: false, error: 'No association is set up for this organization yet.' }
  const row = assoc.row

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const stored = signResidentNotifySettings(
    row.id,
    { decisionsAndReplies: input.on },
    { updatedAt: new Date().toISOString(), updatedBy: user?.id ?? null },
    secret,
  )
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withResidentNotifySettings(row.compliance_settings, stored) as never })
    .eq('id', row.id)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values (RC-2).
    console.error('[resident-notify-settings] save failed', { code: error?.code ?? 'no_rows', associationId: row.id })
    return { ok: false, error: 'Couldn’t save the setting. Try again.' }
  }

  revalidatePath('/settings/notifications')
  return { ok: true }
}
