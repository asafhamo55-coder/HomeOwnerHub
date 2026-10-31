import { Lock } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import { formatMonthDayTime } from '@/lib/format-datetime'

// Message thread for a resident's ticket / ARC application / concern.
// Chat-style: the resident's own messages on the right in the brand tint,
// the board's on the left. Server component; the composer below it is
// <ReplyComposer>.

export interface ConversationMessage {
  id: string
  author_role: 'resident' | 'board' | 'admin'
  author_name?: string | null
  body: string
  created_at: string
}

export function Conversation({
  messages,
  emptyText,
}: {
  messages: ConversationMessage[]
  emptyText: string
}) {
  if (messages.length === 0) {
    return <p className="px-1 py-2 text-sm text-muted">{emptyText}</p>
  }
  return (
    <ol className="space-y-3" aria-label="Messages">
      {messages.map((m) => {
        const mine = m.author_role === 'resident'
        const name = m.author_name?.trim()
        const who = mine ? 'You' : name ? `${name} · Board` : 'Board'
        return (
          <li key={m.id} className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}>
            <div
              className={cn(
                'max-w-[85%] whitespace-pre-wrap rounded-xl px-3.5 py-2.5 text-sm [overflow-wrap:anywhere]',
                mine
                  ? 'rounded-br-md bg-primary-subtle text-foreground'
                  : 'rounded-bl-md border border-border bg-subtle text-foreground',
              )}
            >
              {m.body}
            </div>
            <p className="px-1 text-xs text-muted">
              <span className="font-medium text-foreground-secondary">{who}</span>
              {' · '}
              <time dateTime={m.created_at}>{formatMonthDayTime(m.created_at)}</time>
            </p>
          </li>
        )
      })}
    </ol>
  )
}

/** Read-only footer for a finished thread (shown instead of the composer). */
export function ThreadClosed({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 border-t border-border pt-4 text-sm text-muted">
      <Lock className="size-4 shrink-0" aria-hidden />
      {children}
    </p>
  )
}
