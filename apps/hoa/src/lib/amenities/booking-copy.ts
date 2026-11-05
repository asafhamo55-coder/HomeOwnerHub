// Plain words for the resident booking flow. Pure: no rules live here, only
// wording and layout helpers. The rules stay in model.ts and the server.

import { addCalendarDays } from '@/lib/association-time'
import { hourLabel, monthGrid, type Amenity, type DayView, type MonthCell } from './model'

/** 9 -> "9:00 am", 14 -> "2:00 pm". */
export const timeLabel = (hour: number): string => hourLabel(hour).replace(' AM', ' am').replace(' PM', ' pm')

/** 8 -> "8 am", 22 -> "10 pm". */
export const shortHour = (hour: number): string => timeLabel(hour).replace(':00', '')

export const hoursWord = (n: number): string => (n === 1 ? '1 hour' : `${n} hours`)

/** "Open 8 am to 10 pm. Up to 3 hours. Book up to 30 days ahead." */
export function plainRules(a: Amenity): string {
  const open = a.weeklyHours === null ? `Open ${shortHour(a.openHour)} to ${shortHour(a.closeHour)}.` : 'Hours are different on some days.'
  const people = a.capacity ? ` Holds up to ${a.capacity} people.` : ''
  const notice = a.minNoticeHours > 0 ? ` Book at least ${hoursWord(a.minNoticeHours)} before.` : ''
  return `${open} Up to ${hoursWord(a.maxHours)}. Book up to ${a.advanceDays} days ahead.${notice}${people}`
}

/** "Saturday, November 8" for an association-local date. */
export function longDayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  )
}

/** "November 2026" for a 'YYYY-MM' month. */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(new Date(Date.UTC(y, m - 1, 1)))
}

export const nextMonth = (month: string): string => addCalendarDays(`${month}-01`, 32).slice(0, 7)
export const prevMonth = (month: string): string => addCalendarDays(`${month}-01`, -1).slice(0, 7)

/** Weeks for the month grid (Sunday first). Layout only. */
export function monthWeeks(month: string, timeZone: string): MonthCell[][] {
  return monthGrid({ month, timeZone, reservations: [] })
}

export const WEEKDAY_HEADS = [
  { short: 'Su', long: 'Sunday' },
  { short: 'Mo', long: 'Monday' },
  { short: 'Tu', long: 'Tuesday' },
  { short: 'We', long: 'Wednesday' },
  { short: 'Th', long: 'Thursday' },
  { short: 'Fr', long: 'Friday' },
  { short: 'Sa', long: 'Saturday' },
]

/** What a day cell says to a screen reader. */
export function dayAria(day: string, view: DayView | undefined, today: string): string {
  let state: string
  if (!view) state = day < today ? 'already passed' : 'not open for booking yet'
  else if (view.status === 'open') state = 'has free times'
  else if (view.status === 'full') state = 'fully booked'
  else if (view.status === 'closed') state = 'closed'
  else if (view.status === 'past') state = 'already passed'
  else state = 'too far ahead to book'
  return `${longDayLabel(day)}${day === today ? ', today' : ''}, ${state}`
}

export const SLOT_WORDS = { free: 'Free', taken: 'Booked', past: 'Passed', too_soon: 'Too soon' } as const

/** "Clubhouse, Saturday, November 8, 2:00 pm to 4:00 pm" */
export function reviewSentence(name: string, day: string, start: number, end: number): string {
  return `${name}, ${longDayLabel(day)}, ${timeLabel(start)} to ${timeLabel(end)}`
}

export function approvalLine(requiresApproval: boolean): string {
  return requiresApproval ? 'The board will confirm this booking. We’ll let you know.' : 'This booking is confirmed right away.'
}

export function cancelLine(cutoffHours: number): string {
  return cutoffHours > 0
    ? `You can cancel on your own until ${hoursWord(cutoffHours)} before it starts. After that, please ask the board.`
    : 'You can cancel any time before it starts.'
}
