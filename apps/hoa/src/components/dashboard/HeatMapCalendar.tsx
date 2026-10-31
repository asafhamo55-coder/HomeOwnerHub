'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AlertCircle, ArrowRight, Check, Clock } from 'lucide-react'
import { cn } from '@homeowner-portal/ui'
import { formatCalendarDay, summarizeDay, type DayLevel, type HeatMapDay, type HeatMapMonth } from './heat-map-grid'

// One table for colour, glyph and words, so the legend and the cells can
// never disagree. Red, amber and green carry a glyph as well as a colour
// (audit finding 10).
const LEVEL_META: Record<
  DayLevel,
  { label: string; cellClass: string; swatchClass: string; icon: typeof AlertCircle | null }
> = {
  red: {
    label: 'overdue',
    cellClass: 'bg-danger-subtle text-danger border border-danger/30',
    swatchClass: 'bg-danger-subtle text-danger border border-danger/30',
    icon: AlertCircle,
  },
  yellow: {
    label: 'due within 3 days',
    cellClass: 'bg-warning-subtle text-warning border border-warning/30',
    swatchClass: 'bg-warning-subtle text-warning border border-warning/30',
    icon: Clock,
  },
  green: {
    label: 'on track',
    cellClass: 'bg-success-subtle text-success border border-success/25',
    swatchClass: 'bg-success-subtle text-success border border-success/25',
    icon: Check,
  },
  grey: {
    label: 'nothing due',
    cellClass: 'bg-subtle text-muted',
    swatchClass: 'bg-subtle text-muted border border-border',
    icon: null,
  },
}

/**
 * The months and the selected day's detail. A coloured day is a button:
 * the title tooltip never shows on touch and is slow in Safari, so a board
 * member could see a green day without learning what was on track. The
 * first day with something on it from today on starts selected.
 */
export function HeatMapCalendar({ months, today }: { months: HeatMapMonth[]; today: string }) {
  const eventDays = months.flatMap((m) => m.days).filter((d) => d.notes.length > 0)
  const initial = eventDays.find((d) => d.day >= today) ?? eventDays[eventDays.length - 1] ?? null
  const [selected, setSelected] = useState<string | null>(initial?.day ?? null)
  const selectedDay = eventDays.find((d) => d.day === selected) ?? null

  return (
    <div className="space-y-5">
      <div className="grid gap-6 cq-md:grid-cols-3">
        {months.map((m) => (
          <MonthGrid key={m.key} month={m} selected={selected} onSelect={setSelected} />
        ))}
      </div>
      <DayDetail day={selectedDay} />
    </div>
  )
}

function MonthGrid({
  month,
  selected,
  onSelect,
}: {
  month: HeatMapMonth
  selected: string | null
  onSelect: (day: string) => void
}) {
  // Pad the leading days so the 1st lines up under its weekday (Sun..Sat).
  const padded = Array.from({ length: month.leadingBlanks })
    .map(() => null as HeatMapDay | null)
    .concat(month.days)

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{month.label}</p>
      <div className="grid grid-cols-7 gap-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={`hdr-${i}`} className="text-center text-2xs font-semibold uppercase text-muted" aria-hidden>
            {d}
          </div>
        ))}
        {padded.map((cell, idx) => {
          if (!cell) return <div key={`pad-${idx}`} className="h-8" aria-hidden />
          const meta = LEVEL_META[cell.level]
          const Icon = meta.icon
          const dateLabel = formatCalendarDay(cell.day, 'medium')
          const label = `${cell.isToday ? 'Today, ' : ''}${dateLabel}: ${meta.label}`
          const className = cn(
            'num relative flex h-8 items-center justify-center rounded-md text-xs font-medium',
            meta.cellClass,
            cell.isToday && 'ring-2 ring-ring ring-offset-1 ring-offset-surface',
          )
          const content = (
            <>
              {cell.dayOfMonth}
              {Icon ? <Icon className="absolute right-0.5 top-0.5 size-2.5" strokeWidth={3} aria-hidden /> : null}
            </>
          )
          if (cell.notes.length === 0) {
            return (
              <div key={cell.day} role="img" aria-label={label} title={label} className={className}>
                {content}
              </div>
            )
          }
          const isSelected = cell.day === selected
          return (
            <button
              key={cell.day}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${label}. Show details`}
              onClick={() => onSelect(cell.day)}
              className={cn(
                className,
                'cursor-pointer transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isSelected && 'outline outline-2 outline-offset-1 outline-foreground',
              )}
            >
              {content}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DayDetail({ day }: { day: HeatMapDay | null }) {
  if (!day) {
    return (
      <p className="text-sm text-muted" aria-live="polite">
        Nothing is due in these three months.
      </p>
    )
  }
  const meta = LEVEL_META[day.level]
  const items = summarizeDay(day.notes)
  return (
    <div className="rounded-lg border border-border bg-subtle/50 px-4 py-3" aria-live="polite">
      <p className="text-sm font-medium text-foreground">
        {formatCalendarDay(day.day, 'medium')}
        {day.isToday ? ' (today)' : ''}
        <span className="text-muted">
          {' · '}
          {meta.label.charAt(0).toUpperCase() + meta.label.slice(1)}
        </span>
      </p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => {
          const ItemIcon = LEVEL_META[item.level].icon
          return (
            <li key={item.text} className="flex items-start gap-2 text-sm text-foreground-secondary">
              <span
                className={cn('mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded', LEVEL_META[item.level].swatchClass)}
                aria-hidden
              >
                {ItemIcon ? <ItemIcon className="size-2.5" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">{item.text}</span>
              <Link href={item.href} className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline">
                {item.href === '/dues' ? 'Dues' : 'Violations'}
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">Click any coloured day to see what is on it.</p>
    </div>
  )
}

export function HeatMapLegend() {
  const order: DayLevel[] = ['red', 'yellow', 'green', 'grey']
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted" aria-label="Legend">
      {order.map((level) => {
        const meta = LEVEL_META[level]
        const Icon = meta.icon
        return (
          <li key={level} className="inline-flex items-center gap-1.5">
            <span className={cn('inline-flex size-4 items-center justify-center rounded', meta.swatchClass)} aria-hidden>
              {Icon ? <Icon className="size-2.5" strokeWidth={3} /> : null}
            </span>
            <span className="first-letter:uppercase">{meta.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
