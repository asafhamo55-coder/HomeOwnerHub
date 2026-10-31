'use server'

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { todayIn } from '@/lib/association-time'
import { orgTimeZone } from '@/lib/association-time-server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { fillSampleCommunity, removeSampleCommunity } from './core'

export type SampleActionResult = { ok: true; message: string } | { ok: false; error: string }

function refresh(): void {
  for (const p of ['/', '/properties', '/dues', '/violations', '/tickets', '/arc', '/communications', '/meetings', '/onboarding/setup']) {
    revalidatePath(p)
  }
}

/**
 * Fill the caller's own org with a clearly marked sample community.
 * Board or admin only. Refused once the org has real homes. Sends nothing.
 */
export async function addSampleCommunity(): Promise<SampleActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }

  const today = todayIn(await orgTimeZone(supabase, gate.orgId))
  const result = await fillSampleCommunity(supabase, { orgId: gate.orgId, userId: user.id, today })
  if (!result.ok) return { ok: false, error: result.error }

  refresh()
  return { ok: true, message: `Added ${result.homes} sample homes. Look around, then remove them when you are ready.` }
}

/** Delete exactly the sample data again. Board or admin only. Real rows are never touched. */
export async function removeSampleData(): Promise<SampleActionResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }

  const supabase = await getSupabaseServerClient()
  const result = await removeSampleCommunity(supabase, gate.orgId)
  if (!result.ok) return { ok: false, error: result.error }

  refresh()
  return { ok: true, message: 'The sample data is gone.' }
}
