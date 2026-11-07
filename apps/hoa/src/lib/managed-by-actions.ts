'use server'

// Settings -> Association -> "Managed by (optional)". Same pattern as
// saveBoardContacts: board or admin only (re-checked here because a server
// action is a public endpoint), zod-validated, scoped to the caller's own
// organization, every other compliance_settings key kept.

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { saveManagedBySchema, withManagedBy } from './managed-by'

export type SaveManagedByResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }

export async function saveManagedBy(input: unknown): Promise<SaveManagedByResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }

  const parsed = saveManagedBySchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { ok: false, error: 'Check the highlighted field.', fieldErrors }
  }
  const { associationId, managedBy } = parsed.data

  const supabase = await getSupabaseServerClient()
  const before = await supabase
    .from('associations')
    .select('id, compliance_settings')
    .eq('id', associationId)
    .eq('organization_id', gate.orgId)
    .maybeSingle()
  if (before.error) {
    console.error('[managed-by] read failed', { code: before.error.code ?? null, associationId })
    return { ok: false, error: 'Couldn’t load your association. Try again.' }
  }
  const row = before.data as { id: string; compliance_settings: unknown } | null
  if (!row) return { ok: false, error: 'We couldn’t find that association in your HOA.' }

  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withManagedBy(row.compliance_settings, managedBy) as never })
    .eq('id', associationId)
    .eq('organization_id', gate.orgId)
    .select('id')
  if (error || !data || data.length === 0) {
    console.error('[managed-by] save failed', { code: error?.code ?? 'no_rows', associationId })
    return { ok: false, error: 'Couldn’t save the line. Try again.' }
  }

  revalidatePath('/settings/association')
  return { ok: true }
}
