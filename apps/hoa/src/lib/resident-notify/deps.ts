// What apps/hoa injects into the resident notification runner (BL-082).
//
// `sendEmail` / `sendSms` are the app's GUARDED senders: every recipient
// passes the outbound safety guard (BL-004) before Resend / Vonage is
// called. Do not replace them with a raw transport; deps.test.ts pins this.

import { appUrl, sendEmail } from '@/lib/email'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { sendSms, smsConfigured } from '@/lib/sms'
import type { ResidentNotifyDeps } from './run'

export const residentNotifyDeps: ResidentNotifyDeps = {
  sendEmail,
  sendSms,
  // The email sender no-ops and reports success without its key
  // (email.ts); sendSms now fails without its keys (sms.ts). The runner
  // checks both before claiming anything either way.
  emailConfigured: () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  smsConfigured,
  // The secret Settings → Resident notices signs the setting with.
  settingsSecret: paySettingsSecret,
  portalUrl: appUrl,
}
