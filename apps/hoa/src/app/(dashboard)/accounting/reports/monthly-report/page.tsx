import Link from 'next/link'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { previousMonthIn } from '@homeowner-portal/jobs/monthly-board-report'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readPrimaryAssociation } from '@/lib/association-setup'
import { todayIn } from '@/lib/association-time'
import type { AccountingDb } from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { loadMonthlyReportData, periodForMonth } from '@/lib/monthly-report/load'
import { PrintPacketButton } from '../../../meetings/[id]/packet/PrintPacketButton'
import { MonthlyReportView } from './MonthlyReportView'

export const metadata = { title: 'Monthly board report preview' }
export const dynamic = 'force-dynamic'

/**
 * The month-end board report (BL-073) for last month, in the app and on
 * paper. Built with the signed-in board member's RLS client and the same
 * loaders the emailed report uses, and read through the same view model
 * (lib/monthly-report/view.ts), so the page and the email agree. Print or
 * save as PDF from the button. Nothing is sent from this page.
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
    loadMonthlyReportData(
      supabase as unknown as AccountingDb,
      { orgId: org.id, associationId, associationName, timeZone, period: periodForMonth(month.after), today: todayIn(timeZone) },
    ),
  )

  return (
    <Page
      eyebrow={associationName}
      title={`Monthly board report: ${month.label}`}
      description="The same report board members get by email on the 1st. Sections that fail to load say so here and in the email."
      breadcrumbs={crumbs}
      linkAs={Link}
      actions={
        <span className="print:hidden">
          <PrintPacketButton />
        </span>
      }
    >
      {report.ok ? <MonthlyReportView data={report.data} /> : <LoadFailed what="the report" />}
    </Page>
  )
}
