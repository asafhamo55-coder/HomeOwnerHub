// Texas — Property Code Chapter 209 (Texas Residential Property Owners
// Protection Act) and Chapter 202 (Construction and Enforcement of
// Restrictive Covenants: solar, flags, roofing, religious displays...),
// verbatim, from the Texas Legislative Council's statute files.
//
// statutes.capitol.texas.gov is an Angular app: every page, including the
// old /Docs/PR/htm/PR.209.htm path, returns the same JavaScript shell
// (2026-08-18 design §"Source survey"). The app itself loads each chapter
// from the Council's file server, which serves plain, server-rendered HTML:
//   https://tcss.legis.texas.gov/resources/PR/htm/PR.<chapter>.htm
// (found 2026-10-19 from the app's bundle: FileServerPath; robots.txt on
// that host is 404). One request per chapter, two per run.
//
// Page shape: one `<p>` per paragraph inside a `<pre>`. A section starts
// with a `<p>` whose bold link reads "Sec. 209.006.  CATCHLINE." followed
// by the first paragraph's text; its subsections are the following
// indented `<p>`s; then the history ("Added by Acts …", "Amended by:" and
// a list of "Acts …" lines) closes the section. History is annotation,
// not law, and is excluded from the body. "Text of subsection as amended
// by …" notes are kept: where two versions of a subsection coexist they
// are the only thing telling the reader which is which.

import { decodeEntities } from './florida'
import { normalizeStatuteBody } from './normalize'
import type { FetchedSections, HttpGetter, StateLawAdapter, StatuteRecord } from './types'
import { SourceUnavailableError } from './types'

const FILE_BASE = 'https://tcss.legis.texas.gov/resources/PR/htm'
const PUBLIC_BASE = 'https://statutes.capitol.texas.gov/Docs/PR/htm'

export const TX_CHAPTERS = ['202', '209'] as const
export type TxChapter = (typeof TX_CHAPTERS)[number]

/** Fewer sections than this on a chapter page is a broken page, not a
 *  mass repeal. Counts on 2026-10-20: ch. 202 = 19, ch. 209 = 42. */
export const TX_MIN_SECTIONS: Readonly<Record<TxChapter, number>> = { '202': 15, '209': 35 }

export function texasChapterUrl(chapter: string): string {
  return `${FILE_BASE}/PR.${chapter}.htm`
}

/** The link the official page itself gives each section. */
export function texasSectionUrl(sectionNumber: string): string {
  const chapter = sectionNumber.split('.')[0]
  return `${PUBLIC_BASE}/PR.${chapter}.htm#${sectionNumber}`
}

export function texasCitation(sectionNumber: string): string {
  return `Tex. Prop. Code § ${sectionNumber}`
}

const CITATION_RE = /^Tex\. Prop\. Code § (202|209)\.\d+$/

/** Static citation→category map; same vocabulary as Florida. */
export const TX_CATEGORY: Readonly<Record<string, string>> = {
  // Chapter 202
  '202.001': 'governance', // Definitions
  '202.002': 'governance', // Applicability of chapter
  '202.003': 'governance', // Construction of restrictive covenants
  '202.004': 'enforcement', // Enforcement of restrictive covenants
  '202.005': 'governance', // Withdrawal of signature
  '202.006': 'records', // Public records
  '202.007': 'enforcement', // Certain restrictive covenants prohibited
  '202.008': 'enforcement', // Limitation on fines during residential water restriction
  '202.010': 'enforcement', // Regulation of solar energy devices
  '202.011': 'enforcement', // Regulation of certain roofing materials
  '202.012': 'enforcement', // Flag display
  '202.013': 'enforcement', // Regulation of assembly, association, and speech
  '202.018': 'enforcement', // Regulation of display of certain religious items
  '202.019': 'enforcement', // Standby electric generators
  '202.020': 'enforcement', // Certain sales of beverages by children
  '202.021': 'enforcement', // Regulation of firearms or firearm ammunition
  '202.022': 'enforcement', // Swimming pool enclosures
  '202.023': 'enforcement', // Security measures
  '202.024': 'governance', // Discrimination against tenant based on method of payment prohibited
  // Chapter 209
  '209.001': 'governance', // Short title
  '209.002': 'governance', // Definitions
  '209.003': 'governance', // Applicability of chapter
  '209.004': 'records', // Management certificates
  '209.0041': 'governance', // Adoption or amendment of certain dedicatory instruments
  '209.0042': 'governance', // Methods of providing notices to owners
  '209.005': 'records', // Association records
  '209.00505': 'enforcement', // Architectural review authority
  '209.00506': 'enforcement', // Eligibility to serve on architectural review authority
  '209.00507': 'enforcement', // Solicitation of candidates for architectural review authority
  '209.0051': 'meetings', // Open board meetings
  '209.0052': 'governance', // Association contracts
  '209.0055': 'meetings', // Voting
  '209.0056': 'meetings', // Notice of election or association vote
  '209.0057': 'meetings', // Recount of votes
  '209.0058': 'meetings', // Ballots
  '209.0059': 'meetings', // Right to vote
  '209.00591': 'governance', // Board membership
  '209.00592': 'meetings', // Voting; quorum
  '209.00593': 'meetings', // Election of board members
  '209.00594': 'meetings', // Tabulation of and access to ballots
  '209.006': 'enforcement', // Notice required before enforcement action
  '209.0061': 'enforcement', // Association policy; fines
  '209.0062': 'dues', // Alternative payment schedule for certain assessments
  '209.0063': 'dues', // Priority of payments
  '209.0064': 'dues', // Third party collections
  '209.0065': 'dues', // Credit reporting services
  '209.007': 'enforcement', // Hearing before board; alternative dispute resolution
  '209.008': 'enforcement', // Attorney's fees
  '209.009': 'dues', // Foreclosure sale prohibited in certain circumstances
  '209.0091': 'dues', // Prerequisites to foreclosure
  '209.0092': 'dues', // Judicial foreclosure required
  '209.0093': 'dues', // Removal or adoption of foreclosure authority
  '209.0094': 'dues', // Assessment lien filing
  '209.010': 'dues', // Notice after foreclosure sale
  '209.011': 'dues', // Right of redemption after foreclosure
  '209.012': 'governance', // Restrictive covenants granting easements to certain POAs
  '209.013': 'governance', // Authority of association to amend dedicatory instrument
  '209.014': 'meetings', // Mandatory election required after failure to call regular meeting
  '209.015': 'governance', // Regulation of land use: residential purpose
  '209.016': 'governance', // Regulation of residential leases or rental agreements
  '209.017': 'enforcement', // Justice court jurisdiction
}

/** History paragraphs. Once one appears, the rest of the section is history. */
const HISTORY_RE = /^(Added by|Amended by|Redesignated|Renumbered|Transferred|Reenacted|Repealed by|Acts \d{4})/

const SECTION_START_RE = /<a\b[^>]*font-weight:\s*bold[^>]*>\s*Sec\.\s+(\d{3}\.\d+)\.\s+([\s\S]*?)<\/a>([\s\S]*)$/i

/** Paragraph HTML → text. Source line wrapping inside a paragraph is
 *  presentation (the page is a `<pre>`), so it collapses to one space;
 *  only an explicit `<br>` breaks the line. */
function textOf(html: string): string {
  return html
    .split(/<br\s*\/?>/i)
    .map((part) => decodeEntities(part.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

/** "HEARING BEFORE BOARD;  ALTERNATIVE DISPUTE RESOLUTION." → "Hearing before board; alternative dispute resolution". */
export function sentenceCaseCatchline(raw: string): string {
  const t = decodeEntities(raw.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim().replace(/\.$/, '')
  if (t !== t.toUpperCase()) return t
  const lower = t.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

interface RawTxSection {
  number: string
  catchline: string
  lines: string[]
}

export function parseTexasChapterSections(html: string): RawTxSection[] {
  const sections: RawTxSection[] = []
  let current: RawTxSection | null = null
  let inHistory = false
  for (const m of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const inner = m[1]
    const start = inner.match(SECTION_START_RE)
    if (start) {
      current = { number: start[1], catchline: start[2], lines: [] }
      sections.push(current)
      inHistory = false
      const first = textOf(start[3])
      if (first) current.lines.push(first)
      continue
    }
    if (!current || inHistory) continue
    const text = textOf(inner)
    if (!text) continue
    if (HISTORY_RE.test(text)) {
      inHistory = true
      continue
    }
    current.lines.push(text)
  }
  return sections
}

export function parseTexasChapter(html: string, chapter: string): StatuteRecord[] {
  const records: StatuteRecord[] = []
  for (const raw of parseTexasChapterSections(html)) {
    if (raw.number.split('.')[0] !== chapter) continue
    const body = normalizeStatuteBody(raw.lines.join('\n'))
    if (!body) continue
    records.push({
      code_citation: texasCitation(raw.number),
      title: sentenceCaseCatchline(raw.catchline),
      category: TX_CATEGORY[raw.number] ?? null,
      body,
      source_url: texasSectionUrl(raw.number),
      // The chapter file is the current text; per-section effective dates
      // live only in the history lines, which are not parsed into a date.
      effective_date: null,
    })
  }
  return records
}

// ─── Adapter ────────────────────────────────────────────────────────

export interface TexasAdapterOptions {
  http: HttpGetter
  /** Tests with a trimmed fixture lower these; production never does. */
  minSections?: Partial<Record<TxChapter, number>>
}

export function texasAdapter(opts: TexasAdapterOptions): StateLawAdapter {
  const min = { ...TX_MIN_SECTIONS, ...opts.minSections }
  return {
    state: 'TX',
    offline: false,
    covers: (citation) => CITATION_RE.test(citation),
    async fetchSections(): Promise<FetchedSections> {
      const records: StatuteRecord[] = []
      // All chapters or nothing: a missing chapter would read as the repeal
      // of every section in it.
      for (const chapter of TX_CHAPTERS) {
        const url = texasChapterUrl(chapter)
        const res = await opts.http.get(url)
        if (res.status !== 200) throw new SourceUnavailableError(`${url}: HTTP ${res.status}`)
        const parsed = parseTexasChapter(res.body, chapter)
        if (parsed.length < min[chapter]) {
          throw new SourceUnavailableError(`${url}: ${parsed.length} sections parsed (< ${min[chapter]})`)
        }
        records.push(...parsed)
      }
      return { sourceName: `tcss.legis.texas.gov Tex. Prop. Code Ch. ${TX_CHAPTERS.join(', ')}`, records }
    },
  }
}
