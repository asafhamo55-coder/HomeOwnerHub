import { propertyHref } from '@/lib/properties/href'
import { asPropertyId } from '@/lib/properties/resolve'
import Link from 'next/link'
import { ArrowRight, Home } from 'lucide-react'
import { Alert, StatusPill, cn } from '@homeowner-portal/ui'
import type { PropertyContext, ThreadDetail } from '@/lib/inbox/queries'
import { AssignPropertyForm } from './AssignPropertyForm'
import { ResidentRailRow } from './ResidentRailRow'
import { formatShortDate } from '@/lib/format-datetime'
import type { ThreadRailContext } from '@/lib/inbox/thread-context'
import { MoneyCard, SenderLine, ViolationList } from './ContextSections'
import { filedByLine, matchRuleLabel } from '@/lib/inbox/match-label'
import { usd } from '@/lib/money/format'

interface Props {
  thread: ThreadDetail
  context: PropertyContext | null
  /**
   * True when `thread.unitId` is set but `getPropertyContext` threw (see
   * its docstring in queries.ts). Ground truth for "is this thread filed"
   * is always `thread.unitId`, never whether `context` resolved — the
   * same unitId-first branch ThreadList.tsx uses so a fetch hiccup here
   * can't misrepresent a matched thread as unmatched.
   */
  contextLoadFailed: boolean
  suggestedProperty: { unitId: string; address: string } | null
  /**
   * BL-101 A1: sender, ledger, violations (getThreadRailContext). Null when
   * it failed to load — the rail then falls back to the counts below.
   */
  rail?: ThreadRailContext | null
}

/** Section label shared by the property and vendor rails. */
export function RailLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{children}</h2>
}

export function PropertyRail({ thread, context, contextLoadFailed, suggestedProperty, rail = null }: Props) {
  // Branch on unitId (ground truth) first, before anything derived from
  // the context fetch — the exact ordering ThreadList.tsx's attribution
  // fix established, so a rail load failure can't get relabeled as "not
  // filed".
  if (thread.unitId) {
    if (contextLoadFailed) {
      return (
        <div className="space-y-3 p-4">
          <RailLabel>Property</RailLabel>
          <Alert variant="warning" title="Property context unavailable">
            This thread is filed, but dues, violations and tickets couldn&apos;t be loaded right
            now. Refresh to try again — the thread is still correctly matched.
          </Alert>
        </div>
      )
    }

    if (!context) {
      // unitId is set and the fetch didn't throw, yet context is null —
      // the unit row itself doesn't exist (a dangling reference). Distinct
      // from "not filed": say so honestly rather than falling into the
      // assign-form branch below, which would misrepresent a filed thread
      // as unmatched.
      return (
        <div className="space-y-3 p-4">
          <RailLabel>Property</RailLabel>
          <p className="text-sm font-medium text-foreground">Property record missing</p>
          <p className="text-xs text-muted">
            This thread is filed under a property that no longer exists. Contact an admin to fix
            the assignment.
          </p>
        </div>
      )
    }

    const failed = (k: PropertyContext['degraded'][number]) => context.degraded.includes(k)
    const addressLabel = `${context.address}${context.unitNumber ? ` #${context.unitNumber}` : ''}`
    const ledgerHref = context.propertyId
      ? propertyHref(asPropertyId(context.propertyId), { query: { tab: 'money' } })
      : null

    return (
      <div className="space-y-4 p-4">
        <div className="space-y-2">
          <RailLabel>Property</RailLabel>
          {/* /properties/[id] takes the hoa_properties id, not the thread's
              unit id (which 404s there). A unit with no property record has
              no page, so its address is shown without a link. */}
          {context.propertyId ? (
            <Link
              href={propertyHref(asPropertyId(context.propertyId))}
              className="group flex items-start gap-2 rounded-lg no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Home className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 text-sm font-semibold text-foreground group-hover:text-primary">
                {context.address}
                {context.unitNumber ? ` #${context.unitNumber}` : ''}
              </span>
              <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted group-hover:text-primary" aria-hidden />
            </Link>
          ) : (
            <div className="flex items-start gap-2">
              <Home className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 text-sm font-semibold text-foreground">
                {context.address}
                {context.unitNumber ? ` #${context.unitNumber}` : ''}
              </span>
            </div>
          )}
          <p className="text-xs text-muted">
            {filedByLine(thread.matchReason?.rule, thread.matchSource)}
          </p>
          {rail ? <SenderLine rail={rail} address={addressLabel} /> : null}
        </div>

        {rail?.home ? <MoneyCard home={rail.home} ledgerHref={ledgerHref} /> : null}
        {rail?.home ? <ViolationList home={rail.home} /> : null}

        <div className="space-y-2">
          <RailLabel>Residents</RailLabel>
          {/* The degraded branch stays FIRST. getPropertyContext defaults
              residents to [] and pushes 'residents' onto `degraded` when the
              query fails — without this branch an unloadable list would
              render as an editable empty list, the same class of lie the
              unitId-first ordering above exists to prevent. */}
          {failed('residents') ? (
            <p className="text-xs font-medium text-warning">Residents couldn&apos;t load</p>
          ) : context.residents.length === 0 ? (
            <p className="text-xs text-muted">No residents on file</p>
          ) : (
            <div className="space-y-2">
              {context.residents.map((resident) => (
                <ResidentRailRow key={resident.id} threadId={thread.id} resident={resident} />
              ))}
            </div>
          )}
        </div>

        <dl className="divide-y divide-border overflow-hidden rounded-lg border border-border">
          {rail?.home ? null : (
            <RailFact
              label="Dues"
              failed={failed('dues')}
              value={
                context.duesBalance > 0 ? (
                  <StatusPill
                    tone="danger"
                    label={`${usd(context.duesBalance)}${
                      context.duesOverdueCount > 0 ? ` · ${context.duesOverdueCount} overdue` : ''
                    }`}
                  />
                ) : (
                  <StatusPill tone="success" label="Current" />
                )
              }
            />
          )}
          {rail?.home ? null : (
            <RailFact
              label="Open violations"
              failed={failed('violations')}
              value={
                context.openViolations > 0 ? (
                  <StatusPill tone="warning" label={String(context.openViolations)} />
                ) : (
                  <span className="text-muted">None</span>
                )
              }
            />
          )}
          <RailFact
            label="Open ARC"
            failed={failed('arc')}
            stacked={context.openArcRequests.length > 0}
            value={
              context.openArcRequests.length > 0 ? (
                <ul className="space-y-1">
                  {context.openArcRequests.map((a) => (
                    <li key={a.id}>
                      <Link href={`/arc/${a.id}`} className="font-medium text-primary">
                        {a.summary}
                      </Link>
                      <span className="text-muted">{` (${a.status.replace(/_/g, ' ')})`}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted">None</span>
              )
            }
          />
          <RailFact
            label="Open tickets"
            failed={failed('tickets')}
            stacked={context.openTickets.length > 0}
            value={
              context.openTickets.length > 0 ? (
                <ul className="space-y-1">
                  {context.openTickets.map((t) => (
                    <li key={t.id}>
                      <Link href={`/tickets/${t.id}`} className="font-medium text-primary">
                        {t.subject}
                      </Link>
                      <span className="text-muted">{` (${t.status.replace(/_/g, ' ')})`}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-muted">None</span>
              )
            }
          />
          <RailFact
            label="Last sent"
            failed={failed('lastCommunication')}
            stacked={Boolean(context.lastCommunication)}
            value={
              context.lastCommunication ? (
                `${context.lastCommunication.subject}${
                  context.lastCommunication.sentAt
                    ? ` — ${formatShortDate(context.lastCommunication.sentAt)}`
                    : ''
                }`
              ) : (
                <span className="text-muted">Nothing sent yet</span>
              )
            }
          />
        </dl>
      </div>
    )
  }

  // No unitId — genuinely not filed yet.
  return (
    <div className="space-y-3 p-4">
      <RailLabel>Property</RailLabel>
      <p className="text-sm font-medium text-foreground">Not filed under a property yet</p>
      {suggestedProperty ? (
        <Alert variant="warning" hideIcon>
          Suggested: <strong className="font-semibold text-foreground">{suggestedProperty.address}</strong> —
          {matchRuleLabel(thread.matchReason?.rule) ? `matched by ${matchRuleLabel(thread.matchReason?.rule)}` : 'a possible match'}. Confirm below.
        </Alert>
      ) : (
        <p className="text-xs text-muted">
          No property matched this sender. File it manually, or leave it if it isn&apos;t about a
          specific home.
        </p>
      )}
      <AssignPropertyForm threadId={thread.id} suggestedProperty={suggestedProperty} />
    </div>
  )
}

/**
 * One fact row. A section that failed to load says so in warning text —
 * never its numeric default ("None", "Current"), which would be a lie.
 */
function RailFact({
  label,
  value,
  failed,
  stacked = false,
}: {
  label: string
  value: React.ReactNode
  failed: boolean
  /** Long text values go under the label instead of beside it. */
  stacked?: boolean
}) {
  return (
    <div
      className={cn(
        'bg-surface px-3 py-2.5 text-sm',
        stacked && !failed ? 'space-y-1' : 'flex items-center justify-between gap-3',
      )}
    >
      <dt className="shrink-0 text-xs text-muted">{label}</dt>
      <dd className={cn('min-w-0 text-foreground', stacked && !failed ? 'text-xs' : 'text-right')}>
        {failed ? <span className="text-xs font-medium text-warning">Couldn&apos;t load</span> : value}
      </dd>
    </div>
  )
}

