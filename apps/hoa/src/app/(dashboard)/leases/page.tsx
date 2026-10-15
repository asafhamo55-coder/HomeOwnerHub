import Link from 'next/link'
import { format } from 'date-fns'
import { AlertTriangle, Download, Home, KeyRound, ListOrdered, Percent } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  Kpi,
  LoadFailed,
  Page,
  StatusBadge,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { getPrimaryAssociation } from '@/lib/vendors'
import {
  getLeaseCap,
  listWaitingListCandidates,
  loadLeaseStats,
  loadWaitingList,
  type WaitingListEntry,
} from '@/lib/leases'
import { WAITING_LIST_STATUS } from '@/lib/status/community'
import { LeaseCapEditor } from './LeaseCapEditor'
import { WaitingListActions } from './WaitingListActions'
import { AddToWaitingList } from './AddToWaitingList'

export const metadata = { title: 'Leases' }
export const dynamic = 'force-dynamic'

const RECENT_DECISIONS = 10

export default async function LeasesPage() {
  const assoc = await getPrimaryAssociation()
  if (!assoc) {
    return (
      <Page title="Leases" description="Rental cap, current leasing, and the waiting list.">
        <EmptyState
          icon={<AlertTriangle aria-hidden />}
          title="No association configured"
          description="Set up an association for this HOA in Settings before managing leases."
          action={
            <Button asChild>
              <Link href="/settings">Open settings</Link>
            </Button>
          }
        />
      </Page>
    )
  }

  const [stats, cap, waiting, candidates] = await Promise.all([
    loadLeaseStats(assoc.id),
    getLeaseCap(assoc.id),
    loadWaitingList(assoc.id),
    listWaitingListCandidates(assoc.id),
  ])

  const openWaiting = (waiting ?? []).filter((w) => w.status === 'waiting')
  const decided = (waiting ?? []).filter((w) => w.status !== 'waiting')
  const resolvedWaiting = decided.slice(-RECENT_DECISIONS).reverse()
  const capSet = cap?.capPct !== null && cap?.capPct !== undefined && cap.capPct > 0

  return (
    <Page
      title="Leases"
      description={`Rental cap, current leasing, and the waiting list for ${assoc.name}.`}
      actions={
        <Button asChild variant="secondary">
          {/* Plain anchor — Next Link would prefetch the CSV. */}
          <a href="/leases/export">
            <Download className="size-4" aria-hidden />
            Export CSV
          </a>
        </Button>
      }
    >
      {/* ─── Current state ─── */}
      <section aria-labelledby="lease-state" className="space-y-3">
        <h2 id="lease-state" className="sr-only">
          Current state
        </h2>
        {stats === null ? (
          <LoadFailed what="lease statistics" hint="The cap policy and waiting list below still loaded." />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Kpi
                label="Leased"
                icon={<KeyRound />}
                value={stats.totalUnits === 0 ? '—' : `${stats.leasedPct.toFixed(1)}%`}
                hint={
                  stats.totalUnits === 0
                    ? 'No units mapped to this association yet.'
                    : `${stats.leasedCount} of ${stats.totalUnits} units`
                }
              />
              <Kpi
                label="Rental cap"
                icon={<Percent />}
                value={capSet ? `${cap!.capPct}%` : '—'}
                hint={capSet ? 'of units may be leased' : 'No cap set'}
              />
              <Kpi
                label="Headroom"
                icon={<Home />}
                value={stats.headroom === null ? '—' : stats.headroom}
                hint={
                  stats.headroom === null
                    ? 'Set a cap to compute headroom.'
                    : stats.headroom === 0
                      ? 'At the cap — new leases must wait.'
                      : `unit${stats.headroom === 1 ? '' : 's'} can still be leased`
                }
              />
            </div>
            {stats.headroom === 0 && openWaiting.length > 0 ? (
              <Alert variant="warning" title="At the rental cap">
                {openWaiting.length} owner{openWaiting.length === 1 ? ' is' : 's are'} waiting. Approve the next in line
                only when a leased unit returns to owner-occupied.
              </Alert>
            ) : null}
            {stats.unknownCount > 0 ? (
              <p className="text-sm text-muted">
                {stats.unknownCount} {stats.unknownCount === 1 ? 'unit has' : 'units have'} unknown tenure, so the
                figures above may be low.{' '}
                <Link href="/properties" className="font-medium text-primary hover:underline">
                  Review properties
                </Link>
              </p>
            ) : null}
          </>
        )}
      </section>

      {/* ─── Cap policy ─── */}
      <Card>
        <CardHeader>
          <CardTitle as="h2">Cap policy</CardTitle>
          <CardDescription>
            {capSet ? `Up to ${cap!.capPct}% of units may be leased at once.` : 'No rental cap is set.'}
            {cap?.setAt ? ` Set ${format(new Date(cap.setAt), 'PP')}${cap.setBy ? ' by a board member' : ''}.` : ''}
          </CardDescription>
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

      {/* ─── Waiting list ─── */}
      <section aria-labelledby="waiting-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="waiting-heading" className="flex items-baseline gap-2 text-lg font-semibold text-foreground">
              Waiting list
              {waiting !== null ? <span className="num text-sm font-normal text-muted">{openWaiting.length}</span> : null}
            </h2>
            <p className="text-sm text-muted">Owners waiting to lease, first come first served.</p>
          </div>
          <AddToWaitingList candidates={candidates} />
        </div>

        {waiting === null ? (
          <LoadFailed what="the waiting list" />
        ) : (
          <DataTable
            caption="Owners waiting to lease"
            columns={waitingColumns}
            rows={openWaiting.map((e, i) => ({ ...e, position: i + 1 }))}
            rowKey={(e) => e.id}
            mobile="cards"
            linkAs={Link}
            empty={
              <EmptyState
                variant="compact"
                icon={<ListOrdered aria-hidden />}
                title="No one is waiting"
                description={
                  capSet
                    ? 'When owners can’t lease because the cap is full, queue them here in the order they asked.'
                    : 'There’s no cap, so nobody needs to wait. Set one above if your declaration imposes it.'
                }
              />
            }
          />
        )}
      </section>

      {resolvedWaiting.length > 0 ? (
        <section aria-labelledby="decisions-heading" className="space-y-3">
          <h2 id="decisions-heading" className="text-lg font-semibold text-foreground">
            Recent decisions
          </h2>
          <DataTable
            caption="Recent waiting-list decisions"
            columns={decisionColumns}
            rows={resolvedWaiting}
            rowKey={(e) => e.id}
            mobile="cards"
            linkAs={Link}
            footer={
              decided.length > RECENT_DECISIONS ? (
                <p className="px-4 py-3 text-sm text-muted">
                  Showing the latest {RECENT_DECISIONS} of {decided.length}.{' '}
                  <a href="/leases/export" className="font-medium text-primary hover:underline">
                    Export CSV
                  </a>{' '}
                  for the full history.
                </p>
              ) : undefined
            }
          />
        </section>
      ) : null}
    </Page>
  )
}

function propertyLabel(e: WaitingListEntry): string {
  return e.property_unit_number ? `${e.property_address} · Unit ${e.property_unit_number}` : e.property_address
}

function PropertyLink({ entry }: { entry: WaitingListEntry }) {
  return (
    <Link
      href={`/properties/${entry.property_id}`}
      className="font-medium text-foreground no-underline hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {propertyLabel(entry)}
    </Link>
  )
}

const waitingColumns: DataTableColumn<WaitingListEntry & { position: number }>[] = [
  {
    key: 'position',
    header: '#',
    numeric: true,
    hideOnMobile: true,
    className: 'w-12',
    cell: (e) => <span className="text-muted">{e.position}</span>,
  },
  {
    key: 'property',
    header: 'Property',
    mobilePrimary: true,
    cell: (e) => (
      <div className="min-w-0">
        <PropertyLink entry={e} />
        {e.notes ? <p className="mt-0.5 line-clamp-1 max-w-sm text-xs text-muted">{e.notes}</p> : null}
      </div>
    ),
  },
  {
    key: 'owner',
    header: 'Owner',
    cell: (e) => e.owner_name ?? <span className="text-muted">Not on file</span>,
  },
  {
    key: 'requested',
    header: 'Requested',
    cell: (e) => <span className="num whitespace-nowrap">{format(new Date(e.requested_at), 'MMM d, yyyy')}</span>,
  },
  {
    key: 'actions',
    header: <span className="sr-only">Actions</span>,
    className: 'w-px',
    cell: (e) => <WaitingListActions entryId={e.id} propertyLabel={propertyLabel(e)} />,
  },
]

const decisionColumns: DataTableColumn<WaitingListEntry>[] = [
  {
    key: 'property',
    header: 'Property',
    mobilePrimary: true,
    cell: (e) => <PropertyLink entry={e} />,
  },
  {
    key: 'requested',
    header: 'Requested',
    cell: (e) => <span className="num whitespace-nowrap">{format(new Date(e.requested_at), 'MMM d, yyyy')}</span>,
  },
  {
    key: 'status',
    header: 'Decision',
    cell: (e) => (
      <StatusBadge status={e.status} tones={WAITING_LIST_STATUS.tones} labels={WAITING_LIST_STATUS.labels} />
    ),
  },
]
