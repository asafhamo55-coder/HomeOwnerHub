import { createAdminClient } from '@homeowner-portal/db'
import { inngest } from '../client'
import {
  runDuesReminders,
  supabaseReminderStore,
  type AssociationRunResult,
  type DuesRemindersDeps,
  type PlanSweepResult,
} from './run'

/**
 * Automated dues reminders (BL-013), 9am Eastern daily. First, per
 * association, it completes payment plans that are paid in full (BL-080),
 * so a home whose plan just ended is reminded like any other.
 *
 * A factory, like createDailyDigestJob: the email transport and the
 * template live in apps/hoa, which depends on this package, so the app
 * injects its guarded `sendEmail` (BL-004) and its renderer. Off for every
 * association until its board turns it on at /settings/reminders.
 *
 * `concurrency: 1` keeps two invocations from planning at once; the
 * deterministic communications id (schedule.ts) is what actually makes a
 * duplicate send impossible, so this is belt and braces.
 */
export function createDuesRemindersJob(deps: DuesRemindersDeps) {
  return inngest.createFunction(
    { id: 'dues-reminders', name: 'Automated dues reminders', concurrency: { limit: 1 } },
    { cron: 'TZ=America/New_York 0 9 * * *' },
    async ({ step, logger }) =>
      runDuesReminders(
        supabaseReminderStore(createAdminClient()),
        deps,
        new Date(),
        logger,
        // Each association in its own step: one tenant's bad data retries
        // alone, and a retry of the function replays finished steps from
        // memo instead of re-running them.
        async (associationId, fn) =>
          (await step.run(`dues-reminders-${associationId}`, fn)) as AssociationRunResult,
        // BL-080: the payment-plan completion sweep, its own step per
        // association, ahead of that association's reminder plan.
        async (associationId, fn) =>
          (await step.run(`payment-plans-${associationId}`, fn)) as PlanSweepResult,
      ),
  )
}
