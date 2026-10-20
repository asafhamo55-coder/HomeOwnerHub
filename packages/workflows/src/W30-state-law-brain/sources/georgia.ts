// Georgia — Property Owners' Association Act, O.C.G.A. §§ 44-3-220 to
// 44-3-235 (Title 44, Ch. 3, Art. 6), verbatim, from a vetted snapshot.
//
// Georgia has no fetchable official text: the official Code is online only
// through LexisNexis's public-access JavaScript app. So this adapter is
// `offline`: it parses a snapshot committed to the repo,
//   scripts/fixtures/state-law/ga-ocga-44-3-art6-2026.txt
// built from the State's own electronic O.C.G.A. release (via
// Public.Resource.Org) plus the later Acts that amend it. That file's header
// records every source URL, checksum and retrieval date. It is embedded in
// georgia-snapshot.generated.ts (scripts/build-ga-statute-snapshot.ts) so
// the refresh job needs no filesystem access on Vercel.
//
// The refresh job treats it like any other source: unchanged text only
// touches last_checked_at; a refreshed snapshot shows up as `changed`.
//
// Expiry: the snapshot carries @valid_until, the first date on which an Act
// it does not include takes effect (SB 406 §§ 3–6 on 2027-01-01). From that
// date fetchSections throws instead of serving superseded law. The refresh
// job reports GA as failed and leaves the loaded rows untouched — loud, and
// never "every section was repealed".
//
// Citations use the form already in production ("O.C.G.A. Section
// 44-3-232", from migrations/seed-state-law-ga.sql), so the first run
// replaces the seed's paraphrased summaries in place (`changed`) instead of
// adding duplicate rows next to them.

import { GA_SNAPSHOT } from './georgia-snapshot.generated'
import { normalizeStatuteBody } from './normalize'
import type { FetchedSections, StateLawAdapter, StatuteRecord } from './types'
import { SourceUnavailableError } from './types'

/** Art. 6 is §§ 44-3-220 to 44-3-235 plus § 44-3-232.1: 17 sections. */
export const GA_MIN_SECTIONS = 17

const SECTION_CITATION_RE = /^O\.C\.G\.A\. Section 44-3-(2[2-3]\d)(\.\d+)?(\([^)]*\))?$/

/**
 * Enacted text not yet placed in the Code is carried under the Act's own
 * citation. Once the Code publishes where it sits, the snapshot moves it
 * into that section and this record is superseded by the next refresh.
 */
const SESSION_LAW_CITATION_RE = /^Ga\. L\. 20\d\d, [HS]B \d+, § \d+$/

/**
 * Rows the GA adapter owns: Art. 6 sections in the production citation form
 * (including the seed's sub-section row "Section 44-3-225(b)" and its
 * "Section 44-3-236", neither of which is a section of the Act) and session
 * law carried ahead of codification. Rows from other titles in the seed
 * (§§ 44-5-60 …, 14-3-701 …) are never touched.
 */
export function georgiaCovers(citation: string): boolean {
  return SECTION_CITATION_RE.test(citation) || SESSION_LAW_CITATION_RE.test(citation)
}

/** Static citation→category map; same vocabulary as FL and TX. */
export const GA_CATEGORY: Readonly<Record<string, string>> = {
  'O.C.G.A. Section 44-3-220': 'governance', // Short title
  'O.C.G.A. Section 44-3-221': 'governance', // Definitions
  'O.C.G.A. Section 44-3-222': 'governance', // Creation of development; election to be governed
  'O.C.G.A. Section 44-3-223': 'enforcement', // Compliance; fines, suspensions, injunctions
  'O.C.G.A. Section 44-3-224': 'meetings', // Voting at association meetings
  'O.C.G.A. Section 44-3-225': 'dues', // Assessment of expenses; liability for unpaid assessments
  'O.C.G.A. Section 44-3-226': 'governance', // Amendment of instrument
  'O.C.G.A. Section 44-3-227': 'governance', // Incorporation; board of directors
  'O.C.G.A. Section 44-3-228': 'meetings', // Quorums
  'O.C.G.A. Section 44-3-229': 'governance', // Persons deemed to be "lot owner"
  'O.C.G.A. Section 44-3-230': 'meetings', // Frequency of meetings; notice
  'O.C.G.A. Section 44-3-231': 'governance', // Powers and duties of association; records
  'O.C.G.A. Section 44-3-232': 'dues', // Assessment lien; late charges; foreclosure; statement of amounts due
  'O.C.G.A. Section 44-3-232.1': 'governance', // Owners taking control when declarant defaults
  'O.C.G.A. Section 44-3-233': 'governance', // Liberal construction; curing defects
  'O.C.G.A. Section 44-3-234': 'governance', // Application of article
  'O.C.G.A. Section 44-3-235': 'governance', // Applicability of article
  'Ga. L. 2026, SB 406, § 7': 'dues', // Attorney's-fee prerequisites in collection actions
}

export interface GeorgiaSnapshot {
  sourceName: string
  /** YYYY-MM-DD the source documents were retrieved. */
  retrieved: string
  /** YYYY-MM-DD from which this text is known to be out of date. */
  validUntil: string
  records: StatuteRecord[]
}

const META_RE = /^@([a-z_]+):\s*(.*)$/
const HEADER_RE = /^=== (.+?) \| (.+)$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parses the snapshot format (see the fixture's header):
 *   # comment lines (before the first section only)
 *   @source_name / @retrieved / @valid_until   — snapshot metadata
 *   === <citation> | <catchline>                — starts a section
 *   @source_url / @effective_date / @history    — section metadata
 *   any other non-blank line                    — one paragraph, verbatim
 * Throws on anything malformed: a half-parsed snapshot must never be
 * diffed against production, where a missing section reads as a repeal.
 */
export function parseGeorgiaSnapshot(text: string): GeorgiaSnapshot {
  const meta: Record<string, string> = {}
  const records: StatuteRecord[] = []
  let current: { citation: string; title: string; meta: Record<string, string>; lines: string[] } | null = null

  const finish = () => {
    if (!current) return
    const body = normalizeStatuteBody(current.lines.join('\n'))
    if (!body) throw new Error(`GA snapshot: ${current.citation} has no text`)
    const sourceUrl = current.meta.source_url
    if (!sourceUrl?.startsWith('https://')) throw new Error(`GA snapshot: ${current.citation} has no https @source_url`)
    const effective = current.meta.effective_date ?? null
    if (effective !== null && !DATE_RE.test(effective)) {
      throw new Error(`GA snapshot: ${current.citation} has a malformed @effective_date`)
    }
    records.push({
      code_citation: current.citation,
      title: current.title,
      category: GA_CATEGORY[current.citation] ?? null,
      body,
      source_url: sourceUrl,
      effective_date: effective,
    })
  }

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const header = line.match(HEADER_RE)
    if (header) {
      finish()
      current = { citation: header[1].trim(), title: header[2].trim(), meta: {}, lines: [] }
      continue
    }
    if (!current) {
      if (line.startsWith('#')) continue
      const m = line.match(META_RE)
      if (!m) throw new Error(`GA snapshot: unexpected line before the first section: ${line.slice(0, 60)}`)
      meta[m[1]] = m[2].trim()
      continue
    }
    const m = current.lines.length === 0 ? line.match(META_RE) : null
    if (m) {
      current.meta[m[1]] = m[2].trim()
      continue
    }
    current.lines.push(line)
  }
  finish()

  for (const key of ['source_name', 'retrieved', 'valid_until'] as const) {
    if (!meta[key]) throw new Error(`GA snapshot: missing @${key}`)
  }
  for (const key of ['retrieved', 'valid_until'] as const) {
    if (!DATE_RE.test(meta[key])) throw new Error(`GA snapshot: malformed @${key}`)
  }
  const seen = new Set<string>()
  for (const r of records) {
    if (!georgiaCovers(r.code_citation)) throw new Error(`GA snapshot: citation outside the adapter's scope: ${r.code_citation}`)
    if (seen.has(r.code_citation)) throw new Error(`GA snapshot: duplicate citation ${r.code_citation}`)
    seen.add(r.code_citation)
  }

  return { sourceName: meta.source_name, retrieved: meta.retrieved, validUntil: meta.valid_until, records }
}

// ─── Adapter ────────────────────────────────────────────────────────

export interface GeorgiaAdapterOptions {
  /** Snapshot text. Defaults to the embedded committed snapshot. */
  snapshot?: string
  now?: () => Date
}

export function georgiaAdapter(opts: GeorgiaAdapterOptions = {}): StateLawAdapter {
  const now = opts.now ?? (() => new Date())
  return {
    state: 'GA',
    offline: true,
    covers: georgiaCovers,
    async fetchSections(): Promise<FetchedSections> {
      const snap = parseGeorgiaSnapshot(opts.snapshot ?? GA_SNAPSHOT)
      const today = now().toISOString().slice(0, 10)
      if (today >= snap.validUntil) {
        throw new SourceUnavailableError(
          `GA snapshot (retrieved ${snap.retrieved}) is out of date from ${snap.validUntil}: a later Act ` +
            `has taken effect. Refresh scripts/fixtures/state-law/ga-ocga-44-3-art6-2026.txt ` +
            `(data/statutes/README.md, "Georgia snapshot").`,
        )
      }
      const codified = snap.records.filter((r) => SECTION_CITATION_RE.test(r.code_citation))
      if (codified.length < GA_MIN_SECTIONS) {
        throw new SourceUnavailableError(`GA snapshot: ${codified.length} sections (< ${GA_MIN_SECTIONS})`)
      }
      return { sourceName: snap.sourceName, records: snap.records }
    },
  }
}
