import Link from 'next/link'
import { Calculator, ClipboardList, Scale, ScrollText } from 'lucide-react'
import {
  Alert,
  Button,
  DataTable,
  EmptyState,
  Kpi,
  LoadFailed,
  StatementTable,
  StatusBadge,
  StatusPill,
  cn,
  type DataTableColumn,
  type StatementRow,
} from '@homeowner-portal/ui'
import type { LoadResult } from '@/lib/load-or-fail'
import { complianceSummary, type ComplianceOverview, type ObligationTone } from '@/lib/compliance/obligations'
import type { BalanceSheet, IncomeStatement, ReportLineRow } from '@/lib/accounting/queries'
import type { PacketBudget } from '@/lib/board-packet/financials'
import type { DelinquencySummary, DelinquentUnit } from '@/lib/board-packet/delinquency'
import type { OpenItems, PacketActionItem, PacketArc, PacketViolation, PreviousMeeting } from '@/lib/board-packet/queries'
import { LIST_CAP } from '@/lib/board-packet/queries'
import { formatDay, periodLabel, plural, signTone, usd, usdSigned } from '@/lib/money/format'
import { BUDGET_STATUS, statusOf } from '@/lib/money/status'
import { ACTION_ITEM_STATUS, ARC_CATEGORY, ARC_STATUS, MEETING_TYPE, VIOLATION_STATUS } from '@/lib/status/community'
import { AccountLabel } from '../../../accounting/_components/shared'

/**
 * One packet section. Every section after the first starts a new sheet of
 * paper, and its heading never strands at the foot of a page.
 */
export function PacketSection({
  id,
  title,
  subtitle,
  first = false,
  children,
}: {
  id: string
  title: string
  subtitle?: React.ReactNode
  first?: boolean
  children: React.ReactNode
}) {
  return (
    <section aria-labelledby={id} className={cn('min-w-0 space-y-4', !first && 'print:break-before-page')}>
      <div className="break-after-avoid border-b border-border pb-2">
        <h2 id={id} className="text-lg font-semibold text-foreground">
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** "Accounting isn't set up" — a real state, not a failure. */
export function AccountingMissing() {
  return (
    <EmptyState
      variant="compact"
      icon={<Calculator aria-hidden />}
      title="Accounting isn’t set up"
      description="Financial statements appear here once the association has a chart of accounts and posted entries."
      action={
        <Button asChild variant="secondary" size="sm" className="print:hidden">
          <Link href="/accounting">Open accounting</Link>
        </Button>
      }
    />
  )
}

/**
 * The free-text column of a list table. On a phone the table scrolls
 * sideways (DataTable's scroller) instead of crushing this column to one
 * word per line; on paper the page is wide enough, so the floor goes.
 */
const TEXT_COL = 'min-w-[13rem] print:min-w-0'

/** Totals row: three figures across, stacked on a phone. */
function Figures({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-3 sm:gap-4 print:grid-cols-3">{children}</div>
}

const lineRows = (rows: ReportLineRow[]): StatementRow[] =>
  rows.map((r) => ({ key: r.accountId, label: <AccountLabel number={r.accountNumber} name={r.accountName} />, values: { amt: usd(r.balance) } }))

// ─── Income statement ───────────────────────────────────────────────

export function IncomeStatementSection({ res }: { res: LoadResult<IncomeStatement> }) {
  if (!res.ok) return <LoadFailed what="the income statement" hint="The rest of the packet is unaffected." />
  const d = res.data
  const netLabel = d.netIncome < 0 ? 'Net loss' : 'Net income'
  return (
    <>
      <Figures>
        <Kpi label="Income" value={usd(d.totalIncome, { whole: true })} />
        <Kpi label="Expenses" value={usd(d.totalExpenses, { whole: true })} />
        <Kpi label={netLabel} value={<span className={d.netIncome < 0 ? 'text-danger' : undefined}>{usd(d.netIncome, { whole: true })}</span>} />
      </Figures>
      <StatementTable
        caption="Income statement for the period"
        columns={[{ key: 'amt', header: 'Amount' }]}
        sections={[
          { key: 'income', title: 'Income', rows: lineRows(d.income), subtotal: { label: 'Total income', values: { amt: usd(d.totalIncome) } } },
          { key: 'expenses', title: 'Expenses', rows: lineRows(d.expenses), subtotal: { label: 'Total expenses', values: { amt: usd(d.totalExpenses) } } },
        ]}
        totals={[{ key: 'net', label: netLabel, values: { amt: <span className={d.netIncome < 0 ? 'text-danger' : undefined}>{usd(d.netIncome)}</span> } }]}
      />
    </>
  )
}

// ─── Balance sheet ──────────────────────────────────────────────────

export function BalanceSheetSection({ res }: { res: LoadResult<BalanceSheet> }) {
  if (!res.ok) return <LoadFailed what="the balance sheet" hint="The rest of the packet is unaffected." />
  const d = res.data
  return (
    <>
      <Figures>
        <Kpi label="Total assets" value={usd(d.totalAssets, { whole: true })} />
        <Kpi label="Total liabilities" value={usd(d.totalLiabilities, { whole: true })} />
        <Kpi label="Total equity" value={usd(d.totalEquity, { whole: true })} hint="Including net income to date" />
      </Figures>
      {!d.isBalanced ? (
        <Alert variant="error" title="Assets don’t equal liabilities plus equity">
          Contact support before relying on these figures.
        </Alert>
      ) : null}
      <StatementTable
        caption="Balance sheet at the close of the period"
        columns={[{ key: 'amt', header: 'Balance' }]}
        sections={[
          { key: 'assets', title: 'Assets', rows: lineRows(d.assets), subtotal: { label: 'Total assets', values: { amt: usd(d.totalAssets) } } },
          { key: 'liabilities', title: 'Liabilities', rows: lineRows(d.liabilities), subtotal: { label: 'Total liabilities', values: { amt: usd(d.totalLiabilities) } } },
          {
            key: 'equity',
            title: 'Equity',
            rows: [
              ...lineRows(d.equity),
              {
                key: 'ni',
                label: <span className="block pl-[2.875rem] italic text-foreground-secondary">Net income, period to date</span>,
                values: { amt: usd(d.netIncomePtd) },
              },
            ],
            subtotal: { label: 'Total equity', values: { amt: usd(d.totalEquity) } },
          },
        ]}
        totals={[{ key: 'le', label: 'Total liabilities + equity', values: { amt: usd(d.totalLiabilities + d.totalEquity) } }]}
      />
    </>
  )
}

// ─── Budget vs actual ───────────────────────────────────────────────

const variance = (n: number) => <span className={signTone(n)}>{usdSigned(n, { whole: true })}</span>

export function BudgetSection({ res }: { res: LoadResult<PacketBudget[]> }) {
  if (!res.ok) return <LoadFailed what="budget vs. actual" hint="The rest of the packet is unaffected." />
  if (res.data.length === 0) {
    return (
      <EmptyState
        variant="compact"
        icon={<Scale aria-hidden />}
        title="No budget covers this month"
        description="Create a budget for the fiscal year and the packet compares each line with what was collected or spent."
        action={
          <Button asChild variant="secondary" size="sm" className="print:hidden">
            <Link href="/accounting/budget/new">New budget</Link>
          </Button>
        }
      />
    )
  }
  return (
    <div className="space-y-6">
      {res.data.map(({ budget, report }) => {
        const t = report.totals
        const rows = (type: 'income' | 'expense'): StatementRow[] =>
          report.rows
            .filter((r) => r.accountType === type)
            .map((r) => ({
              key: r.accountId,
              label: <AccountLabel number={r.accountNumber} name={r.accountName} />,
              values: { b: usd(r.budgeted, { whole: true }), a: usd(r.actual, { whole: true }), v: variance(r.variance) },
            }))
        return (
          <div key={budget.id} className="space-y-2 break-inside-avoid">
            <p className="text-sm font-medium text-foreground">
              {budget.fund?.name ?? 'Fund'}
              {budget.fiscalPeriod ? ` · ${periodLabel(budget.fiscalPeriod)}` : ''}
              <span className="text-muted"> · {statusOf(BUDGET_STATUS, budget.status).label}</span>
            </p>
            <StatementTable
              caption={`Budget vs. actual, ${budget.fund?.name ?? 'fund'}`}
              columns={[
                { key: 'b', header: 'Budget' },
                { key: 'a', header: 'Actual' },
                { key: 'v', header: 'Variance' },
              ]}
              sections={[
                {
                  key: 'income',
                  title: 'Income',
                  rows: rows('income'),
                  subtotal: { label: 'Total income', values: { b: usd(t.budgetedIncome, { whole: true }), a: usd(t.actualIncome, { whole: true }), v: variance(t.actualIncome - t.budgetedIncome) } },
                },
                {
                  key: 'expense',
                  title: 'Expenses',
                  rows: rows('expense'),
                  subtotal: { label: 'Total expenses', values: { b: usd(t.budgetedExpense, { whole: true }), a: usd(t.actualExpense, { whole: true }), v: variance(t.budgetedExpense - t.actualExpense) } },
                },
              ]}
              totals={[{ key: 'net', label: 'Net surplus (deficit)', values: { b: usd(t.budgetedNet, { whole: true }), a: usd(t.actualNet, { whole: true }), v: variance(t.varianceNet) } }]}
            />
          </div>
        )
      })}
    </div>
  )
}

// ─── Delinquency ────────────────────────────────────────────────────

const delinquentColumns: DataTableColumn<DelinquentUnit>[] = [
  { key: 'unit', header: 'Unit', className: TEXT_COL, cell: (u) => <span className="break-words">{u.label}</span> },
  { key: 'charges', header: 'Charges', numeric: true, cell: (u) => u.charges },
  { key: 'oldest', header: 'Oldest due', cell: (u) => <span className="whitespace-nowrap">{formatDay(u.oldestDue)}</span> },
  { key: 'days', header: 'Days late', numeric: true, cell: (u) => u.daysOverdue },
  { key: 'amount', header: 'Overdue', numeric: true, cell: (u) => usd(u.amount) },
]

/** `asOf` is the last day of the packet month ('YYYY-MM-DD'); balances are at its close. */
export function DelinquencySection({ res, asOf }: { res: LoadResult<DelinquencySummary>; asOf: string }) {
  if (!res.ok) return <LoadFailed what="the delinquency summary" hint="The rest of the packet is unaffected." />
  const d = res.data
  return (
    <>
      <Figures>
        <Kpi label="Overdue" value={usd(d.totalOverdue, { whole: true })} hint={plural(d.chargeCount, 'charge')} />
        <Kpi label="Units behind" value={String(d.unitCount)} />
        <Kpi label="Over 90 days" value={usd(d.aging.d90_plus, { whole: true })} />
      </Figures>
      <DataTable
        caption="Overdue balance by age"
        columns={[
          { key: 'bucket', header: 'Days past due', cell: (r: { label: string; amount: number }) => r.label },
          { key: 'amount', header: 'Amount', numeric: true, cell: (r) => usd(r.amount) },
        ]}
        rows={[
          { label: '1–30', amount: d.aging.d1_30 },
          { label: '31–60', amount: d.aging.d31_60 },
          { label: '61–90', amount: d.aging.d61_90 },
          { label: 'Over 90', amount: d.aging.d90_plus },
        ]}
        rowKey={(r) => r.label}
        density="compact"
      />
      <DataTable
        caption="Units with an overdue balance, largest first"
        showCaption
        columns={delinquentColumns}
        rows={d.units}
        rowKey={(u) => u.key}
        density="compact"
        empty={<EmptyState variant="compact" icon={<ClipboardList aria-hidden />} title="No unit was behind" description={`Every charge due by ${formatDay(asOf)} was paid by the end of that day.`} />}
      />
    </>
  )
}

// ─── Open violations / ARC ──────────────────────────────────────────

function breakdown(byStatus: Record<string, number>, labels: Record<string, string>): string {
  return Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${n} ${(labels[s] ?? s).toLowerCase()}`)
    .join(' · ')
}

function CappedNote({ shown, total, what }: { shown: number; total: number; what: string }) {
  if (total <= shown) return null
  return (
    <p className="text-xs text-muted">
      Showing the oldest {shown} of {total} {what}. The count above covers all of them.
    </p>
  )
}

const violationColumns: DataTableColumn<PacketViolation>[] = [
  {
    key: 'where',
    header: 'Property',
    className: TEXT_COL,
    cell: (v) => <span className="break-words">{[v.property?.unit_number, v.property?.address].filter(Boolean).join(' · ') || '—'}</span>,
  },
  { key: 'type', header: 'Type', cell: (v) => v.violation_type },
  { key: 'opened', header: 'Opened', cell: (v) => <span className="whitespace-nowrap">{formatDay(v.created_at)}</span> },
  { key: 'status', header: 'Status', cell: (v) => <StatusBadge status={v.status} tones={VIOLATION_STATUS.tones} labels={VIOLATION_STATUS.labels} /> },
]

export function ViolationsSection({ res }: { res: LoadResult<OpenItems<PacketViolation>> }) {
  if (!res.ok) return <LoadFailed what="open violations" hint="The rest of the packet is unaffected." />
  const d = res.data
  return (
    <>
      <p className="text-sm text-foreground">
        <span className="num font-semibold">{d.total}</span> open
        {d.total > 0 ? <span className="text-muted"> — {breakdown(d.byStatus, VIOLATION_STATUS.labels)}</span> : null}
      </p>
      <DataTable
        caption="Open violations, oldest first"
        columns={violationColumns}
        rows={d.rows}
        rowKey={(v) => v.id}
        density="compact"
        empty={<EmptyState variant="compact" icon={<ClipboardList aria-hidden />} title="No open violations" description="Nothing is waiting on a notice, a cure or a fine." />}
      />
      <CappedNote shown={Math.min(d.rows.length, LIST_CAP)} total={d.total} what="open violations" />
    </>
  )
}

const arcColumns: DataTableColumn<PacketArc>[] = [
  { key: 'unit', header: 'Unit', cell: (a) => a.unit?.unit_number ?? '—' },
  { key: 'category', header: 'Category', cell: (a) => ARC_CATEGORY[a.category] ?? a.category },
  { key: 'summary', header: 'Request', className: TEXT_COL, cell: (a) => <span className="break-words">{a.summary}</span> },
  { key: 'submitted', header: 'Submitted', cell: (a) => <span className="whitespace-nowrap">{formatDay(a.submitted_at)}</span> },
  { key: 'status', header: 'Status', cell: (a) => <StatusBadge status={a.status} tones={ARC_STATUS.tones} labels={ARC_STATUS.labels} /> },
]

export function ArcSection({ res }: { res: LoadResult<OpenItems<PacketArc>> }) {
  if (!res.ok) return <LoadFailed what="open ARC applications" hint="The rest of the packet is unaffected." />
  const d = res.data
  return (
    <>
      <p className="text-sm text-foreground">
        <span className="num font-semibold">{d.total}</span> awaiting a decision
        {d.total > 0 ? <span className="text-muted"> — {breakdown(d.byStatus, ARC_STATUS.labels)}</span> : null}
      </p>
      <DataTable
        caption="Open ARC applications, oldest first"
        columns={arcColumns}
        rows={d.rows}
        rowKey={(a) => a.id}
        density="compact"
        empty={<EmptyState variant="compact" icon={<ClipboardList aria-hidden />} title="No applications waiting" description="Every architectural request has a decision." />}
      />
      <CappedNote shown={Math.min(d.rows.length, LIST_CAP)} total={d.total} what="applications" />
    </>
  )
}

// ─── Previous meeting's action items ────────────────────────────────

const actionColumns: DataTableColumn<PacketActionItem>[] = [
  { key: 'title', header: 'Action item', className: TEXT_COL, cell: (i) => <span className="break-words">{i.title}</span> },
  { key: 'who', header: 'Owner', cell: (i) => i.assignee_name ?? '—' },
  { key: 'due', header: 'Due', cell: (i) => <span className="whitespace-nowrap">{formatDay(i.due_date)}</span> },
  { key: 'status', header: 'Status', cell: (i) => <StatusBadge status={i.status} tones={ACTION_ITEM_STATUS.tones} labels={ACTION_ITEM_STATUS.labels} /> },
]

export function PreviousMeetingSection({ res }: { res: LoadResult<PreviousMeeting> }) {
  if (!res.ok) return <LoadFailed what="the previous meeting’s action items" hint="The rest of the packet is unaffected." />
  const { meeting, items } = res.data
  if (!meeting) {
    return <p className="text-sm text-muted">This is the first meeting on record, so there are no earlier action items.</p>
  }
  const open = items.filter((i) => i.status === 'open' || i.status === 'in_progress').length
  return (
    <>
      <p className="text-sm text-foreground">
        From the {MEETING_TYPE[meeting.meeting_type ?? ''] ? `${MEETING_TYPE[meeting.meeting_type ?? '']!.toLowerCase()} ` : ''}meeting on{' '}
        <Link href={`/meetings/${meeting.id}`} className="font-medium text-primary underline-offset-2 hover:underline print:text-foreground print:no-underline">
          {formatDay(meeting.meeting_date)}
        </Link>
        <span className="text-muted"> · {plural(items.length, 'item')}, {open} still open</span>
      </p>
      <DataTable
        caption="Action items from the previous meeting"
        columns={actionColumns}
        rows={items}
        rowKey={(i) => i.id}
        density="compact"
        empty={<EmptyState variant="compact" icon={<ClipboardList aria-hidden />} title="No action items were recorded" description="Add them on that meeting’s page if any were agreed." />}
      />
    </>
  )
}

// ─── Agenda ─────────────────────────────────────────────────────────

export function AgendaSection({ text, meetingId }: { text: string | null; meetingId: string }) {
  if (!text?.trim()) {
    return (
      <EmptyState
        variant="compact"
        icon={<ScrollText aria-hidden />}
        title="No agenda yet"
        description="Add the agenda on the meeting so it prints here."
        action={
          <Button asChild variant="secondary" size="sm" className="print:hidden">
            <Link href={`/meetings/${meetingId}/edit`}>Edit meeting</Link>
          </Button>
        }
      />
    )
  }
  return (
    <div className="max-w-prose space-y-3 text-base leading-relaxed text-foreground">
      {text.split('\n\n').map((para, i) => (
        <p key={i} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          {para}
        </p>
      ))}
    </div>
  )
}

// ─── State law compliance (BL-145) ──────────────────────────────────

const OBLIGATION_PILL: Record<ObligationTone, 'danger' | 'warning' | 'info' | 'success' | 'neutral'> = {
  overdue: 'danger',
  soon: 'warning',
  upcoming: 'info',
  done: 'success',
  standing: 'neutral',
  unknown: 'warning',
  failed: 'danger',
  not_loaded: 'neutral',
}

/** Every obligation with its status, as on /compliance; statute text stays on the page. */
export function ComplianceSection({ res }: { res: LoadResult<ComplianceOverview> }) {
  if (!res.ok) return <LoadFailed what="your state-law obligations" hint="The rest of the packet is unaffected." />
  const o = res.data
  const sum = complianceSummary(o)
  const multiple = o.groups.length > 1
  return (
    <>
      <p className="text-sm text-foreground">
        <span className="num font-semibold">{sum.overdue}</span> overdue ·{' '}
        <span className="num font-semibold">{sum.open - sum.overdue}</span> coming up
        <span className="text-muted"> — details and the statute text are on Compliance.</span>
      </p>
      {o.groups.map((g) => (
        <div key={g.associationId} className="space-y-2">
          {multiple ? <h3 className="text-sm font-semibold text-foreground">{g.associationName}</h3> : null}
          <ul className="divide-y divide-border rounded-md border border-border">
            {g.obligations.map((ob) => (
              <li key={ob.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 text-foreground">{ob.title}</span>
                <StatusPill tone={OBLIGATION_PILL[ob.tone]} label={ob.label} />
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted print:hidden">
        <Link href="/compliance" className="font-medium text-primary hover:underline">
          Open Compliance
        </Link>
      </p>
    </>
  )
}
