import Link from 'next/link'
import { FileText, Plus } from 'lucide-react'
import { format } from 'date-fns'
import { Badge, BackLink, Button, Card, EmptyState, PageHeader, Select } from '@homeowner-portal/ui'
import { getAccountingContext, listInvoices } from '@/lib/accounting/queries'

export const metadata = { title: 'Invoices' }
export const dynamic = 'force-dynamic'

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'outline' | 'default'> = {
  received: 'outline',
  coded: 'outline',
  approved: 'warning',
  paid: 'success',
  disputed: 'destructive',
  cancelled: 'outline',
}

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

interface PageProps {
  searchParams: Promise<{ status?: string }>
}

export default async function InvoicesPage({ searchParams }: PageProps) {
  const ctx = await getAccountingContext()
  if (!ctx) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState
          icon={<FileText className="h-10 w-10" aria-hidden />}
          title="No invoices yet"
          description="Run pnpm seed:accounting first, then enter your first vendor bill."
        />
      </div>
    )
  }

  const sp = await searchParams
  const invoices = await listInvoices(ctx.associationId, { status: sp.status })

  const totalOpen = invoices
    .filter((i) => i.status === 'approved' || i.status === 'coded' || i.status === 'received')
    .reduce((s, i) => s + Number(i.amount), 0)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-2">
        <BackLink href="/accounting" label="Accounting" />
        <PageHeader
          title="Invoices"
          description={`${invoices.length} on file · ${currency(totalOpen)} unpaid`}
          actions={
            <Button asChild>
              <Link href="/accounting/invoices/new">
                <Plus className="h-4 w-4" />
                Enter bill
              </Link>
            </Button>
          }
        />
      </div>

      <Card>
        <form className="flex flex-wrap items-end gap-3 px-4 py-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Status
            <Select name="status" defaultValue={sp.status ?? ''}>
              <option value="">All</option>
              {['received', 'coded', 'approved', 'paid', 'disputed', 'cancelled'].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </label>
          <Button type="submit" size="sm">
            Filter
          </Button>
          <Link
            href="/accounting/invoices"
            className="text-xs text-muted hover:text-foreground"
          >
            Reset
          </Link>
        </form>
      </Card>

      {invoices.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-10 w-10" aria-hidden />}
          title="No invoices in this view"
          description="Enter your first vendor bill. Each one posts a Dr Expense / Cr AP journal entry — visible under General Ledger."
          action={
            <Button asChild>
              <Link href="/accounting/invoices/new">
                <Plus className="h-4 w-4" />
                Enter first bill
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Number</th>
                <th className="px-4 py-2 font-medium">Vendor</th>
                <th className="px-4 py-2 font-medium">Invoice date</th>
                <th className="px-4 py-2 font-medium">Due</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-b border-border last:border-0 hover:bg-background/50">
                  <td className="px-4 py-2">
                    <Link
                      href={`/accounting/invoices/${i.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {i.invoice_number}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    <p className="text-foreground">{i.vendor?.legal_name ?? '—'}</p>
                    {i.vendor?.dba ? (
                      <p className="text-xs text-muted">d/b/a {i.vendor.dba}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {format(new Date(i.invoice_date), 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-2 text-muted">
                    {i.due_date ? format(new Date(i.due_date), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-foreground">
                    {currency(Number(i.amount))}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={STATUS_VARIANT[i.status] ?? 'outline'} size="sm">
                      {i.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </div>
  )
}
