import Link from 'next/link'
import { Paperclip } from 'lucide-react'
import type { ThreadListItem } from '@/lib/inbox/queries'

// No `text-success`/`text-warning` utilities exist in the shared Tailwind
// config (packages/ui/tailwind.config.ts only defines primary/accent/
// background/surface/border/foreground/muted/destructive as CSS-variable
// tokens). Matched vs. needs-review is rendered with the same literal
// emerald/amber + dark: pair already used for this exact distinction in
// settings/mailbox/MailboxConnectCard.tsx (the confirmed-match sample
// row and the Stat "ok"/"warn" tones).
function confidenceTone(item: ThreadListItem): string {
  if (item.propertyAddress) return 'text-emerald-700 dark:text-emerald-400'
  if (item.matchConfidence === 'medium' || item.matchConfidence === 'low')
    return 'text-amber-700 dark:text-amber-400'
  return 'text-muted'
}

function attributionLabel(item: ThreadListItem): string {
  if (item.propertyAddress) return `→ ${item.propertyAddress}`
  if (item.matchConfidence === 'medium') return 'Suggested match — confirm'
  if (item.matchConfidence === 'low') return 'Possible match — confirm'
  return 'Unassigned'
}

export function ThreadList({
  threads,
  selectedId,
  filter,
}: {
  threads: ThreadListItem[]
  selectedId?: string
  filter: string
}) {
  if (threads.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted">
        Nothing here. Mail syncs every 2 minutes.
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
                  ? new Date(thread.lastMessageAt).toLocaleDateString()
                  : ''}
              </span>
            </div>
            <p className="flex items-center gap-1 truncate text-sm text-foreground">
              <span className="truncate">{thread.subject ?? '(no subject)'}</span>
              {thread.hasAttachments ? (
                <Paperclip className="h-3 w-3 shrink-0 text-muted" aria-label="Has attachments" />
              ) : null}
            </p>
            <p className={`truncate text-xs ${confidenceTone(thread)}`}>
              {attributionLabel(thread)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  )
}
