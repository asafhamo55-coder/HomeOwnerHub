import Link from 'next/link'
import { Building2, CheckCircle2, Plus, Wallet } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
} from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ensureLeaseLedger } from '@/lib/rent'
import { StartEvictionButton } from './StartEvictionButton'

export const metadata = { title: 'Dashboard' }

interface PropertyRow {
  id: string
  address: string
  monthly_rent: number | null
  tenant_name: string | null
  tenant_email: string | null
}

interface LedgerRow {
  id: string
  period: string
  due_date: string
  amount_due: number
  amount_paid: number | null
  late_fee: number | null
  late_fee_rate: number | null
  status: string | null
}

function currency(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export default async function PMDashboard() {
  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const { data: propData } = await supabase
    .from('pm_properties')
    .select('id, address, monthly_rent, tenant_name, tenant_email')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const property = (propData ?? null) as PropertyRow | null

  if (!property) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold text-foreground">Welcome to {org.name}</h1>
          <p className="text-sm text-muted">Add your first property to start tracking rent.</p>
        </header>
        <EmptyState
          icon={<Building2 className="h-10 w-10" aria-hidden />}
          title="No property yet"
          description="Add your rental, the tenant's contact info, and we'll auto-track each month's rent."
          action={
            <Button asChild>
              <Link href="/setup">
                <Plus className="h-4 w-4" />
                Add property
              </Link>
            </Button>
          }
        />
      </div>
    )
  }

  // Materialize the current month's ledger row if missing.
  // Backfills missing months from lease_start to today, idempotent.
  await ensureLeaseLedger(property.id)

  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)

  const { data: currentLedger } = await supabase
    .from('pm_rent_ledger')
    .select('id, period, due_date, amount_due, amount_paid, late_fee, late_fee_rate, status')
    .eq('property_id', property.id)
    .lte('due_date', todayISO)
    .order('due_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const current = (currentLedger ?? null) as LedgerRow | null

  // Derived figures
  const daysUnpaid =
    current && current.status !== 'paid' && current.due_date
      ? Math.max(0, differenceInCalendarDays(today, new Date(current.due_date)))
      : 0

  const lateFee =
    current?.late_fee ??
    (daysUnpaid > 0 && current?.late_fee_rate
      ? Math.round((current.amount_due * current.late_fee_rate) / 100)
      : 0)

  const isPaid = current?.status === 'paid'
  const isOverdue = !isPaid && daysUnpaid > 0

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{property.address}</h1>
          <p className="text-sm text-muted">
            {property.tenant_name ?? 'No tenant on file'}
            {property.tenant_email ? ` · ${property.tenant_email}` : ''}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/setup">Edit property</Link>
        </Button>
      </header>

      <Card variant="elevated">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="h-4 w-4 text-muted" />
            This month&apos;s rent
            {current ? (
              <span className="text-sm font-normal text-muted">
                · {format(new Date(current.due_date), 'MMM yyyy')}
              </span>
            ) : null}
          </CardTitle>
          {isPaid ? (
            <Badge variant="success" size="md">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Paid
            </Badge>
          ) : isOverdue ? (
            <Badge variant="destructive" size="md">
              {daysUnpaid} {daysUnpaid === 1 ? 'day' : 'days'} late
            </Badge>
          ) : (
            <Badge variant="outline" size="md">
              Pending
            </Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <p className="text-3xl font-bold text-foreground">
                {current ? currency(current.amount_due) : currency(property.monthly_rent ?? 0)}
              </p>
              <p className="text-xs text-muted">
                Due {current ? format(new Date(current.due_date), 'MMM d, yyyy') : '—'}
              </p>
            </div>
            {lateFee > 0 && !isPaid ? (
              <div>
                <p className="text-xl font-semibold text-destructive">+ {currency(lateFee)}</p>
                <p className="text-xs text-muted">
                  Late fee ({current?.late_fee_rate ?? 5}% of rent)
                </p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isOverdue ? (
              <StartEvictionButton
                address={property.address}
                monthlyRent={property.monthly_rent ?? 0}
                tenantName={property.tenant_name}
                daysUnpaid={daysUnpaid}
              />
            ) : null}
            <Button asChild variant="outline">
              <Link href="/rent">View ledger</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {isOverdue ? (
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <p className="font-medium text-foreground">Why &quot;Start eviction&quot; opens a new tab</p>
            <p className="text-muted">
              Eviction filings happen in a separate tool — Eviction Hub — so the legal workflow
              stays isolated from rent tracking. The button pre-fills the address, tenant, rent,
              and days unpaid for you. You only have to confirm and approve the notice.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
