import { CalendarClock } from 'lucide-react'
import { DataTable, LoadFailed, Page } from '@homeowner-portal/ui'
import {
  countDraftJournalEntries,
  countPendingProposals,
  getAccountingContext,
  listBankAccounts,
  listFiscalPeriods,
} from '@/lib/accounting/queries'
import { nextFiscalYearOffer } from '@/lib/accounting/open-next-fiscal-year'
import { getCurrentUserRole } from '@/lib/auth'
import { tryLoad } from '@/lib/load-or-fail'
import { todayIso } from '@/lib/money/format'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp } from '../_components/shared'
import { BooksNotOpen } from '../../_components/BooksNotOpen'
import { OpenNextFiscalYearButton } from '../_components/OpenNextFiscalYearButton'
import { loadLastReconciled } from '@/lib/accounting/last-reconciled'
import { periodColumns } from './columns'
import { periodHasEnded, unreconciledAccounts, type CloseChecks, type CountRead } from './close-checks-shared'

export const metadata = { title: 'Fiscal Periods' }
export const dynamic = 'force-dynamic'

export default async function PeriodsPage() {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Fiscal periods" what="fiscal periods" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Fiscal periods" returnTo="/accounting/periods" />

  const [res, role] = await Promise.all([
    tryLoad('fiscal periods', () => listFiscalPeriods(ctx.associationId)),
    getCurrentUserRole(),
  ])
  const today = todayIso(ctx.timeZone)
  // BL-076: admins only, like opening the books; offered only when there is a year to add.
  const offer = res.ok && role?.role === 'admin' ? nextFiscalYearOffer(res.data, today) : null

  // Close checks, only for open periods that have ended (the only ones with a
  // Close button). A failed read stays a failure; it is never turned into zero.
  const closable = res.ok ? res.data.filter((p) => p.status === 'open' && periodHasEnded(p.end_date, today)) : []
  const checks = new Map<string, CloseChecks>()
  if (closable.length > 0) {
    const [proposals, accounts] = await Promise.all([
      tryLoad('pending proposals', () => countPendingProposals(ctx.organizationId, ctx.associationId)),
      tryLoad('bank accounts', () => listBankAccounts(ctx.associationId)),
    ])
    const recs = accounts.ok
      ? await tryLoad('last reconciliations', () => loadLastReconciled(accounts.data.map((a) => a.id)))
      : null
    const proposalRead: CountRead = proposals.ok ? { ok: true, n: proposals.data } : { ok: false }
    for (const p of closable) {
      const drafts = await tryLoad('draft entries', () =>
        countDraftJournalEntries(ctx.associationId, { from: p.start_date, to: p.end_date }),
      )
      checks.set(p.id, {
        drafts: drafts.ok ? { ok: true, n: drafts.data } : { ok: false },
        proposals: proposalRead,
        unreconciled:
          accounts.ok && recs && recs.ok
            ? {
                ok: true,
                accounts: unreconciledAccounts(
                  accounts.data.filter((a) => a.is_active).map((a) => ({ id: a.id, name: a.account_name })),
                  recs.data,
                  p.end_date,
                ),
              }
            : { ok: false },
      })
    }
  }

  return (
    <Page
      title="Fiscal periods"
      description="Closing a period moves its income and expenses into each fund’s balance and locks it. Closed periods still accept reversing entries. The board packet is a PDF of the period’s statements."
      tabs={<AccountingTabs />}
      actions={offer ? <OpenNextFiscalYearButton {...offer} /> : undefined}
    >
      {!res.ok ? (
        <LoadFailed what="fiscal periods" />
      ) : (
        <DataTable
          caption="Fiscal periods"
          mobile="cards"
          columns={periodColumns(today, ctx.currentPeriod?.id ?? null, (id) => checks.get(id) ?? null)}
          rows={res.data}
          rowKey={(p) => p.id}
          empty={
            <BooksNotOpen
              variant="compact"
              icon={<CalendarClock aria-hidden />}
              title="No fiscal periods"
              needFor="Entries post into a fiscal period, and this association has none yet."
              returnTo="/accounting/periods"
            />
          }
        />
      )}
    </Page>
  )
}
