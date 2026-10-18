import Link from 'next/link'
import { Plus, Wallet } from 'lucide-react'
import {
  Button,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  Kpi,
  LoadFailed,
  Page,
  Pager,
  StatusPill,
  pageRange,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { getPrimaryAssociationResult } from '@/lib/primary-association'
import { AssociationNotSetUp } from '../_components/AssociationNotSetUp'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { loadOverdueHeadline } from '@/lib/dues/overdue-headline'
import type { SupabaseClient } from '@supabase/supabase-js'
import { chargeTypeLabel } from '@/lib/assessment-labels'
import { daysSince, formatDay, plural, todayIso, usd } from '@/lib/money/format'
import { MarkPaidButton } from './MarkPaidButton'
import { MaterializeButton } from './MaterializeButton'
import { DeleteAssessmentButton } from './DeleteAssessmentButton'
import { WhoOwesPanel } from './WhoOwesPanel'
import { asPropertyId, asUnitId, resolveUnitForProperty } from '@/lib/properties/resolve'
import { propertyHref } from '@/lib/properties/href'
import { loadPropertyScope } from '@/lib/property-scope'
import { PropertyScopeBanner } from '@/components/PropertyScopeBanner'
import { HowThisWorks } from '@/components/guide/HowThisWorks'
import { guideHref } from '@/lib/guide'

export const metadata = { title: 'Dues' }
export const dynamic = 'force-dynamic'

// Was a silent `.limit(500)`, and the "$X overdue" headline was summed from
// those 500 rows — so at a large association the headline undercounted with
// no sign it had. The table now pages; the headline has its own query over
// every overdue charge.
const PAGE_SIZE = 500

interface AssessmentRow {
  id: string
  amount: number
  due_date: string
  status: string
  assessment_type: string
  fiscal_period: { id: string; start_date: string; end_date: string } | null
  unit: {
    id: string
    unit_number: string | null
    address_line1: string | null
    /** The hoa_properties row this unit is bridged to, for the address link. */
  } | null
  payments: { amount: number }[]
}

export default async function DuesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; property?: string }>
}) {
  // BL-046: "none yet" gets a working next step (create it inline, or —
  // for a board member — find an admin); a failed read is LoadFailed, not
  // a claim that the association does not exist.
  const assocRes = await getPrimaryAssociationResult()
  if (!assocRes.ok) {
    return (
      <Page title="Dues" width="narrow">
        <LoadFailed what="your association" />
      </Page>
    )
  }
  const assoc = assocRes.data
  if (!assoc) {
    return (
      <Page title="Dues" width="narrow">
        <AssociationNotSetUp needFor="Dues are billed per property in an association." returnTo="/dues" />
      </Page>
    )
  }

  const sp = await searchParams
  const page = parsePageParam(sp.page)
  const { from, to } = pageRange(page, PAGE_SIZE)

  // Compared as date strings, not Dates: `new Date('2026-08-09') < today`
  // is true from 00:00:01 onward, because `today` carries a time — so a
  // charge due TODAY counted as overdue here while the Who owes panel
  // directly below, which compares 'YYYY-MM-DD' strings, called it current.
  // Due today is not late; this is the boundary both now use.
  const todayIsoStr = todayIso(assoc.timeZone)

  const supabase = await getSupabaseServerClient()

  // Opened from a property page (`?property=`): that home's charges only.
  // Charges hang off units, so the scope resolves to the units bridged to
  // the property. A failed unit lookup fails the list — it must never
  // silently widen to the whole association.
  const scope = await loadPropertyScope(supabase as unknown as SupabaseClient, sp.property)
  // Every unit bridged to the home (duplicates included), via the one resolver.
  const scopeUnits: { ok: boolean } | null = scope
    ? scope.orgId
      ? await resolveUnitForProperty(supabase as unknown as SupabaseClient, scope.orgId, asPropertyId(scope.id)).then(
          (r) => ({ ok: true as const, ids: r.unitIds as string[] }),
          () => ({ ok: false as const, ids: [] as string[] }),
        )
      : { ok: true as const, ids: [] as string[] }
    : null
  const scopeUnitIds = scopeUnits && 'ids' in scopeUnits ? (scopeUnits as { ids: string[] }).ids : []
  const pageHref = (p: number) => {
    const q = new URLSearchParams()
    if (p > 1) q.set('page', String(p))
    if (scope) q.set('property', scope.id)
    const s = q.toString()
    return s ? `/dues?${s}` : '/dues'
  }

  let listQuery = supabase
    .from('assessments')
    .select(
      'id, amount, due_date, status, assessment_type, fiscal_period:fiscal_period_id(id, start_date, end_date), unit:unit_id(id, unit_number, address_line1), payments(amount)',
      { count: 'exact' },
    )
    .eq('association_id', assoc.id)
    .is('deleted_at', null)
  if (scope) listQuery = listQuery.in('unit_id', scopeUnitIds.length ? scopeUnitIds : ['00000000-0000-0000-0000-000000000000'])

  const [listResult, overdueResult] = await Promise.all([
    scopeUnits && !scopeUnits.ok
      ? Promise.resolve({ ok: false } as const)
      : loadOrFail('dues', listQuery.order('due_date', { ascending: false }).range(from, to)),
    // The headline's own read: the same predicate it always used (not
    // paid, not waived, due before today), paged over EVERY row. Was a
    // single `.range(0, 49_999)`, which PostgREST still capped at 1000
    // rows (BL-047). A failed page fails the KPIs, never shrinks them.
    tryLoad('overdue dues total', () =>
      loadOverdueHeadline(supabase as unknown as SupabaseClient, assoc.id, todayIsoStr),
    ),
  ])

  const rows = listResult.ok ? ((listResult.data ?? []) as unknown as AssessmentRow[]) : []
  const total = listResult.ok ? (listResult.count ?? rows.length) : 0
  const listData = listResult.ok ? listResult : null

  // Group by the month each charge is due, newest first, so the page reads
  // as a stack of billing months.
  const byMonth = new Map<string, AssessmentRow[]>()
  for (const row of rows) {
    const key = row.due_date.slice(0, 7)
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key)!.push(row)
  }
  const months = Array.from(byMonth.entries()).sort((a, b) => b[0].localeCompare(a[0]))

  // A month cut by a page boundary has only part of its charges on this
  // page, so its billed/paid figures are this page's only. Rows run newest
  // due date first: the previous page can only continue into the top
  // month, and the next page only out of the bottom one.
  const hasNextPage = from + rows.length < total
  const cutMonths = new Set<string>()
  if (months.length > 0) {
    if (page > 1) cutMonths.add(months[0][0])
    if (hasNextPage) cutMonths.add(months[months.length - 1][0])
  }

  const currentMonthLabel = formatDay(todayIsoStr, 'monthShort')

  const headline = overdueResult.ok ? overdueResult.data : null
  const totalOverdue = headline?.totalOverdue ?? 0
  const oldestDue = headline?.oldestDue ?? null
  const unitsBehind = headline?.unitsBehind ?? 0
  const kpiState = overdueResult.ok ? 'ready' : 'failed'

  return (
    <Page
      width="wide"
      title="Dues"
      description="Charges billed to each property, who has paid, and who to remind."
      actions={
        <>
          <MaterializeButton monthLabel={currentMonthLabel} />
          <Button asChild>
            <Link href="/dues/new">
              <Plus aria-hidden />
              Add a due
            </Link>
          </Button>
        </>
      }
    >
      <section aria-label="Overdue" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Kpi
          label="Overdue"
          value={usd(totalOverdue, { whole: true })}
          hint={totalOverdue > 0 ? 'Past due and unpaid' : 'All caught up'}
          state={kpiState}
        />
        <Kpi label="Properties behind" value={String(unitsBehind)} hint={unitsBehind > 0 ? 'With an overdue charge' : 'None'} state={kpiState} />
        <Kpi
          className="col-span-2 lg:col-span-1"
          label="Oldest overdue"
          value={oldestDue ? `${daysSince(oldestDue, todayIsoStr)} days` : '—'}
          hint={oldestDue ? `Due ${formatDay(oldestDue)}` : 'Nothing overdue'}
          state={kpiState}
        />
      </section>

      <WhoOwesPanel associationId={assoc.id} timeZone={assoc.timeZone} />

      {scope ? (
        <PropertyScopeBanner
          scope={scope}
          noun="dues"
          clearHref="/dues"
          note="the totals above still cover the whole association"
        />
      ) : null}

      {/* Never the raw error.message — this page used to render it, which is
          exactly what (dashboard)/error.tsx exists to prevent. */}
      {!listData ? (
        <LoadFailed what="dues" />
      ) : scope && rows.length === 0 ? (
        <EmptyState
          icon={<Wallet aria-hidden />}
          title={scopeUnitIds.length === 0 ? 'This home isn’t linked to a billing unit' : 'No dues billed to this home'}
          description={
            scopeUnitIds.length === 0
              ? 'Dues are billed to units, and no unit is linked to this property yet, so nothing can be billed to it.'
              : 'No charges have been billed to this home yet.'
          }
          action={
            <Button asChild variant="secondary">
              <Link href="/dues">Show all dues</Link>
            </Button>
          }
        />
      ) : rows.length === 0 && total === 0 ? (
        <EmptyState
          icon={<Wallet aria-hidden />}
          title="No dues billed yet"
          description="Generate this month’s dues for every property, or add a one-off charge. Each charge posts to the ledger as money owed to the association."
          action={<MaterializeButton monthLabel={currentMonthLabel} variant="default" />}
          secondaryAction={
            <>
              <Button asChild variant="ghost">
                <Link href="/properties">Add properties first</Link>
              </Button>
              <HowThisWorks href={guideHref('dues-generate-monthly')} />
            </>
          }
        />
      ) : (
        <div className="space-y-6">
          {months.map(([month, monthRows]) => (
            <MonthTable key={month} month={month} rows={monthRows} today={todayIsoStr} partial={cutMonths.has(month)} />
          ))}
          {total > PAGE_SIZE ? (
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              rowCount={rows.length}
              hrefFor={pageHref}
              linkAs={Link}
              noun="charges"
              className="rounded-xl border border-border bg-surface"
            />
          ) : null}
        </div>
      )}
    </Page>
  )
}

function paidOf(r: AssessmentRow): number {
  return (r.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
}

function unitLabelOf(r: AssessmentRow): string {
  return `${r.unit?.address_line1 ?? 'Unknown property'}${r.unit?.unit_number ? ` · unit ${r.unit.unit_number}` : ''}`
}

function MonthTable({ month, rows, today, partial }: { month: string; rows: AssessmentRow[]; today: string; partial: boolean }) {
  const billed = rows.reduce((sum, r) => sum + Number(r.amount), 0)
  const paid = rows.reduce((sum, r) => sum + paidOf(r), 0)
  const remaining = Math.max(billed - paid, 0)
  const label = formatDay(`${month}-01`, 'month')

  const columns: DataTableColumn<AssessmentRow>[] = [
    {
      key: 'unit',
      header: 'Property',
      mobilePrimary: true,
      cell: (r) => (
        <span className="block">
          {r.unit?.id ? (
            // A unit id: /properties/[id] redirects it to the home's page.
            <Link
              href={propertyHref(asUnitId(r.unit.id))}
              className="block font-medium text-foreground no-underline hover:text-primary hover:underline"
            >
              {r.unit.address_line1 ?? 'Unknown property'}
            </Link>
          ) : (
            <span className="block font-medium text-foreground">{r.unit?.address_line1 ?? 'Unknown property'}</span>
          )}
          {r.unit?.unit_number ? <span className="block text-xs text-muted">Unit {r.unit.unit_number}</span> : null}
        </span>
      ),
    },
    { key: 'type', header: 'Charge', hideBelowLg: true, hideOnMobile: true, className: 'whitespace-nowrap text-muted', cell: (r) => chargeTypeLabel(r.assessment_type) },
    { key: 'due', header: 'Due', className: 'whitespace-nowrap text-muted', cell: (r) => formatDay(r.due_date, 'short') },
    { key: 'amount', header: 'Amount', numeric: true, cell: (r) => usd(Number(r.amount)) },
    {
      key: 'paid',
      header: 'Paid',
      numeric: true,
      cell: (r) => {
        const p = paidOf(r)
        return p > 0 ? usd(p) : <span className="text-muted">—</span>
      },
    },
    { key: 'status', header: 'Status', cell: (r) => <DuesStatus row={r} today={today} /> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      className: 'text-right',
      cell: (r) =>
        r.status !== 'paid' ? (
          <div className="flex items-center justify-end gap-1">
            <MarkPaidButton assessmentId={r.id} balance={Math.max(Number(r.amount) - paidOf(r), 0)} unitLabel={unitLabelOf(r)} />
            <DeleteAssessmentButton assessmentId={r.id} unitLabel={unitLabelOf(r)} />
          </div>
        ) : null,
    },
  ]

  return (
    <Card className="overflow-hidden">
      <CardHeader
        actions={
          remaining > 0 ? (
            <StatusPill tone="warning" label={`${usd(remaining)} outstanding`} size="sm" />
          ) : (
            <StatusPill tone="success" label="Paid in full" size="sm" />
          )
        }
      >
        <CardTitle as="h2">{label}</CardTitle>
        <CardDescription>
          <span className="num">
            {plural(rows.length, 'charge')} · billed {usd(billed)} · collected {usd(paid)}
          </span>
          {partial ? ' · this page only; the rest of this month is on another page' : ''}
        </CardDescription>
      </CardHeader>
      <DataTable framed={false} mobile="cards" caption={`${label} charges`} columns={columns} rows={rows} rowKey={(r) => r.id} />
    </Card>
  )
}

function DuesStatus({ row, today }: { row: AssessmentRow; today: string }) {
  if (row.status === 'paid') return <StatusPill tone="success" label="Paid" size="sm" />
  if (row.status === 'waived') return <StatusPill tone="neutral" label="Waived" size="sm" />
  const late = daysSince(row.due_date, today)
  if (late > 0) {
    return <StatusPill tone="danger" label={`${late} ${late === 1 ? 'day' : 'days'} late${row.status === 'partial' ? ' · partly paid' : ''}`} size="sm" />
  }
  if (row.status === 'partial') return <StatusPill tone="warning" label="Partly paid" size="sm" />
  return <StatusPill tone="neutral" label="Due" size="sm" />
}
