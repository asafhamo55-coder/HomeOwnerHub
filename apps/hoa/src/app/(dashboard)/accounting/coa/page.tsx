import { BookOpen } from 'lucide-react'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
  StatusPill,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { getAccountingContext, listAccounts, listFunds, type AccountType, type ChartAccount } from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp } from '../_components/shared'

export const metadata = { title: 'Chart of Accounts' }
export const dynamic = 'force-dynamic'

const TYPE_ORDER: AccountType[] = ['asset', 'liability', 'equity', 'income', 'expense']
const TYPE_META: Record<AccountType, { title: string; blurb: string }> = {
  asset: { title: 'Assets', blurb: 'What the association owns or is owed — cash, receivables.' },
  liability: { title: 'Liabilities', blurb: 'What it owes — unpaid bills, prepaid dues.' },
  equity: { title: 'Equity', blurb: 'Each fund’s accumulated balance.' },
  income: { title: 'Income', blurb: 'Dues, fees, fines and interest.' },
  expense: { title: 'Expenses', blurb: 'What the association spends on.' },
}

export default async function ChartOfAccountsPage() {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Chart of accounts" what="the chart of accounts" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Chart of accounts" />

  const [accounts, funds] = await Promise.all([
    tryLoad('chart of accounts', () => listAccounts(ctx.associationId)),
    tryLoad('funds', () => listFunds(ctx.associationId)),
  ])
  const fundName = new Map((funds.ok ? funds.data : []).map((f) => [f.id, f.name]))

  const columns: DataTableColumn<ChartAccount>[] = [
    { key: 'number', header: 'Number', className: 'num w-24 whitespace-nowrap text-muted', cell: (a) => a.account_number },
    {
      key: 'name',
      header: 'Name',
      mobilePrimary: true,
      cell: (a) => (
        <span className="block">
          <span className="block font-medium text-foreground">{a.account_name}</span>
          {a.description ? <span className="block text-xs text-muted">{a.description}</span> : null}
        </span>
      ),
    },
    {
      key: 'fund',
      header: 'Fund',
      className: 'whitespace-nowrap text-muted',
      cell: (a) => (a.fund_id ? (fundName.get(a.fund_id) ?? '—') : 'Shared'),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (a) => (a.is_active ? <StatusPill tone="success" label="Active" size="sm" /> : <StatusPill tone="neutral" label="Inactive" size="sm" />),
    },
  ]

  const byType = new Map<string, ChartAccount[]>()
  for (const a of accounts.ok ? accounts.data : []) {
    byType.set(a.account_type, [...(byType.get(a.account_type) ?? []), a])
  }

  return (
    <Page
      title="Chart of accounts"
      description={
        accounts.ok
          ? `${accounts.data.length} accounts. Numbering follows the usual 1xxx–5xxx convention, but any scheme your CPA uses works.`
          : 'Every account the books post to.'
      }
      tabs={<AccountingTabs />}
    >
      {!accounts.ok ? (
        <LoadFailed what="the chart of accounts" />
      ) : accounts.data.length === 0 ? (
        <EmptyState
          icon={<BookOpen aria-hidden />}
          title="No accounts yet"
          description="The standard chart is created when accounting is set up. Contact support to add it."
        />
      ) : (
        TYPE_ORDER.filter((t) => (byType.get(t) ?? []).length > 0).map((type) => {
          const rows = byType.get(type) ?? []
          return (
            <Card key={type} className="overflow-hidden">
              <CardHeader actions={<span className="text-xs text-muted">{rows.length} {rows.length === 1 ? 'account' : 'accounts'}</span>}>
                <CardTitle as="h2">{TYPE_META[type].title}</CardTitle>
                <CardDescription>{TYPE_META[type].blurb}</CardDescription>
              </CardHeader>
              <DataTable
                framed={false}
                density="compact"
                mobile="cards"
                caption={TYPE_META[type].title}
                columns={columns}
                rows={rows}
                rowKey={(a) => a.id}
              />
            </Card>
          )
        })
      )}
    </Page>
  )
}
