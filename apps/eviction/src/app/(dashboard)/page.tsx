import Link from 'next/link'
import { AlertCircle, Clock, Plus, ScrollText } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'
import { Badge, Button, EmptyState, LoadFailed, NoOrgSelected, Page } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { listUnfinishedDrafts } from '@/lib/drafts'
import { formatCounty } from '@/lib/county-labels'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { UnfinishedWorkflowsCard } from '@/components/dashboard/UnfinishedWorkflowsCard'

export const metadata = { title: 'Cases' }

interface CaseRow {
  id: string
  property_address: string
  tenant_name: string | null
  status: string | null
  county: string
  state: string
  created_at: string | null
  filing_eligible_date: string | null
  notice_sent_at: string | null
}

// Phase 1 status pipeline. The wizard sets new cases to 'notice_sent';
// downstream statuses are set manually from the case detail page (not yet built).
const COLUMNS: { id: string; label: string; description: string }[] = [
  { id: 'intake', label: 'Intake', description: 'Drafted, not yet served' },
  { id: 'notice_sent', label: 'Notice sent', description: 'Cure clock running' },
  { id: 'filing_ready', label: 'Filing ready', description: 'Cure period elapsed' },
  { id: 'filed', label: 'Filed', description: 'In JP Court' },
  { id: 'resolved', label: 'Resolved', description: 'Closed' },
]

export default async function CasesHomePage() {
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected noun="workspace" />

  const supabase = await getSupabaseServerClient()
  const [casesRes, drafts] = await Promise.all([
    loadOrFail(
      'your cases',
      supabase
        .from('eviction_cases')
        .select(
          'id, property_address, tenant_name, status, county, state, created_at, filing_eligible_date, notice_sent_at',
        )
        .order('created_at', { ascending: false }),
    ),
    listUnfinishedDrafts(),
  ])

  if (!casesRes.ok) {
    return (
      <Page width="wide" title="Cases">
        <LoadFailed what="your cases" />
      </Page>
    )
  }
  const cases = (casesRes.data ?? []) as CaseRow[]

  // Apply derived status: notice_sent rows whose filing_eligible_date <= today
  // are effectively "filing_ready" even if no one has flipped the status yet.
  const today = new Date()
  const enriched = cases.map((c) => {
    if (
      c.status === 'notice_sent' &&
      c.filing_eligible_date &&
      new Date(c.filing_eligible_date) <= today
    ) {
      return { ...c, derivedStatus: 'filing_ready' }
    }
    return { ...c, derivedStatus: c.status ?? 'intake' }
  })

  const byColumn = COLUMNS.map((col) => ({
    ...col,
    cases: enriched.filter((c) => c.derivedStatus === col.id),
  }))

  return (
    <Page
      width="wide"
      title="Cases"
      description={`${cases.length} ${cases.length === 1 ? 'case' : 'cases'} in ${org.name}`}
      actions={
        <Button asChild>
          <Link href="/cases/new">
            <Plus aria-hidden />
            New case
          </Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <UnfinishedWorkflowsCard drafts={drafts} />

        {cases.length === 0 ? (
          <EmptyState
            icon={<ScrollText aria-hidden />}
            title="No cases yet"
            description="Start a case to run the compliance check, generate the notice and track the filing date."
            action={
              <Button asChild>
                <Link href="/cases/new">
                  <Plus aria-hidden />
                  Start your first case
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:mx-0 lg:px-0">
            <div className="flex min-w-max gap-3 lg:grid lg:min-w-0 lg:grid-cols-5">
              {byColumn.map((col) => (
                <section
                  key={col.id}
                  aria-labelledby={`col-${col.id}`}
                  className="w-72 shrink-0 rounded-xl border border-border bg-subtle p-2 lg:w-auto"
                >
                  <header className="px-2 pb-2 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <h2 id={`col-${col.id}`} className="text-sm font-semibold text-foreground">
                        {col.label}
                      </h2>
                      <Badge variant="neutral" size="sm">
                        {col.cases.length}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{col.description}</p>
                  </header>
                  <div className="space-y-2">
                    {col.cases.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-border-strong px-3 py-5 text-center text-xs text-muted">
                        No cases
                      </p>
                    ) : (
                      col.cases.map((c) => <CaseCard key={c.id} c={c} />)
                    )}
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </Page>
  )
}

function CaseCard({
  c,
}: {
  c: CaseRow & { derivedStatus: string }
}) {
  const filingDate = c.filing_eligible_date ? new Date(c.filing_eligible_date) : null
  const today = new Date()
  const daysUntilFiling = filingDate ? differenceInCalendarDays(filingDate, today) : null
  const isOverdue =
    c.derivedStatus === 'filing_ready' || (daysUntilFiling !== null && daysUntilFiling < 0)

  return (
    <Link
      href={`/cases/${c.id}`}
      className="block rounded-lg border border-border bg-surface p-3 no-underline shadow-xs transition-[border-color,box-shadow] duration-fast hover:border-border-strong hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <p className="truncate text-sm font-medium text-foreground">{c.property_address}</p>
      <p className="mt-0.5 truncate text-xs text-muted">{c.tenant_name ?? 'Tenant unknown'}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span>
          {formatCounty(c.county)}, {c.state}
        </span>
        {filingDate ? (
          isOverdue && c.derivedStatus !== 'filed' && c.derivedStatus !== 'resolved' ? (
            <span className="inline-flex items-center gap-1 font-medium text-danger">
              <AlertCircle className="size-3.5" aria-hidden />
              File now
            </span>
          ) : c.derivedStatus === 'notice_sent' ? (
            <span
              className={
                daysUntilFiling !== null && daysUntilFiling <= 1
                  ? 'inline-flex items-center gap-1 font-medium text-warning'
                  : 'inline-flex items-center gap-1'
              }
            >
              <Clock className="size-3.5" aria-hidden />
              Files {format(filingDate, 'MMM d')}
            </span>
          ) : null
        ) : null}
      </div>
    </Link>
  )
}
