import Link from 'next/link'
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, Landmark, ScrollText, Sparkles } from 'lucide-react'
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  DataTable,
  EmptyState,
  Kpi,
  LoadFailed,
  Page,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import {
  computeBalanceSheet,
  computeIncomeStatement,
  countDraftJournalEntries,
  countPendingProposals,
  getAccountingContext,
  listJournalEntries,
  pageBankTransactions,
  summarizeUnpaidInvoices,
  type JournalEntrySummary,
} from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDay, periodLabel, plural, todayIso, usd } from '@/lib/money/format'
import { JOURNAL_STATUS, PERIOD_STATUS, sourceLabel, statusOf } from '@/lib/money/status'
import { AccountingTabs } from './AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp, MoneyStatus } from './_components/shared'

export const metadata = { title: 'Accounting' }
export const dynamic = 'force-dynamic'

export default async function AccountingIndexPage() {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Accounting" what="accounting" width="wide" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp />

  const today = todayIso()
  const period = ctx.currentPeriod
  const aid = ctx.associationId

  // Each figure loads on its own: one failed query greys out one tile
  // ("Couldn't load"), never the page, and never reads as $0.
  const [bs, inc, recent, unpaid, unmatched, proposals, drafts] = await Promise.all([
    tryLoad('balance sheet', () => computeBalanceSheet(aid, today)),
    period ? tryLoad('income statement', () => computeIncomeStatement(aid, period.id)) : Promise.resolve(null),
    tryLoad('recent journal entries', () => listJournalEntries(aid, { limit: 8 })),
    tryLoad('unpaid invoices', () => summarizeUnpaidInvoices(aid, today)),
    tryLoad('unmatched bank transactions', () => pageBankTransactions(aid, { matched: 'unmatched' }, { from: 0, to: 0 })),
    tryLoad('pending postings', () => countPendingProposals(ctx.organizationId, aid)),
    tryLoad('draft entries', () => countDraftJournalEntries(aid)),
  ])

  const balanceOf = (number: string): number | null => {
    if (!bs.ok) return null
    const all = [...bs.data.assets, ...bs.data.liabilities, ...bs.data.equity]
    return all.find((r) => r.accountNumber === number)?.balance ?? 0
  }

  const periodStatus = period ? statusOf(PERIOD_STATUS, period.status).label.toLowerCase() : null

  return (
    <Page
      width="wide"
      title="Accounting"
      description={
        period
          ? `${ctx.associationName} · ${periodLabel(period)} is ${periodStatus}. Figures are live from posted journal entries.`
          : `${ctx.associationName} · no fiscal period yet.`
      }
      tabs={<AccountingTabs />}
      actions={
        <Button asChild>
          <Link href="/accounting/invoices/new">
            <FileText aria-hidden />
            Enter bill
          </Link>
        </Button>
      }
    >
      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi
          label="Operating cash"
          value={usd(balanceOf('1010'), { whole: true })}
          hint="Ledger balance, today"
          href="/accounting/bank"
          linkAs={Link}
          state={bs.ok ? 'ready' : 'failed'}
        />
        <Kpi
          label="Reserve cash"
          value={usd(balanceOf('1020'), { whole: true })}
          hint="Ledger balance, today"
          href="/accounting/bank"
          linkAs={Link}
          state={bs.ok ? 'ready' : 'failed'}
        />
        <Kpi
          label="Owed by owners"
          value={usd(balanceOf('1100'), { whole: true })}
          hint="Accounts receivable"
          href="/dues"
          linkAs={Link}
          state={bs.ok ? 'ready' : 'failed'}
        />
        <Kpi
          label={period ? `Net income · ${periodLabel(period)}` : 'Net income'}
          value={inc && inc.ok ? usd(inc.data.netIncome, { whole: true }) : '—'}
          hint={inc && inc.ok ? `${usd(inc.data.totalIncome, { whole: true })} in · ${usd(inc.data.totalExpenses, { whole: true })} out` : 'No open period'}
          href="/accounting/reports/income-statement"
          linkAs={Link}
          state={inc === null ? 'ready' : inc.ok ? 'ready' : 'failed'}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 lg:self-start">
          <CardHeader>
            <CardTitle as="h2">Needs attention</CardTitle>
            <CardDescription>Work waiting on the board or treasurer.</CardDescription>
          </CardHeader>
          <AttentionList
            items={[
              {
                key: 'proposals',
                name: 'AI matches',
                res: proposals,
                count: proposals.ok ? proposals.data : 0,
                icon: <Sparkles aria-hidden />,
                label: (n) => `${plural(n, 'deposit')} matched by AI, awaiting approval`,
                href: '/accounting/bank/queue#proposed-postings',
                tone: 'ai',
              },
              {
                key: 'unmatched',
                name: 'bank transactions',
                res: unmatched,
                count: unmatched.ok ? unmatched.data.total : 0,
                icon: <Landmark aria-hidden />,
                label: (n) => `${plural(n, 'bank transaction')} to match`,
                href: '/accounting/bank/queue',
                tone: 'warning',
              },
              {
                key: 'overdue',
                name: 'bills',
                res: unpaid,
                count: unpaid.ok ? unpaid.data.overdueCount : 0,
                icon: <AlertTriangle aria-hidden />,
                label: (n) => `${plural(n, 'bill')} past due · ${unpaid.ok ? usd(unpaid.data.overdueTotal) : ''}`,
                href: '/accounting/invoices?status=approved',
                tone: 'danger',
              },
              {
                key: 'unpaid',
                name: 'bills',
                res: unpaid,
                count: unpaid.ok ? unpaid.data.count - unpaid.data.overdueCount : 0,
                icon: <FileText aria-hidden />,
                label: (n) => `${plural(n, 'bill')} unpaid, not yet due`,
                href: '/accounting/invoices',
                tone: 'neutral',
              },
              {
                key: 'drafts',
                name: 'draft entries',
                res: drafts,
                count: drafts.ok ? drafts.data : 0,
                icon: <ScrollText aria-hidden />,
                label: (n) => `${plural(n, 'draft entry', 'draft entries')} not yet posted`,
                href: '/accounting/ledger?status=draft',
                tone: 'neutral',
              },
            ]}
          />
        </Card>

        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link href="/accounting/ledger">
                  Open ledger
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            }
          >
            <CardTitle as="h2">Recent journal entries</CardTitle>
            <CardDescription>The latest activity across every fund.</CardDescription>
          </CardHeader>
          {recent.ok ? (
            <DataTable
              framed={false}
              density="compact"
              mobile="cards"
              caption="Recent journal entries"
              columns={RECENT_COLUMNS}
              rows={recent.data}
              rowKey={(r) => r.id}
              empty={
                <EmptyState
                  variant="compact"
                  icon={<ScrollText aria-hidden />}
                  title="No journal entries yet"
                  description="Entries post automatically when dues are generated, owners pay, or you enter a bill."
                />
              }
            />
          ) : (
            <div className="px-5 pb-5">
              <LoadFailed what="recent journal entries" />
            </div>
          )}
        </Card>
      </div>
    </Page>
  )
}

const RECENT_COLUMNS: DataTableColumn<JournalEntrySummary>[] = [
  {
    key: 'memo',
    header: 'Entry',
    mobilePrimary: true,
    cell: (je) => (
      <Link href={`/accounting/ledger/${je.id}`} className="group block min-w-0 no-underline">
        <span className="block max-w-[22rem] truncate font-medium text-foreground group-hover:text-primary group-hover:underline">
          {je.memo}
        </span>
        <span className="block text-xs text-muted">
          <span className="num">{je.entry_number}</span> · {sourceLabel(je.source)}
        </span>
      </Link>
    ),
  },
  { key: 'date', header: 'Date', className: 'whitespace-nowrap text-muted', cell: (je) => formatDay(je.entry_date, 'short') },
  { key: 'amount', header: 'Amount', numeric: true, cell: (je) => usd(je.totalAmount) },
  { key: 'status', header: 'Status', cell: (je) => <MoneyStatus registry={JOURNAL_STATUS} status={je.status} /> },
]

interface AttentionItem {
  key: string
  /** For the "couldn't check" line. */
  name: string
  res: { ok: boolean }
  count: number
  icon: React.ReactNode
  label: (n: number) => string
  href: string
  tone: 'ai' | 'warning' | 'danger' | 'neutral'
}

const TONE_ICON: Record<AttentionItem['tone'], string> = {
  ai: 'bg-accent-subtle text-accent-fg',
  warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger',
  neutral: 'bg-subtle text-muted',
}

function AttentionList({ items }: { items: AttentionItem[] }) {
  const failed = items.filter((i) => !i.res.ok)
  const live = items.filter((i) => i.res.ok && i.count > 0)
  if (live.length === 0 && failed.length === 0) {
    return (
      <div className="flex items-center gap-3 px-5 pb-5 text-sm text-foreground-secondary">
        <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
        All caught up — nothing is waiting on you.
      </div>
    )
  }
  return (
    <ul className="divide-y divide-border border-t border-border">
      {live.map((i) => (
        <li key={i.key}>
          <Link
            href={i.href}
            className="group flex items-center gap-3 px-5 py-3 text-sm no-underline transition-colors duration-fast hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
          >
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4 ${TONE_ICON[i.tone]}`}>
              {i.icon}
            </span>
            <span className="min-w-0 flex-1 text-foreground">{i.label(i.count)}</span>
            <ArrowRight className="size-4 shrink-0 text-muted transition-transform duration-fast group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </li>
      ))}
      {failed.length > 0 ? (
        <li className="flex items-center gap-2 px-5 py-3 text-xs text-danger">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          Couldn’t check {[...new Set(failed.map((f) => f.name))].join(', ')} — refresh to try again.
        </li>
      ) : null}
    </ul>
  )
}
