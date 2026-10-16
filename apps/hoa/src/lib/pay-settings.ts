'use server'

// Pay-by-Zelle settings: the board's save/clear actions and the reads the
// board Settings screen and the resident Pay screen make. Storage, signing
// and why it is signed: lib/pay-by-zelle.ts.

import { revalidatePath } from 'next/cache'
import { memoCodeFor } from '@homeowner-portal/workflows'
import { requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor } from '@/lib/impersonation'
import { loadOrFail } from '@/lib/load-or-fail'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  paySettingsSecret,
  readZelleSettings,
  signZelleSettings,
  validateZelleInput,
  withZelleSettings,
  type ZelleReadResult,
} from '@/lib/pay-by-zelle'

export interface BoardZelleSettings {
  association: { id: string; name: string }
  read: ZelleReadResult
  /** What the form starts with: the verified values, else empty. */
  initial: { recipient: string; recipientName: string; instructions: string }
  /** A real-looking memo code for the preview (this association's slug). */
  sampleMemoCode: string | null
}

export type BoardZelleLoad =
  | { ok: true; data: BoardZelleSettings }
  | { ok: false; reason: 'forbidden' | 'no_association' | 'failed' }

type AssocRow = { id: string; name: string; slug: string; compliance_settings: unknown }

async function loadPrimaryAssociation(): Promise<{ ok: true; row: AssocRow | null } | { ok: false }> {
  const org = await getCurrentOrg()
  if (!org) return { ok: true, row: null }
  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'pay settings association',
    supabase
      .from('associations')
      .select('id, name, slug, compliance_settings')
      .eq('organization_id', org.id)
      .order('name', { ascending: true })
      .limit(1),
  )
  if (!res.ok) return { ok: false }
  return { ok: true, row: ((res.data ?? []) as AssocRow[])[0] ?? null }
}

export async function getBoardZelleSettings(): Promise<BoardZelleLoad> {
  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return { ok: false, reason: 'forbidden' }
  const assoc = await loadPrimaryAssociation()
  if (!assoc.ok) return { ok: false, reason: 'failed' }
  if (!assoc.row) return { ok: false, reason: 'no_association' }
  const { row } = assoc

  const read = readZelleSettings(row.id, row.compliance_settings, paySettingsSecret())
  const s = read.state === 'configured' ? read.settings : null
  return {
    ok: true,
    data: {
      association: { id: row.id, name: row.name },
      read,
      initial: {
        recipient: s?.recipient ?? '',
        recipientName: s?.recipientName ?? row.name,
        instructions: s?.instructions ?? '',
      },
      sampleMemoCode: memoCodeFor({
        associationSlug: row.slug,
        unitNumber: '1247',
        unitId: '00000000-0000-4000-8000-000000001247',
        assessmentType: 'regular',
      }),
    },
  }
}

export type SaveZelleResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export async function saveZelleSettings(input: {
  recipient: string
  recipientName: string
  instructions: string
}): Promise<SaveZelleResult> {
  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return { ok: false, error: gate.error }

  const parsed = validateZelleInput(input)
  if (!parsed.ok) return { ok: false, error: 'Check the highlighted fields.', fieldErrors: parsed.fieldErrors }

  const secret = paySettingsSecret()
  if (!secret) return { ok: false, error: 'Payment settings can’t be saved on this server yet. Contact support.' }

  return writeSettings((row) => signZelleSettings(row.id, parsed.value, secret))
}

export async function clearZelleSettings(): Promise<SaveZelleResult> {
  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return { ok: false, error: gate.error }
  return writeSettings(() => null)
}

async function writeSettings(
  next: (row: AssocRow) => ReturnType<typeof signZelleSettings> | null,
): Promise<SaveZelleResult> {
  const assoc = await loadPrimaryAssociation()
  if (!assoc.ok) return { ok: false, error: 'Couldn’t load your association. Try again.' }
  if (!assoc.row) return { ok: false, error: 'No association is set up for this organization yet.' }
  const row = assoc.row

  const supabase = await getSupabaseServerClient()
  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withZelleSettings(row.compliance_settings, next(row)) as never })
    .eq('id', row.id)
    .select('id')
  if (error || !data || data.length === 0) {
    return { ok: false, error: 'Couldn’t save the payment settings. Try again.' }
  }

  revalidatePath('/settings/payments')
  revalidatePath('/resident')
  revalidatePath('/resident/dues', 'layout')
  return { ok: true }
}

/**
 * Zelle settings for each association the resident's units belong to, read
 * with the actor's client. `failed` means the read itself failed — the Pay
 * screen then says so instead of claiming the board hasn't set it up.
 */
export async function getResidentZelleSettings(
  associationIds: string[],
): Promise<{ ok: true; byAssociation: Record<string, ZelleReadResult> } | { ok: false }> {
  const ids = [...new Set(associationIds)]
  if (ids.length === 0) return { ok: true, byAssociation: {} }
  const actor = await getResidentActor()
  const res = await loadOrFail(
    'resident pay settings',
    actor.client.from('associations').select('id, compliance_settings').in('id', ids),
  )
  if (!res.ok) return { ok: false }
  const secret = paySettingsSecret()
  const byAssociation: Record<string, ZelleReadResult> = {}
  for (const id of ids) byAssociation[id] = { state: 'not_configured' }
  for (const row of (res.data ?? []) as Array<{ id: string; compliance_settings: unknown }>) {
    byAssociation[row.id] = readZelleSettings(row.id, row.compliance_settings, secret)
  }
  return { ok: true, byAssociation }
}
