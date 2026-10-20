import Link from 'next/link'
import { Gavel } from 'lucide-react'
import {
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  Input,
  LoadFailed,
  Page,
  Pager,
  Select,
  StatusPill,
  filterFieldClass,
  parsePageParam,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { format } from 'date-fns'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { orgTimeZone } from '@/lib/association-time-server'
import { todayIn } from '@/lib/association-time'
import { tryLoad } from '@/lib/load-or-fail'
import { ExportDownloadButton } from '@/components/export/ExportDownloadButton'
import {
  MOTION_RESULTS,
  MOTION_RESULT_LABEL,
  MOTION_SEARCH_MAX,
  filterMotions,
  loadAllMotions,
  meetingTypeLabel,
  minutesStatusLabel,
  motionFiltersToSearch,
  motionYears,
  parseMotionFilters,
  resultLabel,
  votesLabel,
  type MinutesClient,
  type Motion,
  type MotionResult,
} from '@/lib/meeting-motions'

export const metadata = { title: 'Motion log' }
export const dynamic = 'force-dynamic'

// BL-116 — every motion across every meeting, searchable. Board or admin:
// minutes (drafts included) are board-only (0063). Motions come from the
// structured motions column when a meeting has one, otherwise from the
// minutes text, labelled "From minutes text" (see lib/meeting-motions.ts).

const PAGE_SIZE = 50

function tone(r: MotionResult | null): 'success' | 'danger' | 'warning' | 'neutral' {
  if (r === 'passed') return 'success'
  if (r === 'failed') return 'danger'
  if (r === 'tabled') return 'warning'
  return 'neutral'
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function MotionLogPage({ searchParams }: PageProps) {
  const { org } = await requireBoardOrAdmin()
  const sp = await searchParams
  const filters = parseMotionFilters(sp)
  const page = parsePageParam(sp.page)

  const supabase = await getSupabaseServerClient()
  const today = todayIn(await orgTimeZone(supabase, org.id))
  const all = await tryLoad('motions', () => loadAllMotions(supabase as unknown as MinutesClient, org.id, today))

  const motions = all.ok ? filterMotions(all.data, filters) : []
  const years = all.ok ? motionYears(all.data) : []
  const shown = motions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const filtered = Boolean(filters.q || filters.year || filters.result)

  const search = motionFiltersToSearch(filters)
  const hrefFor = (p: number) => {
    const q = new URLSearchParams(search)
    if (p > 1) q.set('page', String(p))
    const s = q.toString()
    return s ? `/meetings/motions?${s}` : '/meetings/motions'
  }
  const exportQs = search.toString()
  const exportUrl = `/api/meetings/motions/export${exportQs ? `?${exportQs}` : ''}`

  const columns: DataTableColumn<Motion>[] = [
    {
      key: 'motion',
      header: 'Motion',
      mobilePrimary: true,
      cell: (m) => (
        <span className="block min-w-0 space-y-1">
          <span className="block text-sm font-medium text-foreground">{m.text}</span>
          <span className="block text-xs text-muted">
            {[
              m.movedBy ? `Moved by ${m.movedBy}` : null,
              m.secondedBy ? `seconded by ${m.secondedBy}` : null,
              m.source === 'minutes_text' ? 'From minutes text' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      cell: (m) => (
        <span className="flex flex-col items-start gap-1">
          <StatusPill tone={tone(m.result)} icon={null} label={resultLabel(m.result)} />
          {votesLabel(m.votes) ? <span className="num text-xs text-muted">{votesLabel(m.votes)}</span> : null}
        </span>
      ),
    },
    {
      key: 'meeting',
      header: 'Meeting',
      className: 'whitespace-nowrap',
      cell: (m) => (
        <Link href={`/meetings/${m.meetingId}`} className="group block no-underline">
          <span className="block font-medium text-primary group-hover:underline">
            {format(new Date(`${m.meetingDate}T00:00:00`), 'MMM d, yyyy')}
          </span>
          <span className="block text-xs text-muted">
            {meetingTypeLabel(m.meetingType)} · {minutesStatusLabel(m.minutesStatus)} minutes
          </span>
        </Link>
      ),
    },
  ]

  return (
    <Page
      title="Motion log"
      description="Every motion from every meeting’s minutes, newest first. Search it, filter it, or export it."
      breadcrumbs={[{ label: 'Meetings', href: '/meetings' }, { label: 'Motion log' }]}
      linkAs={Link}
      actions={<ExportDownloadButton url={exportUrl} label="Export CSV" fallbackName="motion-log.csv" />}
    >
      <FilterBar resetHref="/meetings/motions" filtered={filtered} linkAs={Link} label="Filter motions">
        <Field label="Search" className={filterFieldClass}>
          <Input
            type="search"
            name="q"
            defaultValue={filters.q ?? ''}
            maxLength={MOTION_SEARCH_MAX}
            placeholder="Budget, fence, Smith…"
          />
        </Field>
        <Field label="Year" className={filterFieldClass}>
          <Select name="year" defaultValue={filters.year ?? ''}>
            <option value="">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Result" className={filterFieldClass}>
          <Select name="result" defaultValue={filters.result ?? ''}>
            <option value="">Any result</option>
            {MOTION_RESULTS.map((r) => (
              <option key={r} value={r}>
                {MOTION_RESULT_LABEL[r]}
              </option>
            ))}
            <option value="none">Not recorded</option>
          </Select>
        </Field>
      </FilterBar>

      <p className="text-sm text-muted">
        Rows marked “From minutes text” were read from the minutes wording, not a recorded vote. Open the minutes to
        check the exact record.
      </p>

      {!all.ok ? (
        <LoadFailed what="motions" />
      ) : (
        <DataTable
          caption="Motions"
          mobile="cards"
          columns={columns}
          rows={shown}
          rowKey={(m) => m.id}
          empty={
            <EmptyState
              variant="compact"
              icon={<Gavel aria-hidden />}
              title={filtered ? 'No motions match' : 'No motions recorded yet'}
              description={
                filtered
                  ? 'Try other words, another year, or reset the filters.'
                  : 'Motions appear here once minutes list them, for example under “Decisions Made”.'
              }
              action={
                filtered ? (
                  <Link href="/meetings/motions" className="font-medium text-primary hover:underline">
                    Reset filters
                  </Link>
                ) : (
                  <Link href="/meetings/new" className="font-medium text-primary hover:underline">
                    Record minutes
                  </Link>
                )
              }
            />
          }
          footer={
            motions.length > PAGE_SIZE ? (
              <Pager
                page={page}
                pageSize={PAGE_SIZE}
                total={motions.length}
                rowCount={shown.length}
                hrefFor={hrefFor}
                linkAs={Link}
                noun="motions"
              />
            ) : undefined
          }
        />
      )}
    </Page>
  )
}
