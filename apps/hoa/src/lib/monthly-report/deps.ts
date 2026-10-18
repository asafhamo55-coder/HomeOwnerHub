// What apps/hoa injects into the month-end board report job (BL-073).
//
// The job lives in packages/jobs, which cannot import this app. The email
// transport and the report builder (the board packet's loaders) live here.
//
// `sendEmail` is the app's guarded sender: every recipient passes the
// outbound safety guard (BL-004) before Resend is called. Do not replace
// it with a raw transport; deps.test.ts pins this.
//
// The job has no request and therefore no signed-in user, so the report is
// read with a service-role client; load.ts scopes every read by the org or
// association id the job hands it.

import { createAdminClient } from '@homeowner-portal/db'
import type { MonthlyReportDeps } from '@homeowner-portal/jobs'
import { todayIn } from '@/lib/association-time'
import type { AccountingDb } from '@/lib/accounting/queries'
import { appUrl, sendEmail } from '@/lib/email'
import { buildMonthlyReport, periodForMonth } from './load'

export const monthlyReportDeps: MonthlyReportDeps = {
  sendEmail,
  // sendEmail no-ops and reports success without a key (see email.ts).
  emailConfigured: () => Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  buildReport: (input) =>
    buildMonthlyReport(
      createAdminClient() as unknown as AccountingDb,
      {
        orgId: input.orgId,
        associationId: input.associationId,
        associationName: input.associationName,
        timeZone: input.timeZone,
        period: periodForMonth(input.month.after),
        today: todayIn(input.timeZone),
      },
      appUrl,
    ),
}
