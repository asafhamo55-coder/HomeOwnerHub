import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { getAccountingContext } from '@/lib/accounting/queries'
import { DEFAULT_ASSOCIATION_TIME_ZONE } from '@/lib/association-time'
import { packetPeriod } from '@/lib/board-packet/period'
import { loadPacketSections } from '@/lib/board-packet/sections'
import { loadBalanceSheet, loadBudgetsVsActual, loadIncomeStatement } from '@/lib/board-packet/financials'
import {
  loadDelinquency,
  loadOpenArc,
  loadOpenViolations,
  loadPreviousMeeting,
  packetMeetingQuery,
} from '@/lib/board-packet/queries'
import { formatDay, formatDayRange, todayIso } from '@/lib/money/format'
import { MEETING_TYPE } from '@/lib/status/community'
import { createAdminClient } from '@homeowner-portal/db'
import { loadComplianceOverview } from '@/lib/compliance/overview-load'
import { caBudgetLoader } from '@/lib/compliance/ca-budget-load'
import type { LooseDb } from '@/lib/compliance/evidence'
import { PrintPacketButton } from './PrintPacketButton'
import {
  AccountingMissing,
  AgendaSection,
  ArcSection,
  BalanceSheetSection,
  BudgetSection,
  ComplianceSection,
  DelinquencySection,
  IncomeStatementSection,
  PacketSection,
  PreviousMeetingSection,
  ViolationsSection,
} from './sections'

export const metadata = { title: 'Board packet' }
export const dynamic = 'force-dynamic'

/**
 * Monthly board packet (BL-016): one printable page the treasurer brings
 * to the meeting instead of six. Board/admin only — it lists delinquent
 * units — and it is never emailed from the product; the board prints it
 * or saves it as a PDF from the browser.
 *
 * The period is the calendar month before the meeting. Each section
 * loads on its own (loadPacketSections), so one failed read shows that
 * section's "Couldn't load" and the rest still print. Totals come from
 * full reads, never a page of rows (UX decision 11).
 */

interface MeetingRow {
  id: string
  org_id: string
  meeting_date: string
  meeting_type: string | null
  ai_summary: string | null
  status: string | null
}

export default async function BoardPacketPage(props: { params: Promise<{ id: string }> }) {
  const { org } = await requireBoardOrAdmin()
  const { id } = await props.params
  const supabase = await getSupabaseServerClient()

  // Scoped to the caller's org in the query itself (SEC3-L9): meeting.org_id
  // below feeds service-role reads, so it must never be another org's.
  const meetingRes = await loadOrFail('meeting', packetMeetingQuery(supabase, org.id, id))
  const crumbsFor = (label: string) => [
    { label: 'Meetings', href: '/meetings' },
    { label, href: `/meetings/${id}` },
    { label: 'Board packet' },
  ]
  if (!meetingRes.ok) {
    return (
      <Page title="Board packet" breadcrumbs={crumbsFor('Meeting')} linkAs={Link}>
        <LoadFailed what="this meeting" hint="The packet is built from the meeting date, so nothing else can load without it." />
      </Page>
    )
  }
  if (!meetingRes.data) notFound()
  const meeting = meetingRes.data as unknown as MeetingRow

  const period = packetPeriod(meeting.meeting_date)
  if (!period) {
    return (
      <Page title="Board packet" breadcrumbs={crumbsFor('Meeting')} linkAs={Link}>
        <Alert variant="error" title="This meeting has no valid date">
          Edit the meeting and set its date; the packet reports the month before it.
        </Alert>
      </Page>
    )
  }

  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  const ctx = ctxRes.ok ? ctxRes.data : null
  // The association's day (BL-043); Eastern when the context didn't load.
  const today = todayIso(ctx?.timeZone)
  const assocId = ctx?.associationId ?? null
  const timeZone = ctx?.timeZone ?? DEFAULT_ASSOCIATION_TIME_ZONE

  // Association-scoped sections need the accounting context; without one
  // they are skipped (and say why) rather than loaded against nothing.
  // Every money figure is as of the close of the packet month (BL-051) —
  // nothing posted, paid or due after `period.end` is in it.
  const s = await loadPacketSections({
    previous: () => loadPreviousMeeting(supabase, meeting.org_id, meeting.meeting_date),
    income: assocId ? () => loadIncomeStatement(assocId, period) : null,
    balance: assocId ? () => loadBalanceSheet(assocId, period) : null,
    budgets: assocId ? () => loadBudgetsVsActual(assocId, period) : null,
    delinquency: assocId ? () => loadDelinquency(supabase, assocId, period.after, timeZone) : null,
    violations: () => loadOpenViolations(supabase, meeting.org_id),
    arc: () => loadOpenArc(supabase, meeting.org_id),
    // BL-145: every association's state-law obligations, as on /compliance.
    compliance: async () => {
      const db = supabase as unknown as LooseDb
      const res = await loadComplianceOverview({
        db,
        admin: createAdminClient() as unknown as LooseDb,
        orgId: meeting.org_id,
        today,
        caBudgets: caBudgetLoader(db, meeting.org_id, today, timeZone),
      })
      if (!res.ok) throw new Error('board packet: compliance obligations failed')
      return res.overview
    },
  })

  const dateLabel = formatDay(meeting.meeting_date, 'medium')
  const typeLabel = meeting.meeting_type ? `${MEETING_TYPE[meeting.meeting_type] ?? meeting.meeting_type} meeting` : 'Meeting'
  const range = formatDayRange(period.start, period.end)
  const noAccounting = ctxRes.ok && !ctx
  const money = (node: React.ReactNode) =>
    !ctxRes.ok ? <LoadFailed what="the association’s accounting" hint="The rest of the packet is unaffected." /> : noAccounting ? <AccountingMissing /> : node

  return (
    <Page
      width="wide"
      eyebrow={`${ctx?.associationName ?? 'Board'} · ${typeLabel}`}
      title={`Board packet · ${period.label}`}
      description={`For the meeting on ${dateLabel}. Financials cover ${range}. Prepared ${formatDay(today)}.`}
      breadcrumbs={crumbsFor(formatDay(meeting.meeting_date, 'medium'))}
      linkAs={Link}
      actions={
        <span className="print:hidden">
          <PrintPacketButton />
        </span>
      }
    >
      <p className="rounded-lg border border-border bg-subtle px-4 py-3 text-sm text-foreground-secondary print:bg-transparent print:px-0">
        Board only — this packet lists delinquent units. Print it or choose “Save as PDF” in the print dialog; it is not
        sent from the app.
      </p>

      <div className="space-y-10 print:space-y-6">
        <PacketSection id="agenda" title="Agenda" first subtitle={`${typeLabel} · ${dateLabel}`}>
          <AgendaSection text={meeting.ai_summary} meetingId={meeting.id} />
        </PacketSection>

        <PacketSection id="previous" title="Action items from the previous meeting">
          <PreviousMeetingSection res={s.previous} />
        </PacketSection>

        <PacketSection id="income" title="Income statement" subtitle={`${range} · accrual basis · posted entries only`}>
          {money(<IncomeStatementSection res={s.income} />)}
        </PacketSection>

        <PacketSection id="balance" title="Balance sheet" subtitle={`As of ${formatDay(period.end)} · posted entries only`}>
          {money(<BalanceSheetSection res={s.balance} />)}
        </PacketSection>

        <PacketSection
          id="budget"
          title="Budget vs. actual"
          subtitle={`The fiscal-year budget covering this month, against entries posted to it through ${formatDay(period.end)}. Variance is positive when it helps.`}
        >
          {money(<BudgetSection res={s.budgets} />)}
        </PacketSection>

        <PacketSection
          id="delinquency"
          title="Delinquency"
          subtitle={`As of ${formatDay(period.end)}: charges due by then and still unpaid at the end of that day, by unit`}
        >
          {money(<DelinquencySection res={s.delinquency} asOf={period.end} />)}
        </PacketSection>

        <PacketSection id="violations" title="Open violations" subtitle="Not yet resolved, cured, waived or dismissed">
          <ViolationsSection res={s.violations} />
        </PacketSection>

        <PacketSection id="arc" title="Open ARC applications" subtitle="Submitted or in review">
          <ArcSection res={s.arc} />
        </PacketSection>

        <PacketSection id="compliance" title="State law compliance" subtitle={`Where each obligation stands on ${formatDay(today)}`}>
          <ComplianceSection res={s.compliance} />
        </PacketSection>
      </div>
    </Page>
  )
}
