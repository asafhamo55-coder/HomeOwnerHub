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
        <p className="text-xs text-muted-fg">
          {format(start, 'MMM yyyy')} – {format(end, 'MMM yyyy')} · red = overdue / yellow = within 3
          days / green = clean
        </p>
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
      <p className="mb-2 text-sm font-medium text-muted">{label}</p>
      <div className="grid grid-cols-7 gap-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div
            key={`hdr-${i}`}
            className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-fg"
          >
            {d}
          </div>
        ))}
        {padded.map((cell, idx) => {
          if (!cell) return <div key={`pad-${idx}`} className="h-8" aria-hidden />
          const isToday = isSameDay(cell.date, today)
          return (
            <div
              key={cell.date.toISOString()}
              title={
                cell.notes.length === 0
                  ? format(cell.date, 'PP')
                  : `${format(cell.date, 'PP')} · ${cell.notes.join('; ')}`
              }
              className={`relative flex h-8 items-center justify-center rounded-md text-xs font-medium ${
                cell.level === 'red'
                  ? 'bg-destructive/20 text-destructive'
                  : cell.level === 'yellow'
                    ? 'bg-amber-200 text-amber-900'
                    : cell.level === 'green'
                      ? 'bg-emerald-200 text-emerald-900'
                      : 'bg-background text-muted-fg'
              } ${isToday ? 'ring-2 ring-primary' : ''}`}
            >
              {cell.date.getDate()}
            </div>
          )
        })}
      </div>
    </div>
  )
}
