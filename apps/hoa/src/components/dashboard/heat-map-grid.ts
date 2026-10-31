/**
 * The compliance heat map's grid, built from CALENDAR DATES only (BL-065).
 *
 * It used to be built with date-fns from Date objects, whose getters read
 * the server's own zone: UTC on Vercel, so the grid's month, its weekday
 * padding and each cell's number came from the UTC calendar rather than the
 * association's. Here every date is a 'YYYY-MM-DD' string and every step is
 * Y-M-D arithmetic on Date.UTC with UTC getters, so the machine zone cannot
 * move anything. `today` is the association's today (todayIn its zone).
 *
 * Pure and browser-safe.
 */

export type DayLevel = 'red' | 'yellow' | 'green' | 'grey'

/** One coloured day, keyed by its calendar date. */
export interface DayCell {
  day: string
  level: DayLevel
  notes: string[]
}

export interface HeatMapDay extends DayCell {
  dayOfMonth: number
  isToday: boolean
}

export interface HeatMapMonth {
  /** 'YYYY-MM' */
  key: string
  label: string
  /** Blank cells before the 1st, so it lands under its weekday (Sun = 0). */
  leadingBlanks: number
  days: HeatMapDay[]
}

export interface HeatMapGrid {
  months: HeatMapMonth[]
  /** First and last calendar day drawn. */
  start: string
  end: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

function parts(day: string): [number, number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(day)
  if (!m) throw new Error('heat map: not a YYYY-MM-DD date')
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

const FORMATS = {
  medium: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }),
  month: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }),
  monthYear: new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
  longMonthYear: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
} as const

/** A calendar date as words, read on its own Y-M-D (never shifted by a zone). */
export function formatCalendarDay(day: string, style: keyof typeof FORMATS): string {
  const [y, m, d] = parts(day)
  return FORMATS[style].format(new Date(Date.UTC(y, m - 1, d)))
}

/** `months` calendar months starting with the one `today` is in. */
export function buildHeatMapMonths(today: string, cells: DayCell[], months = 3): HeatMapGrid {
  const [ty, tm] = parts(today)
  const todayDay = today.slice(0, 10)
  const byDay = new Map(cells.map((c) => [c.day, c]))

  const out: HeatMapMonth[] = []
  for (let i = 0; i < months; i++) {
    const first = new Date(Date.UTC(ty, tm - 1 + i, 1))
    const y = first.getUTCFullYear()
    const m = first.getUTCMonth() + 1
    const length = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const days: HeatMapDay[] = []
    for (let d = 1; d <= length; d++) {
      const day = iso(y, m, d)
      const cell = byDay.get(day)
      days.push({
        day,
        dayOfMonth: d,
        level: cell?.level ?? 'grey',
        notes: cell?.notes ?? [],
        isToday: day === todayDay,
      })
    }
    out.push({
      key: `${y}-${pad(m)}`,
      label: FORMATS.longMonthYear.format(first),
      leadingBlanks: first.getUTCDay(),
      days,
    })
  }

  const last = out[out.length - 1]
  return {
    months: out,
    start: out[0]?.days[0]?.day ?? todayDay,
    end: last?.days[last.days.length - 1]?.day ?? todayDay,
  }
}

/** One line of a day's detail: what is due, how many, and where to act. */
export interface DayItem {
  text: string
  level: DayLevel
  href: '/dues' | '/violations'
}

// The notes getComplianceHeatMap writes, one per row, in the order shown.
const NOTE_ITEMS: ReadonlyArray<{
  note: string
  level: DayLevel
  href: DayItem['href']
  text: (n: number) => string
}> = [
  { note: 'dues overdue', level: 'red', href: '/dues', text: (n) => `${plural(n, 'dues charge')} past due and unpaid` },
  { note: 'cure deadline elapsed', level: 'red', href: '/violations', text: (n) => `${plural(n, 'violation')} past the cure deadline and still open` },
  { note: 'dues due within 3 days', level: 'yellow', href: '/dues', text: (n) => `${plural(n, 'dues charge')} due within 3 days, not paid yet` },
  { note: 'cure deadline within 3 days', level: 'yellow', href: '/violations', text: (n) => `${plural(n, 'violation')} with a cure deadline within 3 days` },
  { note: 'dues due', level: 'green', href: '/dues', text: (n) => `${plural(n, 'dues charge')} due, not late yet` },
  { note: 'dues paid', level: 'green', href: '/dues', text: (n) => `${plural(n, 'dues charge')} already paid` },
  { note: 'cure deadline', level: 'green', href: '/violations', text: (n) => `${plural(n, 'violation')} with a cure deadline on this day, still in the cure period` },
  { note: 'cure deadline (resolved)', level: 'green', href: '/violations', text: (n) => `${plural(n, 'violation')} with a cure deadline on this day, already resolved` },
]

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/**
 * A day's raw notes (one per dues charge or violation) as counted lines,
 * worst first, so a green day says what is on track instead of repeating
 * "dues due" once per home. Unknown notes are kept as they are.
 */
export function summarizeDay(notes: readonly string[]): DayItem[] {
  const counts = new Map<string, number>()
  for (const n of notes) counts.set(n, (counts.get(n) ?? 0) + 1)
  const items: DayItem[] = []
  for (const k of NOTE_ITEMS) {
    const n = counts.get(k.note)
    if (n) items.push({ text: k.text(n), level: k.level, href: k.href })
    counts.delete(k.note)
  }
  for (const [note, n] of counts) {
    items.push({ text: n === 1 ? note : `${note} (${n})`, level: 'grey', href: note.includes('dues') ? '/dues' : '/violations' })
  }
  return items
}
