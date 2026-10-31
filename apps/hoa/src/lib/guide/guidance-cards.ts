/**
 * Which guidance card(s) a board member sees on the dashboard.
 *
 * How roles are known: the org creator is the one who ran onboarding, and
 * that flow inserts them into org_members with role 'admin' (there is no
 * created_by column on orgs). Invited board members get 'board'. So "creator
 * or admin" is simply role 'admin'; no new column or query is needed.
 *
 *  - admin: keeps the setup checklist (treasurer and owner setup work). The
 *    "first week" card stays out of the way until the checklist is dismissed,
 *    so there is one card at a time.
 *  - board: one welcome card with the first 3 first-week steps. No checklist.
 *  - anyone else (should not reach this page): nothing.
 */
export interface Guidance {
  setupChecklist: boolean
  firstWeek: 'none' | 'full' | 'welcome'
}

export function guidanceFor(role: string | null, setupDismissed: boolean): Guidance {
  if (role === 'admin') return { setupChecklist: true, firstWeek: setupDismissed ? 'full' : 'none' }
  if (role === 'board') return { setupChecklist: false, firstWeek: 'welcome' }
  return { setupChecklist: false, firstWeek: 'none' }
}

export const WELCOME_STEP_COUNT = 3

export function welcomeTitle(orgName: string): string {
  return `Welcome to ${orgName}. Here’s what to do first`
}
