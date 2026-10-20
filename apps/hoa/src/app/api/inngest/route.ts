import { serve } from 'inngest/next'
import {
  inngest,
  createDailyDigestJob,
  createDuesRemindersJob,
  createMonthlyBoardReportJob,
  createVendorCoiRemindersJob,
  createScheduledCommunicationsJob,
  createAiSpendAlertJob,
  createBillingBandSyncJob,
  createBillingRenewalJob,
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
import { AI_SPEND_ALERT_COST_PER_CALL_USD, PLATFORM_AI_DAILY_ALERT_USD } from '@/lib/api/ai-limits'
import { billingStripePort } from '@/lib/billing-stripe-port'

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

// Vendor COI expiry reminders (BL-083): in-app notices to the BOARD only;
// no sender is injected, so it cannot email a vendor (owner rule
// 2026-10-20). The settings secret is app-side; off at /settings/vendors.
const vendorCoiRemindersJob = createVendorCoiRemindersJob(vendorCoiReminderDeps)

// Scheduled messages (BL-102 A1): every five minutes, claim due
// "send later" communications at most once and deliver them through the
// app's own render path and guarded senders (BL-004). Board-scheduled only:
// it sends nothing a board member didn't schedule.
const scheduledCommunicationsJob = createScheduledCommunicationsJob({
  deliver: (id) => dispatchScheduledCommunication(id),
})

// Platform AI spend alert (BL-108): once a day, yesterday's estimated AI
// spend across every org; over $50 it emails the platform admin
// (AI_SPEND_ALERT_TO), never a board or resident. The guarded sendEmail
// and the per-call estimates are app-side. BL-112: the estimates include the
// platform labels (embeddings, `job.*` model calls), not just org buckets.
const aiSpendAlertJob = createAiSpendAlertJob({
  sendEmail,
  costPerCallUsd: AI_SPEND_ALERT_COST_PER_CALL_USD,
  thresholdUsd: PLATFORM_AI_DAILY_ALERT_USD,
})

// BL-104 billing jobs, both no-ops while PRICING_V2 is off. Stripe is
// injected through the app's adapter (lib/billing-stripe-port.ts); every
// change is proration_behavior 'none'.
//  - Nightly band sync: new-plan orgs' quantity follows the homes on file
//    when that changes the price; the new band bills from the next renewal.
//  - Grandfathered renewal: the 30-day notice to the BOARD (guarded
//    sendEmail, once per term) and the switch to Complete at renewal.
const billingBandSyncJob = createBillingBandSyncJob({ stripe: billingStripePort })
const billingRenewalJob = createBillingRenewalJob({ stripe: billingStripePort, sendEmail, appUrl })

// Twenty-four functions (crons and event listeners) mount in the HOA app. Inngest is a single
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
    aiSpendAlertJob,
    billingBandSyncJob,
    billingRenewalJob,
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
