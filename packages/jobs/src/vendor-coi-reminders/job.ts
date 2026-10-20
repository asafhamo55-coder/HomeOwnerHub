import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from '../client'
import {
  runVendorCoiReminders,
  supabaseVendorCoiStore,
  type CoiAssociationResult,
  type VendorCoiRemindersDeps,
} from './run'

/**
 * Vendor COI expiry reminders (BL-083), 10am Eastern daily — BOARD ONLY.
 *
 * Owner rule 2026-10-20: no automatic email to anyone outside the board.
 * This job writes in-app notices to board members / admins and nothing
 * else; it has no sender injected and no way to email a vendor. The board
 * sends "Request updated certificate" from the vendor page by hand.
 *
 * The function id is unchanged ('vendor-coi-reminders'): renaming it would
 * register a new function and leave the old, vendor-emailing one scheduled
 * until a coordinated deploy unregistered it.
 *
 * The deterministic notice entity id (milestones.ts) plus the notifications
 * dedupe read make a duplicate notice impossible; `concurrency: 1` is belt
 * and braces.
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
