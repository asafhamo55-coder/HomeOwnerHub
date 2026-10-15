import Link from 'next/link'
import { Building2, Info, Pencil, Plus, Wallet } from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  KeyValue,
  KeyValueList,
  LoadFailed,
  NoOrgSelected,
  Page,
  StatusPill,
} from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ensureLeaseLedger } from '@/lib/rent'
import { loadOrFail } from '@/lib/load-or-fail'
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
  if (!org) return <NoOrgSelected noun="workspace" />

  const supabase = await getSupabaseServerClient()
  // PM Hub v1 tracks one property per workspace (the first one added).
  const propRes = await loadOrFail(
    'your property',
    supabase
      .from('pm_properties')
      .select('id, address, monthly_rent, tenant_name, tenant_email')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  )

  if (!propRes.ok) {
    return (
      <Page width="default" title="Dashboard">
        <LoadFailed what="your property" />
      </Page>
    )
  }

  const property = (propRes.data ?? null) as PropertyRow | null

  if (!property) {
    return (
      <Page width="default" title={`Welcome to ${org.name}`} description="Add your first property to start tracking rent.">
        <EmptyState
          icon={<Building2 aria-hidden />}
          title="No property yet"
          description="Add your rental and your tenant's contact details — we'll track each month's rent automatically."
          action={
            <Button asChild>
              <Link href="/setup">
                <Plus aria-hidden />
                Add property
              </Link>
            </Button>
          }
        />
      </Page>
    )
  }

  // Materialize the current month's ledger row if missing.
  // Backfills missing months from lease_start to today, idempotent.
  await ensureLeaseLedger(property.id)

  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)

  const ledgerRes = await loadOrFail(
    "this month's rent",
    supabase
      .from('pm_rent_ledger')
      .select('id, period, due_date, amount_due, amount_paid, late_fee, late_fee_rate, status')
      .eq('property_id', property.id)
      .lte('due_date', todayISO)
      .order('due_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  )

  const current = ledgerRes.ok ? ((ledgerRes.data ?? null) as LedgerRow | null) : null

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
    <Page
      width="default"
      eyebrow="Property"
      title={property.address}
      description={
        property.tenant_name
          ? `${property.tenant_name}${property.tenant_email ? ` · ${property.tenant_email}` : ''}`
          : 'No tenant on file'
      }
      actions={
        <Button asChild variant="secondary">
          <Link href="/setup">
            <Pencil aria-hidden />
            Edit property
          </Link>
        </Button>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader
            actions={
              !ledgerRes.ok ? null : isPaid ? (
                <StatusPill tone="success" label="Paid" />
              ) : isOverdue ? (
                <StatusPill tone="danger" label={`${daysUnpaid} ${daysUnpaid === 1 ? 'day' : 'days'} late`} />
              ) : (
                <StatusPill tone="neutral" label="Not due yet" />
              )
            }
          >
            <CardTitle as="h2" className="flex items-center gap-2">
              <Wallet className="size-4 text-muted" aria-hidden />
              This month&apos;s rent
              {current ? (
                <span className="text-sm font-normal text-muted">· {format(new Date(current.due_date), 'MMMM yyyy')}</span>
              ) : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {!ledgerRes.ok ? (
              <LoadFailed what="this month's rent" />
            ) : (
              <>
                <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
                  <div>
                    <p className="num text-3xl font-semibold tracking-tight text-foreground">
                      {current ? currency(current.amount_due) : currency(property.monthly_rent ?? 0)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Due {current ? format(new Date(current.due_date), 'MMM d, yyyy') : '—'}
                    </p>
                  </div>
                  {lateFee > 0 && !isPaid ? (
                    <div>
                      <p className="num text-xl font-semibold text-danger">+ {currency(lateFee)}</p>
                      <p className="mt-1 text-xs text-muted">Late fee ({current?.late_fee_rate ?? 5}% of rent)</p>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-5">
                  {isOverdue ? (
                    <StartEvictionButton
                      address={property.address}
                      monthlyRent={property.monthly_rent ?? 0}
                      tenantName={property.tenant_name}
                      daysUnpaid={daysUnpaid}
                    />
                  ) : null}
                  <Button asChild variant={isOverdue ? 'secondary' : 'primary'}>
                    <Link href="/rent">View rent ledger</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h2">Lease</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValueList>
              <KeyValue label="Monthly rent" value={property.monthly_rent != null ? currency(property.monthly_rent) : null} />
              <KeyValue label="Tenant" value={property.tenant_name} />
              <KeyValue label="Tenant email" value={property.tenant_email} />
            </KeyValueList>
          </CardContent>
        </Card>

        {isOverdue ? (
          <Card variant="subtle">
            <CardContent className="flex items-start gap-3 p-5 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <div className="space-y-1">
                <p className="font-medium text-foreground">Why “Start eviction” opens a new tab</p>
                <p className="text-foreground-secondary">
                  Filings happen in Eviction Hub so the legal workflow stays separate from rent
                  tracking. The address, tenant, rent and days unpaid are pre-filled — you only confirm
                  and approve the notice.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Page>
  )
}
