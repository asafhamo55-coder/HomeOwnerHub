import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from './client'

/**
 * Morning health check across every active HOA org, 7am Eastern.
 *
 * This used to also pre-generate the Daily Digest. It no longer does. The
 * digest's numbers are now computed in SQL at render time
 * (apps/hoa/src/lib/dashboard/digest-facts.ts) and its one AI line is a
 * "start with X" suggestion that names a specific thread — pre-generating
 * that at 7am means directing a board member at a thread they may have
 * answered at 9am, which is worse than no suggestion at all. The dashboard
 * card refreshes the line itself once a day on first visit, so nothing is
 * lost by dropping it here.
 *
 * What remains is the part that genuinely needs a schedule: surfacing a
 * mailbox that has stopped syncing. A board that believes email is flowing
 * while it isn't loses trust in the product permanently, and nobody is
 * watching sync_status on their own.
 *
 * The Inngest function id stays 'daily-digest' deliberately. Changing an
 * id registers a NEW function and leaves the old one scheduled, so the
 * rename would have to be coordinated with a deploy that unregisters the
 * old id — not worth it for a cosmetic name.
 */
export const dailyDigestJob = inngest.createFunction(
  { id: 'daily-digest', name: 'Morning mailbox health check' },
  { cron: 'TZ=America/New_York 0 7 * * *' },
  async ({ logger }) => {
    const db = createAdminClient()

    const { data: orgs, error } = await db
      .from('orgs')
      .select('id')
      .eq('hub_type', 'hoa')
      .neq('plan', 'free')

    if (error) {
      logger.error('[daily-digest] failed to load orgs', error)
      throw new Error(error.message)
    }

    let brokenTotal = 0

    for (const org of orgs ?? []) {
      const orgId = org.id as string

      const { data: brokenMailboxes, error: brokenMailboxesError } = await db
        .from('mailbox_accounts')
        .select('email_address, sync_status, sync_error')
        .eq('organization_id', orgId)
        .is('disconnected_at', null)
        .in('sync_status', ['stalled', 'auth_failed'])

      if (brokenMailboxesError) {
        // A failed check here must not read as "nothing is broken" — log
        // it (message/code only; PostgrestError.details can carry row
        // values) and keep going to the next org.
        logger.error(`[daily-digest] ${orgId}: failed to check mailbox sync status`, {
          code: brokenMailboxesError.code,
          message: brokenMailboxesError.message,
        })
        continue
      }

      for (const mailbox of brokenMailboxes ?? []) {
        brokenTotal += 1
        logger.error(
          `[daily-digest] ${orgId}: mailbox ${mailbox.email_address} is ` +
            `${mailbox.sync_status} — ${mailbox.sync_error ?? 'no detail'}`,
        )
      }
    }

    return { processed: (orgs ?? []).length, brokenMailboxes: brokenTotal }
  },
)
