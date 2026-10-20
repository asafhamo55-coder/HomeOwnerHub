import Link from 'next/link'
import { History } from 'lucide-react'
import {
  Alert,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  Input,
  LoadFailed,
  Page,
  Pager,
  Select,
  filterFieldClass,
  pageRange,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { orgTimeZone } from '@/lib/association-time-server'
import { tryLoad } from '@/lib/load-or-fail'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { ExportDownloadButton } from '@/components/export/ExportDownloadButton'
import { ACTIVITY_AREAS, ACTIVITY_AREA_LABEL } from '@/lib/audit/labels'
import {
  ACTIVITY_PAGE_SIZE,
  EMPTY_DIRECTORY,
  activityView,
  boardPeople,
  filtersToSearch,
  isFiltered,
  loadActivityPage,
  loadActorDirectory,
  localStamp,
  parseActivityFilters,
  type ActivityView,
  type AuditClient,
} from '@/lib/audit/queries'

export const metadata = { title: 'Activity log' }
export const dynamic = 'force-dynamic'

// BL-115 — who did what, and when. Board or admin, like the export route.
// audit_log is read through the caller's RLS client (0063
// audit_log_select: board/admin of the org); names come from
// loadActorDirectory, board members only.

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ActivityLogPage({ searchParams }: PageProps) {
  const { role, org } = await requireBoardOrAdmin()
  const sp = await searchParams
  const { filters, invalid } = parseActivityFilters(sp)
  const page = parsePageParam(sp.page)

  const supabase = await getSupabaseServerClient()
  const timeZone = await orgTimeZone(supabase, org.id)
  const [list, directory] = await Promise.all([
    tryLoad('activity log', () =>
      loadActivityPage(supabase as unknown as AuditClient, org.id, filters, timeZone, pageRange(page, ACTIVITY_PAGE_SIZE)),
    ),
    tryLoad('board members', () => loadActorDirectory(org.id)),
  ])
  const dir = directory.ok ? directory.data : EMPTY_DIRECTORY
  const people = boardPeople(dir)

  const search = filtersToSearch(filters)
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(search)
    if (p > 1) q.set('page', String(p))
    const s = q.toString()
    return s ? `/settings/activity?${s}` : '/settings/activity'
  }
  const exportQs = search.toString()
  const exportUrl = `/api/settings/activity/export${exportQs ? `?${exportQs}` : ''}`

  const rows: ActivityView[] = list.ok ? list.data.rows.map((r) => activityView(r, dir)) : []
  const filtered = isFiltered(filters)

  const columns: DataTableColumn<ActivityView>[] = [
    {
      key: 'action',
      header: 'What happened',
      mobilePrimary: true,
      cell: (v) => (
        <span className="block min-w-0">
          <span className="block font-medium text-foreground">{v.action}</span>
          {v.detail ? <span className="block text-xs text-muted">{v.detail}</span> : null}
        </span>
      ),
    },
    { key: 'actor', header: 'Who', cell: (v) => v.actor },
    { key: 'area', header: 'Area', hideBelowLg: true, className: 'text-muted', cell: (v) => v.area },
    {
      key: 'record',
      header: 'Record',
      cell: (v) =>
        v.href ? (
          <Link href={v.href} className="font-medium text-primary hover:underline">
            {v.entity ? `Open ${v.entity.toLowerCase()}` : 'Open'}
          </Link>
        ) : (
          <span className="text-muted">{v.entity ?? '—'}</span>
        ),
    },
    {
      key: 'when',
      header: 'When',
      className: 'whitespace-nowrap text-muted',
      cell: (v) => <span className="num">{localStamp(v.at, timeZone)}</span>,
    },
  ]

  return (
    <Page
      title="Settings"
      description="Who did what, and when. Every entry is permanent: nobody can edit or delete it."
      tabs={<SettingsTabs current="/settings/activity" role={role} />}
      linkAs={Link}
    >
      <FilterBar resetHref="/settings/activity" filtered={filtered} linkAs={Link} label="Filter the activity log">
        <Field label="Person" className={filterFieldClass}>
          <Select name="person" defaultValue={filters.person ?? ''}>
            <option value="">Everyone</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Area" className={filterFieldClass}>
          <Select name="area" defaultValue={filters.area ?? ''}>
            <option value="">All areas (without AI usage)</option>
            {ACTIVITY_AREAS.map((a) => (
              <option key={a} value={a}>
                {ACTIVITY_AREA_LABEL[a]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="From" className={filterFieldClass}>
          <Input type="date" name="from" defaultValue={filters.from ?? ''} />
        </Field>
        <Field label="To" className={filterFieldClass}>
          <Input type="date" name="to" defaultValue={filters.to ?? ''} />
        </Field>
      </FilterBar>

      {invalid.length > 0 ? (
        <Alert variant="warning" title="Some filters were ignored">
          A filter value wasn’t recognised (or the start date was after the end date), so it was left out.
        </Alert>
      ) : null}
      {!directory.ok ? (
        <Alert variant="warning" title="Names couldn’t be loaded">
          The entries below are correct; board members show as “Former member” until names load. Refresh to try again.
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Board members are shown by name. Residents and automatic steps are shown as “A resident” and “System”.
        </p>
        <ExportDownloadButton url={exportUrl} label="Export CSV" fallbackName="activity-log.csv" />
      </div>

      {!list.ok ? (
        <LoadFailed what="the activity log" />
      ) : (
        <DataTable
          caption="Activity log"
          mobile="cards"
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyState
              variant="compact"
              icon={<History aria-hidden />}
              title={filtered ? 'Nothing matches these filters' : 'No activity recorded yet'}
              description={
                filtered
                  ? 'Widen the dates or pick another person or area.'
                  : 'Exports, imports, vendor decisions and other board actions appear here as they happen.'
              }
              action={
                filtered ? (
                  <Link href="/settings/activity" className="font-medium text-primary hover:underline">
                    Reset filters
                  </Link>
                ) : (
                  <Link href="/settings/members" className="font-medium text-primary hover:underline">
                    See who has access
                  </Link>
                )
              }
            />
          }
          footer={
            list.data.total > ACTIVITY_PAGE_SIZE ? (
              <Pager
                page={page}
                pageSize={ACTIVITY_PAGE_SIZE}
                total={list.data.total}
                rowCount={list.data.rows.length}
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
