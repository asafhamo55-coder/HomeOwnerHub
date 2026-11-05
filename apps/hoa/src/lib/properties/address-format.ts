/**
 * ⚠ CROSS-PACKAGE CONSTRAINT: this file is shared with `packages/jobs`
 * (see the note at the top of normalize-address.ts). It must have NO imports
 * at all: no `@/` aliases, no `server-only`, no Next modules.
 *
 * One standard address format, after USPS Publication 28:
 *
 *   1234 Peachtree St NE, Apt 5, Atlanta, GA 30309
 *
 * Pure and idempotent: formatting a formatted address changes nothing.
 * It never guesses. A part that is missing or not recognised stays as the
 * person typed it (trimmed, single spaces). Only these things change:
 *
 *   - the street suffix and directionals ("Street" to "St", "Northeast" to "NE")
 *   - unit designators ("Apartment 5" to "Apt 5", "Suite" to "Ste")
 *   - capitals: ALL CAPS and all lowercase get title case; mixed case
 *     ("McDonald", "DeKalb") is left alone
 *   - a state name to its 2-letter code, only when it is plainly the state
 *   - a ZIP to 5 digits or ZIP+4, only when it is plainly a ZIP
 */

// ─── Tables ──────────────────────────────────────────────────────────

const SUFFIXES: Record<string, string> = {
  alley: 'Aly', aly: 'Aly',
  avenue: 'Ave', ave: 'Ave', av: 'Ave', aven: 'Ave', avenu: 'Ave',
  bend: 'Bend',
  boulevard: 'Blvd', blvd: 'Blvd', boul: 'Blvd',
  bridge: 'Brg', brg: 'Brg',
  circle: 'Cir', cir: 'Cir', circ: 'Cir',
  court: 'Ct', ct: 'Ct', crt: 'Ct',
  cove: 'Cv', cv: 'Cv',
  creek: 'Crk', crk: 'Crk',
  crescent: 'Cres', cres: 'Cres',
  crossing: 'Xing', xing: 'Xing',
  drive: 'Dr', dr: 'Dr', drv: 'Dr',
  estates: 'Ests', ests: 'Ests',
  expressway: 'Expy', expy: 'Expy',
  freeway: 'Fwy', fwy: 'Fwy',
  glen: 'Gln', gln: 'Gln',
  green: 'Grn', grn: 'Grn',
  grove: 'Grv', grv: 'Grv',
  harbor: 'Hbr', hbr: 'Hbr',
  heights: 'Hts', hts: 'Hts',
  highway: 'Hwy', hwy: 'Hwy',
  hill: 'Hl', hl: 'Hl',
  hills: 'Hls', hls: 'Hls',
  hollow: 'Holw', holw: 'Holw',
  junction: 'Jct', jct: 'Jct',
  knoll: 'Knl', knl: 'Knl',
  lake: 'Lk', lk: 'Lk',
  landing: 'Lndg', lndg: 'Lndg',
  lane: 'Ln', ln: 'Ln',
  loop: 'Loop',
  manor: 'Mnr', mnr: 'Mnr',
  meadow: 'Mdw', mdw: 'Mdw',
  meadows: 'Mdws', mdws: 'Mdws',
  mountain: 'Mtn', mtn: 'Mtn',
  orchard: 'Orch', orch: 'Orch',
  park: 'Park',
  parkway: 'Pkwy', pkwy: 'Pkwy', pkway: 'Pkwy', parkwy: 'Pkwy',
  pass: 'Pass',
  path: 'Path',
  pike: 'Pike',
  place: 'Pl', pl: 'Pl',
  plaza: 'Plz', plz: 'Plz',
  point: 'Pt', pt: 'Pt',
  ridge: 'Rdg', rdg: 'Rdg',
  road: 'Rd', rd: 'Rd',
  row: 'Row',
  run: 'Run',
  square: 'Sq', sq: 'Sq',
  street: 'St', st: 'St', str: 'St',
  springs: 'Spgs', spgs: 'Spgs',
  station: 'Sta', sta: 'Sta',
  terrace: 'Ter', ter: 'Ter', terr: 'Ter',
  trace: 'Trce', trce: 'Trce',
  trail: 'Trl', trl: 'Trl',
  turnpike: 'Tpke', tpke: 'Tpke',
  valley: 'Vly', vly: 'Vly',
  view: 'Vw', vw: 'Vw',
  village: 'Vlg', vlg: 'Vlg',
  walk: 'Walk',
  way: 'Way',
}

const DIRECTIONALS: Record<string, string> = {
  north: 'N', n: 'N',
  south: 'S', s: 'S',
  east: 'E', e: 'E',
  west: 'W', w: 'W',
  northeast: 'NE', ne: 'NE',
  northwest: 'NW', nw: 'NW',
  southeast: 'SE', se: 'SE',
  southwest: 'SW', sw: 'SW',
}

/** Unit designators that take an identifier ("Apt 5"). */
const UNIT_DESIGNATORS: Record<string, string> = {
  apartment: 'Apt', apt: 'Apt',
  suite: 'Ste', ste: 'Ste',
  unit: 'Unit',
  building: 'Bldg', bldg: 'Bldg',
  room: 'Rm', rm: 'Rm',
  space: 'Spc', spc: 'Spc',
  lot: 'Lot',
}

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC',
  florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL',
  indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'puerto rico': 'PR', guam: 'GU', 'american samoa': 'AS',
  'virgin islands': 'VI', 'northern mariana islands': 'MP',
}
const STATE_CODES = new Set([...Object.values(STATES), 'AA', 'AE', 'AP'])

/** Words that stay capitalised when the whole address was typed in caps. */
const KEEP_UPPER = new Set(['PO', 'RR', 'HC', 'USA', 'MLK', 'JFK', 'FDR', 'PGA', 'UGA', 'TVA'])

/** Names with a capital inside, restored when the input is all caps or all lowercase. */
const KNOWN_CASED: Record<string, string> = {
  dekalb: 'DeKalb', desoto: 'DeSoto', deleon: 'DeLeon', lagrange: 'LaGrange', macarthur: 'MacArthur',
  macdonald: 'MacDonald', macdougall: 'MacDougall', macgregor: 'MacGregor', mackenzie: 'MacKenzie',
}

/** Lowercase inside a name unless it comes first ("Avenue of the Americas"). */
const SMALL_WORDS = new Set(['of', 'the', 'and'])

/** Road-route prefixes: "GA-400", "US-41", and "SR 9" when a number follows. */
const ROUTE_WORDS = new Set(['sr', 'us', 'ga', 'cr', 'fm', 'i', 'ih', 'nc', 'sc'])
const ROUTE_WITH_NUMBER = /^(ga|us|sr|cr|fm|i|ih|nc|sc)-\d+[a-z]?$/i

/** A 2-3 letter all-caps word with no vowel is an acronym ("MLK"), not a shout. */
const isAcronym = (w: string): boolean => /^[A-Z]{2,3}$/.test(w) && !/[AEIOU]/.test(w) && !['JR', 'SR', 'MR', 'MS', 'ST', 'DR'].includes(w)

// ─── Small helpers ───────────────────────────────────────────────────

const squish = (s: string): string => s.replace(/\s+/g, ' ').trim()
const hasLower = (s: string): boolean => /[a-z]/.test(s)
const hasLetter = (s: string): boolean => /[a-z]/i.test(s)
/** Letters only, lowercased, for table lookups ("St." and "st" both give "st"). */
const key = (s: string): string => s.toLowerCase().replace(/[.,]/g, '')

/** Case one word: ordinals and house-number letters, then title case. */
function caseWord(word: string, shouting: boolean): string {
  if (!hasLetter(word)) return word
  const upper = word.toUpperCase()
  if (KEEP_UPPER.has(upper.replace(/\./g, ''))) return upper.replace(/\./g, '')
  if (ROUTE_WITH_NUMBER.test(word)) return upper
  if (word === upper && isAcronym(word)) return word
  const ordinal = /^(\d+)(st|nd|rd|th)$/i.exec(word)
  if (ordinal) return `${ordinal[1]}${ordinal[2].toLowerCase()}`
  if (/^\d/.test(word)) {
    // House numbers like "12a" or "12-B": the letter is capital.
    return word.replace(/[a-z]+/gi, (m) => (m.length === 1 ? m.toUpperCase() : m))
  }
  if (word.length === 1) return word.toUpperCase()
  // Mixed case ("McDonald", "DeKalb", "MLK") is on purpose, unless the whole
  // address is in caps.
  if (hasLower(word) && word !== word.toLowerCase()) return word
  if (!shouting && word === upper && word !== word.toLowerCase()) return word
  const lower = word.toLowerCase()
  const known = KNOWN_CASED[lower]
  if (known) return known
  // Capital after a hyphen, a slash, or a one-letter apostrophe prefix (O'Neil).
  return lower
    .replace(/^mc([a-z]{3,})$/, (_m, rest: string) => `Mc${rest.charAt(0).toUpperCase()}${rest.slice(1)}`)
    .replace(/(^|[-/])([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
    .replace(/^([A-Za-z])'([a-z])/,(_m, a: string, b: string) => `${a.toUpperCase()}'${b.toUpperCase()}`)
}

function caseWords(text: string, shouting: boolean): string {
  return squish(text)
    .split(' ')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : caseWord(w, shouting)))
    .join(' ')
}

function isShouting(text: string): boolean {
  return hasLetter(text) && !hasLower(text)
}

// ─── Units ───────────────────────────────────────────────────────────

function formatUnitId(id: string): string {
  const bare = id.replace(/[.,]+$/, '')
  if (/^[a-z0-9-]{1,5}$/i.test(bare) && (/\d/.test(bare) || bare.length === 1)) return bare.toUpperCase()
  return bare
}

/**
 * Format a unit: "apartment 5" gives "Apt 5", "# 5" gives "#5", "5" gives "#5".
 * Anything that is not a designator plus an identifier, or a bare identifier,
 * is returned trimmed and as typed.
 */
export function formatUnit(raw: string | null | undefined): string {
  const text = squish(raw ?? '')
  if (!text) return ''
  const hash = /^#\s*(\S.*)$/.exec(text)
  if (hash) return `#${formatUnitId(hash[1])}`
  const words = text.split(' ')
  const designator = UNIT_DESIGNATORS[key(words[0])]
  if (designator && words.length === 2 && words[1].startsWith('#') && words[1].length > 1) {
    return `${designator} ${formatUnitId(words[1].slice(1))}`
  }
  if (designator && words.length === 2) return `${designator} ${formatUnitId(words[1])}`
  if (designator && words.length > 2 && words[1] === '#') return `${designator} ${formatUnitId(words.slice(2).join(' '))}`
  if (words.length === 1 && /^[a-z0-9-]{1,5}$/i.test(text) && /\d/.test(text)) return `#${formatUnitId(text)}`
  return text
}

/** Splits an inline unit off a street line: "12 Main St Apt 5" gives the unit "Apt 5". */
function splitInlineUnit(words: string[]): { street: string[]; unit: string | null } {
  const last = words[words.length - 1]
  // "Apt #4" and "Apt # 4": the designator and the number are one unit.
  if (words.length >= 4 && last?.startsWith('#') && last.length > 1) {
    const des = UNIT_DESIGNATORS[key(words[words.length - 2])]
    if (des) return { street: words.slice(0, -2), unit: `${des} ${formatUnitId(last.slice(1))}` }
  }
  if (words.length >= 5 && words[words.length - 2] === '#') {
    const des = UNIT_DESIGNATORS[key(words[words.length - 3])]
    if (des) return { street: words.slice(0, -3), unit: `${des} ${formatUnitId(last)}` }
  }
  // "# 5" / "#5" at the end.
  if (words.length >= 3 && last?.startsWith('#') && last.length > 1) {
    return { street: words.slice(0, -1), unit: formatUnit(last) }
  }
  if (words.length >= 4 && words[words.length - 2] === '#') {
    return { street: words.slice(0, -2), unit: formatUnit(`# ${last}`) }
  }
  // "Apt 5" as the last two words, after at least a number and a street word.
  if (words.length >= 4) {
    const des = UNIT_DESIGNATORS[key(words[words.length - 2])]
    if (des) return { street: words.slice(0, -2), unit: `${des} ${formatUnitId(last)}` }
  }
  return { street: words, unit: null }
}

// ─── Street line ─────────────────────────────────────────────────────

function formatStreetWords(words: string[], shouting: boolean): string[] {
  const out = words.map((w) => w)
  const numbered = /^\d/.test(words[0] ?? '')
  const start = numbered ? 1 : 0
  let end = out.length

  // Trailing directional ("Peachtree St NE"), only when a suffix precedes it.
  let postdir: string | null = null
  const lastDir = DIRECTIONALS[key(out[end - 1] ?? '')]
  if (lastDir && end - 1 > start + 1 && SUFFIXES[key(out[end - 2])]) {
    postdir = lastDir
    end -= 1
  }

  // Street suffix, with at least one name word before it.
  let suffixAt = -1
  const sfx = SUFFIXES[key(out[end - 1] ?? '')]
  // "The Lake" is a name, not "The" + a suffix: a suffix word that is the only
  // name word after "The" stays as typed.
  const onlyAfterThe = end - 1 === start + 1 && key(out[start] ?? '') === 'the'
  if (sfx && end - 1 > start && !onlyAfterThe) {
    out[end - 1] = sfx
    suffixAt = end - 1
  }

  // Leading directional ("123 North Main Street"), only when a name and a
  // suffix follow, so "123 North Ave" keeps "North" as the street name.
  let predirAt = -1
  const firstDir = DIRECTIONALS[key(out[start] ?? '')]
  if (firstDir && suffixAt !== -1 && suffixAt - start >= 2) {
    out[start] = firstDir
    predirAt = start
  }

  for (let i = 0; i < end; i += 1) {
    if (i === suffixAt || i === predirAt) continue
    const w = out[i].replace(/[,]+$/, '')
    if (i > start && SMALL_WORDS.has(w.toLowerCase())) {
      out[i] = w.toLowerCase()
    } else if (ROUTE_WORDS.has(key(w)) && /^\d/.test(out[i + 1] ?? '')) {
      out[i] = w.replace(/\./g, '').toUpperCase()
    } else {
      out[i] = caseWord(w, shouting)
    }
  }
  if (postdir) out[end] = postdir
  return out
}

/** Format one street line (no city, state or ZIP). Unit stays in, as a comma part. */
function formatStreetPart(raw: string, shouting: boolean): { line: string; unit: string | null } {
  const words = squish(raw).split(' ').filter(Boolean)
  if (words.length === 0) return { line: '', unit: null }
  const { street, unit } = splitInlineUnit(words)
  return { line: squish(formatStreetWords(street, shouting).join(' ')), unit }
}

/** Format a street line: "1234 peachtree street northeast" gives "1234 Peachtree St NE". */
export function formatStreet(raw: string | null | undefined): string {
  const text = squish(raw ?? '')
  if (!text) return ''
  const { line, unit } = formatStreetPart(text, isShouting(text))
  return unit ? `${line}, ${unit}` : line
}

// ─── State and ZIP ───────────────────────────────────────────────────

/** "Georgia" or "ga" gives "GA"; anything else is returned as typed. */
export function formatState(raw: string | null | undefined): string {
  const text = squish(raw ?? '').replace(/\.$/, '')
  if (!text) return ''
  const fromName = STATES[text.toLowerCase()]
  if (fromName) return fromName
  const code = text.toUpperCase()
  return STATE_CODES.has(code) ? code : squish(raw ?? '')
}

/** "303091234" or "30309 1234" gives "30309-1234"; a 5-digit ZIP stays; anything else is as typed. */
export function formatZip(raw: string | null | undefined): string {
  const text = squish(raw ?? '')
  if (/^\d{5}$/.test(text)) return text
  const plus4 = /^(\d{5})[-\s]?(\d{4})$/.exec(text)
  return plus4 ? `${plus4[1]}-${plus4[2]}` : text
}

const ZIP_TAIL = /(?:^|\s)(\d{5}(?:[-\s]?\d{4})?)$/

function stateOnly(text: string): string | null {
  const t = squish(text).replace(/\.$/, '')
  if (!t) return null
  const name = STATES[t.toLowerCase()]
  if (name) return name
  return /^[A-Za-z]{2}$/.test(t) && STATE_CODES.has(t.toUpperCase()) ? t.toUpperCase() : null
}

/** The longest state at the end of `words`, as { state, used }, or null. */
function trailingState(words: string[]): { state: string; used: number } | null {
  for (let n = Math.min(4, words.length); n >= 1; n -= 1) {
    const tail = words.slice(words.length - n).join(' ')
    const st = n === 1 ? stateOnly(tail) : STATES[tail.toLowerCase()] ?? null
    if (st) return { state: st, used: n }
  }
  return null
}

// ─── Whole address ───────────────────────────────────────────────────

export interface AddressParts {
  line1: string
  line2: string
  city: string
  state: string
  zip: string
}

export interface AddressInput {
  line1?: string | null
  line2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
}

const EMPTY: AddressParts = { line1: '', line2: '', city: '', state: '', zip: '' }

function joinParts(p: AddressParts): string {
  const stateZip = [p.state, p.zip].filter(Boolean).join(' ')
  return [p.line1, p.line2, p.city, stateZip].filter(Boolean).join(', ')
}

/** Format an address given as separate fields. */
export function formatAddressFields(input: AddressInput): AddressParts {
  const line1Raw = squish(input.line1 ?? '')
  const { line, unit } = formatStreetPart(line1Raw, isShouting(line1Raw))
  const line2 = formatUnit(input.line2)
  const cityRaw = squish(input.city ?? '')
  return {
    line1: line,
    // An inline unit and a separate line 2 can both exist; keep both.
    line2: [unit, line2].filter((u): u is string => Boolean(u)).join(', '),
    city: cityRaw ? caseWords(cityRaw, isShouting(cityRaw)) : '',
    state: formatState(input.state),
    zip: formatZip(input.zip),
  }
}

/**
 * Parse and format a one-line address ("105 springwood parkway, atlanta, georgia 30067").
 * Returns the parts. Without a clearly recognised state or ZIP at the end, only
 * the street part and any unit part are formatted and the rest stays as typed.
 */
export function formatAddress(raw: string | null | undefined): AddressParts {
  const text = squish((raw ?? '').replace(/\s*,\s*/g, ', ').replace(/(, )+/g, ', ').replace(/^, |,$|, $/g, ''))
  if (!text) return { ...EMPTY }
  const shouting = isShouting(text)
  const segments = text.split(', ').filter(Boolean)

  let state = ''
  let zip = ''
  let city = ''
  let streetSegs = segments

  // Only a comma-separated tail can be read as city, state and ZIP. A single
  // segment is a street line and is never guessed at.
  if (segments.length > 1) {
    const last = segments[segments.length - 1]
    const zipMatch = ZIP_TAIL.exec(last)
    const rest = zipMatch ? last.slice(0, last.length - zipMatch[1].length).trim() : last
    const words = rest ? rest.split(' ') : []
    const st = words.length ? trailingState(words) : null
    // With no ZIP, a lone last segment is a state only after a street AND a
    // city (3 or more segments): a full name ("Georgia") or a 2-letter code in
    // any case ("ga") becomes the code. With just two segments it stays as
    // typed, since "Washington", "In" and "Or" are more likely a city or a word.
    // A unit segment ("Apt 2", "#4") is not a city, so it does not count toward the 3:
    // "100 Main St, Apt 2, Washington" is still just street plus one word.
    const isUnitSegment = (s: string) => s.startsWith('#') || Boolean(UNIT_DESIGNATORS[key(s.split(' ')[0] ?? '')])
    const placeSegments = segments.filter((s, i) => i === 0 || !isUnitSegment(s)).length
    const loneState = st && !zipMatch && st.used === words.length && placeSegments >= 3
    if (st && (zipMatch || loneState)) {
      // "<city> <state> <zip>", "<state> <zip>" or "<state>" in the last segment.
      state = st.state
      if (zipMatch) zip = formatZip(zipMatch[1])
      city = words.slice(0, words.length - st.used).join(' ')
      streetSegs = segments.slice(0, -1)
    } else if (zipMatch && !rest) {
      // A segment that is only a ZIP: "..., Atlanta, GA, 30309" or "..., Atlanta, 30309".
      zip = formatZip(zipMatch[1])
      streetSegs = segments.slice(0, -1)
      const prev = streetSegs.length > 1 ? stateOnly(streetSegs[streetSegs.length - 1]) : null
      if (prev) {
        state = prev
        streetSegs = streetSegs.slice(0, -1)
      }
    }
    if (zip || state) {
      if (!city && streetSegs.length > 1) {
        city = streetSegs[streetSegs.length - 1]
        streetSegs = streetSegs.slice(0, -1)
      }
    }
  }

  const { line, unit } = formatStreetPart(streetSegs[0] ?? '', shouting)
  const extras = streetSegs.slice(1).map((s) =>
    s.startsWith('#') || UNIT_DESIGNATORS[key(s.split(' ')[0] ?? '')] ? formatUnit(s) : caseWords(s, shouting),
  )
  return {
    line1: line,
    line2: [unit, ...extras].filter((s): s is string => Boolean(s)).join(', '),
    city: city ? caseWords(city, shouting) : '',
    state,
    zip,
  }
}

/** One line: "1234 Peachtree St NE, Apt 5, Atlanta, GA 30309". */
export function formatAddressLine(raw: string | null | undefined, unit?: string | null): string {
  const parts = formatAddress(raw)
  const u = formatUnit(unit ?? '')
  if (u) {
    const dup = parts.line2 === u || parts.line2.toLowerCase().split(', ').includes(u.toLowerCase())
    if (!dup) parts.line2 = parts.line2 ? `${parts.line2}, ${u}` : u
  }
  return joinParts(parts)
}

/**
 * What to store when a person saves an address: the one-line standard form, or
 * the input as typed (trimmed) when formatting leaves nothing.
 */
export function standardAddress(raw: string): string {
  return formatAddressLine(raw) || squish(raw)
}

/** Two lines for a mailing block: street (and unit), then "City, ST ZIP". */
export function formatAddressLines(raw: string | null | undefined, unit?: string | null): [string, string] {
  const parts = formatAddress(raw)
  const u = formatUnit(unit ?? '')
  let line2 = parts.line2
  if (u && !line2.toLowerCase().split(', ').includes(u.toLowerCase())) line2 = line2 ? `${line2}, ${u}` : u
  const first = [parts.line1, line2].filter(Boolean).join(', ')
  const stateZip = [parts.state, parts.zip].filter(Boolean).join(' ')
  const second = [parts.city, stateZip].filter(Boolean).join(', ')
  return [first, second]
}

/** The street line only (what list rows show), formatted. Replaces cutting at the first comma. */
export function formatStreetOnly(raw: string | null | undefined): string {
  return formatAddress(raw).line1
}
