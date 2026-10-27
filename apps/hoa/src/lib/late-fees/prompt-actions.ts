'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { lateFeePromptDismissedCookie } from './dashboard-prompt'

/**
 * BL-147: hide the dashboard late-fee prompt in this browser. A per-browser
 * cookie like the setup checklist's: no migration, and the prompt goes away
 * for good once a policy is saved. Board/admin only.
 */
export async function dismissLateFeePrompt(): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: BOARD_ONLY_DENIED }
  const store = await cookies()
  store.set(lateFeePromptDismissedCookie(gate.orgId), '1', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 90,
  })
  revalidatePath('/')
  return { ok: true }
}
