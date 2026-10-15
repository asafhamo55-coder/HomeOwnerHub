import { describe, expect, it } from 'vitest'
import { planStatuteSync, storedHash, SuspiciousSourceError, type ExistingStatuteRow } from './plan'
import { statuteContentHash } from './sources/normalize'
import type { StatuteRecord } from './sources/types'

const SOURCE = 'flsenate.gov Fla. Stat. Ch. 720 (2026)'
const covers = (c: string) => c.startsWith('Fla. Stat. § 720.')

function rec(n: string, body = `Body of ${n}.`, title = `Title ${n}`): StatuteRecord {
  return {
    code_citation: `Fla. Stat. § ${n}`,
    title,
    category: 'governance',
    body,
    source_url: `https://www.flsenate.gov/Laws/Statutes/2026/${n}`,
    effective_date: null,
  }
}

function row(n: string, over: Partial<ExistingStatuteRow> = {}): ExistingStatuteRow {
  const r = rec(n)
  return {
    id: `id-${n}`,
    code_citation: r.code_citation,
    title: r.title,
    category: r.category,
    body: r.body,
    source_url: r.source_url,
    source_name: SOURCE,
    content_hash: statuteContentHash(r.body),
    superseded_at: null,
    ...over,
  }
}

const plan = (records: StatuteRecord[], existing: ExistingStatuteRow[]) =>
  planStatuteSync({ state: 'FL', sourceName: SOURCE, records, existing, covers })

describe('planStatuteSync', () => {
  it('hash unchanged → no write, no change; last_checked_at only', () => {
    const p = plan([rec('720.301')], [row('720.301')])
    expect(p.writes).toEqual([])
    expect(p.removals).toEqual([])
    expect(p.unchanged).toEqual([
      expect.objectContaining({ statuteId: 'id-720.301', backfillHash: false, metadataChanged: false }),
    ])
  })

  it('a new citation is added with no old hash', () => {
    const p = plan([rec('720.302')], [])
    expect(p.writes).toEqual([
      expect.objectContaining({ kind: 'added', statuteId: null, oldHash: null, newHash: statuteContentHash('Body of 720.302.') }),
    ])
  })

  it('changed text → changed, carrying both hashes', () => {
    const p = plan([rec('720.305', 'Fines may not exceed $1,000.')], [row('720.305')])
    expect(p.writes).toHaveLength(1)
    expect(p.writes[0]).toMatchObject({
      kind: 'changed',
      statuteId: 'id-720.305',
      oldHash: statuteContentHash('Body of 720.305.'),
      newHash: statuteContentHash('Fines may not exceed $1,000.'),
    })
  })

  it('a pre-0062 row (no hash) is compared by hashing its stored body', () => {
    const same = plan([rec('720.301')], [row('720.301', { content_hash: null, source_name: null })])
    expect(same.writes).toEqual([])
    expect(same.unchanged[0]).toMatchObject({ backfillHash: true })

    // The starter fixture's paraphrase differs from the official text.
    const starter = 'SAMPLE EXCERPT — replace with full statutory text.'
    const differs = plan([rec('720.303')], [row('720.303', { body: starter, content_hash: null })])
    expect(differs.writes[0]).toMatchObject({ kind: 'changed', oldHash: statuteContentHash(starter) })
  })

  it('a stored hash is authoritative over the stored body', () => {
    // e.g. a previous run wrote the row but the hash says otherwise:
    // trust the hash so a disagreement is re-written, not silently passed.
    const r = row('720.301', { content_hash: 'f'.repeat(64) })
    expect(storedHash(r)).toBe('f'.repeat(64))
    expect(plan([rec('720.301')], [r]).writes[0].kind).toBe('changed')
  })

  it('moved metadata with identical text is refreshed silently, not reported as a change', () => {
    const p = plan([rec('720.301')], [row('720.301', { source_name: 'flsenate.gov Fla. Stat. Ch. 720 (2025)' })])
    expect(p.writes).toEqual([])
    expect(p.unchanged[0].metadataChanged).toBe(true)
  })

  it('a superseded citation that reappears is reinstated', () => {
    const p = plan([rec('720.301')], [row('720.301', { superseded_at: '2026-01-01T00:00:00Z' })])
    expect(p.writes[0]).toMatchObject({ kind: 'reinstated', statuteId: 'id-720.301' })
  })

  it('a live covered row absent from the source is removed', () => {
    const p = plan([rec('720.301')], [row('720.301'), row('720.3015')])
    expect(p.removals).toEqual([
      { statuteId: 'id-720.3015', codeCitation: 'Fla. Stat. § 720.3015', oldHash: statuteContentHash('Body of 720.3015.') },
    ])
  })

  it('never removes rows outside the adapter scope, or rows already superseded', () => {
    const condo = row('718.112', { code_citation: 'Fla. Stat. § 718.112' })
    const gone = row('720.999', { superseded_at: '2026-01-01T00:00:00Z' })
    const p = plan([rec('720.301')], [row('720.301'), condo, gone])
    expect(p.removals).toEqual([])
  })

  it('refuses a mass removal as a source/parser failure', () => {
    const existing = Array.from({ length: 36 }, (_, i) => row(`720.${400 + i}`))
    // 36 live rows → limit max(5, 9) = 9. Ten missing is refused.
    const keep = existing.slice(10).map((r) => rec(r.code_citation.replace('Fla. Stat. § ', '')))
    expect(() => plan(keep, existing)).toThrow(SuspiciousSourceError)
    // Nine missing is allowed.
    const keepMore = existing.slice(9).map((r) => rec(r.code_citation.replace('Fla. Stat. § ', '')))
    expect(plan(keepMore, existing).removals).toHaveLength(9)
  })

  it('refuses duplicate citations from the source', () => {
    expect(() => plan([rec('720.301'), rec('720.301')], [])).toThrow(/duplicate citation/)
  })

  it('produces a plan that survives a JSON round-trip (Inngest step output)', () => {
    const p = plan([rec('720.301'), rec('720.302')], [row('720.301'), row('720.3015')])
    expect(JSON.parse(JSON.stringify(p))).toEqual(p)
  })
})
