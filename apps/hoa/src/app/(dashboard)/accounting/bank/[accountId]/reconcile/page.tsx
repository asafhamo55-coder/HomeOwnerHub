import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ListChecks } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
  Pager,
  StatusPill,
  pageRange,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { getAccountingContext, listBankAccounts } from '@/lib/accounting/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { formatDay, formatStamp, usd } from '@/lib/money/format'
import { AccountingLoadFailed, accountingCrumbs } from '../../../_components/shared'
import { ReconcileForm } from './ReconcileForm'
import { ApproveReconciliationButton } from './ApproveReconciliationButton'

export const metadata = { title: 'Reconcile' }
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 12

interface RecRow {
  id: string
  statement_date: string
  statement_balance: number | null
  reconciled_balance: number | null
  approved_at: string | null
}

interface PageProps {
  params: Promise<{ accountId: string }>
  searchParams: Promise<{ page?: string }>
}

export default async function ReconcilePage({ params, searchParams }: PageProps) {
  const { accountId } = await params
  const crumbs = accountingCrumbs(['Bank', '/accounting/bank'], ['Reconcile'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Reconcile" what="this bank account" breadcrumbs={crumbs} width="narrow" />
  const ctx = ctxRes.data
  if (!ctx) notFound()
  const accountsRes = await tryLoad('bank accounts', () => listBankAccounts(ctx.associationId))
  if (!accountsRes.ok) return <AccountingLoadFailed title="Reconcile" what="this bank account" breadcrumbs={crumbs} width="narrow" />
  const account = accountsRes.data.find((a) => a.id === accountId)
  if (!account) notFound()

  const page = parsePageParam((await searchParams).page)
  const { from, to } = pageRange(page, PAGE_SIZE)
  const supabase = await getSupabaseServerClient()
  const recs = await loadOrFail(
    'reconciliations',
    supabase
      .from('bank_reconciliations')
      .select('id, statement_date, statement_balance, reconciled_balance, approved_at', { count: 'exact' })
      .eq('bank_account_id', accountId)
      .order('statement_date', { ascending: false })
      .range(from, to),
  )
  const rows = recs.ok ? ((recs.data ?? []) as RecRow[]) : []
  const total = recs.ok ? (recs.count ?? rows.length) : 0

  const diffOf = (r: RecRow) =>
    r.statement_balance != null && r.reconciled_balance != null ? Number(r.statement_balance) - Number(r.reconciled_balance) : null

  const columns: DataTableColumn<RecRow>[] = [
    { key: 'date', header: 'Statement date', mobilePrimary: true, className: 'whitespace-nowrap', cell: (r) => formatDay(r.statement_date) },
    { key: 'statement', header: 'Statement', numeric: true, cell: (r) => usd(r.statement_balance == null ? null : Number(r.statement_balance)) },
    { key: 'ledger', header: 'Ledger', numeric: true, cell: (r) => usd(r.reconciled_balance == null ? null : Number(r.reconciled_balance)) },
    {
      key: 'diff',
      header: 'Difference',
      numeric: true,
      cell: (r) => {
        const d = diffOf(r)
        if (d === null) return <span className="text-muted">—</span>
        return Math.abs(d) < 0.01 ? <span className="text-muted">{usd(0)}</span> : <span className="text-danger">{usd(d)}</span>
      },
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) =>
        r.approved_at ? (
          <StatusPill tone="success" label={`Approved ${formatStamp(r.approved_at)}`} size="sm" />
        ) : (
          <StatusPill tone="warning" label="Awaiting approval" size="sm" />
        ),
    },
    {
      key: 'action',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) => (r.approved_at ? null : <ApproveReconciliationButton reconciliationId={r.id} difference={diffOf(r) ?? 0} />),
    },
  ]

  return (
    <Page
      width="default"
      linkAs={Link}
      breadcrumbs={accountingCrumbs(['Bank', '/accounting/bank'], [account.account_name])}
      title={`Reconcile ${account.account_name}`}
      description={`${account.bank_name ?? 'Bank'}${account.last4 ? ` ··${account.last4}` : ''}${account.fund ? ` · ${account.fund.name}` : ''}. Compare the bank statement with the ledger’s cash balance on the same date.`}
    >
      <Card>
        <CardHeader>
          <CardTitle as="h2">New reconciliation</CardTitle>
          <CardDescription>We compute the ledger balance through the statement date and record both numbers.</CardDescription>
        </CardHeader>
        <CardContent>
          <ReconcileForm bankAccountId={accountId} />
        </CardContent>
      </Card>

      <section aria-labelledby="history" className="space-y-3">
        <h2 id="history" className="text-lg font-semibold text-foreground">
          History
        </h2>
        {!recs.ok ? (
          <LoadFailed what="past reconciliations" />
        ) : (
          <DataTable
            caption="Past reconciliations"
            mobile="cards"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            empty={
              <EmptyState
                variant="compact"
                icon={<ListChecks aria-hidden />}
                title="No reconciliations yet"
                description="Run the first one above with your latest statement — it sets the baseline."
              />
            }
            footer={
              total > PAGE_SIZE ? (
                <Pager
                  page={page}
                  pageSize={PAGE_SIZE}
                  total={total}
                  rowCount={rows.length}
                  hrefFor={(p) => (p > 1 ? `/accounting/bank/${accountId}/reconcile?page=${p}` : `/accounting/bank/${accountId}/reconcile`)}
                  linkAs={Link}
                  noun="reconciliations"
                />
              ) : undefined
            }
          />
        )}
      </section>
    </Page>
  )
}
