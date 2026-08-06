import Link from 'next/link'
import type { PropertyContext, ThreadDetail } from '@/lib/inbox/queries'
import { AssignPropertyForm } from './AssignPropertyForm'
import { ResidentRailRow } from './ResidentRailRow'
import { formatShortDate } from '@/lib/format-datetime'

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
}

export function PropertyRail({ thread, context, contextLoadFailed, suggestedProperty }: Props) {
  // Branch on unitId (ground truth) first, before anything derived from
  // the context fetch — the exact ordering ThreadList.tsx's attribution
  // fix established, so a rail load failure can't get relabeled as "not
  // filed".
  if (thread.unitId) {
    if (contextLoadFailed) {
      return (
        <div className="space-y-3 p-3">
          <p className="text-sm font-semibold text-foreground">Property context unavailable</p>
          <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            This thread is filed, but dues/violations/tickets couldn&apos;t be loaded
            right now. Refresh to try again — the thread is still correctly matched.
          </p>
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
        <div className="space-y-3 p-3">
          <p className="text-sm font-semibold text-foreground">Property record missing</p>
          <p className="text-xs text-muted">
            This thread is filed under a property that no longer exists. Contact an
            admin to fix the assignment.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-2.5 p-3">
        <div>
          <p className="font-semibold text-foreground">
            {context.address}
            {context.unitNumber ? ` #${context.unitNumber}` : ''}
          </p>
          {/* The degraded branch stays FIRST. getPropertyContext defaults
              residents to [] and pushes 'residents' onto `degraded` when the
              query fails — without this branch an unloadable list would
              render as an editable empty list, the same class of lie the
              unitId-first ordering above exists to prevent. */}
          {context.degraded.includes('residents') ? (
            <p className="text-xs text-muted">Residents couldn&apos;t load</p>
          ) : context.residents.length === 0 ? (
            <p className="text-xs text-muted">No residents on file</p>
          ) : (
            <div className="space-y-1.5">
              {context.residents.map((resident) => (
                <ResidentRailRow key={resident.id} threadId={thread.id} resident={resident} />
              ))}
            </div>
          )}
          <p className="mt-0.5 text-[11px] text-muted">
            Matched via {String(thread.matchReason?.rule ?? 'unknown')}
            {thread.matchSource === 'manual' ? ' (manual)' : ''}
          </p>
        </div>

        <RailBox
          label="Dues"
          tone={
            context.degraded.includes('dues')
              ? 'warn'
              : context.duesBalance > 0
                ? 'danger'
                : 'ok'
          }
          value={
            context.degraded.includes('dues')
              ? "Couldn't load"
              : context.duesBalance > 0
                ? `$${context.duesBalance.toFixed(2)}${
                    context.duesOverdueCount > 0
                      ? ` · ${context.duesOverdueCount} overdue`
                      : ''
                  }`
                : 'Current'
          }
        />

        <RailBox
          label="Open violations"
          tone={
            context.degraded.includes('violations')
              ? 'warn'
              : context.openViolations > 0
                ? 'warn'
                : 'plain'
          }
          value={
            context.degraded.includes('violations')
              ? "Couldn't load"
              : context.openViolations > 0
                ? String(context.openViolations)
                : 'None'
          }
        />

        <RailBox
          label="Open ARC"
          tone={context.degraded.includes('arc') ? 'warn' : 'plain'}
          value={
            context.degraded.includes('arc')
              ? "Couldn't load"
              : context.openArcRequests.length > 0
                ? context.openArcRequests.map((a) => `${a.summary} (${a.status})`).join(', ')
                : 'None'
          }
        />

        <RailBox
          label="Open tickets"
          tone={context.degraded.includes('tickets') ? 'warn' : 'plain'}
          value={
            context.degraded.includes('tickets')
              ? "Couldn't load"
              : context.openTickets.length > 0
                ? context.openTickets.map((t) => t.subject).join(', ')
                : 'None'
          }
        />

        <RailBox
          label="Last sent"
          tone={context.degraded.includes('lastCommunication') ? 'warn' : 'plain'}
          value={
            context.degraded.includes('lastCommunication')
              ? "Couldn't load"
              : context.lastCommunication
                ? `${context.lastCommunication.subject}${
                    context.lastCommunication.sentAt
                      ? ` — ${formatShortDate(context.lastCommunication.sentAt)}`
                      : ''
                  }`
                : 'Nothing sent yet'
          }
        />

        <div className="space-y-1 border-t border-border pt-2 text-xs">
          <Link href={`/properties/${thread.unitId}`} className="block underline">
            Open property →
          </Link>
        </div>
      </div>
    )
  }

  // No unitId — genuinely not filed yet.
  return (
    <div className="space-y-3 p-3">
      <p className="text-sm font-semibold text-foreground">Not filed yet</p>
      {suggestedProperty ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Suggested: {suggestedProperty.address} — matched via{' '}
          {String(thread.matchReason?.rule ?? 'unknown')}. Confirm below.
        </p>
      ) : (
        <p className="text-xs text-muted">
          No property matched this sender. File it manually, or leave it if it
          isn&apos;t about a specific home.
        </p>
      )}
      <AssignPropertyForm threadId={thread.id} suggestedProperty={suggestedProperty} />
    </div>
  )
}

function RailBox({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'ok' | 'warn' | 'danger' | 'plain'
}) {
  // `border-warning` doesn't exist in the shared Tailwind config
  // (packages/ui/tailwind.config.ts) — literal amber with a dark:
  // variant, same pair used throughout this task for the "needs
  // attention but isn't destructive" tone. `border-destructive` is a
  // real token (used by Button/Alert), so that one is untouched.
  const border =
    tone === 'danger'
      ? 'border-destructive'
      : tone === 'warn'
        ? 'border-amber-400 dark:border-amber-700'
        : 'border-border'

  return (
    <div className={`rounded-md border ${border} p-2`}>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  )
}
