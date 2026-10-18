// What apps/hoa injects into the vendor COI expiry reminder job (BL-083).
//
// `sendEmail` is the app's guarded sender: every recipient passes the
// outbound safety guard (BL-004) before Resend is called. Do not replace
// it with a raw transport; deps.test.ts pins this.

import type { VendorCoiRemindersDeps } from '@homeowner-portal/jobs'
import { sendEmail } from '@/lib/email'
import { paySettingsSecret } from '@/lib/pay-by-zelle'

export const vendorCoiReminderDeps: VendorCoiRemindersDeps = {
  sendEmail,
  // The secret Settings → Vendors signs compliance_settings.vendor_insurance
  // with; its own domain string keeps it apart from the other signed values.
  settingsSecret: paySettingsSecret,
  // sendEmail no-ops and reports success without a key (see email.ts).
  emailConfigured: () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
}
