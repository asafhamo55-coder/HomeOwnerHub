/**
 * BL-173: pull the date, time and place out of the one sentence a board
 * member types ("Halloween party Oct 31 at 6pm at the clubhouse").
 *
 * Deliberately small and forgiving: it reads common phrasings, returns ''
 * for anything it is not sure of, and never guesses a year in the past. The
 * draft screen shows every fact in an editable field, so a miss costs the
 * board one tap, never a wrong message.
 *
 * `today` is the association's own calendar day ("YYYY-MM-DD"), passed in
 * so the parse is pure and testable. Pure and client-safe. Nothing here
 * logs: the sentence can name people.
 */

import { cleanFact, isIsoDate, matchOccasion } from './occasions'

export interface ParsedSentence {
  /** "YYYY-MM-DD" or ''. */
  date: string
  /** "HH:mm" or ''. */
  time: string
  place: string
  /** An occasion the words point at, or null. */
  occasionId: string | null
}

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5, june: 6, jun: 6,
  july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9, october: 10, oct: 10,
  november: 11, nov: 11, december: 12, dec: 12,
}
const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
}

const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)'
const DAY_RE = '(sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)'

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toIso(y: number, m: number, d: number): string {
  const iso = `${y}-${pad(m)}-${pad(d)}`
  return isIsoDate(iso) ? iso : ''
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

function dowOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** A month and day with no year: this year, or next when it already passed. */
function monthDay(today: string, m: number, d: number): string {
  const y = Number(today.slice(0, 4))
  const thisYear = toIso(y, m, d)
  if (!thisYear) return ''
  return thisYear >= today ? thisYear : toIso(y + 1, m, d)
}

interface Hit {
  value: string
  start: number
  end: number
}

function findTime(text: string): Hit | null {
  // 6pm, 6:30 p.m., at 6 pm
  let m = /\b(?:at\s+|from\s+|@\s*)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/i.exec(text)
  if (m) {
    let h = Number(m[1])
    const min = Number(m[2] ?? '0')
    if (h < 1 || h > 12 || min > 59) return null
    const pm = m[3]!.toLowerCase().startsWith('p')
    if (h === 12) h = pm ? 12 : 0
    else if (pm) h += 12
    return { value: `${pad(h)}:${pad(min)}`, start: m.index, end: m.index + m[0].length }
  }
  m = /\b(?:at\s+)?(noon|midday)\b/i.exec(text)
  if (m) return { value: '12:00', start: m.index, end: m.index + m[0].length }
  // 18:30 (24 hour)
  m = /\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*\/)/.exec(text)
  if (m) {
    const h = Number(m[1])
    const min = Number(m[2])
    // "at 6:30" with no am/pm: evenings for 1-6, mornings for 7-11.
    const explicit24 = m[1]!.startsWith('0') || h >= 13 || h === 0
    const hour = !explicit24 && h <= 6 ? h + 12 : h
    return { value: `${pad(hour)}:${pad(min)}`, start: m.index, end: m.index + m[0].length }
  }
  // "at 6" alone
  m = /\bat\s+(\d{1,2})(?![\d:/.-]|\s*(?:st|nd|rd|th)\b)(?!\s+[A-Z][a-z]+\s+(?:St|Ave|Rd|Dr|Ln|Ct|Blvd|Way)\b)/.exec(text)
  if (m) {
    const h = Number(m[1])
    if (h < 1 || h > 12) return null
    const hour = h >= 7 && h <= 11 ? h : h === 12 ? 12 : h + 12
    return { value: `${pad(hour)}:00`, start: m.index, end: m.index + m[0].length }
  }
  return null
}

function findDate(text: string, today: string): Hit | null {
  const lower = text
  let m: RegExpExecArray | null

  // October 31st, Oct 31, 2026
  m = new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i').exec(lower)
  if (m) {
    const mo = MONTHS[m[1]!.toLowerCase().replace(/\.$/, '')]
    const d = Number(m[2])
    const y = m[3] ? Number(m[3]) : null
    const iso = mo ? (y ? toIso(y, mo, d) : monthDay(today, mo, d)) : ''
    if (iso) return { value: iso, start: m.index, end: m.index + m[0].length }
  }
  // 31 October, the 31st of October
  m = new RegExp(`\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b(?:,?\\s+(\\d{4}))?`, 'i').exec(lower)
  if (m) {
    const mo = MONTHS[m[2]!.toLowerCase()]
    const d = Number(m[1])
    const y = m[3] ? Number(m[3]) : null
    const iso = mo ? (y ? toIso(y, mo, d) : monthDay(today, mo, d)) : ''
    if (iso) return { value: iso, start: m.index, end: m.index + m[0].length }
  }
  // 10/31 or 10/31/2026 or 10/31/26
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/.exec(lower)
  if (m) {
    const mo = Number(m[1])
    const d = Number(m[2])
    let y: number | null = null
    if (m[3]) y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    const iso = y ? toIso(y, mo, d) : monthDay(today, mo, d)
    if (iso) return { value: iso, start: m.index, end: m.index + m[0].length }
  }
  m = /\b(today|tonight)\b/i.exec(lower)
  if (m) return { value: today, start: m.index, end: m.index + m[0].length }
  m = /\btomorrow\b/i.exec(lower)
  if (m) return { value: addDays(today, 1), start: m.index, end: m.index + m[0].length }
  // this Friday / next Friday / on Friday / Friday
  m = new RegExp(`\\b(?:(this|next|on|by|before)\\s+)?${DAY_RE}\\b`, 'i').exec(lower)
  if (m) {
    const target = WEEKDAYS[m[2]!.toLowerCase()]
    if (target !== undefined) {
      let delta = (target - dowOf(today) + 7) % 7
      if ((m[1] ?? '').toLowerCase() === 'next') delta += 7
      return { value: addDays(today, delta), start: m.index, end: m.index + m[0].length }
    }
  }
  return null
}

function removeRanges(text: string, hits: Array<Hit | null>): string {
  const ranges = hits.filter((h): h is Hit => h !== null).sort((a, b) => b.start - a.start)
  let out = text
  for (const r of ranges) out = `${out.slice(0, r.start)} ${out.slice(r.end)}`
  return out.replace(/\s+/g, ' ')
}

const PLACE_STOP = '(?=\\s*(?:[,.;!?]|\\b(?:on|at|from|for|to|with|because|so|starting|begins|beginning|until|and\\s+(?:all|everyone|please|we))\\b|$))'
const PLACE_RE = new RegExp(
  `\\b(?:at|in|inside|outside|by|near)\\s+((?:the\\s+|our\\s+)?[A-Za-z0-9][A-Za-z0-9'’&.\\- ]{1,58}?)${PLACE_STOP}`,
  'gi',
)

function findPlace(textWithoutWhen: string): string {
  for (const m of textWithoutWhen.matchAll(PLACE_RE)) {
    const candidate = cleanFact(m[1] ?? '', 80).replace(/[\s.,;]+$/, '')
    if (candidate.length < 3) continue
    // A leftover day or month word is a date fragment, not a place.
    if (new RegExp(`^(?:${DAY_RE}|${MONTH_RE}|noon|night|tonight|morning|evening)\\b`, 'i').test(candidate)) continue
    return candidate
  }
  return ''
}

/** The facts in a one-sentence description. Every field may be ''. */
export function parseAnnouncementSentence(sentence: string, today: string): ParsedSentence {
  const text = sentence.replace(/\s+/g, ' ').trim()
  const safeToday = isIsoDate(today) ? today : new Date().toISOString().slice(0, 10)
  const time = findTime(text)
  // Dates first-match over the text with the time cut out, so "6:30" is
  // never read as a date.
  const withoutTime = removeRanges(text, [time])
  const date = findDate(withoutTime, safeToday)
  // Re-run on the original positions for removal: find again on the text
  // with the time removed, then cut the date from that.
  const withoutWhen = removeRanges(withoutTime, [date])
  return {
    date: date?.value ?? '',
    time: time?.value ?? '',
    place: findPlace(withoutWhen),
    occasionId: matchOccasion(text)?.id ?? null,
  }
}
