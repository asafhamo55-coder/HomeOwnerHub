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
  mailboxReconcileJob,
  mailboxAttachmentsJob,
  mailboxReplyEmbeddingsJob,
  mailboxSendJob,
  ticketNotificationsJob,
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
// Background work runs here, not in a request a human is waiting on: a
// mailbox sync pages through Gmail, the embedding job makes a paid provider
// call per chunk, and a send talks to the Gmail API. The platform default is
// far too short for those, and an invocation killed mid-flight surfaces as a
// transport error with no HTTP status — which is exactly how the reply
// corpus sat empty for days with nothing able to say why.
//
// Matches the ceiling already used by the routes in this app that expect
// slow work (governing-docs upload, violation drafting, recurring events).
export const maxDuration = 60

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
  mailboxReconcileJob,
    mailboxAttachmentsJob,
    mailboxReplyEmbeddingsJob,
    mailboxSendJob,
  ticketNotificationsJob,
  ],
})
