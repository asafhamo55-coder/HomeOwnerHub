import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, ListChecks } from 'lucide-react'
import { format } from 'date-fns'
import { Card, EmptyState } from '@homeowner-portal/ui'
import { getAccountingContext, listBankAccounts } from '@/lib/accounting/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ReconcileForm } from './ReconcileForm'
import { ApproveReconciliationButton } from './ApproveReconciliationButton'

export const metadata = { title: 'Reconcile' }

function currency(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

interface PageProps {
  params: Promise<{ accountId: string }>
}

export default async function ReconcilePage({ params }: PageProps) {
  const { accountId } = await params
  const ctx = await getAccountingContext()
  if (!ctx) notFound()
  const accounts = await listBankAccounts(ctx.associationId)
  const account = accounts.find((a) => a.id === accountId)
  if (!account) notFound()

  const supabase = await getSupabaseServerClient()
  const { data: priorRecs } = await supabase
    .from('bank_reconciliations')
    .select('id, statement_date, statement_balance, reconciled_balance, approved_at')
    .eq('bank_account_id', accountId)
    .order('statement_date', { ascending: false })
    .limit(12)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <Link
          href="/accounting/bank"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          Bank Accounts
        </Link>
        <h1 className="text-2xl font-bold text-foreground">Reconcile · {account.account_name}</h1>
        <p className="text-sm text-muted">
          Enter the statement balance for a given date. The system computes the
          ledger cash balance through that date and writes a
          bank_reconciliations row capturing both.
        </p>
      </header>

      <Card>
        <div className="p-6">
          <ReconcileForm bankAccountId={accountId} />
        </div>
      </Card>

      {priorRecs && priorRecs.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Prior reconciliations</h2>
          <Card>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Statement date</th>
                  <th className="px-4 py-2 text-right font-medium">Statement balance</th>
                  <th className="px-4 py-2 text-right font-medium">Ledger balance</th>
                  <th className="px-4 py-2 text-right font-medium">Difference</th>
                  <th className="px-4 py-2 font-medium">Approved</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {priorRecs.map((r) => {
                  const diff =
                    r.statement_balance != null && r.reconciled_balance != null
                      ? Number(r.statement_balance) - Number(r.reconciled_balance)
                      : null
                  return (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-foreground">
                        {format(new Date(r.statement_date), 'PP')}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-foreground">
                        {currency(Number(r.statement_balance))}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-foreground">
                        {currency(Number(r.reconciled_balance))}
                      </td>
                      <td
                        className={`px-4 py-2 text-right font-mono ${diff && Math.abs(diff) > 0.01 ? 'text-destructive' : 'text-emerald-600'}`}
                      >
                        {currency(diff)}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted">
                        {r.approved_at ? (
                          <span className="text-emerald-600">
                            ✓ {format(new Date(r.approved_at), 'PP')}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.approved_at ? null : (
                          <ApproveReconciliationButton
                            reconciliationId={r.id}
                            difference={diff ?? 0}
                          />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </Card>
        </section>
      ) : (
        <EmptyState
          icon={<ListChecks className="h-10 w-10" aria-hidden />}
          title="No prior reconciliations"
          description="Run the first one above to set the baseline."
        />
      )}
    </div>
  )
}
