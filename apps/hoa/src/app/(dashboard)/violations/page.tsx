import Link from 'next/link'
import { AlertTriangle, Download, Plus, Search } from 'lucide-react'
import { format } from 'date-fns'
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
import { VIOLATION_SEVERITY, VIOLATION_STATUS } from '@/lib/status/community'
import { violationTabs } from './tabs'

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
  property: { address: string; unit_number: string | null } | null
}

// Was a silent `.limit(100)`: the 101st violation simply did not exist as
// far as this page was concerned. Same page size, now with a pager.
const PAGE_SIZE = 100

/** Cure deadline = notice sent + cure period (only while the notice is live). */
function cureDue(v: ViolationRow): Date | null {
  if (v.status !== 'notice_sent' || !v.notice_sent_at || !v.cure_period_days) return null
  return new Date(new Date(v.notice_sent_at).getTime() + v.cure_period_days * 86_400_000)
}

export default async function ViolationsListPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>
}) {
  const { q: qParam, page: pageParam, status: statusParam } = await searchParams
  const search = (qParam ?? '').trim()
  const statusFilter = parseStatusFilter(statusParam)
  const page = parsePageParam(pageParam)
  const { from, to } = pageRange(page, PAGE_SIZE)

  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />

  const supabase = await getSupabaseServerClient()
  let query = supabase
    .from('hoa_violations')
    .select(
      'id, description, status, severity, ccr_section, created_at, notice_sent_at, cure_period_days, property:hoa_properties(address, unit_number)',
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

  // Status column only, for the chip counts. Small (one short text per
  // violation) and independent of paging; a failure just hides the counts.
  const [result, statusRes] = await Promise.all([
    loadOrFail('violations', query.range(from, to)),
    loadOrFail(
      'violation status counts',
      supabase.from('hoa_violations').select('status').eq('org_id', org.id).is('deleted_at', null),
    ),
  ])

  const rows = result.ok ? ((result.data ?? []) as unknown as ViolationRow[]) : []
  const total = result.ok ? (result.count ?? rows.length) : 0

  const counts: Partial<Record<StatusFilter, number>> = {}
  if (statusRes.ok) {
    const all = (statusRes.data ?? []) as Array<{ status: string }>
    for (const key of Object.keys(STATUS_FILTERS) as StatusFilter[]) {
      const set = STATUS_FILTERS[key].statuses as readonly string[] | null
      counts[key] = set ? all.filter((r) => set.includes(r.status)).length : all.length
    }
  }

  const href = (opts: { page?: number; status?: StatusFilter; q?: string }): string => {
    const params = new URLSearchParams()
    const q = opts.q ?? search
    const st = opts.status ?? statusFilter
    if (q) params.set('q', q)
    if (st !== 'all') params.set('status', st)
    if (opts.page && opts.page > 1) params.set('page', String(opts.page))
    const qs = params.toString()
    return qs ? `/violations?${qs}` : '/violations'
  }

  const filtered = search.length > 0 || statusFilter !== 'all'

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
            {v.property?.address ?? 'Property unknown'}
            {v.property?.unit_number ? ` · ${v.property.unit_number}` : ''}
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
        const due = cureDue(v)
        if (!due) return <span className="text-muted">—</span>
        const overdue = due < new Date()
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
          <Button asChild>
            <Link href="/violations/new">
              <Plus aria-hidden />
              Report violation
            </Link>
          </Button>
        </>
      }
      tabs={<Tabs items={violationTabs('/violations')} aria-label="Violation sections" linkAs={Link} />}
    >
      <ListToolbar>
        <FilterChips
          label="Filter by status"
          linkAs={Link}
          items={(Object.keys(STATUS_FILTERS) as StatusFilter[]).map((key) => ({
            label: STATUS_FILTERS[key].label,
            href: href({ status: key, page: 1 }),
            active: key === statusFilter,
            count: counts[key] ?? null,
          }))}
        />
        <SearchForm
          action="/violations"
          label="Search violations"
          placeholder="Search description or CC&R"
          defaultValue={search}
          keep={{ status: statusFilter === 'all' ? null : statusFilter }}
          linkAs={Link}
        />
      </ListToolbar>

      {!result.ok ? (
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
                    <Link href="/violations">Clear filters</Link>
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
                hrefFor={(p) => href({ page: p })}
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
