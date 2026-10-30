import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { LIBRARY_TYPES } from '../documents/filter'
import {
  RECORDS_CHECK_BYLAWS,
  recordRows,
  recordsChecklistFor,
  recordsProgress,
  type RecordsChecklist,
} from './records-checklist'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const htmlToText = (h: string) =>
  h
    .replace(/<(script|style)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
const cache = new Map<string, string>()
const fixture = (name: string) => {
  if (!cache.has(name)) {
    const raw = readFileSync(path.join(root, 'scripts/fixtures/state-law', name), 'utf8')
    cache.set(name, squash(name.endsWith('.html') ? htmlToText(raw) : raw))
  }
  return cache.get(name)!
}

const fl = recordsChecklistFor('FL') as RecordsChecklist
const ga = recordsChecklistFor('GA') as RecordsChecklist

describe('category mapping per state', () => {
  it('has checklists for FL and GA only', () => {
    expect(fl).not.toBeNull()
    expect(ga).not.toBeNull()
    for (const s of ['CA', 'TX', null] as const) expect(recordsChecklistFor(s)).toBeNull()
    expect(RECORDS_CHECK_BYLAWS).toMatch(/bylaws/)
  })

  it('Florida maps bylaws, declaration, rules and minutes to library types; the rest are untracked', () => {
    expect(Object.fromEntries(fl.categories.map((c) => [c.id, c.docType]))).toEqual({
      'fl-articles': null,
      'fl-bylaws': 'bylaws',
      'fl-declaration': 'ccr',
      'fl-rules': 'rules',
      'fl-contracts': null,
      'fl-budget': null,
      'fl-financial-report': null,
      'fl-insurance': null,
      'fl-minutes': 'minutes',
    })
  })

  it('Georgia lists minutes, financial records, bylaws and articles, with no posting list', () => {
    expect(Object.fromEntries(ga.categories.map((c) => [c.id, c.docType]))).toEqual({
      'ga-minutes': 'minutes',
      'ga-financial': null,
      'ga-bylaws': 'bylaws',
      'ga-articles': null,
    })
    expect(ga.intro).toContain('no posting list; check your bylaws')
  })

  it('every mapped docType is a real library category', () => {
    for (const c of [...fl.categories, ...ga.categories]) {
      if (c.docType) expect((LIBRARY_TYPES as readonly string[]).includes(c.docType)).toBe(true)
    }
  })
})

describe('statute quotes are verbatim in the fixtures', () => {
  const all = [...fl.categories, ...ga.categories]
  it.each(all.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(c.quote.length).toBeGreaterThan(20)
    expect(c.cite).toMatch(/§/)
    expect(fixture(c.fixture)).toContain(squash(c.quote))
    if (c.alsoIn) expect(fixture(c.alsoIn)).toContain(squash(c.quote))
  })

  it('Florida posting list is the 100-parcel website duty', () => {
    const t = fixture('flsenate-ch720-2026.html')
    expect(t).toContain('an association that has 100 or more parcels shall post the following documents on its website')
  })
})

describe('posted / missing / untracked logic', () => {
  const docs = [
    { id: 'd3', name: 'Rules 2026', type: 'rules' },
    { id: 'd2', name: 'Bylaws', type: 'bylaws' },
    { id: 'd1', name: 'Misc', type: 'other' },
  ]

  it('posted only when a document of the matching type exists', () => {
    const by = Object.fromEntries(recordRows(fl, docs).map((r) => [r.category.id, r]))
    expect(by['fl-bylaws']).toMatchObject({ status: 'posted', document: { id: 'd2' } })
    expect(by['fl-rules']).toMatchObject({ status: 'posted', document: { id: 'd3' } })
    expect(by['fl-declaration']).toMatchObject({ status: 'missing', document: null })
    expect(by['fl-minutes'].status).toBe('missing')
  })

  it('an "other" document never satisfies anything', () => {
    const rows = recordRows(fl, [{ id: 'x', name: 'Insurance policy', type: 'other' }])
    expect(rows.filter((r) => r.status === 'posted')).toHaveLength(0)
    expect(rows.find((r) => r.category.id === 'fl-insurance')?.status).toBe('untracked')
  })

  it('untracked is never counted as missing', () => {
    const rows = recordRows(ga, [])
    expect(rows.filter((r) => r.status === 'missing').map((r) => r.category.id)).toEqual(['ga-minutes', 'ga-bylaws'])
    expect(rows.filter((r) => r.status === 'untracked')).toHaveLength(2)
  })

  it('takes the first (newest) matching document', () => {
    const rows = recordRows(fl, [
      { id: 'new', name: 'Bylaws v2', type: 'bylaws' },
      { id: 'old', name: 'Bylaws v1', type: 'bylaws' },
    ])
    expect(rows.find((r) => r.category.id === 'fl-bylaws')?.document?.id).toBe('new')
  })

  it('progress line counts trackable records only', () => {
    const p = recordsProgress(recordRows(fl, docs))
    expect(p).toMatchObject({ posted: 2, trackable: 4, untracked: 5 })
    expect(p.line).toBe('2 of 4 trackable records in your library; 5 are not tracked in the app.')
    expect(recordsProgress(recordRows(ga, [])).line).toBe('0 of 2 trackable records in your library; 2 are not tracked in the app.')
  })

  it('copy has no em dashes', () => {
    const text = JSON.stringify([fl.intro, ga.intro, RECORDS_CHECK_BYLAWS, ...[...fl.categories, ...ga.categories].map((c) => c.label)])
    expect(text).not.toContain('—')
  })
})
