import Link from 'next/link'
import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'
import { AlertTriangle, BellRing, CalendarX, Camera, CircleDot, Download, Plus, Search } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import {
  Button,
  DataTable,
  EmptyState,
  FilterChips,
  ListToolbar,
  LoadFailed,
  NoOrgSelected,
  Page,
  Pager,
  SearchForm,
  StatusBadge,
  Tabs,
  pageRange,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { timed } from '@/lib/perf/timing'
import { readViolationStatusRows } from '@/lib/violation-status-rows'
import type { SupabaseClient } from '@supabase/supabase-js'
import { VIOLATION_SEVERITY, VIOLATION_STATUS } from '@/lib/status/community'
import { violationTabs } from './tabs'
import { loadPropertyScope, withPropertyParam } from '@/lib/property-scope'
import { PropertyScopeBanner } from '@/components/PropertyScopeBanner'
import { HowThisWorks } from '@/components/guide/HowThisWorks'
import { guideHref } from '@/lib/guide'
import { SummaryStrip } from '@/components/SummaryStrip'
import { cureDueDay, isCurePassed, summarizeViolations, type ViolationSummaryRow } from '@/lib/violation-summary'
import { getPrimaryAssociationResult } from '@/lib/primary-association'
import { DEFAULT_ASSOCIATION_TIME_ZONE } from '@/lib/association-time'
import { plural } from '@/lib/money/format'

export const metadata = { title: 'Violations' }
export const dynamic = 'force-dynamic'

/**
 * Status filter groups. A board member thinks in "what needs me" / "what's
 * waiting on the owner" / "what's done", not in the nine raw statuses.
 */
const STATUS_FILTERS = {
  all: { label: 'All', statuses: null },
  action: { label: 'Needs action', statuses: ['open', 'notice_drafted'] },
  notice: { label: 'Cure period', statuses: ['notice_sent'] },
  fined: { label: 'Fined', statuses: ['fined', 'escalated'] },
  closed: { label: 'Closed', statuses: ['resolved', 'cured', 'waived', 'dismissed'] },
} as const satisfies Record<string, { label: string; statuses: readonly string[] | null }>

type StatusFilter = keyof typeof STATUS_FILTERS

function parseStatusFilter(raw: string | undefined): StatusFilter {
  return raw && raw in STATUS_FILTERS ? (raw as StatusFilter) : 'all'
}

interface ViolationRow {
  id: string
  description: string
  status: string
  severity: string | null
  ccr_section: string | null
  created_at: string | null
  notice_sent_at: string | null
  cure_period_days: number | null
  property_id: string | null
  property: { address: string; unit_number: string | null } | null
}

// Was a silent `.limit(100)`: the 101st violation simply did not exist as
// far as this page was concerned. Same page size, now with a pager.
const PAGE_SIZE = 100

/** Most ids the "cure date passed" view can filter by in one request. Past this the tile links to the cure period chip. */
const MAX_CURE_IDS = 250

export default async function ViolationsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string; property?: string; cure?: string }>
}) {
  const { q: qParam, page: pageParam, status: statusParam, property: propertyParam, cure: cureParam } = await searchParams
  const wantCurePassed = cureParam === 'passed'
  const search = (qParam ?? '').trim()
  const statusFilter = parseStatusFilter(statusParam)
  const page = parsePageParam(pageParam)
  const { from, to } = pageRange(page, PAGE_SIZE)

  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />

  const supabase = await getSupabaseServerClient()
  // Opened from a property page: that home's violations only.
  const scope = await loadPropertyScope(supabase as unknown as SupabaseClient, propertyParam)
  let query = supabase
    .from('hoa_violations')
    .select(
      'id, description, status, severity, ccr_section, created_at, notice_sent_at, cure_period_days, property_id, property:hoa_properties(address, unit_number)',
      { count: 'exact' },
    )
    .eq('org_id', org.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (search.length > 0) {
    // Cap length, escape LIKE wildcards (`%`, `_`, `\`) so they don't
    // match everything, and strip PostgREST `.or()` separators.
    const safe = search
      .slice(0, 100)
      .replace(/[%_\\]/g, '\\$&')
      .replace(/[,()]/g, ' ')
    query = query.or(`description.ilike.%${safe}%,ccr_section.ilike.%${safe}%`)
  }
  const statuses = STATUS_FILTERS[statusFilter].statuses
  if (statuses) query = query.in('status', [...statuses])
  if (scope) query = query.eq('property_id', scope.id)

  // Status, notice date and cure days only, for the chip counts and the
  // summary strip. Small, independent of paging, and read to the END — a single read
  // stopped at PostgREST's 1000-row cap (BL-047). A failure hides the counts and the strip shows "Not available".
  const statusPromise = timed('/violations', 'violations.statusCounts', () =>
    loadOrFail('violation status counts', readViolationStatusRows(supabase as unknown as SupabaseClient, org.id, scope?.id ?? null)),
  )
  const loadList = () => timed('/violations', 'violations.list', () => loadOrFail('violations', query.range(from, to)))
  // The list runs alongside the other two reads, except for the cure view, which needs the status rows first.
  const [assoc, statusRes, earlyList] = await Promise.all([
    getPrimaryAssociationResult(),
    statusPromise,
    wantCurePassed ? null : loadList(),
  ])
  const timeZone = (assoc.ok && assoc.data?.timeZone) || DEFAULT_ASSOCIATION_TIME_ZONE
  const now = new Date()
  const statusRows = statusRes.ok ? ((statusRes.data ?? []) as unknown as ViolationSummaryRow[]) : null
  const summary = statusRows ? summarizeViolations(statusRows, timeZone, now) : null

  // "Cure date passed" is a calendar-day rule the database cannot express, so
  // the view filters by the ids found above. A failed status read cannot
  // filter, and says so instead of listing everything.
  const cureIds = summary && summary.curePassedIds.length <= MAX_CURE_IDS ? summary.curePassedIds : null
  const cureFilterOn = wantCurePassed && cureIds !== null
  const cureUnavailable = wantCurePassed && summary === null
  if (cureFilterOn && cureIds) query = query.in('id', cureIds.length > 0 ? cureIds : ['00000000-0000-0000-0000-000000000000'])
  const result = earlyList ?? (cureUnavailable ? null : await loadList())

  const rows = result?.ok ? ((result.data ?? []) as unknown as ViolationRow[]) : []
  const total = result?.ok ? (result.count ?? rows.length) : 0

  const counts: Partial<Record<StatusFilter, number>> = {}
  if (statusRes.ok) {
    const all = (statusRes.data ?? []) as Array<{ status: string }>
    for (const key of Object.keys(STATUS_FILTERS) as StatusFilter[]) {
      const set = STATUS_FILTERS[key].statuses as readonly string[] | null
      counts[key] = set ? all.filter((r) => set.includes(r.status)).length : all.length
    }
  }

  const href = (opts: { page?: number; status?: StatusFilter; q?: string; dropProperty?: boolean; cure?: boolean }): string => {
    const params = new URLSearchParams()
    const q = opts.q ?? search
    const st = opts.status ?? statusFilter
    if (q) params.set('q', q)
    if (st !== 'all') params.set('status', st)
    if (opts.cure) params.set('cure', 'passed')
    if (opts.page && opts.page > 1) params.set('page', String(opts.page))
    if (scope && !opts.dropProperty) params.set('property', scope.id)
    const qs = params.toString()
    return qs ? `/violations?${qs}` : '/violations'
  }

  const filtered = search.length > 0 || statusFilter !== 'all' || scope !== null || cureFilterOn

  const columns: DataTableColumn<ViolationRow>[] = [
    {
      key: 'violation',
      header: 'Violation',
      mobilePrimary: true,
      className: 'min-w-[16rem] max-w-[28rem]',
      cell: (v) => (
        <div className="min-w-0">
          <Link
            href={`/violations/${v.id}`}
            className="line-clamp-2 font-medium text-foreground no-underline hover:text-primary hover:underline"
          >
            {v.description}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted">
            {v.property && v.property_id ? (
              <Link href={propertyHref(asPropertyId(v.property_id))} className="text-muted hover:text-primary hover:underline">
                {v.property.address}
                {v.property.unit_number ? ` · ${v.property.unit_number}` : ''}
              </Link>
            ) : (
              'Property unknown'
            )}
            {v.created_at ? (
              <span className="md:hidden"> · {format(new Date(v.created_at), 'MMM d')}</span>
            ) : null}
          </p>
        </div>
      ),
    },
    {
      key: 'ccr',
      header: 'CC&R',
      hideBelowLg: true,
      hideOnMobile: true,
      cell: (v) => (v.ccr_section ? <span className="whitespace-nowrap text-foreground-secondary">{v.ccr_section}</span> : <span className="text-muted">—</span>),
    },
    {
      key: 'severity',
      header: 'Severity',
      cell: (v) =>
        v.severity ? (
          <StatusBadge status={v.severity} tones={VIOLATION_SEVERITY.tones} labels={VIOLATION_SEVERITY.labels} />
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (v) => <StatusBadge status={v.status} tones={VIOLATION_STATUS.tones} labels={VIOLATION_STATUS.labels} />,
    },
    {
      key: 'cure',
      header: 'Cure due',
      cell: (v) => {
        const dueDay = cureDueDay(v, timeZone)
        if (!dueDay) return <span className="text-muted">—</span>
        const due = parseISO(dueDay)
        const overdue = isCurePassed(v, timeZone, now)
        return (
          <span className={overdue ? 'whitespace-nowrap font-medium text-danger' : 'whitespace-nowrap text-foreground-secondary'}>
            {overdue ? 'Overdue · ' : ''}
            {format(due, 'MMM d')}
          </span>
        )
      },
    },
    {
      key: 'reported',
      header: 'Reported',
      hideBelowLg: true,
      hideOnMobile: true,
      cell: (v) => (
        <span className="whitespace-nowrap text-foreground-secondary">
          {v.created_at ? format(new Date(v.created_at), 'MMM d, yyyy') : '—'}
        </span>
      ),
    },
  ]

  return (
    <Page
      title="Violations"
      width="wide"
      description="Covenant violations on file, from first report through notice, cure period and close."
      linkAs={Link}
      actions={
        <>
          <Button asChild variant="secondary">
            <a href={`/violations/export${search ? `?q=${encodeURIComponent(search)}` : ''}`}>
              <Download aria-hidden />
              Export CSV
            </a>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/inspect">
              <Camera aria-hidden />
              Inspect homes
            </Link>
          </Button>
          <Button asChild>
            <Link href={withPropertyParam('/violations/new', scope?.id ?? null)}>
              <Plus aria-hidden />
              Report violation
            </Link>
          </Button>
        </>
      }
      tabs={<Tabs items={violationTabs('/violations')} aria-label="Violation sections" linkAs={Link} />}
    >
      {scope ? <PropertyScopeBanner scope={scope} noun="violations" clearHref={href({ dropProperty: true, page: 1 })} /> : null}
      <SummaryStrip
        ariaLabel="Violations summary"
        testId="violations-summary"
        tiles={[
          {
            label: 'Open',
            icon: <CircleDot />,
            value: summary ? String(summary.open) : null,
            hint: summary?.open === 0 ? 'Nothing waiting on the board' : 'No notice sent yet',
            href: href({ status: 'action', q: '', page: 1 }),
          },
          {
            label: 'In cure period',
            icon: <BellRing />,
            value: summary ? String(summary.inCure) : null,
            hint: summary?.inCure === 0 ? 'No owners are being waited on' : 'Notice sent, owner has time left',
            href: href({ status: 'notice', q: '', page: 1 }),
          },
          {
            label: 'Cure date passed',
            icon: <CalendarX />,
            value: summary ? String(summary.curePassed) : null,
            hint: summary?.curePassed === 0 ? 'No one is past the deadline' : `${plural(summary?.curePassed ?? 0, 'notice')} past the cure date`,
            tone: summary && summary.curePassed > 0 ? 'danger' : 'default',
            href: href({ status: 'notice', q: '', page: 1, cure: !summary || summary.curePassed <= MAX_CURE_IDS }),
          },
        ]}
      />

      {cureFilterOn ? (
        <p className="text-sm text-muted">
          Showing only violations past their cure date.{' '}
          <Link href={href({ status: 'notice', page: 1 })} className="font-medium text-primary hover:underline">
            Show the whole cure period
          </Link>
        </p>
      ) : null}

      <ListToolbar>
        <FilterChips
          label="Filter by status"
          linkAs={Link}
          items={(Object.keys(STATUS_FILTERS) as StatusFilter[]).map((key) => ({
            label: STATUS_FILTERS[key].label,
            href: href({ status: key, page: 1 }),
            active: key === statusFilter && !cureFilterOn,
            count: counts[key] ?? null,
          }))}
        />
        <SearchForm
          action="/violations"
          label="Search violations"
          placeholder="Search description or CC&R"
          defaultValue={search}
          keep={{ status: statusFilter === 'all' ? null : statusFilter, property: scope?.id ?? null, cure: cureFilterOn ? 'passed' : null }}
          linkAs={Link}
        />
      </ListToolbar>

      {!result?.ok ? (
        <LoadFailed what="violations" />
      ) : (
        <DataTable
          caption="Violations"
          columns={columns}
          rows={rows}
          rowKey={(v) => v.id}
          mobile="cards"
          linkAs={Link}
          empty={
            total === 0 && !filtered ? (
              <EmptyState
                variant="compact"
                icon={<AlertTriangle aria-hidden />}
                title="No violations on file"
                secondaryAction={<HowThisWorks href={guideHref('violations-report-and-letter')} />}
                description="Report your first violation. Covenant Brain will match it to a CC&R section and draft the letter."
                action={
                  <Button asChild size="sm">
                    <Link href="/violations/new">
                      <Plus aria-hidden />
                      Report a violation
                    </Link>
                  </Button>
                }
              />
            ) : (
              <EmptyState
                variant="compact"
                icon={<Search aria-hidden />}
                title={search ? `No violations match “${search}”` : 'Nothing in this view'}
                description={
                  search
                    ? 'Try a shorter or different search term, or clear the filters.'
                    : `No violations are ${STATUS_FILTERS[statusFilter].label.toLowerCase()} right now.`
                }
                action={
                  <Button asChild variant="secondary" size="sm">
                    <Link href={scope ? href({ status: 'all', q: '', page: 1 }) : '/violations'}>
                      {scope ? 'Clear filters for this home' : 'Clear filters'}
                    </Link>
                  </Button>
                }
              />
            )
          }
          footer={
            total > PAGE_SIZE || page > 1 ? (
              <Pager
                page={page}
                pageSize={PAGE_SIZE}
                total={total}
                rowCount={rows.length}
                hrefFor={(p) => href({ page: p, cure: cureFilterOn })}
                linkAs={Link}
                noun="violations"
              />
            ) : undefined
          }
        />
      )}
    </Page>
  )
}
