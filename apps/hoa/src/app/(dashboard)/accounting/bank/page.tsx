import Link from 'next/link'
import { Banknote, CheckCircle2, ChevronLeft, Circle, ListChecks } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, Card, EmptyState } from '@homeowner-portal/ui'
import {
  getAccountingContext,
  listBankAccounts,
  listBankTransactions,
  listFunds,
} from '@/lib/accounting/queries'
import { LinkPlaidButton } from './LinkPlaidButton'

export const metadata = { title: 'Bank Accounts' }
export const dynamic = 'force-dynamic'

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

export default async function BankAccountsPage() {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<Banknote className="h-10 w-10" aria-hidden />}
          title="Banking not yet available"
          description="This area is empty. Contact support to set up accounting for your association, then you can link a bank account."
        />
      </div>
    )
  }

  const [accounts, recent, funds] = await Promise.all([
    listBankAccounts(ctx.associationId),
    listBankTransactions(ctx.associationId, { limit: 50 }),
    listFunds(ctx.associationId),
  ])
  const fundOptions = funds.map((f) => ({ id: f.id, label: `${f.code} — ${f.name}` }))

  const unmatchedCount = recent.filter((t) => !t.matched_journal_entry_id).length

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
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1>Bank Accounts</h1>
          {unmatchedCount > 0 ? (
            <Link
              href="/accounting/bank/queue"
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-background"
            >
              <ListChecks className="h-3.5 w-3.5" />
              {unmatchedCount} unmatched in queue
            </Link>
          ) : null}
        </div>
        <p className="text-sm text-muted">
          {accounts.length} account{accounts.length === 1 ? '' : 's'} linked.
          We pull a fresh transaction feed every few hours and match each
          transaction to your ledger entries automatically.
        </p>
      </header>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="text-sm font-semibold text-foreground">Link a new bank account</p>
        <p className="mb-3 text-xs text-muted">
          Pick which fund the linked accounts attach to, then connect via
          Plaid. The popup handles bank authentication; we never see your
          credentials.
        </p>
        <LinkPlaidButton funds={fundOptions} />
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Banknote className="h-10 w-10" aria-hidden />}
          title="No bank accounts linked yet"
          description="Use the Link button above to connect your operating or reserve account via Plaid. Sandbox credentials work for dev."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {accounts.map((a) => (
            <Card key={a.id}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-foreground">{a.account_name}</p>
                    <p className="text-xs text-muted">
                      {a.bank_name ?? 'Bank'}
                      {a.last4 ? ` · …${a.last4}` : ''}
                      {a.fund ? ` · ${a.fund.code}` : ''}
                    </p>
                  </div>
                  {a.is_active ? (
                    <Badge variant="success" size="sm">linked</Badge>
                  ) : (
                    <Badge variant="outline" size="sm">inactive</Badge>
                  )}
                </div>
                <div className="mt-3 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-lg text-foreground">
                    {a.current_balance != null ? currency(Number(a.current_balance)) : '—'}
                  </span>
                  <span className="text-[11px] text-muted">
                    {a.last_synced_at
                      ? `synced ${format(new Date(a.last_synced_at), 'PP')}`
                      : 'never synced'}
                  </span>
                </div>
                <div className="mt-3 border-t border-border pt-3">
                  <Link
                    href={`/accounting/bank/${a.id}/reconcile`}
                    className="text-xs text-primary hover:underline"
                  >
                    Reconcile →
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-foreground">Recent transactions</h2>
          <Link
            href="/accounting/bank/queue"
            className="text-xs text-primary hover:underline"
          >
            View queue
          </Link>
        </div>
        {recent.length === 0 ? (
          <Card>
            <div className="p-6 text-sm text-muted">
              No transactions yet. Once a bank account is linked, transactions
              will appear here with their match status.
            </div>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Memo / Merchant</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Match</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-muted">
                      {format(new Date(t.posted_date), 'MMM d')}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {t.bank_account?.account_name ?? '—'}
                    </td>
                    <td className="px-4 py-2">
                      <p className="text-foreground">{t.memo ?? '—'}</p>
                      {t.merchant ? (
                        <p className="text-xs text-muted">{t.merchant}</p>
                      ) : null}
                    </td>
                    <td
                      className={`px-4 py-2 text-right font-mono ${Number(t.amount) < 0 ? 'text-destructive' : 'text-emerald-600'}`}
                    >
                      {currency(Number(t.amount))}
                    </td>
                    <td className="px-4 py-2">
                      {t.matched_journal_entry_id ? (
                        <Link
                          href={`/accounting/ledger/${t.matched_journal_entry_id}`}
                          className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline"
                        >
                          <CheckCircle2 className="h-3 w-3" />
                          {t.match_method ?? 'matched'}
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted">
                          <Circle className="h-3 w-3" />
                          unmatched
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  )
}
