import Link from 'next/link'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { previousMonthIn } from '@homeowner-portal/jobs/monthly-board-report'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readPrimaryAssociation } from '@/lib/association-setup'
import { todayIn } from '@/lib/association-time'
import type { AccountingDb } from '@/lib/accounting/queries'
import { appUrl } from '@/lib/email'
import { tryLoad } from '@/lib/load-or-fail'
import { buildMonthlyReport, periodForMonth } from '@/lib/monthly-report/load'

export const metadata = { title: 'Monthly board report preview' }
export const dynamic = 'force-dynamic'

/**
 * Preview of the month-end board report (BL-073): the exact email HTML the
 * job sends, for last month, rendered in-app. Built with the signed-in
 * board member's RLS client — the same loaders, the same renderer — so
 * what's here is what the board gets. Nothing is sent from this page.
 */
export default async function MonthlyReportPreviewPage() {
  const { org } = await requireBoardOrAdmin()
  const crumbs = [{ label: 'Reports', href: '/accounting/reports' }, { label: 'Monthly board report' }]
  const supabase = await getSupabaseServerClient()

  const assoc = await readPrimaryAssociation(supabase, org.id)
  if (!assoc.ok || !assoc.data) {
    return (
      <Page title="Monthly board report" breadcrumbs={crumbs} linkAs={Link}>
        {assoc.ok ? (
          <Alert variant="info" title="No association yet">
            The report is built from the association’s books. Set up the association first.
          </Alert>
        ) : (
          <LoadFailed what="the association" hint="The preview is built from it, so nothing else can load." />
        )}
      </Page>
    )
  }

  const { id: associationId, name: associationName, timeZone } = assoc.data
  const month = previousMonthIn(timeZone, new Date())
  const report = await tryLoad('monthly board report preview', () =>
    buildMonthlyReport(
      supabase as unknown as AccountingDb,
      { orgId: org.id, associationId, associationName, timeZone, period: periodForMonth(month.after), today: todayIn(timeZone) },
      appUrl,
    ),
  )

  return (
    <Page
      title={`Monthly board report · ${month.label}`}
      description="Exactly what board members get by email on the 1st. Sections that fail to load say so in the email too."
      breadcrumbs={crumbs}
      linkAs={Link}
    >
      {report.ok ? (
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Subject: <span className="font-medium text-foreground">{report.data.subject}</span>
          </p>
          <div className="overflow-hidden rounded-xl border border-border bg-subtle">
            <iframe
              title={`Board report email for ${month.label}`}
              srcDoc={report.data.html}
              // No scripts, no navigation from inside the preview.
              sandbox=""
              className="block h-[1500px] w-full border-0"
            />
          </div>
        </div>
      ) : (
        <LoadFailed what="the report preview" />
      )}
    </Page>
  )
}
