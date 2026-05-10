import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CheckCircle2, CreditCard } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { formatCounty } from '@/lib/county-labels'
import { getSupabaseServerClient } from '@/lib/supabase/server'
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

  const { data } = await supabase
    .from('eviction_cases')
    .select(
      'id, property_address, tenant_name, tenant_email, county, state, monthly_rent, days_unpaid, notice_type, notice_draft, notice_sent_at, notice_served_method, filing_eligible_date, status, case_notes, outcome, stripe_payment_id, compliance_flags, created_at',
    )
    .eq('id', id)
    .maybeSingle()

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

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to cases
      </Link>

      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-muted">{c.property_address}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-fg">
          <span>{c.tenant_name ?? 'Tenant unknown'}</span>
          <span>·</span>
          <span>
            {formatCounty(c.county)}, {c.state}
          </span>
          <Badge
            variant={
              c.status === 'resolved'
                ? 'success'
                : filingReady && c.status !== 'filed'
                  ? 'destructive'
                  : 'warning'
            }
            size="sm"
          >
            {c.status === 'resolved'
              ? 'resolved'
              : filingReady && c.status === 'notice_sent'
                ? 'filing ready'
                : (c.status ?? 'unknown').replace('_', ' ')}
          </Badge>
          {c.stripe_payment_id ? (
            <Badge variant="success" size="sm">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Paid
            </Badge>
          ) : null}
        </div>
      </header>

      {filingReady && c.status !== 'filed' && c.status !== 'resolved' ? (
        <Alert variant="error" title="Filing eligible — file in JP court today">
          The 3-day cure period has elapsed. Texas Property Code §24.005 lets you file the
          forcible-detainer suit in the appropriate Justice of the Peace court today. Bring the
          approved notice and proof of service.
        </Alert>
      ) : !filingReady && daysUntilFiling !== null && daysUntilFiling > 0 ? (
        <Alert variant="info" hideIcon>
          <span className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            Cure period running. Earliest filing date:{' '}
            <strong>{format(filingDate!, 'EEEE, MMMM d, yyyy')}</strong> ·{' '}
            {daysUntilFiling} {daysUntilFiling === 1 ? 'day' : 'days'} from today
          </span>
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
          <CardTitle className="text-base">Status</CardTitle>
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
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="h-4 w-4 text-muted-fg" />
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
            <CardTitle className="text-base">Approved notice</CardTitle>
          </CardHeader>
          <CardContent>
            {c.notice_draft ? (
              <pre className="whitespace-pre-wrap rounded-lg border border-border bg-background p-4 font-mono text-xs leading-relaxed text-muted">
                {c.notice_draft}
              </pre>
            ) : (
              <p className="text-sm text-muted-fg">No approved notice on file.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Opened">
              {c.created_at ? format(new Date(c.created_at), 'PPp') : '—'}
            </Row>
            <Row label="Notice served">
              {c.notice_sent_at ? format(new Date(c.notice_sent_at), 'PPp') : '—'}
            </Row>
            <Row label="Service method">
              {c.notice_served_method ? c.notice_served_method.replace(/_/g, ' ') : '—'}
            </Row>
            <Row label="Earliest filing">{filingDate ? format(filingDate, 'PP') : '—'}</Row>
            <Row label="Days unpaid">{c.days_unpaid ?? '—'}</Row>
            <Row label="Monthly rent">
              {c.monthly_rent != null ? `$${c.monthly_rent.toLocaleString()}` : '—'}
            </Row>
            {c.outcome ? <Row label="Outcome">{c.outcome}</Row> : null}
            {c.tenant_email ? (
              <Row label="Tenant email">
                <a href={`mailto:${c.tenant_email}`} className="text-primary hover:underline">
                  {c.tenant_email}
                </a>
              </Row>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {c.case_notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes from intake</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm text-muted">{c.case_notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-fg">{label}</span>
      <span className="text-right text-muted">{children}</span>
    </div>
  )
}
