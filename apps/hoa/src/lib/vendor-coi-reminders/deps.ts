// What apps/hoa injects into the vendor COI expiry reminder job (BL-083).
//
// Deliberately NO sender. Owner rule 2026-10-20: nothing emails anyone
// outside the board automatically, so the job only writes the board's
// in-app notices. The vendor email is a draft the board sends by hand from
// the vendor page (lib/vendor-coi-request.ts). deps.test.ts pins this.

import type { VendorCoiRemindersDeps } from '@homeowner-portal/jobs'
import { paySettingsSecret } from '@/lib/pay-by-zelle'

export const vendorCoiReminderDeps: VendorCoiRemindersDeps = {
  // The secret Settings → Vendors signs compliance_settings.vendor_insurance
  // with; its own domain string keeps it apart from the other signed values.
  settingsSecret: paySettingsSecret,
}
