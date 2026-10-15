import * as React from 'react'
import { cn } from '../lib/cn'
import type { StatusTone } from './Badge'

/**
 * Timeline — the history of a record, oldest first (or newest first; the
 * caller orders the items). For detail pages where "what happened, when,
 * by whom" is the story: a violation's notices, a ticket's replies, an ARC
 * application's review, a report's decision.
 *
 *   <Timeline items={[
 *     { id, title: 'Notice sent', time: 'Oct 3, 2026', tone: 'info', icon: <Mail/> },
 *     { id, title: 'Dana Rivers', meta: 'Resident', time, body: <p>…</p> },
 *   ]} />
 *
 * Server-safe. The marker carries an icon when given (status is never
 * colour-only); `tone` tints it. `body` renders in a bordered bubble —
 * use it for messages; leave it out for plain events. `highlight` marks an
 * internal note (amber well) so it cannot be mistaken for something the
 * resident saw.
 */
export interface TimelineItem {
  id: string
  title: React.ReactNode
  /** Small text after the title: a role, "internal note". */
  meta?: React.ReactNode
  /** Human time. Pass a <time dateTime> element for machine-readable time. */
  time?: React.ReactNode
  body?: React.ReactNode
  icon?: React.ReactNode
  tone?: StatusTone
  /** Amber well for internal / board-only entries. */
  highlight?: boolean
}

const MARKER_TONE: Record<StatusTone, string> = {
  success: 'bg-success-subtle text-success border-success/25',
  warning: 'bg-warning-subtle text-warning border-warning/30',
  danger: 'bg-danger-subtle text-danger border-danger/25',
  info: 'bg-info-subtle text-info border-info/25',
  neutral: 'bg-subtle text-muted border-border',
  ai: 'bg-accent-subtle text-accent-fg border-accent/30',
  brand: 'bg-primary-subtle text-primary border-primary/20',
}

export interface TimelineProps {
  items: TimelineItem[]
  className?: string
  /** Accessible name for the list. */
  label?: string
}

export function Timeline({ items, className, label = 'History' }: TimelineProps) {
  return (
    <ol aria-label={label} className={cn('relative space-y-5', className)}>
      {items.map((item, i) => {
        const last = i === items.length - 1
        return (
          <li key={item.id} className="relative flex gap-3">
            {last ? null : (
              <span aria-hidden className="absolute left-[13px] top-8 -bottom-5 w-px bg-border" />
            )}
            <span
              aria-hidden
              className={cn(
                'relative z-[1] mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border [&_svg]:size-3.5',
                MARKER_TONE[item.tone ?? 'neutral'],
              )}
            >
              {item.icon ?? <span className="size-1.5 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-medium text-foreground">{item.title}</span>
                {item.meta ? <span className="text-xs text-muted">{item.meta}</span> : null}
                {item.time ? <span className="num ml-auto text-xs text-muted">{item.time}</span> : null}
              </div>
              {item.body ? (
                <div
                  className={cn(
                    'rounded-lg border px-3.5 py-2.5 text-sm text-foreground-secondary',
                    item.highlight ? 'border-warning/30 bg-warning-subtle' : 'border-border bg-surface',
                  )}
                >
                  {item.body}
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
