import Link from 'next/link'
import { Scale } from 'lucide-react'
import { Alert, Button, DataTable, Page, StatusPill, type DataTableColumn } from '@homeowner-portal/ui'
import { getAccountingContext } from '@/lib/accounting/queries'
import { getCurrentUserRole } from '@/lib/auth'
import { tryLoad } from '@/lib/load-or-fail'
import { formatStamp, todayIso } from '@/lib/money/format'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOpeningBooks, type OpeningProposalRow } from '@/lib/accounting/opening-balances/load'
import { centsToUsd, resolveOpeningBooks } from '@/lib/accounting/opening-balances/model'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp } from '../_components/shared'
import { BooksNotOpen } from '../../_components/BooksNotOpen'
import { OpeningBalancesWizard } from './OpeningBalancesWizard'

export const metadata = { title: 'Opening balances' }
export const dynamic = 'force-dynamic'

const TITLE = 'Opening balances'
const DESCRIPTION =
  'Start the books from where the last manager or spreadsheet left off: bank balances per fund, what each home owed, and any prepaid dues or unpaid bills, all as of one start date. Nothing posts until a board member approves it in Approvals.'

const STATUS: Record<string, { tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; label: string }> = {
  proposed: { tone: 'info', label: 'Waiting in Approvals' },
  approved: { tone: 'warning', label: 'Approved, not posted' },
  posted: { tone: 'success', label: 'Posted' },
  rejected: { tone: 'neutral', label: 'Rejected' },
  failed: { tone: 'danger', label: 'Couldn’t post' },
}

const HISTORY: DataTableColumn<OpeningProposalRow>[] = [
  {
    key: 'date',
    header: 'Start date',
    mobilePrimary: true,
    cell: (p) => <span className="num">{p.payload?.cutoverDate ?? '—'}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    cell: (p) => {
      const s = STATUS[p.status] ?? { tone: 'neutral' as const, label: p.status }
      return <StatusPill tone={s.tone} label={s.label} />
    },
  },
  {
    key: 'homes',
    header: 'Homes',
    numeric: true,
    cell: (p) => (p.payload ? p.payload.charges.length.toLocaleString('en-US') : '—'),
  },
  {
    key: 'owed',
    header: 'Owed by homes',
    numeric: true,
    cell: (p) => (p.payload ? centsToUsd(p.payload.charges.reduce((n, c) => n + c.cents, 0)) : '—'),
  },
  {
    key: 'when',
    header: 'Proposed',
    cell: (p) => <span className="whitespace-nowrap text-foreground-secondary">{formatStamp(p.proposedAt)}</span>,
  },
  {
    key: 'next',
    header: <span className="sr-only">Where</span>,
    cell: (p) =>
      p.status === 'posted' && p.journalEntryId ? (
        <Link href={`/accounting/ledger/${p.journalEntryId}`} className="text-sm font-medium text-primary">
          View entry
        </Link>
      ) : p.status === 'proposed' ? (
        <Link href="/approvals?type=opening" className="text-sm font-medium text-primary">
          Open in Approvals
        </Link>
      ) : null,
  },
]

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function OpeningBalancesPage() {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title={TITLE} what="the books" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title={TITLE} returnTo="/accounting/opening-balances" />

  const role = await getCurrentUserRole()
  if (role?.role !== 'admin' && role?.role !== 'board') {
    return (
      <Page title={TITLE} tabs={<AccountingTabs />}>
        <Alert variant="info" title="Board members and admins only">
          Only board members and admins can enter opening balances.
        </Alert>
      </Page>
    )
  }

  const supabase = await getSupabaseServerClient()
  const res = await loadOpeningBooks(supabase, ctx.organizationId, ctx.associationId)
  if (!res.ok) return <AccountingLoadFailed title={TITLE} what="the books" />
  const data = res.data
  const books = resolveOpeningBooks(data.funds, data.accounts)
  const openPeriods = data.periods.filter((p) => p.status === 'open')
  const today = todayIso(ctx.timeZone)

  const posted = data.proposals.find((p) => p.status === 'posted')
  const live = data.proposals.find((p) => p.status === 'proposed' || p.status === 'approved')

  return (
    <Page title={TITLE} description={DESCRIPTION} tabs={<AccountingTabs />}>
      {books.funds.length === 0 || openPeriods.length === 0 ? (
        <BooksNotOpen
          icon={<Scale aria-hidden />}
          title="The books aren’t open yet"
          needFor="Opening balances post into an open fiscal year, to each fund’s cash and fund balance accounts."
          returnTo="/accounting/opening-balances"
        />
      ) : posted ? (
        <Alert variant="success" title="Opening balances are posted">
          Opening balances{posted.payload ? ` as of ${posted.payload.cutoverDate}` : ''} are already on the books. Correct them with
          entries in the ledger rather than a second opening balance, which would count everything twice.
        </Alert>
      ) : live ? (
        <Alert variant="info" title="Waiting in Approvals">
          Opening balances{live.payload ? ` as of ${live.payload.cutoverDate}` : ''} are waiting for a board member to approve them.
          Nothing is posted yet. To change the figures, reject them in Approvals and enter them again here.
          <span className="mt-3 block">
            <Button asChild size="sm">
              <Link href="/approvals?type=opening">Open in Approvals</Link>
            </Button>
          </span>
        </Alert>
      ) : (
        <OpeningBalancesWizard
          books={books}
          units={data.units}
          periods={openPeriods}
          defaultCutover={ctx.currentPeriod?.status === 'open' ? ctx.currentPeriod.start_date : openPeriods[0].start_date}
          defaultDueDate={addDays(today, 30)}
          openCharges={data.openCharges}
          postedEntries={data.postedEntries}
        />
      )}

      {data.proposals.length > 0 ? (
        <section className="space-y-3" aria-labelledby="opening-history">
          <h2 id="opening-history" className="text-base font-semibold text-foreground">
            Proposed so far
          </h2>
          <DataTable caption="Opening balances proposed so far" mobile="cards" columns={HISTORY} rows={data.proposals} rowKey={(p) => p.id} />
        </section>
      ) : null}
    </Page>
  )
}
