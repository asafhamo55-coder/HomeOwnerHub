// The auth sign-in email behind a contact-update ticket's submitted_by
// (model.ts trustContactRequest). A request's "Signed in as" line is free
// text a resident can type; the only authoritative record of who they
// signed in as is auth.users, which no RLS client can read — and
// profiles.email is writable by its own user (own_profile), so it is not
// one either. So this is the one service-role call in PR-10: a READ of
// auth emails by user id. Every row the board reads or writes still goes
// through the board's own RLS client (apply.ts).
//
// Server-only: callers are server actions and server components. Logs ids
// and codes only, never an address.

import { createAdminClient } from '@homeowner-portal/db'
import type { SubmitterEmails } from './apply'

export const authSubmitterEmails: SubmitterEmails = async (userIds) => {
  const ids = [...new Set(userIds)]
  if (ids.length === 0) return new Map()
  try {
    const admin = createAdminClient()
    const results = await Promise.all(ids.map((id) => admin.auth.admin.getUserById(id)))
    const out = new Map<string, string | null>()
    for (let i = 0; i < ids.length; i++) {
      const { data, error } = results[i]!
      if (error) {
        // A deleted account names nobody: its tickets are ordinary ones.
        // Anything else is a failed read — fail closed.
        if ((error as { status?: number }).status === 404) {
          out.set(ids[i]!, null)
          continue
        }
        console.error('[contact-updates] submitter email read failed', { userId: ids[i], status: (error as { status?: number }).status ?? null })
        return null
      }
      out.set(ids[i]!, data.user?.email?.trim().toLowerCase() || null)
    }
    return out
  } catch {
    console.error('[contact-updates] submitter email read threw', { count: ids.length })
    return null
  }
}
