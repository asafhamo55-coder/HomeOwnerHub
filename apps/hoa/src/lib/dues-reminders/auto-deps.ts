// What apps/hoa injects into the automated dues-reminder job (BL-013).
//
// The job lives in packages/jobs, which cannot import this app. The email
// transport, the template and the signing secret all live here, so they
// are handed in — the same factory pattern as createDailyDigestJob.
//
// `sendEmail` is the app's guarded sender: every recipient passes the
// outbound safety guard (BL-004) before Resend is called. Do not replace
// it with a raw transport; auto-deps.test.ts pins this.

import type { DuesRemindersDeps } from '@homeowner-portal/jobs'
import { appUrl, sendEmail } from '@/lib/email'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { renderAutoReminder } from './auto-render'

export const duesReminderDeps: DuesRemindersDeps = {
  sendEmail,
  appUrl,
  render: renderAutoReminder,
  // Same server-only secret as the Zelle settings; config.ts signs under
  // its own domain string, so one signature can never verify as the other.
  settingsSecret: paySettingsSecret,
  // sendEmail no-ops and reports success without a key (see email.ts).
  emailConfigured: () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
}
