// Florida — Chapter 720 (Homeowners' Association Act), verbatim, from the
// Florida Senate's official statutes site.
//
// Source: https://www.flsenate.gov/Laws/Statutes/<year>/Chapter720/All
// returns server-rendered semantic HTML. Each section in the body is a
// `<div class="Section">` holding a `SectionNumber`, a `Catchline`, a
// `SectionBody` (nested `Subsection` / `Paragraph` / `SubParagraph` /
// `SubSubParagraph` divs) and then `History` / `Note` blocks.
//
// Probed 2026-10-15: the 2025 and 2026 editions each hold 36 sections.
// (The 2026-08-18 design said 72; that figure counted every
// `class="SectionNumber"`, and each number appears twice — once in the
// chapter's index, once in the body.)
//
// History and Note blocks are excluded from the body: they are editorial
// annotations, not statute text, and the history line is rewritten
// whenever the section is amended, which the body hash already catches.

import { normalizeStatuteBody } from './normalize'
import type {
  FetchedSections,
  HttpGetter,
  StateLawAdapter,
  StatuteRecord,
} from './types'
import { SourceUnavailableError } from './types'

const BASE = 'https://www.flsenate.gov/Laws/Statutes'
const CHAPTER = '720'

/** A chapter page with fewer sections than this is treated as broken, not
 *  as a mass repeal. Chapter 720 has had 36 sections in recent editions. */
export const FL_MIN_SECTIONS = 30

/**
 * Static citation→category map. Vocabulary is the one the GA seed and
 * scripts/state-law-sources.ts established (governance, meetings, records,
 * dues, enforcement). Unmapped sections get null rather than a guess.
 */
export const FL_CATEGORY: Readonly<Record<string, string>> = {
  // Catchlines as of the 2026 edition.
  '720.301': 'governance', // Definitions
  '720.3015': 'governance', // Short title
  '720.302': 'governance', // Purposes, scope, and application
  '720.303': 'records', // Association powers and duties; meetings of board; official records; budgets; ...
  '720.3032': 'records', // Notice of association information; preservation from Marketable Record Title Act
  '720.3033': 'governance', // Officers and directors
  '720.3035': 'enforcement', // Architectural control covenants; parcel owner improvements
  '720.304': 'enforcement', // Right of owners to peaceably assemble; display of flags; SLAPP suits prohibited
  '720.3045': 'enforcement', // Installation, display, and storage of items
  '720.305': 'enforcement', // Obligations of members; ... levy of fines and suspension of use rights
  '720.3053': 'governance', // Failure to fill vacancies on board ...; appointment of receiver
  '720.3055': 'governance', // Contracts for products and services; in writing; bids; exceptions
  '720.306': 'meetings', // Meetings of members; voting and election procedures; amendments
  '720.3065': 'meetings', // Fraudulent voting activities relating to association elections
  '720.307': 'governance', // Transition of association control in a community
  '720.3075': 'governance', // Prohibited clauses in association documents
  '720.308': 'dues', // Assessments and charges
  '720.3085': 'dues', // Payment for assessments; lien claims
  '720.30851': 'dues', // Estoppel certificates
  '720.3086': 'records', // Financial report
  '720.309': 'governance', // Agreements entered into by the association
  '720.31': 'governance', // Recreational leaseholds; right to acquire; escalation clauses
  '720.311': 'enforcement', // Dispute resolution
  '720.312': 'governance', // Declaration of covenants; survival after tax deed or foreclosure
  '720.313': 'governance', // Receivership notification
  '720.315': 'dues', // Passage of special assessments
  '720.316': 'governance', // Association emergency powers
  '720.317': 'meetings', // Electronic voting
  '720.318': 'enforcement', // First responder vehicles
  '720.401': 'records', // Prospective purchasers ...; disclosure required
  '720.402': 'governance', // Publication of false and misleading information
  '720.403': 'governance', // Preservation of communities; revival of declaration of covenants
  '720.404': 'governance', // Eligible communities; requirements for revival of declaration
  '720.405': 'governance', // Organizing committee; parcel owner approval
  '720.406': 'governance', // Department of Commerce; submission; review and determination
  '720.407': 'governance', // Recording; notice of recording; applicability and effective date
}

export function floridaCitation(sectionNumber: string): string {
  return `Fla. Stat. § ${sectionNumber}`
}

const CITATION_RE = /^Fla\. Stat\. § 720\.\d+$/

export function chapterUrl(year: number): string {
  return `${BASE}/${year}/Chapter${CHAPTER}/All`
}

export function sectionUrl(year: number, sectionNumber: string): string {
  return `${BASE}/${year}/${sectionNumber}`
}

// ─── HTML → records ──────────────────────────────────────────────────

const VOID_TAGS = new Set(['br', 'img', 'hr', 'input', 'meta', 'link', 'wbr', 'col', 'area', 'source'])
/** Elements whose boundaries are line breaks in the extracted body. */
const BLOCK_TAGS = new Set(['div', 'p', 'br', 'li', 'tr', 'table', 'ul', 'ol'])
/** Classes whose entire subtree is not statute text. */
const SKIP_CLASSES = new Set(['History', 'Note'])

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  sect: '§',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, ent: string) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[ent] ?? whole
  })
}

function classesOf(attrs: string): string[] {
  const m = attrs.match(/\bclass\s*=\s*"([^"]*)"/) ?? attrs.match(/\bclass\s*=\s*'([^']*)'/)
  return m ? m[1].split(/\s+/).filter(Boolean) : []
}

type Mode = 'none' | 'number' | 'catchline' | 'body' | 'skip'

interface Frame {
  tag: string
  mode: Mode
}

interface RawSection {
  number: string
  catchline: string
  body: string
}

/**
 * Extracts the body sections of a chapter page. Index entries
 * (`IndexItem`) also carry a SectionNumber, but they are not inside a
 * `div.Section`, so they are never mistaken for statute text.
 */
export function parseChapterSections(html: string): RawSection[] {
  const sections: RawSection[] = []
  const token = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)/g

  // `stack` is non-empty only while inside a div.Section.
  let stack: Frame[] = []
  let current: { number: string; catchline: string; lines: string[]; line: string } | null = null

  const breakLine = (): void => {
    if (!current) return
    if (current.line.trim()) current.lines.push(current.line)
    current.line = ''
  }

  for (const m of html.matchAll(token)) {
    const [whole, closing, rawTag, attrs, text] = m
    if (whole.startsWith('<!--')) continue

    if (text !== undefined) {
      if (!current) continue
      const mode = stack.length ? stack[stack.length - 1].mode : 'none'
      const decoded = decodeEntities(text)
      if (mode === 'number') current.number += decoded
      else if (mode === 'catchline') current.catchline += decoded
      else if (mode === 'body') current.line += decoded
      continue
    }

    const tag = rawTag.toLowerCase()
    const selfClosing = /\/\s*$/.test(attrs ?? '') || VOID_TAGS.has(tag)

    if (!current) {
      // Looking for the start of a body section.
      if (!closing && tag === 'div' && classesOf(attrs ?? '').includes('Section')) {
        current = { number: '', catchline: '', lines: [], line: '' }
        stack = [{ tag, mode: 'none' }]
      }
      continue
    }

    if (closing) {
      // Pop to the matching open tag (tolerates stray unclosed spans).
      let idx = stack.length - 1
      while (idx >= 0 && stack[idx].tag !== tag) idx--
      if (idx < 0) continue
      const popped = stack[idx]
      stack = stack.slice(0, idx)
      if (popped.mode === 'body' && BLOCK_TAGS.has(tag)) breakLine()
      if (stack.length === 0) {
        breakLine()
        sections.push({
          number: current.number.replace(/\s+/g, ' ').trim(),
          catchline: current.catchline.replace(/\s+/g, ' ').trim(),
          body: current.lines.join('\n'),
        })
        current = null
      }
      continue
    }

    const parentMode = stack[stack.length - 1].mode
    const classes = classesOf(attrs ?? '')
    let mode: Mode = parentMode
    if (parentMode === 'skip') mode = 'skip'
    else if (classes.some((c) => SKIP_CLASSES.has(c))) mode = 'skip'
    else if (parentMode === 'none' && classes.includes('SectionNumber')) mode = 'number'
    else if (parentMode === 'none' && classes.includes('CatchlineText')) mode = 'catchline'
    else if (parentMode === 'none' && classes.includes('SectionBody')) mode = 'body'
    // The catchline's trailing em dash sits in a sibling span of
    // CatchlineText inside `Catchline`; parentMode 'none' leaves it out.

    if (mode === 'body' && BLOCK_TAGS.has(tag)) breakLine()
    if (!selfClosing) stack.push({ tag, mode })
  }

  return sections
}

export function parseFloridaChapter(html: string, year: number): StatuteRecord[] {
  const records: StatuteRecord[] = []
  for (const raw of parseChapterSections(html)) {
    if (!/^720\.\d+$/.test(raw.number)) continue
    const body = normalizeStatuteBody(raw.body)
    // A section with no body (e.g. a bare "Repealed" stub) is not current
    // law; leaving it out lets the sync retire any stored copy.
    if (!body) continue
    records.push({
      code_citation: floridaCitation(raw.number),
      title: raw.catchline.replace(/[\s—-]+$/, '').replace(/\.$/, ''),
      category: FL_CATEGORY[raw.number] ?? null,
      body,
      source_url: sectionUrl(year, raw.number),
      // flsenate.gov publishes the edition, not per-section effective
      // dates; inventing one would be worse than leaving it null.
      effective_date: null,
    })
  }
  return records
}

// ─── Adapter ────────────────────────────────────────────────────────

export interface FloridaAdapterOptions {
  http: HttpGetter
  /** Defaults to the current UTC year. */
  now?: () => Date
}

/**
 * The newest published edition is fetched: the current calendar year,
 * falling back to the previous year when the current edition is not up yet
 * (flsenate.gov redirects an unpublished year to its index). That is at
 * most two requests per run, spaced by the getter's crawl delay.
 */
export function floridaAdapter(opts: FloridaAdapterOptions): StateLawAdapter {
  const now = opts.now ?? (() => new Date())
  return {
    state: 'FL',
    offline: false,
    covers: (citation) => CITATION_RE.test(citation),
    async fetchSections(): Promise<FetchedSections> {
      const thisYear = now().getUTCFullYear()
      const attempts: string[] = []
      for (const year of [thisYear, thisYear - 1]) {
        const url = chapterUrl(year)
        const res = await opts.http.get(url)
        if (res.status !== 200) {
          attempts.push(`${year}: HTTP ${res.status}`)
          continue
        }
        const records = parseFloridaChapter(res.body, year)
        if (records.length < FL_MIN_SECTIONS) {
          attempts.push(`${year}: ${records.length} sections parsed (< ${FL_MIN_SECTIONS})`)
          continue
        }
        return { sourceName: `flsenate.gov Fla. Stat. Ch. ${CHAPTER} (${year})`, records }
      }
      throw new SourceUnavailableError(
        `flsenate.gov Chapter ${CHAPTER}: no usable edition (${attempts.join('; ')})`,
      )
    },
  }
}
