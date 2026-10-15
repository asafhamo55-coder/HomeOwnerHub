import Link from 'next/link'
import { AlertCircle, Home, HelpCircle, Paperclip } from 'lucide-react'
import { Avatar, cn } from '@homeowner-portal/ui'
import type { ThreadListItem } from '@/lib/inbox/queries'
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

export function ThreadList({
  threads,
  selectedId,
  filter,
  page = 1,
}: {
  threads: ThreadListItem[]
  selectedId?: string
  filter: string
  /** List page these threads came from, carried so the list pane stays put when one is opened. */
  page?: number
}) {
  const qs = `?filter=${filter}${page > 1 ? `&page=${page}` : ''}`
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
