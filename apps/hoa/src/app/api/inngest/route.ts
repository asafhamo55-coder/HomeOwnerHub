import { serve } from 'inngest/next'
import {
  inngest,
  createDailyDigestJob,
  createDuesRemindersJob,
  createMonthlyBoardReportJob,
  createVendorCoiRemindersJob,
  createScheduledCommunicationsJob,
  hoaLateFeeJob,
  pmLateFeeJob,
  evictionReminderJob,
  wizardDraftRemindersJob,
  stateLawRefreshJob,
  lawStatuteChangedJob,
  mailboxSyncJob,
  mailboxWatchdogJob,
  mailboxBackfillJob,
  mailboxReconcileJob,
  mailboxAttachmentsJob,
  mailboxReplyEmbeddingsJob,
  mailboxSendJob,
  ticketNotificationsJob,
  recurringJeJob,
  plaidSyncJob,
} from '@homeowner-portal/jobs'
import { sendEmail, appUrl } from '@/lib/email'
import { duesReminderDeps } from '@/lib/dues-reminders/auto-deps'
import { monthlyReportDeps } from '@/lib/monthly-report/deps'
import { vendorCoiReminderDeps } from '@/lib/vendor-coi-reminders/deps'
import { dispatchScheduledCommunication } from '@/lib/communications/scheduled-dispatch'

// The morning mailbox check emails the board when sync is broken (BL-003).
// It takes this app's sendEmail — guarded by BL-004 — because the email
// transport lives here, not in packages/jobs.
const dailyDigestJob = createDailyDigestJob({ sendEmail, appUrl })

// Automated dues reminders (BL-013): same factory pattern — the guarded
// sendEmail, the reminder template and the settings secret are app-side.
// Off per association until its board turns it on at /settings/reminders.
const duesRemindersJob = createDuesRemindersJob(duesReminderDeps)

// Month-end board report (BL-073): the guarded sendEmail and the report
// builder (the board packet's own loaders) are app-side.
const monthlyBoardReportJob = createMonthlyBoardReportJob(monthlyReportDeps)

// Vendor COI expiry reminders (BL-083): the guarded sendEmail and the
// settings secret are app-side. On unless the board opts out at
// /settings/vendors; vendors only, never residents.
const vendorCoiRemindersJob = createVendorCoiRemindersJob(vendorCoiReminderDeps)

// Scheduled messages (BL-102 A1): every five minutes, claim due
// "send later" communications at most once and deliver them through the
// app's own render path and guarded senders (BL-004). Board-scheduled only:
// it sends nothing a board member didn't schedule.
const scheduledCommunicationsJob = createScheduledCommunicationsJob({
  deliver: (id) => dispatchScheduledCommunication(id),
})

// Twenty-one functions (crons and event listeners) mount in the HOA app. Inngest is a single
// app-id ("homeownerhub") so it doesn't matter where the handler lives —
// scheduled invocations target the function id, not the host. Apps/eviction
// and apps/pm could mount the same handler if they need their own
// inngest.send() event ingress, but for now they don't.
//
// Only Inngest calls this route (Stripe posts to /api/webhooks/stripe, not
// here). It carries no user session, so the matcher in src/middleware.ts
// excludes exactly /api/inngest (anchored with `$`). Auth is the SDK's
// signature check on every request: in cloud mode serve() rejects an
// unsigned or wrongly signed call with 401 and fails closed when
// INNGEST_SIGNING_KEY is unset (route.test.ts pins both).
//
// Conventions exemption (api-route-conventions RC-10/RC-1): serve() owns
// GET/POST/PUT, their bodies and statuses, so the handlers are not wrapped
// in withRoute and do not use the error envelope. Job failures are reported
// by the client's failure-reporting middleware, not by this route.
//
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
    duesRemindersJob,
    monthlyBoardReportJob,
    vendorCoiRemindersJob,
    scheduledCommunicationsJob,
    hoaLateFeeJob,
    pmLateFeeJob,
    evictionReminderJob,
    wizardDraftRemindersJob,
    stateLawRefreshJob,
    lawStatuteChangedJob,
    mailboxSyncJob,
    mailboxWatchdogJob,
    mailboxBackfillJob,
    mailboxReconcileJob,
    mailboxAttachmentsJob,
    mailboxReplyEmbeddingsJob,
    mailboxSendJob,
    ticketNotificationsJob,
    recurringJeJob,
    plaidSyncJob,
  ],
})
