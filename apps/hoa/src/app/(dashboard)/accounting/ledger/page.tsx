import Link from 'next/link'
import { ScrollText, Sparkles } from 'lucide-react'
import {
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  LoadFailed,
  Page,
  Pager,
  Select,
  StatusPill,
  filterFieldClass,
  pageRange,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import {
  getAccountingContext,
  listFiscalPeriods,
  pageJournalEntries,
  type JournalEntrySummary,
} from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { formatDay, periodLabel, plural, usd } from '@/lib/money/format'
import { JOURNAL_SOURCES, JOURNAL_STATUS, sourceLabel } from '@/lib/money/status'
import { AccountingTabs } from '../AccountingTabs'
import { AccountingLoadFailed, AccountingNotSetUp, MoneyStatus } from '../_components/shared'

export const metadata = { title: 'General Ledger' }
export const dynamic = 'force-dynamic'

// Was a silent 200-row cap: a busy year's ledger just stopped, with no
// sign there was more. Now paged, with the true count in the header.
const PAGE_SIZE = 50

interface PageProps {
  searchParams: Promise<{ period?: string; source?: string; status?: string; page?: string }>
}

export default async function GeneralLedgerPage({ searchParams }: PageProps) {
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="General ledger" what="the ledger" width="wide" />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="General ledger" returnTo="/accounting/ledger" />

  const sp = await searchParams
  const periodsRes = await tryLoad('fiscal periods', () => listFiscalPeriods(ctx.associationId))
  if (!periodsRes.ok) return <AccountingLoadFailed title="General ledger" what="the ledger" width="wide" />
  const periods = periodsRes.data

  // `period=all` is an explicit choice; no param means the current period.
  const periodId =
    sp.period === 'all'
      ? undefined
      : sp.period && periods.some((p) => p.id === sp.period)
        ? sp.period
        : ctx.currentPeriod?.id
  const source = sp.source && JOURNAL_SOURCES.includes(sp.source) ? sp.source : undefined
  const status = sp.status && sp.status in JOURNAL_STATUS ? sp.status : undefined

  const page = parsePageParam(sp.page)
  const res = await tryLoad('journal entries', () =>
    pageJournalEntries(ctx.associationId, { periodId, source, status }, pageRange(page, PAGE_SIZE)),
  )

  const params = new URLSearchParams()
  if (sp.period) params.set('period', sp.period)
  if (source) params.set('source', source)
  if (status) params.set('status', status)
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(params)
    if (p > 1) q.set('page', String(p))
    const s = q.toString()
    return s ? `/accounting/ledger?${s}` : '/accounting/ledger'
  }
  const filtered = Boolean(sp.period || source || status)
  const selectedPeriod = periods.find((p) => p.id === periodId)

  return (
    <Page
      width="wide"
      title="General ledger"
      description={
        res.ok
          ? `${plural(res.data.total, 'journal entry', 'journal entries')} ${selectedPeriod ? `in ${periodLabel(selectedPeriod)}` : 'across all periods'}. Nothing is deleted — mistakes are reversed.`
          : 'Every journal entry, newest first.'
      }
      tabs={<AccountingTabs />}
    >
      <FilterBar resetHref="/accounting/ledger" filtered={filtered} linkAs={Link} label="Filter the ledger">
        <Field label="Period" className={filterFieldClass}>
          <Select name="period" defaultValue={periodId ?? 'all'}>
            <option value="all">All periods</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {periodLabel(p)} · {p.status}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source" className={filterFieldClass}>
          <Select name="source" defaultValue={source ?? ''}>
            <option value="">All sources</option>
            {JOURNAL_SOURCES.map((s) => (
              <option key={s} value={s}>
                {sourceLabel(s)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status" className={filterFieldClass}>
          <Select name="status" defaultValue={status ?? ''}>
            <option value="">Any status</option>
            {Object.entries(JOURNAL_STATUS).map(([value, def]) => (
              <option key={value} value={value}>
                {def.label}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      {!res.ok ? (
        <LoadFailed what="journal entries" />
      ) : (
        <DataTable
          caption="Journal entries"
          density="compact"
          mobile="cards"
          columns={COLUMNS}
          rows={res.data.rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              variant="compact"
              icon={<ScrollText aria-hidden />}
              title={filtered ? 'No entries match these filters' : 'No journal entries in this period'}
              description={
                filtered
                  ? 'Try another period, or reset the filters.'
                  : 'Entries post automatically when dues are generated, owners pay, or a bill is entered.'
              }
            />
          }
          footer={
            res.data.total > PAGE_SIZE ? (
              <Pager
                page={page}
                pageSize={PAGE_SIZE}
                total={res.data.total}
                rowCount={res.data.rows.length}
                hrefFor={hrefFor}
                linkAs={Link}
                noun="entries"
              />
            ) : undefined
          }
        />
      )}
    </Page>
  )
}

const COLUMNS: DataTableColumn<JournalEntrySummary>[] = [
  {
    key: 'number',
    header: 'Entry',
    className: 'whitespace-nowrap',
    hideOnMobile: true,
    cell: (je) => (
      <Link href={`/accounting/ledger/${je.id}`} className="num font-medium text-primary hover:underline">
        {je.entry_number}
      </Link>
    ),
  },
  { key: 'date', header: 'Date', className: 'whitespace-nowrap text-muted', cell: (je) => formatDay(je.entry_date) },
  {
    key: 'memo',
    header: 'Memo',
    mobilePrimary: true,
    cell: (je) => (
      <span className="flex min-w-0 items-center gap-2">
        <Link href={`/accounting/ledger/${je.id}`} className="truncate text-foreground no-underline hover:text-primary hover:underline">
          {je.memo}
        </Link>
        {je.ai_generated ? (
          <StatusPill tone="ai" label="AI" icon={<Sparkles aria-hidden />} size="sm" title="Drafted by AI" />
        ) : null}
      </span>
    ),
  },
  { key: 'source', header: 'Source', hideBelowLg: true, className: 'whitespace-nowrap text-muted', cell: (je) => sourceLabel(je.source) },
  { key: 'amount', header: 'Amount', numeric: true, cell: (je) => usd(je.totalAmount) },
  { key: 'status', header: 'Status', cell: (je) => <MoneyStatus registry={JOURNAL_STATUS} status={je.status} /> },
]
