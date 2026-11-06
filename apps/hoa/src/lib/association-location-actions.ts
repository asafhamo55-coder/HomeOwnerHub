'use server'

// Settings -> Association -> "Where the community is". The board sets the
// city and ZIP once; the home photo route uses them for street-only addresses.
//
// Board or admin only (re-checked here: a server action is a public endpoint).
// Validates with zod, updates only a row of the caller's own organization and
// keeps every other compliance_settings key.

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { saveCommunityLocationSchema, withCommunityLocation } from './association-location'

export type SaveCommunityLocationResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export async function saveCommunityLocation(input: unknown): Promise<SaveCommunityLocationResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }

  const parsed = saveCommunityLocationSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { ok: false, error: 'Check the highlighted fields.', fieldErrors }
  }
  const { associationId, city, zip } = parsed.data

  const supabase = await getSupabaseServerClient()
  const before = await supabase
    .from('associations')
    .select('id, compliance_settings')
    .eq('id', associationId)
    .eq('organization_id', gate.orgId)
    .maybeSingle()
  if (before.error) {
    console.error('[community-location] read failed', { code: before.error.code ?? null, associationId })
    return { ok: false, error: 'Couldn’t load your association. Try again.' }
  }
  const row = before.data as { id: string; compliance_settings: unknown } | null
  if (!row) return { ok: false, error: 'We couldn’t find that association in your HOA.' }

  const { data, error } = await supabase
    .from('associations')
    .update({ compliance_settings: withCommunityLocation(row.compliance_settings, { city, zip }) as never })
    .eq('id', associationId)
    .eq('organization_id', gate.orgId)
    .select('id')
  if (error || !data || data.length === 0) {
    console.error('[community-location] save failed', { code: error?.code ?? 'no_rows', associationId })
    return { ok: false, error: 'Couldn’t save the location. Try again.' }
  }

  revalidatePath('/settings/association')
  return { ok: true }
}
