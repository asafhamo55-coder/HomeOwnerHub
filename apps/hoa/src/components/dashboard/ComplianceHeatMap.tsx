import { AlertCircle, Check, Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, cn } from '@homeowner-portal/ui'
import { addDays, format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns'
import { FailedNote } from './BreakdownList'

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
  /**
   * The source read failed. Grey days would then claim "nothing due" for
   * days we know nothing about, so the grid is replaced by a failed note.
   */
  failed?: boolean
  /** Number of months to render. The plan calls for a 3-month rolling view. */
  months?: number
}

/**
 * 3-month rolling calendar. Each cell is coloured by the worst event on
 * that day AND carries a glyph, and the words live in its accessible name:
 *   red    = cure deadline elapsed / dues overdue        (alert glyph)
 *   yellow = cure deadline within 3 days / due soon      (clock glyph)
 *   green  = events on this day, all clean               (check glyph)
 *   grey   = no events
 *
 * The page builds the cells server-side from hoa_violations +
 * assessments, so this component is purely visual.
 */
export function ComplianceHeatMap({ cells, failed = false, months = 3 }: ComplianceHeatMapProps) {
  const today = new Date()
  const start = startOfMonth(today)
  const end = endOfMonth(addDays(start, (months - 1) * 32))

  const monthGrids: { label: string; days: DayCell[] }[] = []
  for (let i = 0; i < months; i++) {
    const monthStart = startOfMonth(addDays(start, i * 32))
    const monthEnd = endOfMonth(monthStart)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd }).map((d) => {
      const cell = cells.find((c) => isSameDay(c.date, d))
      return cell ?? { date: d, level: 'grey' as DayLevel, notes: [] }
    })
    monthGrids.push({ label: format(monthStart, 'MMMM yyyy'), days })
  }

  const counts = { red: 0, yellow: 0 }
  for (const c of cells) {
    if (c.level === 'red') counts.red++
    if (c.level === 'yellow') counts.yellow++
  }

  return (
    <Card>
      <CardHeader className="gap-2 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle as="h3">Compliance calendar</CardTitle>
          <p className="text-sm text-muted">
            Cure deadlines and dues dates, {format(start, 'MMM')} – {format(end, 'MMM yyyy')}
            {!failed && (counts.red > 0 || counts.yellow > 0)
              ? ` · ${counts.red} overdue ${counts.red === 1 ? 'day' : 'days'}, ${counts.yellow} due soon`
              : ''}
          </p>
        </div>
        {failed ? null : <HeatMapLegend />}
      </CardHeader>
      <CardContent>
        {failed ? (
          <FailedNote what="the compliance calendar" />
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {monthGrids.map((m) => (
              <MonthGrid key={m.label} label={m.label} days={m.days} today={today} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MonthGrid({ label, days, today }: { label: string; days: DayCell[]; today: Date }) {
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
          <div key={`hdr-${i}`} className="text-center text-2xs font-semibold uppercase text-muted" aria-hidden>
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
              className={cn(
                'num relative flex h-8 items-center justify-center rounded-md text-xs font-medium',
                meta.cellClass,
                isToday && 'ring-2 ring-ring ring-offset-1 ring-offset-surface',
              )}
            >
              {cell.date.getDate()}
              {Icon ? (
                <Icon className="absolute right-0.5 top-0.5 size-2.5" strokeWidth={3} aria-hidden />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

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

function HeatMapLegend() {
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
