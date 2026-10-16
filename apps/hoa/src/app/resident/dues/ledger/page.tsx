import Link from 'next/link'
import { format } from 'date-fns'
import { FileText, ReceiptText, Wallet } from 'lucide-react'
import { Alert, Button, DataTable, EmptyState, LoadFailed, type DataTableColumn } from '@homeowner-portal/ui'
import { getResidentLedger } from '@/lib/resident-dashboard'
import type { LedgerEntry } from '@/lib/resident-ledger'
import type { ResidentUnit } from '@/lib/resident'
import { DuesTabs } from '@/components/resident/DuesTabs'
import { ScreenEmpty, ScreenHeader } from '@/components/resident/screen'

export const metadata = { title: 'Ledger' }
export const dynamic = 'force-dynamic'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** "$325.00", or "$50.00 credit" for a balance in the owner's favour. */
function balanceText(n: number): string {
  return n < 0 ? `${usd.format(-n)} credit` : usd.format(n)
}

export default async function ResidentLedgerPage() {
  const { units, ledger, truncated } = await getResidentLedger()

  const header = (
    <div className="space-y-4">
      <ScreenHeader title="Dues" subtitle="Every charge and payment on your account." />
      <DuesTabs current="ledger" />
    </div>
  )

  if (units.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <ScreenEmpty
          icon={<Wallet />}
          title="No home linked yet"
          description="Once your board links your account to a home, its charges and payments will appear here."
        />
      </div>
    )
  }

  if (!ledger) {
    return (
      <div className="space-y-6">
        {header}
        <LoadFailed what="your ledger" hint="Your history is unknown right now — not empty. Try again in a minute." />
      </div>
    )
  }

  const multiUnit = units.length > 1
  // Newest first on screen; the printed statement reads oldest first.
  const rows = [...ledger.entries].reverse()

  const columns: DataTableColumn<LedgerEntry>[] = [
    {
      key: 'date',
      header: 'Date',
      cell: (e) => format(new Date(`${e.date}T00:00:00`), 'MMM d, yyyy'),
      className: 'whitespace-nowrap',
    },
    {
      key: 'description',
      header: 'Description',
      mobilePrimary: true,
      cell: (e) => (
        <span className="font-medium text-foreground">
          {e.description}
          {multiUnit && e.unitId ? <span className="block text-xs font-normal text-muted">{unitLabel(units, e.unitId)}</span> : null}
        </span>
      ),
    },
    {
      key: 'charge',
      header: 'Charge',
      numeric: true,
      hideOnMobile: true,
      cell: (e) => (e.charge != null ? usd.format(e.charge) : ''),
    },
    {
      key: 'payment',
      header: 'Payment',
      numeric: true,
      hideOnMobile: true,
      cell: (e) => (e.payment != null ? <span className="text-success">−{usd.format(e.payment)}</span> : ''),
    },
    // Phone cards only (the table never shows it): one signed amount instead
    // of an always-half-empty Charge/Payment pair.
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      className: 'hidden',
      cell: (e) =>
        e.charge != null ? usd.format(e.charge) : <span className="text-success">−{usd.format(e.payment ?? 0)}</span>,
    },
    { key: 'balance', header: 'Balance', numeric: true, cell: (e) => balanceText(e.balance) },
  ]

  return (
    <div className="space-y-6">
      {header}

      <dl className="grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface p-4">
        <Total label="Charges" value={usd.format(ledger.totals.charges)} />
        <Total label="Paid & credited" value={usd.format(ledger.totals.payments + ledger.totals.credits)} />
        <Total label="Balance" value={balanceText(ledger.totals.balance)} strong />
      </dl>

      {truncated ? (
        <Alert variant="info" title="Showing your most recent history">
          Your account has more entries than this screen shows. Ask your board for a full statement.
        </Alert>
      ) : null}

      <DataTable
        caption="Charges and payments, newest first"
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        density="compact"
        mobile="cards"
        empty={
          <EmptyState
            variant="compact"
            icon={<ReceiptText />}
            title="No charges yet"
            description="When your board bills dues, each charge and payment shows up here."
          />
        }
      />

      <div className="flex justify-end">
        <Button asChild variant="secondary">
          <Link href="/resident/dues/statement">
            <FileText aria-hidden />
            Printable statement
          </Link>
        </Button>
      </div>
    </div>
  )
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={strong ? 'num text-base font-semibold text-foreground' : 'num text-base text-foreground'}>{value}</dd>
    </div>
  )
}

function unitLabel(units: ResidentUnit[], unitId: string): string | null {
  const unit = units.find((u) => u.unit_id === unitId)
  return unit ? unit.unit_number ?? unit.address ?? null : null
}
