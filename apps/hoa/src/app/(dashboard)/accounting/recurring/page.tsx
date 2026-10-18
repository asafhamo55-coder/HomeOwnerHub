import Link from 'next/link'
import { Repeat, ScrollText } from 'lucide-react'
import { Button, DataTable, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { getAccountingContext, listAccounts, listFunds } from '@/lib/accounting/queries'
import { loadRecurringRules } from '@/lib/accounting/recurring-load'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/association-time'
import { tryLoad } from '@/lib/load-or-fail'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp } from '../_components/shared'
import { recurringColumns } from './columns'
import type { RecurringOptions } from './model'

export const metadata = { title: 'Recurring Entries' }
export const dynamic = 'force-dynamic'

export default async function RecurringPage() {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Recurring entries" what="recurring entries" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Recurring entries" returnTo="/accounting/recurring" />

  const supabase = await getSupabaseServerClient()
  const [res, accountsRes, fundsRes] = await Promise.all([
    tryLoad('recurring entries', () => loadRecurringRules(supabase, ctx)),
    tryLoad('accounts', () => listAccounts(ctx.associationId)),
    tryLoad('funds', () => listFunds(ctx.associationId)),
  ])

  // The edit form needs both lists; without them the page still lists the
  // entries (and Pause/Stop still work) but doesn't offer Edit. The server
  // action re-checks every account anyway.
  const options: RecurringOptions = {
    today: todayIn(ctx.timeZone),
    accounts:
      accountsRes.ok
        ? accountsRes.data
            .filter((a) => a.is_active)
            .map((a) => ({ id: a.id, label: `${a.account_number} · ${a.account_name}`, fundId: a.fund_id }))
        : [],
    funds: fundsRes.ok ? fundsRes.data.map((f) => ({ id: f.id, label: f.name })) : [],
    editable: accountsRes.ok && fundsRes.ok,
  }

  return (
    <Page
      title="Recurring entries"
      description="Entries that post themselves on a schedule — a fresh copy of the template’s lines each run. Edit, pause or stop one from its row."
      tabs={<AccountingTabs />}
    >
      {!res.ok ? (
        <LoadFailed what="recurring entries" />
      ) : (
        <DataTable
          caption="Recurring entries"
          mobile="cards"
          columns={recurringColumns(options)}
          rows={res.data}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              variant="compact"
              icon={<Repeat aria-hidden />}
              title="No recurring entries yet"
              description="Open any posted entry in the ledger — a monthly management fee, a reserve transfer — and choose Make recurring."
              action={
                <Button asChild variant="secondary">
                  <Link href="/accounting/ledger">
                    <ScrollText aria-hidden />
                    Open ledger
                  </Link>
                </Button>
              }
            />
          }
        />
      )}
    </Page>
  )
}
