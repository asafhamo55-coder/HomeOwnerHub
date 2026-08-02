import Link from 'next/link'
import { Paperclip } from 'lucide-react'
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
//
// No `text-success`/`text-warning` utilities exist in the shared Tailwind
// config (packages/ui/tailwind.config.ts only defines primary/accent/
// background/surface/border/foreground/muted/destructive as CSS-variable
// tokens). Matched vs. needs-review is rendered with the same literal
// emerald/amber + dark: pair already used for this exact distinction in
// settings/mailbox/MailboxConnectCard.tsx (the confirmed-match sample
// row and the Stat "ok"/"warn" tones).
function confidenceTone(item: ThreadListItem): string {
  if (item.unitId !== null) {
    return item.propertyAddress
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-amber-700 dark:text-amber-400'
  }
  if (item.matchConfidence === 'medium' || item.matchConfidence === 'low')
    return 'text-amber-700 dark:text-amber-400'
  return 'text-muted'
}

function attributionLabel(item: ThreadListItem): string {
  if (item.unitId !== null) {
    return item.propertyAddress ? `→ ${item.propertyAddress}` : 'Matched — address unavailable'
  }
  if (item.matchConfidence === 'medium') return 'Suggested match — confirm'
  if (item.matchConfidence === 'low') return 'Possible match — confirm'
  return 'Unassigned'
}

export function ThreadList({
  threads,
  selectedId,
  filter,
  hasAnyThreads,
}: {
  threads: ThreadListItem[]
  selectedId?: string
  filter: string
  /**
   * Whether the mailbox has ANY thread at all (across every status), not
   * just this filter. Lets the empty state distinguish "this filter has
   * zero matches" from "no mail has arrived yet" — the filter chip counts
   * hint at this already, but the empty state itself said the same thing
   * either way.
   */
  hasAnyThreads: boolean
}) {
  if (threads.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        {hasAnyThreads
          ? 'No threads match this filter.'
          : 'Nothing here yet. Mail syncs every 2 minutes.'}
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {threads.map((thread) => (
        <li key={thread.id}>
          <Link
            href={`/inbox/${thread.id}?filter=${filter}`}
            className={`block px-3 py-2.5 transition-colors hover:bg-muted/10 ${
              thread.id === selectedId ? 'border-l-4 border-primary bg-primary/5' : ''
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold text-foreground">
                {thread.fromName ?? thread.fromEmail ?? 'Unknown sender'}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {thread.lastMessageAt
                  ? formatShortDate(thread.lastMessageAt)
                  : ''}
              </span>
            </div>
            <p className="flex items-center gap-1 truncate text-sm text-foreground">
              <span className="truncate">{thread.subject ?? '(no subject)'}</span>
              {thread.hasAttachments ? (
                <Paperclip className="h-3 w-3 shrink-0 text-muted" aria-label="Has attachments" />
              ) : null}
            </p>
            {thread.snippet ? (
              <p className="truncate text-xs text-muted">{thread.snippet}</p>
            ) : null}
            <p className={`truncate text-xs ${confidenceTone(thread)}`}>
              {attributionLabel(thread)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
