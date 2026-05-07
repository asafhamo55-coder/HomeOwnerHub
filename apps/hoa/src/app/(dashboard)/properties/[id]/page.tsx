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
} from '@homeownerhub/ui'
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

interface DueRow {
  id: string
  period: string
  due_date: string
  amount_due: number
  amount_paid: number | null
  late_fee: number | null
  status: string | null
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

  const [violationsRes, duesRes] = await Promise.all([
    supabase
      .from('hoa_violations')
      .select('id, description, status, severity, created_at, cure_period_days, notice_sent_at')
      .eq('property_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('hoa_dues')
      .select('id, period, due_date, amount_due, amount_paid, late_fee, status')
      .eq('property_id', id)
      .order('due_date', { ascending: false })
      .limit(12),
  ])

  const violations = (violationsRes.data ?? []) as ViolationRow[]
  const dues = (duesRes.data ?? []) as DueRow[]

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/properties"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to properties
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-muted">{p.address}</h1>
        <p className="text-sm text-muted-fg">
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
            <p className="text-muted">{p.owner_name ?? <span className="text-muted-fg">Not on file</span>}</p>
            {p.owner_email ? (
              <a href={`mailto:${p.owner_email}`} className="block text-primary hover:underline">
                {p.owner_email}
              </a>
            ) : null}
            {p.owner_phone ? <p className="text-muted-fg">{p.owner_phone}</p> : null}
            {p.notes ? (
              <p className="mt-3 whitespace-pre-wrap text-sm text-muted-fg">{p.notes}</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-fg">
            <p>
              {violations.length} {violations.length === 1 ? 'violation' : 'violations'} on file
            </p>
            <p>
              {dues.length} {dues.length === 1 ? 'dues record' : 'dues records'}
            </p>
            {p.created_at ? (
              <p className="text-xs">Added {format(new Date(p.created_at), 'PP')}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-muted">Violations</h2>
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
                    <p className="truncate font-medium text-muted">{v.description}</p>
                    <p className="text-xs text-muted-fg">
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
          <h2 className="text-lg font-semibold text-muted">Dues history</h2>
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
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-background/50 text-xs uppercase tracking-wide text-muted-fg">
                <tr>
                  <th className="px-4 py-2 font-medium">Period</th>
                  <th className="px-4 py-2 font-medium">Due</th>
                  <th className="px-4 py-2 font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {dues.map((d) => (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-muted">{d.period}</td>
                    <td className="px-4 py-2 text-muted-fg">{format(new Date(d.due_date), 'PP')}</td>
                    <td className="px-4 py-2 text-muted">${d.amount_due.toFixed(2)}</td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={d.status === 'paid' ? 'success' : d.status === 'late' ? 'destructive' : 'outline'}
                        size="sm"
                      >
                        {d.status ?? 'pending'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  )
}
