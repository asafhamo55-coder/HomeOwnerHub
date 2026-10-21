import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import {
  ALL_INSURANCE_CITATIONS,
  CA_5300_SUMMARY,
  CHECK_GOVERNING_DOCUMENTS,
  FL_3033_AMOUNT,
  FL_3033_BOND,
  FL_3033_WAIVER,
  INSURANCE_NOT_LOADED,
  POLICY_KINDS,
  POLICY_KIND_LABELS,
  coverageCheck,
  dollarsToCents,
  isActive,
  policyFromRow,
  policyReminders,
  reminderDigestLine,
  remindersSummary,
  type InsuranceCitation,
  type InsurancePolicy,
} from './model'

const REPO_ROOT = resolve(__dirname, '../../../../..')
const fixture = (name: string) => readFileSync(resolve(REPO_ROOT, 'scripts/fixtures/state-law', name), 'utf8')
const squash = (s: string) => s.replace(/\s+/g, ' ')
const caText = fixture('ca-civ-davis-stirling-2026.txt')
const caSection = (n: string) => {
  const marker = `=== Civ. Code § ${n}.  [`
  const start = caText.indexOf(marker)
  expect(start, marker).toBeGreaterThanOrEqual(0)
  const end = caText.indexOf('\n=== ', start + marker.length)
  return squash(caText.slice(start, end === -1 ? undefined : end))
}
const fl = parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026)
const flSection = (cite: string) => {
  const body = fl.find((r) => r.code_citation === cite)?.body
  expect(body, cite).toBeTruthy()
  return squash(body!)
}

function sectionFor(c: InsuranceCitation): string {
  if (c.cite.startsWith('Fla. Stat. § 720.3033')) return flSection('Fla. Stat. § 720.3033')
  if (c.cite.startsWith('Cal. Civ. Code § 5300')) return caSection('5300')
  throw new Error(`no section mapped for ${c.cite}`)
}

describe('citations are verbatim from the fixtures, in the section they cite', () => {
  it.each(ALL_INSURANCE_CITATIONS.map((c) => [c.cite, c] as const))('%s', (_cite, c) => {
    expect(sectionFor(c)).toContain(squash(c.quote))
  })

  it('pinpoints: (5) opens the FL fidelity sentences; (9) opens the CA summary', () => {
    const s = flSection('Fla. Stat. § 720.3033')
    expect(s).toContain(`(5) ${FL_3033_BOND.quote}`)
    const five = s.indexOf('(5) ')
    const six = s.indexOf('(6)(a)')
    for (const c of [FL_3033_AMOUNT, FL_3033_WAIVER]) {
      const at = s.indexOf(c.quote)
      expect(at).toBeGreaterThan(five)
      expect(at).toBeLessThan(six)
    }
    const ca = caSection('5300')
    expect(ca).toContain(`(9)${CA_5300_SUMMARY.quote}`)
  })

  it('what is NOT loaded really is absent: no § 5806 in the CA fixture', () => {
    expect(caText).not.toContain('Civ. Code § 5806')
    expect(INSURANCE_NOT_LOADED.CA?.[0]).toMatch(/5806/)
  })
})

const TODAY = '2026-10-20'
let n = 0
function policy(extra: Partial<InsurancePolicy> = {}): InsurancePolicy {
  n += 1
  return {
    id: `p-${n}`,
    associationId: 'a-1',
    kind: 'property',
    carrier: 'Carrier',
    policyNumber: null,
    coverageLimitCents: 100_000_00,
    deductibleCents: 5_000_00,
    premiumCents: null,
    effectiveOn: '2026-01-01',
    expiresOn: '2027-01-01',
    documentId: null,
    notes: null,
    ...extra,
  }
}

describe('kinds', () => {
  it('every kind has a label, matching the 0068 CHECK list', () => {
    expect([...POLICY_KINDS]).toEqual(['property', 'liability', 'directors_officers', 'fidelity', 'flood', 'earthquake', 'umbrella', 'workers_comp', 'other'])
    for (const k of POLICY_KINDS) expect(POLICY_KIND_LABELS[k]).toBeTruthy()
    const sql = readFileSync(resolve(REPO_ROOT, 'migrations/0068_m4_batch.sql'), 'utf8')
    for (const k of POLICY_KINDS) expect(sql).toContain(`'${k}'`)
  })

  it('policyFromRow reads a row, and drops an unusable one', () => {
    const p = policyFromRow({ id: 'x', kind: 'flood', carrier: 'C', expires_on: '2027-03-01', coverage_limit_cents: '250000', association_id: null })
    expect(p).toMatchObject({ id: 'x', kind: 'flood', coverageLimitCents: 250000, associationId: null, expiresOn: '2027-03-01' })
    expect(policyFromRow({ id: 'x', kind: 'boat', expires_on: '2027-03-01' })).toBeNull()
    expect(policyFromRow({ id: 'x', kind: 'flood' })).toBeNull()
  })
})

describe('policyReminders', () => {
  it('90 / 60 / 30 / expired tones, soonest first; nothing beyond 90 days', () => {
    const r = policyReminders(
      [
        policy({ id: 'far', expiresOn: '2027-03-01' }),
        policy({ id: 'd90', kind: 'liability', expiresOn: '2027-01-18' }), // 90 days
        policy({ id: 'd60', kind: 'flood', expiresOn: '2026-12-19' }), // 60
        policy({ id: 'd30', kind: 'fidelity', expiresOn: '2026-11-19' }), // 30
        policy({ id: 'gone', kind: 'umbrella', expiresOn: '2026-10-10' }),
      ],
      TODAY,
    )
    expect(r.map((x) => [x.policyId, x.tone, x.daysLeft])).toEqual([
      ['gone', 'expired', -10],
      ['d30', '30', 30],
      ['d60', '60', 60],
      ['d90', '90', 90],
    ])
  })

  it('a recorded renewal (same kind and association, starting by the day after) silences the old policy', () => {
    const old = policy({ id: 'old', expiresOn: '2026-11-01' })
    const renewal = policy({ id: 'new', effectiveOn: '2026-11-01', expiresOn: '2027-11-01' })
    expect(policyReminders([old, renewal], TODAY)).toEqual([])
  })

  it('not a renewal: another kind, another association, or a gap in cover', () => {
    const old = policy({ id: 'old', expiresOn: '2026-11-01' })
    for (const other of [
      policy({ kind: 'liability', effectiveOn: '2026-11-01', expiresOn: '2027-11-01' }),
      policy({ associationId: 'a-2', effectiveOn: '2026-11-01', expiresOn: '2027-11-01' }),
      policy({ effectiveOn: '2026-12-15', expiresOn: '2027-12-15' }),
    ]) {
      expect(policyReminders([old, other], TODAY).map((x) => x.policyId)).toEqual(['old'])
    }
  })

  it('digest lines and summary carry the kind and counts, never the carrier or number', () => {
    const r = policyReminders(
      [policy({ kind: 'fidelity', carrier: 'Acme Mutual', policyNumber: 'P-1', expiresOn: '2026-11-19' }), policy({ expiresOn: '2026-10-01' })],
      TODAY,
    )
    expect(reminderDigestLine(r[1]!)).toBe('Fidelity / crime bond policy: expires in 30 days')
    expect(reminderDigestLine(r[0]!)).toBe('Master / property policy: expired 19 days ago')
    const summary = remindersSummary(r)
    expect(summary).toBe('1 insurance policy has expired; 1 insurance policy expires within 90 days')
    expect(r.map(reminderDigestLine).join(' ')).not.toContain('Acme')
  })
})

describe('isActive', () => {
  it('started and not yet expired; a future policy is not active', () => {
    expect(isActive(policy(), TODAY)).toBe(true)
    expect(isActive(policy({ expiresOn: '2026-10-19' }), TODAY)).toBe(false)
    expect(isActive(policy({ effectiveOn: '2026-11-01' }), TODAY)).toBe(false)
    expect(isActive(policy({ effectiveOn: null }), TODAY)).toBe(true)
  })
})

describe('coverageCheck', () => {
  it('FL without a fidelity bond in force: a warning citing § 720.3033(5) and the waiver', () => {
    const c = coverageCheck('FL', [policy(), policy({ kind: 'fidelity', expiresOn: '2026-10-01' })], TODAY)
    expect(c.findings).toHaveLength(1)
    expect(c.findings[0]).toMatchObject({ code: 'fl_fidelity_missing', severity: 'warn' })
    expect(c.findings[0]!.citations).toEqual([FL_3033_BOND, FL_3033_WAIVER])
  })

  it('FL with a bond in force: the amount reminder, not a warning', () => {
    const c = coverageCheck('Florida', [policy({ kind: 'fidelity' })], TODAY)
    expect(c.findings.map((f) => [f.code, f.severity])).toEqual([['fl_fidelity_amount', 'info']])
  })

  it('CA: one warning per § 5300(b)(9) kind not in force, incomplete limits, and § 5806 deferred to the governing documents', () => {
    const c = coverageCheck('CA', [policy(), policy({ kind: 'liability', deductibleCents: null })], TODAY)
    const codes = c.findings.map((f) => f.code)
    expect(codes).toEqual([
      'ca_summary_missing_earthquake',
      'ca_summary_missing_flood',
      'ca_summary_missing_fidelity',
      'ca_summary_incomplete',
      'ca_fidelity_minimum',
    ])
    expect(c.findings.find((f) => f.code === 'ca_fidelity_minimum')!.message).toContain(CHECK_GOVERNING_DOCUMENTS)
    expect(c.findings.find((f) => f.code === 'ca_fidelity_minimum')!.citations).toEqual([])
    expect(c.notLoaded).toEqual(INSURANCE_NOT_LOADED.CA)
  })

  it('CA with every summary kind complete: only the § 5806 line', () => {
    const c = coverageCheck('CA', (['property', 'liability', 'earthquake', 'flood', 'fidelity'] as const).map((kind) => policy({ kind })), TODAY)
    expect(c.findings.map((f) => f.code)).toEqual(['ca_fidelity_minimum'])
  })

  it('any other or unknown state: check your governing documents, no statute', () => {
    for (const s of ['TX', 'GA', null, '']) {
      const c = coverageCheck(s, [], TODAY)
      expect(c.findings).toEqual([{ code: 'check_governing_documents', severity: 'info', message: CHECK_GOVERNING_DOCUMENTS, citations: [] }])
    }
  })
})

describe('dollarsToCents', () => {
  it('parses dollars, blanks to null, junk to NaN', () => {
    expect(dollarsToCents('1,250.50')).toBe(125050)
    expect(dollarsToCents('$1000')).toBe(100000)
    expect(dollarsToCents(12.5)).toBe(1250)
    expect(dollarsToCents('')).toBeNull()
    expect(dollarsToCents(null)).toBeNull()
    expect(dollarsToCents('-5')).toBeNaN()
    expect(dollarsToCents('1.234')).toBeNaN()
  })
})
