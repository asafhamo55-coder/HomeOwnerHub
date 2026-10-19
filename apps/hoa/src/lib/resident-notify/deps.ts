// What apps/hoa injects into the resident notification runner (BL-082).
//
// `sendEmail` / `sendSms` are the app's GUARDED senders: every recipient
// passes the outbound safety guard (BL-004) before Resend / Vonage is
// called. Do not replace them with a raw transport; deps.test.ts pins this.

import { appUrl, sendEmail } from '@/lib/email'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { sendSms } from '@/lib/sms'
import type { ResidentNotifyDeps } from './run'

export const residentNotifyDeps: ResidentNotifyDeps = {
  sendEmail,
  sendSms,
  // Both senders no-op and report success without their keys (email.ts,
  // sms.ts), so the runner checks these before claiming anything.
  emailConfigured: () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  smsConfigured: () =>
    Boolean(process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET && process.env.VONAGE_FROM_NUMBER),
  // The secret Settings → Resident notices signs the setting with.
  settingsSecret: paySettingsSecret,
  portalUrl: appUrl,
}
