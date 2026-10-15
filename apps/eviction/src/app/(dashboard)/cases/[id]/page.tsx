import { notFound } from 'next/navigation'
import { Clock, CreditCard } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'
import {
  Alert,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  KeyValue,
  KeyValueList,
  LoadFailed,
  Page,
  StatusPill,
  type StatusTone,
} from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { formatCounty } from '@/lib/county-labels'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'
import { CaseStatusFlips } from '@/components/cases/CaseStatusFlips'
import { PerCasePayButton } from '@/components/cases/PerCasePayButton'

interface CaseDetail {
  id: string
  property_address: string
  tenant_name: string | null
  tenant_email: string | null
  county: string
  state: string
  monthly_rent: number | null
  days_unpaid: number | null
  notice_type: string | null
  notice_draft: string | null
  notice_sent_at: string | null
  notice_served_method: string | null
  filing_eligible_date: string | null
  status: string | null
  case_notes: string | null
  outcome: string | null
  stripe_payment_id: string | null
  compliance_flags: { flags?: string[]; recommendation?: string } | null
  created_at: string | null
}

export default async function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()

  const res = await loadOrFail(
    'this case',
    supabase
      .from('eviction_cases')
      .select(
        'id, property_address, tenant_name, tenant_email, county, state, monthly_rent, days_unpaid, notice_type, notice_draft, notice_sent_at, notice_served_method, filing_eligible_date, status, case_notes, outcome, stripe_payment_id, compliance_flags, created_at',
      )
      .eq('id', id)
      .maybeSingle(),
  )
  if (!res.ok) {
    return (
      <Page width="default" title="Case" back={{ href: '/', label: 'Cases' }}>
        <LoadFailed what="this case" />
      </Page>
    )
  }
  const data = res.data
  if (!data) notFound()
  const c = data as unknown as CaseDetail

  // Pull the org's plan to decide whether to show the per-case pay button.
  // Unlimited subscribers don't need to pay per case.
  const org = await getCurrentOrg()
  const showPerCaseButton =
    !c.stripe_payment_id && org?.plan !== 'unlimited'

  const filingDate = c.filing_eligible_date ? new Date(c.filing_eligible_date) : null
  const today = new Date()
  const daysUntilFiling = filingDate ? differenceInCalendarDays(filingDate, today) : null
  const filingReady = filingDate ? filingDate <= today : false

  const status = caseStatus(c.status, filingReady)

  return (
    <Page
      width="default"
      breadcrumbs={[{ label: 'Cases', href: '/' }, { label: c.property_address }]}
      title={c.property_address}
      description={`${c.tenant_name ?? 'Tenant unknown'} · ${formatCounty(c.county)}, ${c.state}`}
      meta={
        <>
          <StatusPill tone={status.tone} label={status.label} />
          {c.stripe_payment_id ? <StatusPill tone="success" label="Filing fee paid" /> : null}
        </>
      }
    >
      <div className="space-y-6">
      {filingReady && c.status !== 'filed' && c.status !== 'resolved' ? (
        <Alert variant="error" title="Filing eligible — file in JP court today">
          The 3-day cure period has elapsed. Texas Property Code Section 24.005 lets you file the
          forcible-detainer suit in the appropriate Justice of the Peace court today. Bring the
          approved notice and proof of service.
        </Alert>
      ) : !filingReady && daysUntilFiling !== null && daysUntilFiling > 0 ? (
        <Alert variant="info" title="Cure period running">
          Earliest filing date: <strong>{format(filingDate!, 'EEEE, MMMM d, yyyy')}</strong> ·{' '}
          {daysUntilFiling} {daysUntilFiling === 1 ? 'day' : 'days'} from today.
        </Alert>
      ) : null}

      {c.compliance_flags &&
      Array.isArray(c.compliance_flags.flags) &&
      c.compliance_flags.flags.length > 0 ? (
        <Alert variant="warning" title="AI flagged edge cases at intake">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {c.compliance_flags.flags.map((flag, i) => (
              <li key={i}>{flag}</li>
            ))}
          </ul>
          {c.compliance_flags.recommendation ? (
            <p className="mt-2 text-sm">{c.compliance_flags.recommendation}</p>
          ) : null}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Status</CardTitle>
          <CardDescription>
            Move the case forward as you progress in JP court.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CaseStatusFlips
            caseId={c.id}
            currentStatus={c.status ?? 'intake'}
            filingReady={filingReady}
          />
        </CardContent>
      </Card>

      {showPerCaseButton ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <CreditCard className="size-4 text-muted" aria-hidden />
              Filing fee
            </CardTitle>
            <CardDescription>
              Pay $249 to mark this case as ready to file. Skip if your workspace is on the
              Unlimited plan.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PerCasePayButton caseId={c.id} />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle as="h2">Approved notice</CardTitle>
          </CardHeader>
          <CardContent>
            {c.notice_draft ? (
              <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-subtle p-4 font-mono text-xs leading-relaxed text-foreground">
                {c.notice_draft}
              </pre>
            ) : (
              <p className="text-sm text-muted">No approved notice on file.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList className="sm:grid-cols-1">
              <KeyValue label="Opened" value={c.created_at ? format(new Date(c.created_at), 'PPp') : null} />
              <KeyValue label="Notice served" value={c.notice_sent_at ? format(new Date(c.notice_sent_at), 'PPp') : null} />
              <KeyValue label="Service method" value={c.notice_served_method ? c.notice_served_method.replace(/_/g, ' ') : null} />
              <KeyValue
                label="Earliest filing"
                value={
                  filingDate ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-3.5 text-muted" aria-hidden />
                      {format(filingDate, 'PP')}
                    </span>
                  ) : null
                }
              />
              <KeyValue label="Days unpaid" value={c.days_unpaid != null ? <span className="num">{c.days_unpaid}</span> : null} />
              <KeyValue
                label="Monthly rent"
                value={c.monthly_rent != null ? <span className="num">${c.monthly_rent.toLocaleString()}</span> : null}
              />
              {c.outcome ? <KeyValue label="Outcome" value={c.outcome} /> : null}
              {c.tenant_email ? (
                <KeyValue
                  label="Tenant email"
                  value={
                    <a href={`mailto:${c.tenant_email}`} className="break-all text-primary hover:underline">
                      {c.tenant_email}
                    </a>
                  }
                />
              ) : null}
            </KeyValueList>
          </CardContent>
        </Card>
      </div>

      {c.case_notes ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Notes from intake</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-foreground">{c.case_notes}</p>
          </CardContent>
        </Card>
      ) : null}
      </div>
    </Page>
  )
}

function caseStatus(status: string | null, filingReady: boolean): { tone: StatusTone; label: string } {
  if (status === 'resolved') return { tone: 'success', label: 'Resolved' }
  if (status === 'filed') return { tone: 'info', label: 'Filed' }
  if (status === 'notice_sent' && filingReady) return { tone: 'danger', label: 'Filing ready' }
  if (status === 'notice_sent') return { tone: 'warning', label: 'Notice sent' }
  if (status === 'filing_ready') return { tone: 'danger', label: 'Filing ready' }
  return { tone: 'neutral', label: (status ?? 'intake').replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase()) }
}
