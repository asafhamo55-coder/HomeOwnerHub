import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { getAccountingContext } from '@/lib/accounting/queries'
import { DEFAULT_ASSOCIATION_TIME_ZONE } from '@/lib/association-time'
import { packetMeetingQuery } from '@/lib/board-packet/queries'
import { loadAnnualReport, type AnnualReportMeeting } from '@/lib/annual-report/load'
import { formatDay, todayIso } from '@/lib/money/format'
import { PrintPacketButton } from '../packet/PrintPacketButton'
import { AnnualReportView } from './AnnualReportView'
import { readKitAssociations } from '@/lib/meeting-quorum/load'
import { readNarrative } from '@/lib/annual-report/narrative'
import { BoardMessage } from './BoardMessage'

export const metadata = { title: 'Annual report to owners' }
export const dynamic = 'force-dynamic'

/**
 * BL-153: the annual-meeting report for owners (Georgia § 44-3-230(a):
 * "comprehensive reports of the affairs, finances, and budget projections
 * of the association"). Board/admin build it; owners get the printout or
 * the message the board sends from the composer. Nothing is sent from
 * here.
 *
 * Unlike the board packet (same folder, ../packet), every section is
 * owner-safe: built in lib/annual-report/model.ts from aggregate figures
 * only, with no home, owner, per-home balance or vendor detail.
 */
export default async function AnnualReportPage(props: { params: Promise<{ id: string }> }) {
  const { org } = await requireBoardOrAdmin()
  const { id } = await props.params
  const supabase = await getSupabaseServerClient()

  // Scoped to the caller's org in the query itself (SEC3-L9).
  const meetingRes = await loadOrFail('meeting', packetMeetingQuery(supabase, org.id, id))
  const crumbsFor = (label: string) => [
    { label: 'Meetings', href: '/meetings' },
    { label, href: `/meetings/${id}` },
    { label: 'Annual report' },
  ]
  if (!meetingRes.ok) {
    return (
      <Page title="Annual report to owners" breadcrumbs={crumbsFor('Meeting')} linkAs={Link}>
        <LoadFailed what="this meeting" hint="The report is built from the meeting date, so nothing else can load without it." />
      </Page>
    )
  }
  if (!meetingRes.data) notFound()
  const meeting = meetingRes.data as unknown as AnnualReportMeeting
  if (!/^\d{4}-\d{2}-\d{2}/.test(meeting.meeting_date ?? '')) {
    return (
      <Page title="Annual report to owners" breadcrumbs={crumbsFor('Meeting')} linkAs={Link}>
        <Alert variant="error" title="This meeting has no valid date">
          Edit the meeting and set its date; the report covers the year up to it.
        </Alert>
      </Page>
    )
  }

  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  const ctx = ctxRes.ok ? ctxRes.data : null
  const timeZone = ctx?.timeZone ?? DEFAULT_ASSOCIATION_TIME_ZONE
  const today = todayIso(timeZone)

  const loaded = await loadAnnualReport({ supabase, orgId: org.id, meeting, ctx, ctxFailed: !ctxRes.ok, today, timeZone })
  const crumbs = crumbsFor(formatDay(meeting.meeting_date, 'medium'))
  if (!loaded.ok) {
    return (
      <Page title="Annual report to owners" breadcrumbs={crumbs} linkAs={Link}>
        <LoadFailed what={loaded.what} hint="The report needs it to know which year to cover. Reload to try again." />
      </Page>
    )
  }
  const report = loaded.report
  const assocs = await readKitAssociations(supabase, org.id)
  const savedNarrative = assocs.ok && assocs.rows[0] ? readNarrative(assocs.rows[0].compliance_settings, id) : ''

  return (
    <Page
      width="wide"
      eyebrow={`${report.associationName} · ${report.meeting.type}`}
      title="Annual report to owners"
      description={`${report.window.label}. For the ${report.meeting.type.toLowerCase()} on ${formatDay(report.meeting.date)}. Prepared ${formatDay(report.preparedOn)}.`}
      breadcrumbs={crumbs}
      linkAs={Link}
      actions={
        <span className="print:hidden">
          <PrintPacketButton />
        </span>
      }
    >
      <div className="space-y-3 print:hidden">
        <p className="rounded-lg border border-border bg-subtle px-4 py-3 text-sm text-foreground-secondary">
          For every owner. It shows totals only: no home, owner or balance of any one home, and no premium, policy number or bank detail. Read the
          motions before you share it. Print it, save it as a PDF, or draft a message to owners below; nothing is sent from this page.
        </p>
        {!report.meeting.annual ? (
          <Alert variant="info" title="This isn’t the annual meeting">
            The report is meant for the annual meeting. You can still print it for this one.
          </Alert>
        ) : null}
      </div>

      <AnnualReportView report={report} boardMessage={<BoardMessage report={report} meetingId={id} initialText={savedNarrative} />} />
    </Page>
  )
}
