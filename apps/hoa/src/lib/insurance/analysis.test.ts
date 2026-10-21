import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  carrierKey,
  compareTerms,
  fidelityAdequacy,
  formatPct,
  ownerPolicySummaries,
  previousTerm,
  renewalComparisons,
  termChange,
} from './analysis'
import { CHECK_GOVERNING_DOCUMENTS, FL_3033_AMOUNT, POLICY_KINDS, type InsurancePolicy } from './model'
import { OWNER_INSURANCE_COLUMNS } from './queries'

const here = path.dirname(fileURLToPath(import.meta.url))

function policy(over: Partial<InsurancePolicy> & { id: string }): InsurancePolicy {
  return {
    associationId: 'a1',
    kind: 'property',
    carrier: 'Acme Mutual',
    policyNumber: 'PN-1',
    coverageLimitCents: 100_000_000,
    deductibleCents: 1_000_000,
    premiumCents: 2_000_000,
    effectiveOn: '2025-11-01',
    expiresOn: '2026-11-01',
    documentId: null,
    notes: null,
    ...over,
  }
}

const OLD = policy({ id: 'old', effectiveOn: '2025-11-01', expiresOn: '2026-11-01' })
const NEW = policy({
  id: 'new',
  carrier: 'ACME  Mutual.',
  effectiveOn: '2026-11-01',
  expiresOn: '2027-11-01',
  premiumCents: 2_300_000,
  coverageLimitCents: 90_000_000,
  deductibleCents: 1_000_000,
})

describe('previousTerm (kind + carrier + adjacent dates, no link column)', () => {
  it('matches the same kind and carrier ending on the day the new term starts', () => {
    expect(previousTerm(NEW, [OLD, NEW])?.id).toBe('old')
  })
  it('allows a one-day gap or overlap either side', () => {
    expect(previousTerm({ ...NEW, effectiveOn: '2026-11-02' }, [OLD, NEW])?.id).toBe('old')
    expect(previousTerm({ ...NEW, effectiveOn: '2026-10-31' }, [OLD, NEW])?.id).toBe('old')
    expect(previousTerm({ ...NEW, effectiveOn: '2026-11-03' }, [OLD, NEW])).toBeNull()
  })
  it('does not match a different carrier, kind or association', () => {
    expect(previousTerm({ ...NEW, carrier: 'Other Co' }, [OLD])).toBeNull()
    expect(previousTerm({ ...NEW, kind: 'liability' }, [OLD])).toBeNull()
    expect(previousTerm({ ...NEW, associationId: 'a2' }, [OLD])).toBeNull()
  })
  it('needs a start date on the newer policy', () => {
    expect(previousTerm({ ...NEW, effectiveOn: null }, [OLD])).toBeNull()
  })
  it('never treats a later policy as the previous term', () => {
    expect(previousTerm(OLD, [OLD, NEW])).toBeNull()
  })
  it('normalises carrier names', () => {
    expect(carrierKey('Acme Mutual, Inc.')).toBe(carrierKey('acme   mutual inc'))
  })
})

describe('termChange / compareTerms', () => {
  it('marks a premium rise and a limit cut as worse, an unchanged deductible as same', () => {
    const r = compareTerms(NEW, OLD)
    const by = Object.fromEntries(r.changes.map((c) => [c.field, c]))
    expect(by.premium).toMatchObject({ deltaCents: 300_000, direction: 'worse' })
    expect(by.premium!.pct).toBeCloseTo(0.15)
    expect(by.limit).toMatchObject({ deltaCents: -10_000_000, direction: 'worse' })
    expect(by.deductible).toMatchObject({ deltaCents: 0, direction: 'same' })
    expect(r.hasWorse).toBe(true)
  })
  it('marks a premium drop, a higher limit and a lower deductible as better', () => {
    expect(termChange('premium', 100, 90).direction).toBe('better')
    expect(termChange('limit', 100, 200).direction).toBe('better')
    expect(termChange('deductible', 100, 50).direction).toBe('better')
    expect(termChange('deductible', 100, 150).direction).toBe('worse')
  })
  it('is unknown when either term lacks the figure, and has no % from zero', () => {
    expect(termChange('premium', null, 100)).toMatchObject({ direction: 'unknown', deltaCents: null, pct: null })
    expect(termChange('premium', 0, 100)).toMatchObject({ direction: 'worse', pct: null })
  })
  it('formats percentages', () => {
    expect(formatPct(0.15)).toBe('+15%')
    expect(formatPct(-0.034)).toBe('−3.4%')
    expect(formatPct(0)).toBe('0%')
    expect(formatPct(null)).toBeNull()
  })
})

describe('renewalComparisons', () => {
  it('compares the renewed policy with its previous term, not the old one with nothing', () => {
    const out = renewalComparisons([OLD, NEW], '2026-10-21')
    expect(out).toHaveLength(1)
    expect(out[0]!.current.id).toBe('new')
    expect(out[0]!.previous.id).toBe('old')
  })
  it('skips renewals that have themselves ended', () => {
    expect(renewalComparisons([OLD, NEW], '2027-12-01')).toEqual([])
  })
})

describe('fidelityAdequacy', () => {
  const bond = policy({ id: 'b', kind: 'fidelity', coverageLimitCents: 25_000_000, effectiveOn: '2026-01-01', expiresOn: '2027-01-01' })
  const today = '2026-10-21'

  it('is null without an active fidelity bond', () => {
    expect(fidelityAdequacy({ state: 'FL', policies: [OLD], today, reserveBalance: 1, operatingCash: 1 })).toBeNull()
  })
  it('FL: short when reserve + operating exceed the bond, quoting § 720.3033(5)', () => {
    const f = fidelityAdequacy({ state: 'FL', policies: [bond], today, reserveBalance: 200_000, operatingCash: 60_000.5 })!
    expect(f.status).toBe('short')
    expect(f.heldCents).toBe(26_000_050)
    expect(f.shortfallCents).toBe(1_000_050)
    expect(f.severity).toBe('warn')
    expect(f.citations).toEqual([FL_3033_AMOUNT])
  })
  it('FL: covered still says to compare with the year’s highest balance', () => {
    const f = fidelityAdequacy({ state: 'fl', policies: [bond], today, reserveBalance: 100_000, operatingCash: 20_000 })!
    expect(f.status).toBe('covered')
    expect(f.severity).toBe('info')
    expect(f.message).toMatch(/highest balance/)
  })
  it('other states: information only, and "check your governing documents"', () => {
    const f = fidelityAdequacy({ state: 'GA', policies: [bond], today, reserveBalance: 300_000, operatingCash: 0 })!
    expect(f.status).toBe('short')
    expect(f.severity).toBe('info')
    expect(f.citations).toEqual([])
    expect(f.message).toContain(CHECK_GOVERNING_DOCUMENTS)
  })
  it('unknown when the bond has no limit or the books have no balances', () => {
    expect(
      fidelityAdequacy({ state: 'FL', policies: [{ ...bond, coverageLimitCents: null }], today, reserveBalance: 1, operatingCash: 1 })!
        .status,
    ).toBe('unknown')
    expect(fidelityAdequacy({ state: 'FL', policies: [bond], today, reserveBalance: null, operatingCash: null })!.status).toBe(
      'unknown',
    )
  })
  it('counts a missing reserve fund as zero when operating cash is known', () => {
    const f = fidelityAdequacy({ state: 'CA', policies: [bond], today, reserveBalance: null, operatingCash: 1_000 })!
    expect(f).toMatchObject({ status: 'covered', heldCents: 100_000, reserveCents: null })
  })
})

describe('owner-facing summary', () => {
  it('lists only policies in force, with no premium or policy number', () => {
    const out = ownerPolicySummaries([OLD, NEW, policy({ id: 'l', kind: 'liability' })], '2026-10-21', POLICY_KINDS)
    expect(out.map((p) => p.id)).toEqual(['old', 'l'])
    for (const p of out) {
      expect(Object.keys(p).sort()).toEqual(
        ['associationId', 'carrier', 'coverageLimitCents', 'deductibleCents', 'expiresOn', 'id', 'kind'].sort(),
      )
    }
  })
  it('never reads premium, policy number, notes or the document link', () => {
    for (const col of ['premium_cents', 'policy_number', 'notes', 'document_id']) {
      expect(OWNER_INSURANCE_COLUMNS).not.toContain(col)
    }
  })
  it('the resident page reads with the owner columns, not the board loader', () => {
    const page = readFileSync(path.join(here, '../../app/resident/insurance/page.tsx'), 'utf8')
    expect(page).toContain('loadOwnerInsurancePolicies(')
    expect(page).not.toMatch(/loadInsurancePolicies\(|premiumCents|policyNumber/)
  })
})
