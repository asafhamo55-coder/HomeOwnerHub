import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from '../client'
import {
  runVendorCoiReminders,
  supabaseVendorCoiStore,
  type CoiAssociationResult,
  type VendorCoiRemindersDeps,
} from './run'

/**
 * Vendor COI expiry reminders (BL-083), 10am Eastern daily — an hour after
 * dues reminders, so the two never contend for the email rate limit.
 *
 * A factory, like createDuesRemindersJob: the guarded `sendEmail` (BL-004)
 * and the settings secret live in apps/hoa and are injected. On for every
 * association unless its board turns vendor reminders off at
 * /settings/vendors; the board's in-app notices go out either way.
 *
 * The deterministic communications id (milestones.ts) is what makes a
 * duplicate email impossible; `concurrency: 1` is belt and braces.
 */
export function createVendorCoiRemindersJob(deps: VendorCoiRemindersDeps) {
  return inngest.createFunction(
    { id: 'vendor-coi-reminders', name: 'Vendor insurance expiry reminders', concurrency: { limit: 1 } },
    { cron: 'TZ=America/New_York 0 10 * * *' },
    async ({ step, logger }) =>
      runVendorCoiReminders(
        supabaseVendorCoiStore(createAdminClient()),
        deps,
        new Date(),
        logger,
        // One step per association: a tenant's bad data retries alone, and
        // a retried function replays finished steps from memo.
        async (associationId, fn) =>
          (await step.run(`vendor-coi-reminders-${associationId}`, fn)) as CoiAssociationResult,
      ),
  )
}
