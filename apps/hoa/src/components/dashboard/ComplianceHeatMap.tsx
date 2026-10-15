import { AlertCircle, Check, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { addDays, format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns'

export type DayLevel = 'red' | 'yellow' | 'green' | 'grey'

export interface DayCell {
  date: Date
  level: DayLevel
  notes: string[]
}

interface ComplianceHeatMapProps {
  /**
   * Pre-computed day cells, one per day in the visible window. The page
   * fetches the underlying data and decides the level so this component
   * stays a pure renderer.
   */
  cells: DayCell[]
  /** Number of months to render. The plan calls for a 3-month rolling view. */
  months?: number
}

/**
 * 3-month rolling calendar. Each cell is colored by the worst event on
 * that day:
 *   red    = cure deadline elapsed / dues overdue
 *   yellow = cure deadline within 3 days / upcoming due date
 *   green  = events on this day, all clean
 *   grey   = no events
 *
 * The page builds the cells server-side from hoa_violations +
 * hoa_dues, so this component is purely visual.
 */
export function ComplianceHeatMap({ cells, months = 3 }: ComplianceHeatMapProps) {
  const today = new Date()
  const start = startOfMonth(today)
  const end = endOfMonth(addDays(start, months * 32)) // ~3 months out

  const monthGrids: { label: string; days: DayCell[] }[] = []
  for (let i = 0; i < months; i++) {
    const monthStart = startOfMonth(addDays(start, i * 32))
    const monthEnd = endOfMonth(monthStart)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd }).map((d) => {
      const cell = cells.find((c) => isSameDay(c.date, d))
      return cell ?? { date: d, level: 'grey' as DayLevel, notes: [] }
    })
    monthGrids.push({
      label: format(monthStart, 'MMMM yyyy'),
      days,
    })
  }

  return (
    <Card variant="elevated">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          Compliance heat map
        </CardTitle>
        <p className="text-xs text-muted">
          {format(start, 'MMM yyyy')} – {format(end, 'MMM yyyy')}
        </p>
        <HeatMapLegend />
      </CardHeader>
      <CardContent className="space-y-4">
        {monthGrids.map((m) => (
          <MonthGrid key={m.label} label={m.label} days={m.days} today={today} />
        ))}
      </CardContent>
    </Card>
  )
}

function MonthGrid({
  label,
  days,
  today,
}: {
  label: string
  days: DayCell[]
  today: Date
}) {
  // Pad the leading days so weekday-1 in our grid lines up with Sun..Sat.
  const firstDow = days[0]?.date.getDay() ?? 0
  const padded = Array.from({ length: firstDow })
    .map(() => null as DayCell | null)
    .concat(days)

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-foreground">{label}</p>
      <div className="grid grid-cols-7 gap-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div
            key={`hdr-${i}`}
            className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted"
          >
            {d}
          </div>
        ))}
        {padded.map((cell, idx) => {
          if (!cell) return <div key={`pad-${idx}`} className="h-8" aria-hidden />
          const isToday = isSameDay(cell.date, today)
          const meta = LEVEL_META[cell.level]
          const Icon = meta.icon
          const dateLabel = format(cell.date, 'PP')
          // Spoken and tooltip text carry the status in words: colour alone
          // is invisible to screen readers and to colour-blind users, and a
          // `title` never surfaces on touch devices.
          const description =
            cell.notes.length === 0
              ? `${dateLabel}: ${meta.label}`
              : `${dateLabel}: ${meta.label} — ${cell.notes.join('; ')}`
          return (
            <div
              key={cell.date.toISOString()}
              role="img"
              aria-label={isToday ? `Today, ${description}` : description}
              title={description}
              className={`relative flex h-8 items-center justify-center rounded-md text-xs font-medium ${
                meta.cellClass
              } ${isToday ? 'ring-2 ring-primary' : ''}`}
            >
              {cell.date.getDate()}
              {Icon ? (
                <Icon
                  className="absolute right-0.5 top-0.5 h-2.5 w-2.5"
                  strokeWidth={3}
                  aria-hidden
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// One table for colour, glyph and words, so the legend and the cells can
// never disagree. Red and amber carry a glyph as well as a colour (audit
// finding 10: the explanation used to live only in a `title` attribute).
const LEVEL_META: Record<
  DayLevel,
  { label: string; cellClass: string; swatchClass: string; icon: typeof AlertCircle | null }
> = {
  red: {
    label: 'overdue',
    cellClass: 'bg-destructive/20 text-destructive',
    swatchClass: 'bg-destructive/20 text-destructive',
    icon: AlertCircle,
  },
  yellow: {
    label: 'due within 3 days',
    cellClass: 'bg-amber-200 text-amber-900',
    swatchClass: 'bg-amber-200 text-amber-900',
    icon: Clock,
  },
  green: {
    label: 'on track',
    cellClass: 'bg-emerald-200 text-emerald-900',
    swatchClass: 'bg-emerald-200 text-emerald-900',
    icon: Check,
  },
  grey: {
    label: 'nothing due',
    cellClass: 'bg-background text-muted',
    swatchClass: 'border border-border bg-background text-muted',
    icon: null,
  },
}

function HeatMapLegend() {
  const order: DayLevel[] = ['red', 'yellow', 'green', 'grey']
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted" aria-label="Legend">
      {order.map((level) => {
        const meta = LEVEL_META[level]
        const Icon = meta.icon
        return (
          <li key={level} className="inline-flex items-center gap-1.5">
            <span
              className={`inline-flex h-4 w-4 items-center justify-center rounded ${meta.swatchClass}`}
              aria-hidden
            >
              {Icon ? <Icon className="h-2.5 w-2.5" strokeWidth={3} /> : null}
            </span>
            <span className="first-letter:uppercase">{meta.label}</span>
          </li>
        )
      })}
    </ul>
  )
}
