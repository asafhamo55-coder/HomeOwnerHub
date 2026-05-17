import Link from 'next/link'
import { BookOpen, ChevronLeft } from 'lucide-react'
import { Badge, Card, EmptyState } from '@homeowner-portal/ui'
import {
  getAccountingContext,
  listAccounts,
  listFunds,
  type ChartAccount,
  type Fund,
} from '@/lib/accounting/queries'

export const metadata = { title: 'Chart of Accounts' }

const TYPE_ORDER = ['asset', 'liability', 'equity', 'income', 'expense'] as const
const TYPE_LABEL: Record<(typeof TYPE_ORDER)[number], string> = {
  asset: 'Assets (1xxx)',
  liability: 'Liabilities (2xxx)',
  equity: 'Equity (3xxx)',
  income: 'Income (4xxx)',
  expense: 'Expenses (5xxx)',
}

export default async function ChartOfAccountsPage() {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<BookOpen className="h-10 w-10" aria-hidden />}
          title="No chart of accounts yet"
          description="This area is empty. Contact support to set up your chart of accounts."
        />
      </div>
    )
  }

  const [accounts, funds] = await Promise.all([
    listAccounts(ctx.associationId),
    listFunds(ctx.associationId),
  ])

  const fundById = new Map<string, Fund>(funds.map((f) => [f.id, f]))
  const byType = new Map<string, ChartAccount[]>()
  for (const a of accounts) {
    const list = byType.get(a.account_type) ?? []
    list.push(a)
    byType.set(a.account_type, list)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Accounting
        </Link>
        <h1>Chart of Accounts</h1>
        <p className="text-sm text-muted">
          {accounts.length} accounts. Numbers follow 1xxx assets / 2xxx liabilities
          / 3xxx equity / 4xxx income / 5xxx expenses, but the system enforces no
          numbering scheme — you can match your CPA's.
        </p>
      </header>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-10 w-10" aria-hidden />}
          title="No accounts yet"
          description="This area is empty. Contact support to set up your chart of accounts."
        />
      ) : (
        <div className="space-y-4">
          {TYPE_ORDER.filter((t) => (byType.get(t) ?? []).length > 0).map((type) => {
            const rows = byType.get(type) ?? []
            return (
              <Card key={type}>
                <div className="border-b border-border px-4 py-2 text-sm font-semibold text-foreground">
                  {TYPE_LABEL[type]}
                  <span className="ml-2 text-xs font-normal text-muted">
                    {rows.length} {rows.length === 1 ? 'account' : 'accounts'}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Number</th>
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-4 py-2 font-medium">Fund</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((a) => {
                      const fund = a.fund_id ? fundById.get(a.fund_id) : null
                      return (
                        <tr key={a.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-2 font-mono text-xs text-muted">
                            {a.account_number}
                          </td>
                          <td className="px-4 py-2">
                            <div className="font-medium text-foreground">{a.account_name}</div>
                            {a.description ? (
                              <div className="text-xs text-muted">{a.description}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {fund ? (
                              <span className="font-mono text-muted">{fund.code}</span>
                            ) : (
                              <span className="text-muted">shared</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            {a.is_active ? (
                              <Badge variant="success" size="sm">active</Badge>
                            ) : (
                              <Badge variant="outline" size="sm">inactive</Badge>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  </table>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
