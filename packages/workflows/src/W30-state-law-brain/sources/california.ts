// California — the Davis-Stirling Common Interest Development Act,
// Civil Code §§ 4000–6150 (Division 4, Part 5), verbatim, from the
// Legislative Counsel's official bulk database.
//
// Why the bulk zip and not the web pages: leginfo.legislature.ca.gov answers
// scripts with a Cloudflare challenge (403), checked 2026-08-18, 2026-10-19
// and 2026-10-20. The same publisher's downloads host is not challenged and
// serves `pubinfo_<session year>.zip` (~1.2 GB, rebuilt weekly) with HTTP
// range support (docs/research/2026-10-ca-rules-verification.md).
//
// One run reads only:
//   1. the archive's tail             (64 KB)  → where the central directory is
//   2. the central directory          (~20 MB) → where each entry is
//   3. LAW_SECTION_TBL.dat + LAW_TOC_TBL.dat (~7 MB compressed, one request)
//   4. the ~234 Part 5 `.lob` bodies  (~150 KB, batched 50 ranges per request)
// That is about eight requests, spaced by the polite getter, against a
// host that publishes no robots.txt.
//
// LAW_SECTION_TBL.dat columns (tab-separated, text in backticks, NULL bare):
//   0 id  1 law_code  2 section_num  3 op_statutes  4 op_chapter  5 op_section
//   6 effective_date  7 law_section_version_id  8 division  9 title  10 part
//   11 chapter  12 article  13 history  14 content_xml (.lob name)
//   15 active_flg  16 trans_uid  17 trans_update
// LAW_TOC_TBL.dat columns used: 0 law_code 1 division 2 title 3 part
//   4 chapter 5 article 6 heading.
//
// California's Civil Code sections have no catchlines. A section's title
// is its article heading (or chapter heading when it has no article), from
// LAW_TOC_TBL — e.g. "Board Meeting" for § 4900. History lines are a
// separate column and never enter the body.

import { decodeEntities } from './florida'
import { normalizeStatuteBody } from './normalize'
import type { FetchedSections, RangeGetter, RangeResponse, StateLawAdapter, StatuteRecord } from './types'
import { SourceUnavailableError } from './types'
import { MAX_CENTRAL_DIRECTORY_BYTES, ZIP_TAIL_BYTES, entryRange, extractEntry, locateCentralDirectory, readCentralDirectory, type ZipEntry } from './zip'

const BASE = 'https://downloads.leginfo.legislature.ca.gov'
const SECTION_TABLE = 'LAW_SECTION_TBL.dat'
const TOC_TABLE = 'LAW_TOC_TBL.dat'
const FIRST = 4000
const LAST = 6150
/** Ranges per request; Apache's default MaxRanges is 200, and a server
 *  that ignores the Range header answers 200, which the getter refuses. */
const RANGES_PER_REQUEST = 50

/** Part 5 has had 234 live sections in the 2025–26 database. */
export const CA_MIN_SECTIONS = 200

export function pubinfoUrl(sessionYear: number): string {
  return `${BASE}/pubinfo_${sessionYear}.zip`
}

/** Sessions start in odd years: 2026 is the 2025–26 session. */
export function sessionYearFor(date: Date): number {
  const y = date.getUTCFullYear()
  return y % 2 === 1 ? y : y - 1
}

export function californiaCitation(sectionNumber: string): string {
  return `Cal. Civ. Code § ${sectionNumber}`
}

const CITATION_RE = /^Cal\. Civ\. Code § (\d+(?:\.\d+)?)$/

export function californiaCovers(citation: string): boolean {
  const m = citation.match(CITATION_RE)
  if (!m) return false
  const n = Number(m[1])
  return n >= FIRST && n <= LAST
}

/** The per-section page the app links to (it is the official citation URL,
 *  even though scripts cannot fetch it). */
export function californiaSectionUrl(sectionNumber: string): string {
  return `https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=${sectionNumber}.`
}

/**
 * Static (chapter, article) → category map over Part 5's structure. Same
 * vocabulary as Florida. A chapter key ('6') applies when no article key
 * ('6.2') matches; anything unmapped gets null, never a guess.
 */
export const CA_CATEGORY: Readonly<Record<string, string>> = {
  '1': 'governance', // General Provisions (preliminary provisions, definitions)
  '2': 'governance', // Application of Act
  '3': 'governance', // Governing Documents
  '4': 'governance', // Ownership and Transfer of Interests
  '4.2': 'records', // Transfer Disclosure
  '5': 'enforcement', // Property Use and Maintenance
  '5.3': 'governance', // Maintenance
  '6': 'governance', // Association Governance
  '6.2': 'meetings', // Board Meeting
  '6.3': 'meetings', // Member Meeting
  '6.4': 'meetings', // Member Election
  '6.5': 'records', // Record Inspection
  '6.6': 'records', // Recordkeeping
  '6.7': 'records', // Annual Reports
  '7': 'dues', // Finances
  '8': 'dues', // Assessments and Assessment Collection
  '9': 'governance', // Insurance and Liability
  '10': 'enforcement', // Dispute Resolution and Enforcement
  '11': 'governance', // Construction Defect Litigation
}

// ─── Table parsing ───────────────────────────────────────────────────

/** One tab-separated row: `NULL` → null, backtick quoting removed. */
export function parseDatRow(line: string): (string | null)[] {
  return line.split('\t').map((f) => {
    const v = f.trim()
    if (v === 'NULL') return null
    return v.startsWith('`') && v.endsWith('`') && v.length >= 2 ? v.slice(1, -1) : v
  })
}

/** '6.' → '6'; null stays null. */
function level(v: string | null | undefined): string | null {
  if (!v) return null
  const t = v.replace(/\.$/, '').trim()
  return t || null
}

export interface CaSectionRow {
  sectionNumber: string
  effectiveDate: string | null
  chapter: string | null
  article: string | null
  lobName: string
}

/** Live Part 5 rows of the Civil Code, ordered by section number. */
export function parseSectionTable(text: string): CaSectionRow[] {
  const rows: CaSectionRow[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('`CIV`')) continue
    const f = parseDatRow(line)
    if (f.length < 16 || f[1] !== 'CIV' || f[15] !== 'Y') continue
    const sectionNumber = level(f[2])
    if (!sectionNumber || !/^\d+(\.\d+)?$/.test(sectionNumber)) continue
    const n = Number(sectionNumber)
    if (n < FIRST || n > LAST) continue
    if (level(f[8]) !== '4' || level(f[10]) !== '5' || !f[14]) continue
    rows.push({
      sectionNumber,
      effectiveDate: f[6] ? f[6].slice(0, 10) : null,
      chapter: level(f[11]),
      article: level(f[12]),
      lobName: f[14],
    })
  }
  return rows.sort((a, b) => Number(a.sectionNumber) - Number(b.sectionNumber))
}

/** "ARTICLE 2. Board Meeting [4900. - 4955.]" → "Board Meeting". */
export function cleanHeading(heading: string): string {
  return heading
    .replace(/\s*\[.*\]\s*$/, '')
    .replace(/^(?:ARTICLE|CHAPTER|PART)\s+[\d.]+[A-Z]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** (chapter, article) → heading for Civil Code Division 4, Part 5. Keys
 *  are '6' for a chapter and '6.2' for an article. */
export function parseTocTable(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('`CIV`')) continue
    const f = parseDatRow(line)
    if (level(f[1]) !== '4' || f[2] !== null || level(f[3]) !== '5' || !f[6]) continue
    const chapter = level(f[4])
    const article = level(f[5])
    if (!chapter) continue
    out.set(article ? `${chapter}.${article}` : chapter, cleanHeading(f[6]))
  }
  return out
}

// ─── Section body (CAML) → text ──────────────────────────────────────

const BLOCK_TAGS = new Set(['p', 'div', 'br', 'li', 'tr', 'table', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/**
 * Each `.lob` is a `<caml:Content>` fragment: one `<p>` per subdivision,
 * `<span class="EnSpace"/>` between a designator and its text, and the
 * occasional table. Block boundaries become line breaks; every other tag
 * is dropped; text is kept as published.
 */
export function camlToText(xml: string): string {
  const out: string[] = []
  let line = ''
  const flush = () => {
    if (line.trim()) out.push(line)
    line = ''
  }
  const token = /<!--[\s\S]*?-->|<\/?([a-zA-Z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+)/g
  for (const m of xml.matchAll(token)) {
    const [whole, rawTag, attrs, text] = m
    if (whole.startsWith('<!--')) continue
    if (text !== undefined) {
      // Source line wrapping inside a paragraph is presentation.
      line += decodeEntities(text).replace(/\s+/g, ' ')
      continue
    }
    const tag = rawTag.toLowerCase().replace(/^.*:/, '')
    if (BLOCK_TAGS.has(tag)) flush()
    else if (tag === 'span' && /Space/.test(attrs ?? '')) line += ' '
    else if (tag === 'td' || tag === 'th') line += ' '
  }
  flush()
  return out.join('\n')
}

export function buildCaliforniaRecords(
  rows: CaSectionRow[],
  toc: Map<string, string>,
  lobs: Map<string, string>,
): StatuteRecord[] {
  const records: StatuteRecord[] = []
  for (const row of rows) {
    const xml = lobs.get(row.lobName)
    if (xml === undefined) throw new SourceUnavailableError(`CA: body ${row.lobName} for § ${row.sectionNumber} missing`)
    const body = normalizeStatuteBody(camlToText(xml))
    if (!body) continue
    const articleKey = row.chapter && row.article ? `${row.chapter}.${row.article}` : null
    const title =
      (articleKey && toc.get(articleKey)) ||
      (row.chapter && toc.get(row.chapter)) ||
      'Davis-Stirling Common Interest Development Act'
    const category = (articleKey && CA_CATEGORY[articleKey]) || (row.chapter && CA_CATEGORY[row.chapter]) || null
    records.push({
      code_citation: californiaCitation(row.sectionNumber),
      title,
      category,
      body,
      source_url: californiaSectionUrl(row.sectionNumber),
      effective_date: row.effectiveDate,
    })
  }
  return records
}

// ─── Adapter ────────────────────────────────────────────────────────

export interface CaliforniaAdapterOptions {
  http: RangeGetter
  now?: () => Date
  /** Tests with a small fixture archive lower this; production never does. */
  minSections?: number
}

export function californiaAdapter(opts: CaliforniaAdapterOptions): StateLawAdapter {
  const now = opts.now ?? (() => new Date())
  const minSections = opts.minSections ?? CA_MIN_SECTIONS
  return {
    state: 'CA',
    offline: false,
    covers: californiaCovers,
    async fetchSections(): Promise<FetchedSections> {
      const session = sessionYearFor(now())
      const attempts: string[] = []
      for (const year of [session, session - 2]) {
        const url = pubinfoUrl(year)
        const tail = await opts.http.getRanges(url, [{ suffix: ZIP_TAIL_BYTES }])
        if (tail.status !== 206 || tail.totalSize === null) {
          attempts.push(`${year}: HTTP ${tail.status}`)
          continue
        }
        const records = await readArchive(opts.http, url, tail)
        if (records.length < minSections) {
          attempts.push(`${year}: ${records.length} sections parsed (< ${minSections})`)
          continue
        }
        return {
          sourceName: `leginfo pubinfo_${year}.zip Cal. Civ. Code §§ ${FIRST}–${LAST}`,
          records,
        }
      }
      throw new SourceUnavailableError(`leginfo bulk data: no usable archive (${attempts.join('; ')})`)
    },
  }
}

async function readArchive(http: RangeGetter, url: string, tail: RangeResponse): Promise<StatuteRecord[]> {
  const total = tail.totalSize!
  const etag = tail.etag
  // The archive is rebuilt weekly; offsets from one build are garbage in
  // the next. Every read must come from the build the tail came from.
  const read = async (ranges: { start: number; end: number }[]): Promise<Uint8Array[]> => {
    const res = await http.getRanges(url, ranges)
    if (res.status !== 206) throw new SourceUnavailableError(`${url}: HTTP ${res.status} on a range read`)
    if (res.etag !== etag || res.totalSize !== total) {
      throw new SourceUnavailableError(`${url}: the archive changed during the run; retry later`)
    }
    return res.parts
  }

  const tailBytes = tail.parts[0]
  const cdLoc = locateCentralDirectory(tailBytes, total - tailBytes.length)
  if (cdLoc.size > MAX_CENTRAL_DIRECTORY_BYTES) throw new SourceUnavailableError('zip: central directory is too large')
  const cdStart = cdLoc.offset
  const cdEnd = cdLoc.offset + cdLoc.size - 1
  const tailStart = total - tailBytes.length
  // A small archive's directory may already be inside the tail.
  const [cd] =
    cdStart >= tailStart
      ? [tailBytes.subarray(cdStart - tailStart, cdEnd - tailStart + 1)]
      : await read([{ start: cdStart, end: cdEnd }])

  const tables = readCentralDirectory(cd, (n) => n === SECTION_TABLE || n === TOC_TABLE)
  const sectionEntry = tables.get(SECTION_TABLE)
  const tocEntry = tables.get(TOC_TABLE)
  if (!sectionEntry || !tocEntry) throw new SourceUnavailableError(`${url}: law tables missing from the archive`)

  const [sectionBytes, tocBytes] = await read([entryRange(sectionEntry), entryRange(tocEntry)])
  const dec = new TextDecoder('utf-8')
  const rows = parseSectionTable(dec.decode(extractEntry(sectionBytes, sectionEntry)))
  const toc = parseTocTable(dec.decode(extractEntry(tocBytes, tocEntry)))

  const wanted = new Set(rows.map((r) => r.lobName))
  const lobEntries = [...readCentralDirectory(cd, (n) => wanted.has(n)).values()].sort(
    (a, b) => a.localHeaderOffset - b.localHeaderOffset,
  )
  const lobs = new Map<string, string>()
  for (let i = 0; i < lobEntries.length; i += RANGES_PER_REQUEST) {
    const batch: ZipEntry[] = lobEntries.slice(i, i + RANGES_PER_REQUEST)
    const parts = await read(batch.map(entryRange))
    batch.forEach((e, j) => lobs.set(e.name, dec.decode(extractEntry(parts[j], e))))
  }
  return buildCaliforniaRecords(rows, toc, lobs)
}
