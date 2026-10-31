import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { FailedNote } from './BreakdownList'
import { HeatMapCalendar, HeatMapLegend } from './HeatMapCalendar'
import { buildHeatMapMonths, formatCalendarDay, type DayCell } from './heat-map-grid'

export type { DayCell, DayLevel } from './heat-map-grid'

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
  /**
   * The association's today, 'YYYY-MM-DD' (BL-043). The cells were judged
   * against it, so the window and the "today" ring use it too. The grid is
   * built from calendar dates (BL-065), never the server's own zone.
   */
  today: string
}

/**
 * 3-month rolling calendar. Each cell is coloured by the worst event on
 * that day AND carries a glyph, and the words live in its accessible name.
 * A coloured day opens its detail below the grid (HeatMapCalendar):
 *   red    = cure deadline elapsed / dues overdue        (alert glyph)
 *   yellow = cure deadline within 3 days / due soon      (clock glyph)
 *   green  = events on this day, all clean               (check glyph)
 *   grey   = no events
 *
 * The page builds the cells server-side from hoa_violations +
 * assessments, so this component is purely visual.
 */
export function ComplianceHeatMap({ cells, failed = false, months = 3, today }: ComplianceHeatMapProps) {
  const grid = buildHeatMapMonths(today, cells, months)

  const counts = { red: 0, yellow: 0 }
  for (const c of cells) {
    if (c.level === 'red') counts.red++
    if (c.level === 'yellow') counts.yellow++
  }

  return (
    <Card>
      <CardHeader className="gap-2 pb-4 cq-sm:flex-row cq-sm:items-start cq-sm:justify-between">
        <div className="space-y-1">
          <CardTitle as="h3">Compliance calendar</CardTitle>
          <p className="text-sm text-muted">
            Cure deadlines and dues dates, {formatCalendarDay(grid.start, 'month')} – {formatCalendarDay(grid.end, 'monthYear')}
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
          <HeatMapCalendar months={grid.months} today={today} />
        )}
      </CardContent>
    </Card>
  )
}
