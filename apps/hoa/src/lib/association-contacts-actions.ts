'use server'

// Settings -> Association -> "Board and emergency contacts". The board
// chooses which contacts residents see on their home page.
//
// Board or admin may save (RLS associations_update, 0063, allows exactly
// those roles; this re-checks the role first because a server action is a
// public endpoint). Every call validates with zod, updates only a row of the
// caller's own organization, and keeps every other compliance_settings key.

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { saveBoardContactsSchema, withBoardContacts } from './association-contacts'

export type SaveBoardContactsResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export async function saveBoardContacts(input: unknown): Promise<SaveBoardContactsResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }

  const parsed = saveBoardContactsSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors }
  }
  const { associationId, contacts } = parsed.data

  const supabase = await getSupabaseServerClient()
  const before = await supabase
    .from('associations')
    .select('id, compliance_settings')
    .eq('id', associationId)
    .eq('organization_id', gate.orgId)
    .maybeSingle()
  if (before.error) {
    console.error('[board-contacts] read failed', { code: before.error.code ?? null, associationId })
    return { ok: false, error: 'Couldn’t load your association. Try again.' }
  }
  const row = before.data as { id: string; compliance_settings: unknown } | null
  if (!row) return { ok: false, error: 'We couldn’t find that association in your HOA.' }

  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withBoardContacts(row.compliance_settings, contacts) as never })
    .eq('id', associationId)
    .eq('organization_id', gate.orgId)
    .select('id')
  if (error || !data || data.length === 0) {
    // Code only: a Postgres message can embed row values.
    console.error('[board-contacts] save failed', { code: error?.code ?? 'no_rows', associationId })
    return { ok: false, error: 'Couldn’t save the contacts. Try again.' }
  }

  revalidatePath('/settings/association')
  revalidatePath('/resident')
  return { ok: true }
}
