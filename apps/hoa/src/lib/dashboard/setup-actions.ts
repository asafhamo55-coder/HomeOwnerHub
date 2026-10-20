'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { isChecklistDismissible, loadSetupChecklist, setupDismissedCookie } from './setup-checklist'

/**
 * Hide the completed setup checklist for the current org.
 *
 * Re-derives completion on the server rather than trusting the button:
 * only a complete checklist can be dismissed (BL-008). A per-browser
 * cookie, not a stored flag — no migration, and the dashboard only honours
 * it while the checklist is still complete, so a step that regresses
 * (the last property deleted) brings the card back.
 */
export async function dismissSetupChecklist(): Promise<{ ok: boolean; error?: string }> {
  const org = await getCurrentOrg()
  if (!org) return { ok: false, error: 'No HOA selected.' }

  const supabase = await getSupabaseServerClient()
  const checklist = await loadSetupChecklist(supabase, org.id)
  if (!isChecklistDismissible(checklist)) {
    return { ok: false, error: 'Finish every required step before hiding the checklist.' }
  }

  const store = await cookies()
  store.set(setupDismissedCookie(org.id), '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath('/')
  return { ok: true }
}
