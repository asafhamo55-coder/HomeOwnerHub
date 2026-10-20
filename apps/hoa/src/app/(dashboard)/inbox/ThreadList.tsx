import Link from 'next/link'
import { AlertCircle, Clock, Home, HelpCircle, Paperclip, UserRound } from 'lucide-react'
import { Avatar, cn } from '@homeowner-portal/ui'
import type { InboxFilter, InboxOwnerFilter, ThreadListItem } from '@/lib/inbox/queries'
import { inboxQuery } from '@/lib/inbox/navigation'
import { DEFAULT_INBOX_SLA_HOURS, waitingInfo, type InboxSlaHours, type WaitingTone } from '@/lib/inbox/waiting'
import { formatShortDate } from '@/lib/format-datetime'

// `unitId` is ground truth for "did this thread actually get matched" —
// `decideMatch` (apps/hoa/src/lib/inbox/match.ts) sets it ONLY on a high-
// confidence match, and it is never cleared afterward except by a manual
// re-file. `propertyAddress` is a DERIVED enrichment: `listThreads` looks
// it up in a batched, log-and-degrade query that intentionally continues
// (rather than failing the whole list) if that lookup errors. Branching on
// `propertyAddress` first would render a genuinely matched thread as
// "Unassigned" whenever that one enrichment query hiccups — the exact
// misrepresentation this screen exists to prevent, since a manager would
// then re-triage a thread the system already resolved correctly. Branch on
// `unitId` first, always; a unit attached with no resolvable address says
// so honestly instead of claiming there's no match at all.
type Attribution = { label: string; tone: 'matched' | 'confirm' | 'none' }

function attribution(item: ThreadListItem): Attribution {
  if (item.unitId !== null) {
    return item.propertyAddress
      ? { label: item.propertyAddress, tone: 'matched' }
      : { label: 'Matched — address unavailable', tone: 'confirm' }
  }
  if (item.matchConfidence === 'medium') return { label: 'Suggested match — confirm', tone: 'confirm' }
  if (item.matchConfidence === 'low') return { label: 'Possible match — confirm', tone: 'confirm' }
  return { label: 'Not filed under a property', tone: 'none' }
}

const ATTRIBUTION_STYLE: Record<Attribution['tone'], { className: string; Icon: typeof Home }> = {
  matched: { className: 'text-success', Icon: Home },
  confirm: { className: 'text-warning', Icon: AlertCircle },
  none: { className: 'text-muted', Icon: HelpCircle },
}

// Waiting badge (BL-101 A6): neutral under the org's warn threshold, amber
// past it (48h by default), red past overdue (5 days). Text, not colour
// alone, carries the meaning.
const WAITING_STYLE: Record<WaitingTone, string> = {
  normal: 'bg-subtle text-foreground-secondary',
  warn: 'bg-warning-subtle text-warning',
  overdue: 'bg-danger-subtle text-danger',
}

export function ThreadList({
  threads,
  selectedId,
  filter,
  owner = 'all',
  page = 1,
  now,
  sla = DEFAULT_INBOX_SLA_HOURS,
  assigneeNames = {},
  currentUserId = null,
}: {
  threads: ThreadListItem[]
  selectedId?: string
  filter: InboxFilter
  owner?: InboxOwnerFilter
  /** List page these threads came from, carried so the list pane stays put when one is opened. */
  page?: number
  /** Render time, passed in so every row is measured against the same instant. */
  now: number
  sla?: InboxSlaHours
  /** profiles id → display name, for the assignee line. */
  assigneeNames?: Record<string, string>
  currentUserId?: string | null
}) {
  const qs = inboxQuery({ filter, owner, page })
  return (
    <ul className="divide-y divide-border">
      {threads.map((thread) => {
        const sender = thread.fromName ?? thread.fromEmail ?? 'Unknown sender'
        const who = attribution(thread)
        const { className: whoClass, Icon: WhoIcon } = ATTRIBUTION_STYLE[who.tone]
        const selected = thread.id === selectedId
        return (
          <li key={thread.id}>
            <Link
              href={`/inbox/${thread.id}${qs}`}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'relative flex gap-3 px-4 py-3 no-underline transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                selected ? 'bg-primary-subtle' : 'hover:bg-subtle',
              )}
            >
              {selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-primary" /> : null}
              <Avatar name={sender} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-foreground">{sender}</span>
                  <span className="num shrink-0 text-xs text-muted">
                    {thread.lastMessageAt ? formatShortDate(thread.lastMessageAt) : ''}
                  </span>
                </div>
                <WaitingAndOwner
                  thread={thread}
                  now={now}
                  sla={sla}
                  assigneeNames={assigneeNames}
                  currentUserId={currentUserId}
                />
                <p className="flex items-center gap-1.5 text-sm text-foreground">
                  <span className="truncate">{thread.subject ?? '(no subject)'}</span>
                  {thread.hasAttachments ? (
                    <Paperclip className="size-3.5 shrink-0 text-muted" aria-label="Has attachments" />
                  ) : null}
                </p>
                {thread.snippet ? <p className="truncate text-xs text-muted">{thread.snippet}</p> : null}
                <p className={cn('flex items-center gap-1 pt-0.5 text-xs font-medium', whoClass)}>
                  <WhoIcon className="size-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{who.label}</span>
                </p>
                {/* Only rendered where it is load-bearing — where a row is
                    hidden from the working inbox and the manager's next
                    question is *why*. "Filed" and "Trashed" are different
                    enough decisions to be worth distinguishing. Everywhere
                    else the state is 'active' or 'unknown' and a badge
                    would be noise on every row. */}
                {thread.gmailState === 'archived' || thread.gmailState === 'trashed' ? (
                  <p className="truncate text-xs text-muted">
                    {thread.gmailState === 'trashed' ? 'Trashed in Gmail' : 'Filed in Gmail'}
                  </p>
                ) : null}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function WaitingAndOwner({
  thread,
  now,
  sla,
  assigneeNames,
  currentUserId,
}: {
  thread: ThreadListItem
  now: number
  sla: InboxSlaHours
  assigneeNames: Record<string, string>
  currentUserId: string | null
}) {
  const waiting = waitingInfo(thread, now, sla)
  const assignee = thread.assignedTo
    ? thread.assignedTo === currentUserId
      ? 'You'
      : (assigneeNames[thread.assignedTo] ?? 'Assigned')
    : null
  if (!waiting && !assignee) return null
  return (
    <p className="flex flex-wrap items-center gap-1.5 text-xs">
      {waiting ? (
        <span
          className={cn('num inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium', WAITING_STYLE[waiting.tone])}
          title="Time since the resident's last message with no reply"
        >
          <Clock className="size-3" aria-hidden />
          {waiting.label}
        </span>
      ) : null}
      {assignee ? (
        <span className="inline-flex min-w-0 items-center gap-1 text-muted">
          <UserRound className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{assignee}</span>
        </span>
      ) : null}
    </p>
  )
}
