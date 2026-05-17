import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, AlertTriangle, Wallet } from 'lucide-react'
import { format } from 'date-fns'
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@homeowner-portal/ui'
import { getSupabaseServerClient } from '@/lib/supabase/server'

interface PropertyDetailRow {
  id: string
  address: string
  unit_number: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  notes: string | null
  created_at: string | null
}

interface ViolationRow {
  id: string
  description: string
  status: string
  severity: string | null
  created_at: string | null
  cure_period_days: number | null
  notice_sent_at: string | null
}

interface AssessmentRow {
  id: string
  due_date: string
  amount: number
  status: string
  assessment_type: string
  fiscal_period: { start_date: string } | null
  payments: { amount: number }[]
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await getSupabaseServerClient()

  const { data: property } = await supabase
    .from('hoa_properties')
    .select('id, address, unit_number, owner_name, owner_email, owner_phone, notes, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!property) notFound()
  const p = property as PropertyDetailRow

  // Resolve the v1 unit row for this legacy property (migration 0005
  // backfills `units.legacy_hoa_property_id`). Assessments live keyed
  // on units, not on hoa_properties.
  const { data: unit } = await supabase
    .from('units')
    .select('id')
    .eq('legacy_hoa_property_id', id)
    .maybeSingle()

  const [violationsRes, assessmentsRes] = await Promise.all([
    supabase
      .from('hoa_violations')
      .select('id, description, status, severity, created_at, cure_period_days, notice_sent_at')
      .eq('property_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    unit
      ? supabase
          .from('assessments')
          .select(
            'id, due_date, amount, status, assessment_type, fiscal_period:fiscal_period_id(start_date), payments(amount)',
          )
          .eq('unit_id', unit.id)
          .order('due_date', { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] }),
  ])

  const violations = (violationsRes.data ?? []) as ViolationRow[]
  const dues = (assessmentsRes.data ?? []) as unknown as AssessmentRow[]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/properties"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to properties
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{p.address}</h1>
        <p className="text-sm text-muted">
          {[p.unit_number ? `Unit ${p.unit_number}` : null, p.owner_name].filter(Boolean).join(' · ') ||
            'No additional details'}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Owner</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="text-foreground">{p.owner_name ?? <span className="text-muted">Not on file</span>}</p>
            {p.owner_email ? (
              <a href={`mailto:${p.owner_email}`} className="block text-primary hover:underline">
                {p.owner_email}
              </a>
            ) : null}
            {p.owner_phone ? <p className="text-muted">{p.owner_phone}</p> : null}
            {p.notes ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{p.notes}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <p>
              {violations.length} {violations.length === 1 ? 'violation' : 'violations'} on file
            </p>
            <p>
              {dues.length} {dues.length === 1 ? 'assessment' : 'assessments'}
            </p>
            {p.created_at ? (
              <p className="text-xs">Added {format(new Date(p.created_at), 'PP')}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Violations</h2>
          <Link href="/violations" className="text-sm font-medium text-primary hover:underline">
            All violations
          </Link>
        </div>
        {violations.length === 0 ? (
          <EmptyState
            icon={<AlertTriangle className="h-8 w-8" aria-hidden />}
            title="No violations"
            description="This property has a clean record."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {violations.map((v) => (
                <li key={v.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{v.description}</p>
                    <p className="text-xs text-muted">
                      {v.created_at ? format(new Date(v.created_at), 'PP') : ''}
                      {v.severity ? ` · ${v.severity} severity` : ''}
                    </p>
                  </div>
                  <Badge
                    variant={v.status === 'resolved' ? 'success' : v.status === 'notice_sent' ? 'warning' : 'outline'}
                    size="sm"
                  >
                    {v.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Dues history</h2>
          <Link href="/dues" className="text-sm font-medium text-primary hover:underline">
            Full ledger
          </Link>
        </div>
        {dues.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-8 w-8" aria-hidden />}
            title="No dues records"
            description="Dues for this property will appear here once they're invoiced."
          />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium">Due</th>
                  <th className="px-4 py-2 font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {dues.map((d) => {
                  const period = d.fiscal_period?.start_date
                    ? format(new Date(d.fiscal_period.start_date), 'yyyy')
                    : '—'
                  return (
                    <tr key={d.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-foreground">
                        {period}
                        <span className="ml-2 text-xs text-muted">{d.assessment_type}</span>
                      </td>
                      <td className="px-4 py-2 text-muted">{format(new Date(d.due_date), 'PP')}</td>
                      <td className="px-4 py-2 text-foreground">${Number(d.amount).toFixed(2)}</td>
                      <td className="px-4 py-2">
                        <Badge
                          variant={
                            d.status === 'paid'
                              ? 'success'
                              : d.status === 'partial'
                                ? 'warning'
                                : 'outline'
                          }
                          size="sm"
                        >
                          {d.status}
                        </Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  )
}
