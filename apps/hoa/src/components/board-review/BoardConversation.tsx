import { Lock, ShieldCheck, User } from 'lucide-react'
import { Timeline, type TimelineItem } from '@homeowner-portal/ui'
import type { BoardMessageRow } from '@/lib/board-review'
import { formatMonthDayTime } from '@/lib/format-datetime'

/**
 * The resident ↔ board thread on an ARC application or a resident report,
 * as a Timeline. Internal notes sit in an amber well and say so in words,
 * so nobody mistakes one for something the resident saw.
 */
export function BoardConversation({
  messages,
  residentLabel,
  emptyHint,
}: {
  messages: BoardMessageRow[]
  /** "Resident" or "Reporter". */
  residentLabel: string
  emptyHint: string
}) {
  if (messages.length === 0) {
    return <p className="text-sm text-muted">{emptyHint}</p>
  }
  const items: TimelineItem[] = messages.map((m) => {
    const fromResident = m.author_role === 'resident'
    return {
      id: m.id,
      title: fromResident ? residentLabel : m.author_role === 'admin' ? 'Admin' : 'Board',
      meta: m.internal ? (
        <span className="inline-flex items-center gap-1 font-medium text-warning">
          <Lock className="size-3" aria-hidden />
          Internal note — not visible to the {residentLabel.toLowerCase()}
        </span>
      ) : undefined,
      time: <time dateTime={m.created_at}>{formatMonthDayTime(m.created_at)}</time>,
      icon: fromResident ? <User /> : m.internal ? <Lock /> : <ShieldCheck />,
      tone: fromResident ? 'neutral' : m.internal ? 'warning' : 'brand',
      highlight: m.internal,
      body: <p className="whitespace-pre-wrap text-foreground">{m.body}</p>,
    }
  })
  return <Timeline items={items} label="Conversation" />
}
