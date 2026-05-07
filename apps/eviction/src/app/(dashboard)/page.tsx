import Link from 'next/link'
import { ScrollText, Plus, AlertCircle } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'
import { Badge, Button, Card, EmptyState } from '@homeownerhub/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

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
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const { data } = await supabase
    .from('eviction_cases')
    .select(
      'id, property_address, tenant_name, status, county, state, created_at, filing_eligible_date, notice_sent_at',
    )
    .order('created_at', { ascending: false })

  const cases = (data ?? []) as CaseRow[]

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
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-muted">Cases</h1>
          <p className="text-sm text-muted-fg">
            {cases.length} {cases.length === 1 ? 'case' : 'cases'} in {org.name}
          </p>
        </div>
        <Button asChild>
          <Link href="/cases/new">
            <Plus className="h-4 w-4" />
            New case
          </Link>
        </Button>
      </header>

      {cases.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-10 w-10" aria-hidden />}
          title="No cases yet"
          description="Start a new case to run a compliance check, generate a legal notice, and track the filing date."
          action={
            <Button asChild>
              <Link href="/cases/new">
                <Plus className="h-4 w-4" />
                Start first case
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          <div className="flex min-w-max gap-4 md:grid md:min-w-0 md:grid-cols-5">
            {byColumn.map((col) => (
              <div key={col.id} className="w-72 flex-shrink-0 md:w-auto">
                <div className="mb-2 flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-muted">{col.label}</h2>
                  <span className="text-xs text-muted-fg">{col.cases.length}</span>
                </div>
                <p className="mb-3 px-1 text-[11px] text-muted-fg">{col.description}</p>
                <div className="space-y-2">
                  {col.cases.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border bg-surface px-3 py-4 text-center text-xs text-muted-fg">
                      Empty
                    </div>
                  ) : (
                    col.cases.map((c) => <CaseCard key={c.id} c={c} />)
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
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
      className="block rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      <p className="truncate text-sm font-medium text-muted">{c.property_address}</p>
      <p className="mt-0.5 truncate text-xs text-muted-fg">
        {c.tenant_name ?? 'Tenant unknown'}
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-fg">
        <Badge variant="outline" size="sm">
          {c.county}, {c.state}
        </Badge>
        {filingDate ? (
          <span className="flex items-center gap-1">
            {isOverdue ? (
              <span className="inline-flex items-center gap-0.5 font-medium text-destructive">
                <AlertCircle className="h-3 w-3" />
                file now
              </span>
            ) : daysUntilFiling !== null && daysUntilFiling <= 1 ? (
              <span className="font-medium text-amber-700">
                files {format(filingDate, 'MMM d')}
              </span>
            ) : (
              <span>files {format(filingDate, 'MMM d')}</span>
            )}
          </span>
        ) : null}
      </div>
    </Link>
  )
}
