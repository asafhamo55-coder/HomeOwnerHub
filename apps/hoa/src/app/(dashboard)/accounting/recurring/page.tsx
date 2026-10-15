import Link from 'next/link'
import { Repeat, ScrollText } from 'lucide-react'
import { Button, DataTable, EmptyState, LoadFailed, Page, StatusPill, type DataTableColumn } from '@homeowner-portal/ui'
import { getAccountingContext } from '@/lib/accounting/queries'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { formatDay } from '@/lib/money/format'
import { humanize } from '@/lib/money/status'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp } from '../_components/shared'

export const metadata = { title: 'Recurring Entries' }
export const dynamic = 'force-dynamic'

interface RuleRow {
  id: string
  cadence: string
  next_run_date: string
  is_active: boolean
  template: { id: string; entry_number: string; memo: string } | null
}

const COLUMNS: DataTableColumn<RuleRow>[] = [
  {
    key: 'template',
    header: 'Entry',
    mobilePrimary: true,
    cell: (r) =>
      r.template ? (
        <Link href={`/accounting/ledger/${r.template.id}`} className="group block no-underline">
          <span className="block font-medium text-foreground group-hover:text-primary group-hover:underline">{r.template.memo}</span>
          <span className="num block text-xs text-muted">Copies {r.template.entry_number}</span>
        </Link>
      ) : (
        <span className="text-muted">Template entry missing</span>
      ),
  },
  { key: 'cadence', header: 'Repeats', className: 'whitespace-nowrap', cell: (r) => humanize(r.cadence) },
  { key: 'next', header: 'Next run', className: 'whitespace-nowrap text-muted', cell: (r) => (r.is_active ? formatDay(r.next_run_date) : '—') },
  {
    key: 'status',
    header: 'Status',
    cell: (r) => (r.is_active ? <StatusPill tone="success" label="Active" size="sm" /> : <StatusPill tone="neutral" label="Paused" size="sm" />),
  },
]

export default async function RecurringPage() {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Recurring entries" what="recurring entries" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Recurring entries" />

  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'recurring entries',
    supabase
      .from('recurring_journal_entries')
      .select('id, cadence, next_run_date, is_active, template:template_je_id(id, entry_number, memo)')
      .eq('association_id', ctx.associationId)
      .order('next_run_date', { ascending: true }),
  )

  return (
    <Page
      title="Recurring entries"
      description="Entries that post themselves on a schedule — a fresh copy of the template’s lines each run."
      tabs={<AccountingTabs />}
    >
      {!res.ok ? (
        <LoadFailed what="recurring entries" />
      ) : (
        <DataTable
          caption="Recurring entries"
          mobile="cards"
          columns={COLUMNS}
          rows={(res.data ?? []) as unknown as RuleRow[]}
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
