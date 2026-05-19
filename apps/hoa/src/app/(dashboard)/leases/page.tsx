import Link from 'next/link'
import { format } from 'date-fns'
import { KeyRound, Home, AlertTriangle, Download } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
  StatCard,
} from '@homeowner-portal/ui'
import { getPrimaryAssociation } from '@/lib/vendors'
import {
  getLeaseStats,
  getLeaseCap,
  listWaitingList,
} from '@/lib/leases'
import { LeaseCapEditor } from './LeaseCapEditor'
import { WaitingListActions } from './WaitingListActions'

export const metadata = { title: 'Leases' }

export default async function LeasesPage() {
  const assoc = await getPrimaryAssociation()
  if (!assoc) {
    return (
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title="Lease management"
          description="Cap, current state, and waiting list for leased units."
        />
        <EmptyState
          icon={<AlertTriangle className="h-10 w-10" aria-hidden />}
          title="No association configured"
          description="Set up an association for this HOA in Settings before managing leases."
        />
      </div>
    )
  }

  const [stats, cap, waiting] = await Promise.all([
    getLeaseStats(assoc.id),
    getLeaseCap(assoc.id),
    listWaitingList(assoc.id),
  ])

  const waitingCount = waiting.filter((w) => w.status === 'waiting').length
  const openWaiting = waiting.filter((w) => w.status === 'waiting')
  const resolvedWaiting = waiting.filter((w) => w.status !== 'waiting').slice(0, 10)

  const leasedPctDisplay =
    stats.totalUnits === 0 ? '—' : `${stats.leasedPct.toFixed(1)}%`
  const capDisplay = cap?.capPct === null || cap?.capPct === undefined ? '—' : `${cap.capPct}%`
  const headroomDisplay =
    stats.headroom === null ? '—' : `${stats.headroom}`

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Lease management"
        description={`Cap, current state, and waiting list for leased units in ${assoc.name}.`}
        actions={
          <Button asChild variant="outline">
            {/* Plain anchor — Next Link would prefetch the CSV. We want
                a straight GET that triggers a browser download. */}
            <a href="/leases/export">
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </Button>
        }
      />

      {/* ─── Current state ─── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Current state
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            icon={<KeyRound className="h-4 w-4" />}
            label="Leased"
            value={leasedPctDisplay}
            meta={
              stats.totalUnits === 0
                ? 'No units mapped to this association yet.'
                : `${stats.leasedCount} of ${stats.totalUnits} units`
            }
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Cap"
            value={capDisplay}
            meta={
              cap?.capPct === null || cap?.capPct === undefined
                ? 'No cap set yet.'
                : 'of total units allowed to be leased'
            }
          />
          <StatCard
            icon={<Home className="h-4 w-4" />}
            label="Headroom"
            value={headroomDisplay}
            meta={
              stats.headroom === null
                ? 'Set a cap to compute headroom.'
                : stats.headroom === 0
                  ? 'At the cap — new leases must wait.'
                  : 'units that can still be leased'
            }
          />
        </div>
        {stats.unknownCount > 0 ? (
          <p className="text-xs text-muted">
            {stats.unknownCount}{' '}
            {stats.unknownCount === 1 ? 'unit has' : 'units have'} unknown tenure.
            Visit each property to set it.
          </p>
        ) : null}
      </section>

      {/* ─── Cap policy ─── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Cap policy
        </h2>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {cap?.capPct === null || cap?.capPct === undefined
                ? 'No cap set'
                : `Current cap: ${cap.capPct}%`}
            </CardTitle>
            {cap?.setAt ? (
              <p className="text-xs text-muted">
                Set {format(new Date(cap.setAt), 'PP')}
                {cap.setBy ? ' by a board member' : ''}.
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            <LeaseCapEditor
              associationId={assoc.id}
              currentCapPct={cap?.capPct ?? null}
              aiSuggestedPct={cap?.aiSuggestedPct ?? null}
              aiSource={cap?.aiSource ?? null}
            />
          </CardContent>
        </Card>
      </section>

      {/* ─── Waiting list ─── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Waiting list{' '}
            {waitingCount > 0 ? (
              <span className="ml-1 text-foreground">
                ({waitingCount} {waitingCount === 1 ? 'owner' : 'owners'})
              </span>
            ) : null}
          </h2>
        </div>

        {openWaiting.length === 0 ? (
          <EmptyState
            icon={<KeyRound className="h-8 w-8" aria-hidden />}
            title="No one waiting"
            description={
              cap?.capPct === null || cap?.capPct === undefined
                ? "There's no cap yet, so nobody needs to wait. Set a cap above if your declaration imposes one."
                : 'When owners can’t lease because the cap is full, they’ll appear here in the order they asked.'
            }
          />
        ) : (
          <Card>
            <ul className="divide-y divide-border">
              {openWaiting.map((entry, idx) => {
                const label = formatPropertyLabel(
                  entry.property_address,
                  entry.property_unit_number,
                )
                return (
                  <li
                    key={entry.id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-background text-xs font-semibold text-muted">
                          {idx + 1}
                        </span>
                        <Link
                          href={`/properties/${entry.property_id}`}
                          className="truncate hover:text-primary hover:underline"
                        >
                          {label}
                        </Link>
                      </p>
                      <p className="ml-7 text-xs text-muted">
                        {entry.owner_name ?? 'Owner not on file'} · requested{' '}
                        {format(new Date(entry.requested_at), 'PP')}
                      </p>
                      {entry.notes ? (
                        <p className="ml-7 mt-1 text-xs text-muted">{entry.notes}</p>
                      ) : null}
                    </div>
                    <WaitingListActions entryId={entry.id} propertyLabel={label} />
                  </li>
                )
              })}
            </ul>
          </Card>
        )}

        {resolvedWaiting.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm text-muted">Recent decisions</CardTitle>
            </CardHeader>
            <CardContent className="px-0 py-0">
              <ul className="divide-y divide-border">
                {resolvedWaiting.map((entry) => {
                  const label = formatPropertyLabel(
                    entry.property_address,
                    entry.property_unit_number,
                  )
                  return (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                    >
                      <Link
                        href={`/properties/${entry.property_id}`}
                        className="truncate font-medium text-foreground hover:text-primary"
                      >
                        {label}
                      </Link>
                      <div className="flex items-center gap-3 text-xs text-muted">
                        <span>
                          requested {format(new Date(entry.requested_at), 'PP')}
                        </span>
                        <StatusPill status={entry.status} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  )
}

function formatPropertyLabel(address: string, unit: string | null): string {
  return unit ? `${address} · Unit ${unit}` : address
}

function StatusPill({
  status,
}: {
  status: 'waiting' | 'approved' | 'withdrawn' | 'denied'
}) {
  const variant: 'success' | 'destructive' | 'outline' | 'warning' =
    status === 'approved'
      ? 'success'
      : status === 'denied'
        ? 'destructive'
        : status === 'withdrawn'
          ? 'outline'
          : 'warning'
  return (
    <Badge variant={variant} size="sm">
      {status}
    </Badge>
  )
}
