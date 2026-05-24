import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft,
  AlertTriangle,
  Wallet,
  Home,
  KeyRound,
  HelpCircle,
  Users,
  History,
  UserPlus,
  UserMinus,
  ArrowRightLeft,
  FileText,
  Clock,
} from 'lucide-react'
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
import { getPropertyDetail, type PropertyTenure } from '@/lib/properties'
import { getLeaseCap } from '@/lib/leases'
import { getPrimaryAssociation } from '@/lib/vendors'
import type { PropertyResidentRow, PropertyResidentRole } from '@/lib/property-residents'
import type { PropertyEventRow, PropertyEventKind } from '@/lib/property-events'
import { TenureSelector } from './TenureSelector'
import { AddResidentForm } from './AddResidentForm'
import { PropertyActions } from './PropertyActions'
import { ResidentActions } from './ResidentActions'

interface PropertyDetailRow {
  id: string
  address: string
  unit_number: string | null
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  notes: string | null
  created_at: string | null
  tenure: PropertyTenure
  tenure_updated_at: string | null
  tenure_updated_by: string | null
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

  const detail = await getPropertyDetail(id)
  if (!detail) notFound()
  const p = detail.property as unknown as PropertyDetailRow
  const tenure: PropertyTenure = detail.property.tenure
  const residents = detail.residents
  const events = detail.events

  // Lease cap drives whether the "Add to waiting list" button shows up
  // on owner-occupied properties. No cap → no need to queue anything.
  const [assoc] = await Promise.all([getPrimaryAssociation()])
  const cap = assoc ? await getLeaseCap(assoc.id) : null
  const capInPlace = cap?.capPct !== null && cap?.capPct !== undefined

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
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(20),
    unit
      ? supabase
          .from('assessments')
          .select(
            'id, due_date, amount, status, assessment_type, fiscal_period:fiscal_period_id(start_date), payments(amount)',
          )
          .eq('unit_id', unit.id)
          .is('deleted_at', null)
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">{p.address}</h1>
          <PropertyActions propertyId={p.id} />
        </div>
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Tenure</CardTitle>
              <TenureBadge tenure={tenure} />
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-xs text-muted">
              {detail.property.tenure_updated_at
                ? `Updated ${format(new Date(detail.property.tenure_updated_at), 'PP')}`
                : 'Never recorded — set the current state below.'}
            </p>
            <TenureSelector
              propertyId={p.id}
              currentTenure={tenure}
              capInPlace={capInPlace}
            />
            <div className="pt-2 text-xs text-muted">
              <p>
                {violations.length}{' '}
                {violations.length === 1 ? 'violation' : 'violations'} ·{' '}
                {dues.length}{' '}
                {dues.length === 1 ? 'assessment' : 'assessments'}
              </p>
              {p.created_at ? (
                <p>Added {format(new Date(p.created_at), 'PP')}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Residents ─── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Residents</h2>
          <AddResidentForm propertyId={p.id} />
        </div>
        {residents.length === 0 ? (
          <EmptyState
            icon={<Users className="h-8 w-8" aria-hidden />}
            title="No residents on file"
            description="Add the owners, tenants, and family members living here so notices and outreach reach the right people."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {residents.map((r) => (
                <ResidentRow key={r.id} resident={r} />
              ))}
            </ul>
          </Card>
        )}
      </section>

      {/* ─── History ─── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">History</h2>
          {events.length === 25 ? (
            <span className="text-xs text-muted">Showing latest 25 events</span>
          ) : null}
        </div>
        {events.length === 0 ? (
          <EmptyState
            icon={<History className="h-8 w-8" aria-hidden />}
            title="No history yet"
            description="Tenure changes, resident moves, lease starts/ends, and waiting-list activity will appear here."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <EventRow key={e.id} event={e} />
              ))}
            </ul>
          </Card>
        )}
      </section>

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

// ─── Helpers for the new tenure / residents / history cards ──────────

function TenureBadge({ tenure }: { tenure: PropertyTenure }) {
  if (tenure === 'owner_occupied') {
    return (
      <Badge variant="success" size="sm">
        <Home className="mr-1 h-3 w-3" />
        Owner-occupied
      </Badge>
    )
  }
  if (tenure === 'leased') {
    return (
      <Badge variant="warning" size="sm">
        <KeyRound className="mr-1 h-3 w-3" />
        Leased
      </Badge>
    )
  }
  return (
    <Badge variant="neutral" size="sm">
      <HelpCircle className="mr-1 h-3 w-3" />
      Unknown
    </Badge>
  )
}

const ROLE_LABEL: Record<PropertyResidentRole, string> = {
  owner: 'Owner',
  tenant: 'Tenant',
  family_member: 'Family',
  other: 'Other',
}

function ResidentRow({ resident }: { resident: PropertyResidentRow }) {
  const isActive = resident.moved_out_at === null
  const roleVariant: 'success' | 'info' | 'neutral' | 'outline' =
    resident.role === 'owner'
      ? 'success'
      : resident.role === 'tenant'
        ? 'info'
        : 'neutral'
  return (
    <li
      className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${
        isActive ? '' : 'opacity-60'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-medium text-foreground">
          {resident.full_name}
          {resident.is_primary ? (
            <Badge variant="outline" size="sm">
              Primary
            </Badge>
          ) : null}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
          <Badge variant={roleVariant} size="sm">
            {ROLE_LABEL[resident.role]}
          </Badge>
          {resident.email ? (
            <a
              href={`mailto:${resident.email}`}
              className="hover:text-foreground hover:underline"
            >
              {resident.email}
            </a>
          ) : null}
          {resident.phone ? <span>{resident.phone}</span> : null}
          {resident.moved_in_at ? (
            <span>moved in {format(new Date(resident.moved_in_at), 'PP')}</span>
          ) : null}
          {resident.moved_out_at ? (
            <span className="text-destructive/80">
              moved out {format(new Date(resident.moved_out_at), 'PP')}
            </span>
          ) : null}
        </div>
      </div>
      <ResidentActions
        residentId={resident.id}
        residentName={resident.full_name}
        isActive={isActive}
      />
    </li>
  )
}

const EVENT_ICON: Record<PropertyEventKind, React.ComponentType<{ className?: string }>> = {
  tenure_changed: ArrowRightLeft,
  ownership_changed: ArrowRightLeft,
  resident_added: UserPlus,
  resident_removed: UserMinus,
  lease_started: KeyRound,
  lease_ended: Home,
  waiting_list_added: Clock,
  waiting_list_resolved: FileText,
  note: FileText,
}

function describeEvent(event: PropertyEventRow): string {
  const p = event.payload as Record<string, unknown>
  switch (event.kind) {
    case 'tenure_changed': {
      const from = typeof p.from === 'string' ? p.from.replace(/_/g, '-') : '?'
      const to = typeof p.to === 'string' ? p.to.replace(/_/g, '-') : '?'
      return `Tenure changed from ${from} to ${to}.`
    }
    case 'ownership_changed':
      return 'Ownership changed.'
    case 'resident_added':
      return `${typeof p.fullName === 'string' ? p.fullName : 'A resident'} added${
        typeof p.role === 'string' ? ` as ${p.role.replace(/_/g, ' ')}` : ''
      }.`
    case 'resident_removed':
      return `${
        typeof p.fullName === 'string' ? p.fullName : 'A resident'
      } moved out.`
    case 'lease_started':
      return 'Lease started.'
    case 'lease_ended':
      return 'Lease ended.'
    case 'waiting_list_added':
      return 'Added to lease waiting list.'
    case 'waiting_list_resolved': {
      const outcome = typeof p.outcome === 'string' ? p.outcome : 'resolved'
      return `Waiting list entry ${outcome}.`
    }
    case 'note':
      return event.notes ?? 'Note recorded.'
  }
}

function EventRow({ event }: { event: PropertyEventRow }) {
  const Icon = EVENT_ICON[event.kind] ?? FileText
  return (
    <li className="flex items-start gap-3 px-4 py-3 text-sm">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background text-muted">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-foreground">{describeEvent(event)}</p>
        <p className="text-xs text-muted">
          {format(new Date(event.occurred_at), 'PPp')}
          {event.notes && event.kind !== 'note' ? ` · ${event.notes}` : ''}
        </p>
      </div>
    </li>
  )
}
