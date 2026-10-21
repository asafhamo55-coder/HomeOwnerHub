import Link from 'next/link'
import { ReceiptText, Wallet } from 'lucide-react'
import { DataTable, EmptyState, LoadFailed, Tabs, type DataTableColumn } from '@homeowner-portal/ui'
import { getResidentDues, getResidentIdentity, getResidentLedger } from '@/lib/resident-dashboard'
import { getResidentZelleSettings } from '@/lib/pay-settings'
import { payLinesFor } from '@/lib/pay-by-zelle'
import { statementWindow, type LedgerEntry } from '@/lib/resident-ledger'
import { getCurrentOrg } from '@/lib/orgs'
import { PrintStatementButton } from '@/components/resident/PrintStatementButton'
import { ScreenEmpty, ScreenHeader } from '@/components/resident/screen'
import { formatDay } from '@/lib/money/format'
import { AskToJoinLink } from '@/components/resident/AskToJoinLink'

export const metadata = { title: 'Statement' }
export const dynamic = 'force-dynamic'

// Printable account statement (backlog BL-010). Plain HTML + print styles:
// the resident layout's chrome is `print:hidden`, the page drops its card
// frame on paper, and PrintStatementButton prints in the light theme.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const BACK = { href: '/resident/dues/ledger', label: 'Ledger' }

function balanceText(n: number): string {
  return n < 0 ? `${usd.format(-n)} credit` : usd.format(n)
}

// Calendar dates ('YYYY-MM-DD'), formatted from their Y-M-D parts so no zone shifts them.
const day = (iso: string) => formatDay(iso)

/** Tight rows on paper so a year of monthly dues fits one page. */
const PRINT_CELL = 'print:px-2 print:py-1 print:text-xs'

type Row = Pick<LedgerEntry, 'id' | 'date' | 'description' | 'charge' | 'payment' | 'balance'>

export default async function ResidentStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period } = await searchParams
  const all = period === 'all'
  const [{ units, ledger, truncated }, identity, org, open] = await Promise.all([
    getResidentLedger(),
    getResidentIdentity(),
    getCurrentOrg(),
    getResidentDues(),
  ])
  // The association's today (BL-043), not the server's UTC day. A calendar
  // date, so the 12-month window is calendar math too (Feb 29 → Feb 28).
  const today = open.dues.today
  const from = all ? '0000-01-01' : sameDayLastYear(today)

  const tabs = (
    <Tabs
      aria-label="Statement period"
      linkAs={Link}
      className="print:hidden"
      items={[
        { label: 'Last 12 months', href: '/resident/dues/statement', active: !all },
        { label: 'All time', href: '/resident/dues/statement?period=all', active: all },
      ]}
    />
  )

  if (units.length === 0) {
    return (
      <div className="space-y-6">
        <ScreenHeader title="Statement" back={BACK} />
        <ScreenEmpty
          icon={<Wallet />}
          title="No home linked yet"
          description="Once your board links your account to a home, you can print its statement here."
          action={<AskToJoinLink />}
        />
      </div>
    )
  }

  if (!ledger) {
    return (
      <div className="space-y-6">
        <ScreenHeader title="Statement" back={BACK} />
        <LoadFailed what="your statement" hint="Nothing is wrong with your account — the read failed. Try again in a minute." />
      </div>
    )
  }

  const w = statementWindow(ledger, from)
  const rows: Row[] = [
    ...(all
      ? []
      : [{ id: 'forward', date: from, description: 'Balance forward', charge: null, payment: null, balance: w.openingBalance }]),
    ...w.entries,
  ]

  const associationIds = [...new Set(units.map((u) => u.association_id).filter((id): id is string => id != null))]
  const associationName = units.find((u) => u.association_name)?.association_name ?? org?.name ?? null
  const zelle = associationIds.length === 1 ? await getResidentZelleSettings(associationIds) : null
  const zelleRead = zelle?.ok ? zelle.byAssociation[associationIds[0]!] : null
  const payLines = !open.failed && zelleRead?.state === 'configured' ? payLinesFor(open.dues.charges) : []

  const columns: DataTableColumn<Row>[] = [
    { key: 'date', header: 'Date', cell: (r) => day(r.date), className: `whitespace-nowrap ${PRINT_CELL}` },
    {
      key: 'description',
      header: 'Description',
      mobilePrimary: true,
      cell: (r) => r.description,
      className: PRINT_CELL,
    },
    {
      key: 'charge',
      header: 'Charge',
      numeric: true,
      hideOnMobile: true,
      cell: (r) => (r.charge != null ? usd.format(r.charge) : ''),
      className: PRINT_CELL,
    },
    {
      key: 'payment',
      header: 'Payment',
      numeric: true,
      hideOnMobile: true,
      cell: (r) => (r.payment != null ? `−${usd.format(r.payment)}` : ''),
      className: PRINT_CELL,
    },
    // Phone cards only; the table (screen and paper) never shows it.
    {
      key: 'amount',
      header: 'Amount',
      numeric: true,
      className: 'hidden',
      cell: (r) => (r.charge != null ? usd.format(r.charge) : r.payment != null ? `−${usd.format(r.payment)}` : ''),
    },
    { key: 'balance', header: 'Balance', numeric: true, cell: (r) => balanceText(r.balance), className: PRINT_CELL },
  ]

  return (
    <div className="space-y-5">
      <div className="space-y-4 print:hidden">
        <ScreenHeader
          title="Statement"
          back={BACK}
          subtitle="Print it, or choose “Save as PDF” in the print dialog."
          action={<PrintStatementButton />}
        />
        {tabs}
      </div>

      <article
        aria-label="Account statement"
        className="space-y-5 rounded-xl border border-border bg-surface p-5 print:space-y-4 print:rounded-none print:border-0 print:p-0"
      >
        <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Account statement</p>
            <h2 className="text-lg text-foreground [overflow-wrap:anywhere]">{associationName ?? 'Your association'}</h2>
          </div>
          <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-sm sm:text-right">
            <dt className="text-muted">Statement date</dt>
            <dd className="text-foreground">{formatDay(today)}</dd>
            <dt className="text-muted">Period</dt>
            <dd className="text-foreground">{all ? 'All activity' : `${day(from)} – ${formatDay(today)}`}</dd>
          </dl>
        </header>

        <section className="grid gap-4 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Prepared for</h3>
            {identity.name ? <p className="font-medium text-foreground">{identity.name}</p> : null}
            {identity.email ? <p className="text-foreground-secondary [overflow-wrap:anywhere]">{identity.email}</p> : null}
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
              {units.length === 1 ? 'Home' : 'Homes'}
            </h3>
            <ul>
              {units.map((u) => (
                <li key={u.unit_id} className="text-foreground [overflow-wrap:anywhere]">
                  {[u.unit_number, u.address].filter(Boolean).join(' · ') || 'Your unit'}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <dl className="grid grid-cols-2 gap-3 rounded-lg bg-subtle p-4 sm:grid-cols-4 print:bg-transparent print:p-0">
          <Figure label={all ? 'Opening balance' : 'Balance forward'} value={balanceText(w.openingBalance)} />
          <Figure label="Charges" value={usd.format(w.totals.charges)} />
          <Figure label="Payments & credits" value={`−${usd.format(w.totals.payments + w.totals.credits)}`} />
          <Figure label={w.closingBalance < 0 ? 'Credit balance' : 'Balance due'} value={balanceText(w.closingBalance)} strong />
        </dl>

        <DataTable
          caption="Statement activity, oldest first"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          density="compact"
          mobile="cards"
          className="print:rounded-none print:border-x-0"
          empty={
            <EmptyState
              variant="compact"
              icon={<ReceiptText />}
              title="No activity in this period"
              description="Switch to All time to see older charges and payments."
            />
          }
        />

        {truncated ? (
          <p className="text-xs text-muted">This statement shows the most recent entries only. Ask your board for older history.</p>
        ) : null}

        {payLines.length > 0 && zelleRead?.state === 'configured' ? (
          <section className="space-y-1.5 border-t border-border pt-4 text-sm">
            <h3 className="font-semibold text-foreground">How to pay</h3>
            <p className="text-foreground-secondary">
              Send each charge by Zelle to <span className="font-medium text-foreground">{zelleRead.settings.recipient}</span>
              {zelleRead.settings.recipientName ? ` (${zelleRead.settings.recipientName})` : ''}, with its memo code:
            </p>
            <ul className="space-y-0.5">
              {payLines.map((l) => (
                <li key={l.assessmentId} className="text-foreground">
                  <span className="num">{usd.format(l.amount)}</span> · {l.label}, due {day(l.dueDate)} —{' '}
                  {l.memoCode ? <span className="font-mono font-semibold">{l.memoCode}</span> : 'put your address in the memo'}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="border-t border-border pt-3 text-xs text-muted">
          Payments appear after your board approves them, so anything sent in the last few days may not be listed yet.
        </footer>
      </article>
    </div>
  )
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={strong ? 'num text-lg font-semibold text-foreground' : 'num text-base text-foreground'}>{value}</dd>
    </div>
  )
}

/** 'YYYY-MM-DD' one year earlier; Feb 29 falls back to Feb 28. */
function sameDayLastYear(day: string): string {
  const prev = `${Number(day.slice(0, 4)) - 1}${day.slice(4)}`
  return prev.endsWith('-02-29') ? `${prev.slice(0, 8)}28` : prev
}
