import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { LoadFailed, Tabs } from '@homeowner-portal/ui'
import { getResidentDues, getResidentIdentity, getResidentLedger } from '@/lib/resident-dashboard'
import { getResidentZelleSettings } from '@/lib/pay-settings'
import { payLinesFor } from '@/lib/pay-by-zelle'
import { sameDayLastYear, statementWindow } from '@/lib/resident-ledger'
import { getCurrentOrg } from '@/lib/orgs'
import { PrintStatementButton } from '@/components/resident/PrintStatementButton'
import { ScreenEmpty, ScreenHeader } from '@/components/resident/screen'
import { formatDay } from '@/lib/money/format'
import { StatementDocument } from '@/components/statement/StatementDocument'
import { AskToJoinLink } from '@/components/resident/AskToJoinLink'

export const metadata = { title: 'Statement' }
export const dynamic = 'force-dynamic'

// Printable account statement (backlog BL-010). Plain HTML + print styles:
// the resident layout's chrome is `print:hidden`, the page drops its card
// frame on paper, and PrintStatementButton prints in the light theme.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const BACK = { href: '/resident/dues/ledger', label: 'Ledger' }

// Calendar dates ('YYYY-MM-DD'), formatted from their Y-M-D parts so no zone shifts them.
const day = (iso: string) => formatDay(iso)

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

  const associationIds = [...new Set(units.map((u) => u.association_id).filter((id): id is string => id != null))]
  const associationName = units.find((u) => u.association_name)?.association_name ?? org?.name ?? null
  const zelle = associationIds.length === 1 ? await getResidentZelleSettings(associationIds) : null
  const zelleRead = zelle?.ok ? zelle.byAssociation[associationIds[0]!] : null
  const payLines = !open.failed && zelleRead?.state === 'configured' ? payLinesFor(open.dues.charges, {
        state: units.find((u) => u.association_id === associationIds[0])?.association_state,
        today: open.dues.today,
      })
    : []

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

      <StatementDocument
        associationName={associationName ?? 'Your association'}
        statementDate={today}
        period={all ? 'All activity' : `${day(from)} – ${formatDay(today)}`}
        all={all}
        from={from}
        window={w}
        preparedFor={{ name: identity.name, email: identity.email }}
        homes={units.map((u) => [u.unit_number, u.address].filter(Boolean).join(' · ') || 'Your unit')}
        truncated={truncated}
        truncatedNote="This statement shows the most recent entries only. Ask your board for older history."
        emptyHint="Switch to All time to see older charges and payments."
        footer="Payments appear after your board approves them, so anything sent in the last few days may not be listed yet."
      >
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
      </StatementDocument>
    </div>
  )
}
