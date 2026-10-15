// W30 source adapters — the contract.
//
// Design: docs/superpowers/specs/2026-08-18-state-law-ingestion-design.md §1.
// Every per-state difference lives in one adapter file behind this
// interface, so the refresh job and the CLI ingester never branch on state.

export type StatuteState = 'GA' | 'FL' | 'CA' | 'TX'

/**
 * One statute section as the official source publishes it. Deliberately the
 * same shape as a `data/statutes/<state>.jsonl` line.
 */
export interface StatuteRecord {
  /** 'Fla. Stat. § 720.303' — the (state, code_citation) upsert key. */
  code_citation: string
  /** From the source's catchline. */
  title: string
  /** From a static citation→category map. Never an LLM call: an unstable
   *  category would not move content_hash, but it would churn the row. */
  category: string | null
  /** Verbatim statute text, already passed through normalizeStatuteBody. */
  body: string
  source_url: string
  effective_date: string | null
}

export interface FetchedSections {
  /** Human-readable provenance, stored on every row as source_name,
   *  e.g. 'flsenate.gov Fla. Stat. Ch. 720 (2026)'. */
  sourceName: string
  records: StatuteRecord[]
}

export interface StateLawAdapter {
  state: StatuteState
  /** True when the adapter reads curated local data, never the network. */
  offline: boolean
  /**
   * Whether a citation falls inside what this adapter fetches. A DB row is
   * only eligible to be superseded ("present in DB, absent from source")
   * when the adapter covers it: a Chapter 720 adapter must never retire a
   * Chapter 718 row just because it did not fetch Chapter 718.
   */
  covers(codeCitation: string): boolean
  /** Fetches the complete covered set. Throws rather than return a partial
   *  set: a short list would read as mass repeal and supersede live law. */
  fetchSections(): Promise<FetchedSections>
}

/** Minimal HTTP surface adapters depend on, so tests can substitute a
 *  recorded fixture and never touch the network. */
export interface HttpResponse {
  status: number
  url: string
  body: string
}

export interface HttpGetter {
  get(url: string): Promise<HttpResponse>
}

export class SourceUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SourceUnavailableError'
  }
}
