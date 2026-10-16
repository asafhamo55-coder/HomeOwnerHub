// Role gate for accounting server actions.
//
// Server actions are public endpoints: the (dashboard) layout redirecting
// residents away from /accounting does nothing to stop a resident POSTing
// an action id directly. RLS (migration 0061) is the real boundary; this
// fails fast with a readable error instead of a raw RLS message, and keeps
// the actions from doing any work (W18 runs, Plaid calls) for a caller the
// database would refuse anyway.
//
// Returns an error result rather than redirecting, like members.ts's
// "Board members can only invite residents." Callers render `error`.

import { getCurrentUserRole } from '@/lib/auth'

export const ACCOUNTING_DENIED = 'Only board members and admins can change accounting records.'

/** The same gate for non-accounting board actions (0063 sweep). */
export const BOARD_ONLY_DENIED = 'Only board members and admins can make this change.'

export type AccountingGate =
  | { ok: true; role: 'admin' | 'board'; orgId: string }
  | { ok: false; error: string }

export async function requireBoardOrAdminForAction(
  denied: string = ACCOUNTING_DENIED,
): Promise<AccountingGate> {
  const ctx = await getCurrentUserRole()
  if (!ctx) return { ok: false, error: 'You are not signed in to an organization.' }
  if (ctx.role !== 'admin' && ctx.role !== 'board') return { ok: false, error: denied }
  return { ok: true, role: ctx.role, orgId: ctx.org.id }
}
