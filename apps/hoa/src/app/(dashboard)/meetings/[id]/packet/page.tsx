import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { getAccountingContext } from '@/lib/accounting/queries'
import { packetPeriod } from '@/lib/board-packet/period'
import { loadPacketSections } from '@/lib/board-packet/sections'
import { loadBalanceSheet, loadBudgetsVsActual, loadIncomeStatement } from '@/lib/board-packet/financials'
import { loadDelinquency, loadOpenArc, loadOpenViolations, loadPreviousMeeting } from '@/lib/board-packet/queries'
import { formatDay, formatDayRange, todayIso } from '@/lib/money/format'
import { MEETING_TYPE } from '@/lib/status/community'
import { PrintPacketButton } from './PrintPacketButton'
import {
  AccountingMissing,
  AgendaSection,
  ArcSection,
  BalanceSheetSection,
  BudgetSection,
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
  await requireBoardOrAdmin()
  const { id } = await props.params
  const supabase = await getSupabaseServerClient()

  const meetingRes = await loadOrFail(
    'meeting',
    supabase
      .from('hoa_meeting_minutes')
      .select('id, org_id, meeting_date, meeting_type, ai_summary, status')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle(),
  )
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

  const today = todayIso()
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  const ctx = ctxRes.ok ? ctxRes.data : null
  const assocId = ctx?.associationId ?? null

  // Association-scoped sections need the accounting context; without one
  // they are skipped (and say why) rather than loaded against nothing.
  const s = await loadPacketSections({
    previous: () => loadPreviousMeeting(supabase, meeting.org_id, meeting.meeting_date),
    income: assocId ? () => loadIncomeStatement(assocId, period) : null,
    balance: assocId ? () => loadBalanceSheet(assocId, period) : null,
    budgets: assocId ? () => loadBudgetsVsActual(assocId, period) : null,
    delinquency: assocId ? () => loadDelinquency(supabase, assocId, today) : null,
    violations: () => loadOpenViolations(supabase, meeting.org_id),
    arc: () => loadOpenArc(supabase, meeting.org_id),
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
          subtitle="The fiscal-year budget covering this month, against every entry posted to it so far. Variance is positive when it helps."
        >
          {money(<BudgetSection res={s.budgets} />)}
        </PacketSection>

        <PacketSection id="delinquency" title="Delinquency" subtitle={`Every unpaid charge due before ${formatDay(today)}, by unit`}>
          {money(<DelinquencySection res={s.delinquency} />)}
        </PacketSection>

        <PacketSection id="violations" title="Open violations" subtitle="Not yet resolved, cured, waived or dismissed">
          <ViolationsSection res={s.violations} />
        </PacketSection>

        <PacketSection id="arc" title="Open ARC applications" subtitle="Submitted or in review">
          <ArcSection res={s.arc} />
        </PacketSection>
      </div>
    </Page>
  )
}
