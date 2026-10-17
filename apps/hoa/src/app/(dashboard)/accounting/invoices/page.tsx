import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'
import {
  Button,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  Kpi,
  LoadFailed,
  Page,
  Pager,
  Select,
  filterFieldClass,
  pageRange,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import {
  getAccountingContext,
  pageInvoices,
  summarizeUnpaidInvoices,
  type InvoiceRow,
} from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { daysSince, formatDay, plural, todayIso, usd } from '@/lib/money/format'
import { INVOICE_STATUS, UNPAID_INVOICE_STATUSES } from '@/lib/money/status'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp, MoneyStatus } from '../_components/shared'

export const metadata = { title: 'Invoices' }
export const dynamic = 'force-dynamic'

// Was a silent 200-row cap, and the "$X unpaid" headline was summed from
// those rows. Now paged, and the headline has its own query.
const PAGE_SIZE = 50

interface PageProps {
  searchParams: Promise<{ status?: string; page?: string }>
}

export default async function InvoicesPage({ searchParams }: PageProps) {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Invoices" what="invoices" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Invoices" returnTo="/accounting/invoices" />

  const sp = await searchParams
  const status = sp.status && sp.status in INVOICE_STATUS ? sp.status : undefined
  const page = parsePageParam(sp.page)
  const today = todayIso()

  const [list, summary] = await Promise.all([
    tryLoad('invoices', () => pageInvoices(ctx.associationId, { status }, pageRange(page, PAGE_SIZE))),
    tryLoad('unpaid invoices', () => summarizeUnpaidInvoices(ctx.associationId, today)),
  ])

  const hrefFor = (p: number) => {
    const q = new URLSearchParams()
    if (status) q.set('status', status)
    if (p > 1) q.set('page', String(p))
    const s = q.toString()
    return s ? `/accounting/invoices?${s}` : '/accounting/invoices'
  }

  const columns: DataTableColumn<InvoiceRow>[] = [
    {
      key: 'vendor',
      header: 'Vendor',
      mobilePrimary: true,
      cell: (i) => (
        <Link href={`/accounting/invoices/${i.id}`} className="group block min-w-0 no-underline">
          <span className="block truncate font-medium text-foreground group-hover:text-primary group-hover:underline">
            {i.vendor?.legal_name ?? 'Unknown vendor'}
          </span>
          <span className="num block text-xs text-muted">{i.invoice_number}</span>
        </Link>
      ),
    },
    { key: 'date', header: 'Invoice date', hideBelowLg: true, className: 'whitespace-nowrap text-muted', cell: (i) => formatDay(i.invoice_date) },
    {
      key: 'due',
      header: 'Due',
      className: 'whitespace-nowrap',
      cell: (i) => {
        if (!i.due_date) return <span className="text-muted">—</span>
        const late = (UNPAID_INVOICE_STATUSES as readonly string[]).includes(i.status) ? daysSince(i.due_date, today) : 0
        return late > 0 ? (
          <span className="text-danger">
            {formatDay(i.due_date)} <span className="text-xs">· {late}d late</span>
          </span>
        ) : (
          <span className="text-muted">{formatDay(i.due_date)}</span>
        )
      },
    },
    { key: 'amount', header: 'Amount', numeric: true, cell: (i) => usd(Number(i.amount)) },
    {
      key: 'balance',
      header: 'Balance',
      numeric: true,
      cell: (i) => {
        const paid = (i.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
        const open = Math.max(Number(i.amount) - paid, 0)
        return open > 0 && i.status !== 'cancelled' ? usd(open) : <span className="text-muted">—</span>
      },
    },
    { key: 'status', header: 'Status', cell: (i) => <MoneyStatus registry={INVOICE_STATUS} status={i.status} /> },
  ]

  return (
    <Page
      title="Invoices"
      description="Vendor bills. Entering one posts the expense; marking it paid posts the payment."
      tabs={<AccountingTabs />}
      actions={
        <Button asChild>
          <Link href="/accounting/invoices/new">
            <Plus aria-hidden />
            Enter bill
          </Link>
        </Button>
      }
    >
      <section aria-label="Unpaid bills" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Kpi
          label="Unpaid"
          value={summary.ok ? usd(summary.data.total, { whole: true }) : undefined}
          hint={summary.ok ? plural(summary.data.count, 'bill') : undefined}
          state={summary.ok ? 'ready' : 'failed'}
        />
        <Kpi
          label="Past due"
          value={summary.ok ? usd(summary.data.overdueTotal, { whole: true }) : undefined}
          hint={summary.ok ? (summary.data.overdueCount > 0 ? plural(summary.data.overdueCount, 'bill') : 'Nothing late') : undefined}
          state={summary.ok ? 'ready' : 'failed'}
        />
        <Kpi
          className="col-span-2 lg:col-span-1"
          label="Due later"
          value={summary.ok ? usd(summary.data.total - summary.data.overdueTotal, { whole: true }) : undefined}
          hint={summary.ok ? plural(summary.data.count - summary.data.overdueCount, 'bill') : undefined}
          state={summary.ok ? 'ready' : 'failed'}
        />
      </section>

      <FilterBar resetHref="/accounting/invoices" filtered={Boolean(status)} linkAs={Link} label="Filter invoices">
        <Field label="Status" className={filterFieldClass}>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">All invoices</option>
            {Object.entries(INVOICE_STATUS).map(([value, def]) => (
              <option key={value} value={value}>
                {def.label}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      {!list.ok ? (
        <LoadFailed what="invoices" />
      ) : (
        <DataTable
          caption="Invoices"
          mobile="cards"
          columns={columns}
          rows={list.data.rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              variant="compact"
              icon={<FileText aria-hidden />}
              title={status ? 'No invoices with this status' : 'No invoices yet'}
              description={
                status
                  ? 'Pick another status, or reset the filter.'
                  : 'Enter your first vendor bill — it posts the expense to the ledger right away.'
              }
              action={
                status ? undefined : (
                  <Button asChild variant="secondary">
                    <Link href="/accounting/invoices/new">
                      <Plus aria-hidden />
                      Enter bill
                    </Link>
                  </Button>
                )
              }
            />
          }
          footer={
            list.data.total > PAGE_SIZE ? (
              <Pager
                page={page}
                pageSize={PAGE_SIZE}
                total={list.data.total}
                rowCount={list.data.rows.length}
                hrefFor={hrefFor}
                linkAs={Link}
                noun="invoices"
              />
            ) : undefined
          }
        />
      )}
    </Page>
  )
}
