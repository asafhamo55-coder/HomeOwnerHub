import { LineChart } from 'lucide-react'
import { Alert, EmptyState, LoadFailed, Page, StatementTable, StatusPill } from '@homeowner-portal/ui'
import {
  computeTrialBalance,
  getAccountingContext,
  listFiscalPeriods,
  type AccountType,
  type TrialBalanceRow,
} from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDayRange, periodLabel, usd } from '@/lib/money/format'
import { AccountingTabs } from '../AccountingTabs'
import { AccountLabel, AccountingLoadFailed, AccountingNotSetUp } from '../_components/shared'
import { PeriodFilter } from '../_components/PeriodFilter'

export const metadata = { title: 'Trial Balance' }
export const dynamic = 'force-dynamic'

const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'income', 'expense']
const TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  income: 'Income',
  expense: 'Expenses',
}

interface PageProps {
  searchParams: Promise<{ period?: string }>
}

const dash = <span className="text-muted">—</span>

export default async function TrialBalancePage({ searchParams }: PageProps) {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Trial balance" what="the trial balance" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Trial balance" />

  const sp = await searchParams
  const periodsRes = await tryLoad('fiscal periods', () => listFiscalPeriods(ctx.associationId))
  if (!periodsRes.ok) return <AccountingLoadFailed title="Trial balance" what="the trial balance" />
  const periods = periodsRes.data
  const periodId = sp.period && periods.some((p) => p.id === sp.period) ? sp.period : ctx.currentPeriod?.id
  const period = periods.find((p) => p.id === periodId)

  if (!periodId || !period) {
    return (
      <Page title="Trial balance" tabs={<AccountingTabs />}>
        <EmptyState icon={<LineChart aria-hidden />} title="No fiscal period yet" description="A trial balance covers one fiscal period. Contact support to open the first one." />
      </Page>
    )
  }

  const res = await tryLoad('trial balance', () => computeTrialBalance(ctx.associationId, periodId))
  const isBalanced = res.ok && Math.abs(res.data.totalDebits - res.data.totalCredits) < 0.005

  const byType = new Map<AccountType, TrialBalanceRow[]>()
  for (const row of res.ok ? res.data.rows : []) byType.set(row.accountType, [...(byType.get(row.accountType) ?? []), row])

  return (
    <Page
      title="Trial balance"
      description={`${periodLabel(period)} · ${formatDayRange(period.start_date, period.end_date)} · posted entries only. Debits must equal credits.`}
      meta={
        res.ok && res.data.rows.length > 0 ? (
          isBalanced ? (
            <StatusPill tone="success" label="Balanced" />
          ) : (
            <StatusPill tone="danger" label="Out of balance" />
          )
        ) : undefined
      }
      tabs={<AccountingTabs />}
    >
      <PeriodFilter periods={periods} periodId={periodId} resetHref="/accounting/trial-balance" filtered={Boolean(sp.period)} />

      {!res.ok ? (
        <LoadFailed what="the trial balance" />
      ) : res.data.rows.length === 0 ? (
        <EmptyState
          icon={<LineChart aria-hidden />}
          title="Nothing posted in this period"
          description="The trial balance fills in as journal entries are posted — dues, payments, bills."
        />
      ) : (
        <>
          {!isBalanced ? (
            <Alert variant="error" title={`Out of balance by ${usd(Math.abs(res.data.totalDebits - res.data.totalCredits))}`}>
              Debits and credits should always match. Open the ledger and check the most recent entries for a mis-posted line, then
              contact support — the database should not allow this.
            </Alert>
          ) : null}
          <StatementTable
            caption={`Trial balance, ${periodLabel(period)}`}
            columns={[
              { key: 'dr', header: 'Debits' },
              { key: 'cr', header: 'Credits' },
              { key: 'bal', header: 'Balance' },
            ]}
            sections={TYPE_ORDER.filter((t) => (byType.get(t) ?? []).length > 0).map((type) => {
              const rows = byType.get(type) ?? []
              return {
                key: type,
                title: TYPE_LABEL[type],
                rows: rows.map((r) => ({
                  key: r.accountId,
                  label: <AccountLabel number={r.accountNumber} name={r.accountName} />,
                  values: {
                    dr: r.totalDebits > 0 ? usd(r.totalDebits) : dash,
                    cr: r.totalCredits > 0 ? usd(r.totalCredits) : dash,
                    bal: (
                      <>
                        {usd(r.balance)} <span className="text-xs text-muted">{r.isNormalDebit ? 'Dr' : 'Cr'}</span>
                      </>
                    ),
                  },
                })),
                subtotal: {
                  label: `Total ${TYPE_LABEL[type].toLowerCase()}`,
                  values: {
                    dr: usd(rows.reduce((s, r) => s + r.totalDebits, 0)),
                    cr: usd(rows.reduce((s, r) => s + r.totalCredits, 0)),
                  },
                },
              }
            })}
            totals={[{ key: 'total', label: 'Total', values: { dr: usd(res.data.totalDebits), cr: usd(res.data.totalCredits) } }]}
          />
        </>
      )}
    </Page>
  )
}
