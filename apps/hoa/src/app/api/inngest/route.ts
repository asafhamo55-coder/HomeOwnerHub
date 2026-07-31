import { serve } from 'inngest/next'
import {
  inngest,
  dailyDigestJob,
  hoaLateFeeJob,
  pmLateFeeJob,
  evictionReminderJob,
  wizardDraftRemindersJob,
  stateLawRefreshJob,
  mailboxSyncJob,
  mailboxWatchdogJob,
  mailboxBackfillJob,
} from '@homeowner-portal/jobs'

// All five crons mount in the HOA app for Phase 1. Inngest is a single
// app-id ("homeownerhub") so it doesn't matter where the handler lives —
// scheduled invocations target the function id, not the host. Apps/eviction
// and apps/pm could mount the same handler if they need their own
// inngest.send() event ingress, but for now they don't.
//
// Webhooks (which Stripe POSTs to /api/inngest from outside) are exempt
// from auth middleware: the matcher in src/middleware.ts excludes
// /api/inngest already.
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    dailyDigestJob,
    hoaLateFeeJob,
    pmLateFeeJob,
    evictionReminderJob,
    wizardDraftRemindersJob,
    stateLawRefreshJob,
    mailboxSyncJob,
    mailboxWatchdogJob,
    mailboxBackfillJob,
  ],
})
