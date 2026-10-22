import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import {
  ALL_DRIFT_CITATIONS,
  CA_5850_CAP,
  CA_5850_CAP_100,
  CA_5850_FINDING,
  CA_5850_NO_LATE_CHARGE,
  CA_5850_SCHEDULE,
  CA_5855_EFFECTIVE,
  CHECK_WITH_ATTORNEY,
  FL_305_AGGREGATE,
  FL_305_CAP,
  FL_305_COMMITTEE,
  FL_305_VOTE,
  FL_3085_LATE_NOTICE,
  GA_223_FINES,
  GA_SB406_FEES,
  GA_SB406_ITEMIZED,
  GA_SB406_NOTICE,
  OVERRIDE_REASON_CODES,
  STATUTE_OVERRIDE_ACTION,
  TX_0062_PLAN,
  TX_0064_CURE,
  TX_0064_NOTICE,
  TX_0064_PLAN,
  TX_006_CURE,
  TX_006_NOTICE,
  blockingFindings,
  checkCollectionsLetter,
  checkFine,
  daysBetween,
  offersNoPlan,
  overrideAuditRow,
  resolveOverrides,
  type DriftCitation,
  type LetterCheckInput,
} from './statute-drift'

/**
 * Every quote in statute-drift.ts must be in the statute text the repo
 * keeps (scripts/fixtures/state-law), word for word, inside the section
 * it cites — and the sections it says are NOT loaded must really be
 * absent, so "check with your attorney" stays honest.
 */
const REPO_ROOT = resolve(__dirname, '../../../../..')
const fixture = (name: string) => readFileSync(resolve(REPO_ROOT, 'scripts/fixtures/state-law', name), 'utf8')
const squash = (s: string) => s.replace(/\s+/g, ' ')

const between = (text: string, startMarker: string, endMarker: string) => {
  const start = text.indexOf(startMarker)
  expect(start, startMarker).toBeGreaterThanOrEqual(0)
  const end = text.indexOf(endMarker, start + startMarker.length)
  return squash(text.slice(start, end === -1 ? undefined : end))
}
const caSection = (n: string) => between(fixture('ca-civ-davis-stirling-2026.txt'), `=== Civ. Code § ${n}.  [`, '\n=== ')
const fl = parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026)
const flSection = (cite: string) => {
  const body = fl.find((r) => r.code_citation === cite)?.body
  expect(body, cite).toBeTruthy()
  return squash(body!)
}
const tx0064 = between(fixture('tx-prop-209-2026.txt'), '=== Sec. 209.0064.', '\n=== ')
const tx0062 = between(fixture('tx-prop-209-0062-2026.txt'), '=== Sec. 209.0062.', '\n=== ')
const tx006Html = fixture('tcss-pr209-2026-excerpt.htm')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&')
const tx006 = between(tx006Html, 'Sec. 209.006.', 'Sec. 209.017.')
const gaText = fixture('ga-ocga-44-3-art6-2026.txt')
const ga223 = between(gaText, '=== O.C.G.A. Section 44-3-223 |', '\n=== ')
const gaSb406s7 = between(gaText, '=== Ga. L. 2026, SB 406, § 7 |', '\n=== ')
const sb406Text = fixture('ga-sb406-2026-registration.txt')
const gaSb406s2 = between(sb406Text, '=== SECTION 2. (new O.C.G.A. § 43-17A-2,', '\n=== ')
const gaSb406s9 = between(sb406Text, '=== SECTION 9.', '\n=== ')

/** The cited section's text, so a quote can't pass by matching a different section. */
function sectionFor(c: DriftCitation): string {
  if (c.cite.startsWith('Cal. Civ. Code § 5850')) return caSection('5850')
  if (c.cite.startsWith('Cal. Civ. Code § 5855')) return caSection('5855')
  if (c.cite.startsWith('Fla. Stat. § 720.3085')) return flSection('Fla. Stat. § 720.3085')
  if (c.cite.startsWith('Fla. Stat. § 720.305')) return flSection('Fla. Stat. § 720.305')
  if (c.cite.startsWith('Tex. Prop. Code § 209.0064')) return tx0064
  if (c.cite.startsWith('Tex. Prop. Code § 209.0062')) return tx0062
  if (c.cite.startsWith('Tex. Prop. Code § 209.006(')) return tx006
  if (c.cite.startsWith('O.C.G.A. § 44-3-223')) return ga223
  if (c.cite.startsWith('Ga. L. 2026, SB 406 § 7')) return gaSb406s7
  if (c.cite.startsWith('O.C.G.A. § 43-17A-2')) return gaSb406s2
  if (c.cite.startsWith('Ga. L. 2026, SB 406 § 9')) return gaSb406s9
  throw new Error(`no section mapped for ${c.cite}`)
}

describe('citations are verbatim from the fixtures, in the section they cite', () => {
  it.each(ALL_DRIFT_CITATIONS.map((c) => [c.cite, c] as const))('%s', (_cite, c) => {
    expect(sectionFor(c)).toContain(squash(c.quote))
  })

  it('pinpoints: each quote opens (or sits in) the subdivision it names', () => {
    const ca5850 = caSection('5850')
    expect(ca5850).toContain(`(c)${CA_5850_CAP.quote}`)
    expect(ca5850).toContain(`(1)${CA_5850_SCHEDULE.quote}`)
    expect(ca5850).toContain(`(2)${CA_5850_CAP_100.quote}`)
    expect(ca5850).toContain(`(2)${CA_5850_FINDING.quote}`)
    expect(ca5850).toContain(`(e)${CA_5850_NO_LATE_CHARGE.quote}`)
    expect(caSection('5855')).toContain(`(g)${CA_5855_EFFECTIVE.quote}`)
    // AB 130 is the amendment in force.
    expect(fixture('ca-civ-davis-stirling-2026.txt')).toContain('=== Civ. Code § 5850.  [Amended by Stats. 2025, Ch. 22, Sec. 3.   (AB 130)')

    const fl305 = flSection('Fla. Stat. § 720.305')
    expect(fl305).toContain(`(2) An association may levy reasonable fines`)
    expect(fl305.indexOf(FL_305_CAP.quote)).toBeLessThan(fl305.indexOf('(a) An association may suspend'))
    expect(fl305.indexOf(FL_305_AGGREGATE.quote)).toBeLessThan(fl305.indexOf('(a) An association may suspend'))
    expect(fl305).toContain(`(c) ${FL_305_VOTE.quote}`)
    const b = fl305.indexOf('(b) A fine or suspension levied by the board')
    expect(b).toBeGreaterThan(0)
    expect(fl305.indexOf(FL_305_COMMITTEE.quote)).toBeGreaterThan(b)
    expect(flSection('Fla. Stat. § 720.3085')).toContain(`(d) ${FL_3085_LATE_NOTICE.quote}`)

    expect(tx0064).toContain(`(b) ${TX_0064_NOTICE.quote}`)
    expect(tx0064).toContain(`(2) ${TX_0064_PLAN.quote}`)
    expect(tx0064).toContain(`(3) ${TX_0064_CURE.quote}`)
    expect(tx0062).toContain(`(a) ${TX_0062_PLAN.quote}`)
    expect(tx006).toContain(`(e) ${TX_006_CURE.quote}`)
    expect(tx006.indexOf(TX_006_NOTICE.quote)).toBeLessThan(tx006.indexOf('(b) The notice must:'))

    expect(gaSb406s7).toContain(`(f) ${GA_SB406_FEES.quote}`)
    expect(gaSb406s7).toContain(`(1) ${GA_SB406_NOTICE.quote}`)
    expect(gaSb406s7).toContain(`(3) ${GA_SB406_ITEMIZED.quote}`)
    expect(gaSb406s7).toContain('@effective_date: 2026-07-01')
    expect(ga223).toContain(GA_223_FINES.quote)
  })

  it('the new TX fixture records its official source and retrieval date', () => {
    const t = fixture('tx-prop-209-0062-2026.txt')
    expect(t).toContain('https://tcss.legis.texas.gov/resources/PR/htm/PR.209.htm')
    expect(t).toContain('Retrieved 2026-10-20.')
  })

  it('what NOT_LOADED says is missing really is', () => {
    // GA's payment-order rule is SB 406 § 2 (ch. 43-17A), in force 2027-01-01, and not in any GA fixture.
    for (const f of ['ga-ocga-44-3-art6-2026.txt', 'ga-sb406-2026-registration.txt']) {
      expect(fixture(f)).not.toMatch(/order of priority|priority of application/i)
    }
  })
})

const withPenalty = (state: string | null, dailyFineCents: number | null) => checkFine({ state, dailyFineCents })
const codes = (c: { findings: { code: string; severity: string }[] }) => c.findings.map((f) => `${f.severity}:${f.code}`)

describe('fines — California (Civ. Code § 5850 as amended by AB 130)', () => {
  it('over $100 a day blocks; the health-or-safety finding is an allowed override', () => {
    const c = withPenalty('CA', 10_001)
    const block = blockingFindings(c)
    expect(block.map((f) => f.code)).toEqual(['ca_fine_over_cap'])
    expect(block[0]!.citations).toEqual([CA_5850_CAP, CA_5850_CAP_100, CA_5850_FINDING])
    expect(block[0]!.overrideReasons).toEqual(['health_safety_finding', 'attorney_advised'])
    expect(block[0]!.message).toContain('$100.01 a day')
  })

  it('exactly $100 does not block, but the schedule, late-charge and hearing warnings stay', () => {
    expect(codes(withPenalty('CA', 10_000))).toEqual([
      'warn:ca_fine_schedule',
      'warn:ca_no_late_charge_on_fine',
      'warn:ca_hearing_not_recorded',
    ])
  })

  it('no fine set: no amount warnings', () => {
    expect(codes(withPenalty('california', null))).toEqual(['warn:ca_no_late_charge_on_fine', 'warn:ca_hearing_not_recorded'])
  })
})

describe('fines — Florida (§ 720.305(2))', () => {
  it('over $100 blocks unless the governing documents provide otherwise', () => {
    const c = withPenalty('FL', 15_000)
    const [block] = blockingFindings(c)
    expect(block!.code).toBe('fl_fine_over_cap')
    expect(block!.citations).toEqual([FL_305_CAP])
    expect(block!.overrideReasons).toEqual(['governing_documents_allow', 'attorney_advised'])
  })

  it('the $1,000 aggregate: days until a daily fine reaches it', () => {
    const c = withPenalty('FL', 2_500)
    expect(blockingFindings(c)).toEqual([])
    const agg = c.findings.find((f) => f.code === 'fl_fine_aggregate')!
    expect(agg.severity).toBe('warn')
    expect(agg.message).toContain('after 40 days')
    expect(agg.citations).toEqual([FL_305_AGGREGATE])
    expect(withPenalty('FL', 30_000).findings.find((f) => f.code === 'fl_fine_aggregate')!.message).toContain('after 4 days')
  })

  it('the hearing committee is always a warning until the hearing record exists (BL-133)', () => {
    const h = withPenalty('FL', 0).findings.find((f) => f.code === 'fl_hearing_committee')!
    expect(h.severity).toBe('warn')
    expect(h.citations).toEqual([FL_305_COMMITTEE, FL_305_VOTE])
  })
})

describe('fines — Texas (§ 209.006) and Georgia (§ 44-3-223)', () => {
  it('TX: certified-mail notice and the cure period are warnings', () => {
    const c = withPenalty('TX', 50_000)
    expect(codes(c)).toEqual(['warn:tx_fine_certified_notice', 'warn:tx_fine_cure_period'])
    expect(c.findings[0]!.citations).toEqual([TX_006_NOTICE])
    expect(c.findings[1]!.citations).toEqual([TX_006_CURE])
  })

  it('GA: fines only as far as the instrument provides', () => {
    const c = withPenalty('GA', 2_500)
    expect(codes(c)).toEqual(['warn:ga_fine_instrument'])
    expect(c.findings[0]!.citations).toEqual([GA_223_FINES])
  })

  it('every other state (or none): no findings, and "check with your attorney"', () => {
    for (const s of ['NY', null, 'Florida-ish']) {
      const c = withPenalty(s, 99_999)
      expect(c.findings).toEqual([])
      expect(c.notLoaded).toEqual([CHECK_WITH_ATTORNEY])
    }
  })
})

const letter = (over: Partial<LetterCheckInput>): LetterCheckInput => ({
  state: 'TX',
  kind: 'past_due',
  letterDate: '2026-10-20',
  listedChargeTypes: ['regular'],
  values: {},
  events: [],
  printed: [],
  ...over,
})

describe('collections letters — Texas (§§ 209.0064, 209.0062)', () => {
  it('collection fees without a delinquency notice printed 45+ days earlier block', () => {
    const c = checkCollectionsLetter(letter({ listedChargeTypes: ['regular', 'collection_legal'] }))
    const [block] = blockingFindings(c)
    expect(block!.code).toBe('tx_collection_fees_without_notice')
    expect(block!.citations).toEqual([TX_0064_NOTICE, TX_0064_CURE])
    expect(block!.overrideReasons).toContain('not_collection_agent_fees')
  })

  it('44 days is not enough; 45 days is', () => {
    const at = (printedOn: string) =>
      blockingFindings(checkCollectionsLetter(letter({ listedChargeTypes: ['collection_processing'], printed: [{ kind: 'tx_delinquency', printedOn }] })))
    expect(at('2026-09-06')).toHaveLength(1) // 44 days
    expect(at('2026-09-05')).toEqual([]) // 45 days
  })

  it('a past-due letter printed earlier is not the § 209.0064 notice', () => {
    const c = checkCollectionsLetter(letter({ listedChargeTypes: ['collection_legal'], printed: [{ kind: 'past_due', printedOn: '2026-01-01' }] }))
    expect(blockingFindings(c)).toHaveLength(1)
  })

  it('no collection fees listed: nothing to check', () => {
    expect(checkCollectionsLetter(letter({ listedChargeTypes: ['regular', 'late_fee', 'fine'] })).findings).toEqual([])
  })

  it('a delinquency notice that offers no payment plan blocks; a described plan passes', () => {
    for (const v of ['Not applicable', 'N/A', 'none.', 'n/a ']) {
      const c = checkCollectionsLetter(letter({ kind: 'tx_delinquency', values: { paymentPlan: v } }))
      const [block] = blockingFindings(c)
      expect(block!.code, v).toBe('tx_payment_plan_missing')
      expect(block!.citations).toEqual([TX_0062_PLAN, TX_0064_PLAN])
    }
    expect(checkCollectionsLetter(letter({ kind: 'tx_delinquency', values: { paymentPlan: 'You may pay over 6 months under our guidelines.' } })).findings).toEqual([])
    // An empty BLANK is the letter's own gate, not a law finding.
    expect(checkCollectionsLetter(letter({ kind: 'tx_delinquency', values: {} })).findings).toEqual([])
  })

  it('offersNoPlan', () => {
    expect(offersNoPlan('Not applicable.')).toBe(true)
    expect(offersNoPlan('Contact us to set up a 3-month plan')).toBe(false)
  })
})

describe('collections letters — Georgia (SB 406 § 7), Florida (§ 720.3085(3)(d)), California (§ 5850(e))', () => {
  it('GA: attorney fees block from July 1, 2026, and not before', () => {
    const on = checkCollectionsLetter(letter({ state: 'GA', listedChargeTypes: ['collection_legal'], letterDate: '2026-07-01' }))
    const [block] = blockingFindings(on)
    expect(block!.code).toBe('ga_attorney_fees_prerequisites')
    expect(block!.citations).toEqual([GA_SB406_FEES, GA_SB406_NOTICE, GA_SB406_ITEMIZED])
    expect(block!.overrideReasons).toEqual(['notice_sent_outside_app', 'emergency_conditions', 'attorney_advised'])
    expect(checkCollectionsLetter(letter({ state: 'GA', listedChargeTypes: ['collection_legal'], letterDate: '2026-06-30' })).findings).toEqual([])
    expect(checkCollectionsLetter(letter({ state: 'GA', listedChargeTypes: ['collection_processing'] })).findings).toEqual([])
  })

  it('GA: the dues-first rule is listed as not loaded', () => {
    expect(checkCollectionsLetter(letter({ state: 'GA' })).notLoaded.join(' ')).toContain('January 1, 2027')
  })

  it('FL: attorney fees need a notice of late assessment recorded 30+ days earlier', () => {
    const base = letter({ state: 'FL', listedChargeTypes: ['regular', 'collection_legal'] })
    const [block] = blockingFindings(checkCollectionsLetter(base))
    expect(block!.code).toBe('fl_attorney_fees_without_late_notice')
    expect(block!.citations).toEqual([FL_3085_LATE_NOTICE])
    const recent = { ...base, events: [{ eventType: 'lien_warning_sent', occurredOn: '2026-09-21' }] } // 29 days
    expect(blockingFindings(checkCollectionsLetter(recent))).toHaveLength(1)
    const old = { ...base, events: [{ eventType: 'lien_warning_sent', occurredOn: '2026-09-20' }] } // 30 days
    expect(checkCollectionsLetter(old).findings).toEqual([])
  })

  it('CA: a fine listed with late charges warns', () => {
    const c = checkCollectionsLetter(letter({ state: 'CA', listedChargeTypes: ['fine', 'late_fee'] }))
    expect(codes(c)).toEqual(['warn:ca_late_charge_with_fine'])
    expect(c.findings[0]!.citations).toEqual([CA_5850_NO_LATE_CHARGE])
    expect(checkCollectionsLetter(letter({ state: 'CA', listedChargeTypes: ['fine'] })).findings).toEqual([])
  })
})

describe('the board override', () => {
  const blocked = checkFine({ state: 'CA', dailyFineCents: 20_000 })

  it('never silently allows: no reason, an unknown reason, or one the finding does not allow, all refuse', () => {
    for (const o of [undefined, null, {}, { ca_fine_over_cap: 'made_up' }, { ca_fine_over_cap: 'governing_documents_allow' }]) {
      const r = resolveOverrides(blocked, o as Record<string, string> | undefined)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.missing).toEqual(['ca_fine_over_cap'])
    }
  })

  it('an allowed reason per blocking finding goes ahead', () => {
    const r = resolveOverrides(blocked, { ca_fine_over_cap: 'health_safety_finding' })
    expect(r).toEqual({ ok: true, applied: [{ code: 'ca_fine_over_cap', reason: 'health_safety_finding' }] })
    expect(resolveOverrides(checkFine({ state: 'CA', dailyFineCents: 100 }), undefined)).toEqual({ ok: true, applied: [] })
  })

  it('every block offers attorney_advised, and every reason is a known code', () => {
    for (const c of [blocked, checkFine({ state: 'FL', dailyFineCents: 50_000 })]) {
      for (const f of blockingFindings(c)) {
        expect(f.overrideReasons).toContain('attorney_advised')
        for (const r of f.overrideReasons) expect(OVERRIDE_REASON_CODES).toContain(r)
      }
    }
  })

  it('the audit row carries ids and codes only', () => {
    const row = overrideAuditRow({
      orgId: 'org-1',
      userId: 'user-1',
      entityType: 'hoa_violation',
      entityId: 'v-1',
      step: 'fine',
      state: 'CA',
      applied: [{ code: 'ca_fine_over_cap', reason: 'health_safety_finding' }],
    })
    expect(row).toEqual({
      action: STATUTE_OVERRIDE_ACTION,
      org_id: 'org-1',
      user_id: 'user-1',
      entity_type: 'hoa_violation',
      entity_id: 'v-1',
      metadata: { step: 'fine', state: 'CA', overrides: [{ code: 'ca_fine_over_cap', reason: 'health_safety_finding' }] },
    })
  })
})

describe('daysBetween', () => {
  it('counts calendar days and refuses an unreadable date', () => {
    expect(daysBetween('2026-09-05', '2026-10-20')).toBe(45)
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetween('bad', '2026-10-20')).toBeNull()
  })
})
