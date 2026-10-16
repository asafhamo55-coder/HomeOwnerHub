import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '../W30-state-law-brain/sources/florida'
import {
  FL_720_305_QUOTES,
  StatuteRuleRefusalError,
  applyStateRulesToDraft,
  assertRequestedActionAllowed,
  evaluateRequestedAction,
  selectStateRules,
  verifyStatuteQuotes,
} from './state-rules'

/**
 * The official flsenate.gov Chapter 720 (2026) page, recorded 2026-10-15 —
 * the same fixture the W30 Florida adapter tests parse. Parsing it with the
 * production parser gives exactly the body the ingester stores in
 * `state_statutes`, so a quote that validates here validates in prod.
 */
const FIXTURE = readFileSync(
  resolve(__dirname, '../../../../scripts/fixtures/state-law/flsenate-ch720-2026.html'),
  'utf8',
)
const FL_720_305 = parseFloridaChapter(FIXTURE, 2026).find(
  (r) => r.code_citation === 'Fla. Stat. § 720.305',
)!.body

describe('selectStateRules — rule selection by state', () => {
  it('picks the Florida rule set for FL in any common spelling', () => {
    for (const s of ['FL', 'fl', ' Fl ', 'Florida', 'FLORIDA']) {
      const r = selectStateRules(s)
      expect(r.jurisdiction).toBe('FL')
      expect(r.citation).toBe('Fla. Stat. § 720.305')
      expect(r.hearingNoticeDays).toBe(14)
      expect(r.hearingRequiredBeforeFine).toBe(true)
      expect(r.cureBarsFine).toBe(true)
      expect(r.textVerified).toBe(true)
    }
  })

  it('picks the California rule set for CA, marked as not verified against official text', () => {
    for (const s of ['CA', 'ca', 'California']) {
      const r = selectStateRules(s)
      expect(r.jurisdiction).toBe('CA')
      expect(r.hearingNoticeDays).toBe(10)
      expect(r.fineCapCents).toBe(10_000)
      expect(r.fineCapOverride).toBe('health_safety_finding')
      expect(r.lateFeesOnFinesForbidden).toBe(true)
      expect(r.textVerified).toBe(false)
      // No verbatim quote is ever offered for CA: the official text could
      // not be fetched, so there is nothing to validate a quote against.
      expect(r.quotes).toEqual([])
      expect(r.verifyNote).toMatch(/verify against the statute/i)
    }
  })

  it('falls back to generic verify-against-your-statute wording for other or unknown states', () => {
    for (const s of ['GA', 'TX', 'NY', null, undefined, '', 'Narnia']) {
      const r = selectStateRules(s)
      expect(r.jurisdiction).toBe('OTHER')
      expect(r.citation).toBeNull()
      expect(r.quotes).toEqual([])
      expect(r.noticeLanguage).toMatch(/verify against your state's statute/i)
    }
    expect(selectStateRules('GA').state).toBe('GA')
    expect(selectStateRules(null).state).toBeNull()
  })
})

describe('evaluateRequestedAction — refusal cases', () => {
  const fl = selectStateRules('FL')
  const ca = selectStateRules('CA')
  const other = selectStateRules('GA')

  it('a first notice with no requested step is never refused', () => {
    for (const r of [fl, ca, other]) {
      expect(evaluateRequestedAction(r, undefined).refusals).toEqual([])
      expect(evaluateRequestedAction(r, { step: 'first_notice' }).refusals).toEqual([])
    }
  })

  it('FL: refuses a fine without a committee hearing', () => {
    const { refusals } = evaluateRequestedAction(fl, { step: 'impose_fine', fineAmountCents: 5000 })
    expect(refusals).toHaveLength(1)
    expect(refusals[0]).toMatch(/720\.305\(2\)\(b\)/)
    expect(refusals[0]).toMatch(/hearing/i)
  })

  it('FL: refuses a suspension without a committee hearing', () => {
    const { refusals } = evaluateRequestedAction(fl, { step: 'impose_suspension' })
    expect(refusals[0]).toMatch(/suspension/i)
  })

  it('FL: refuses a fine on a cured violation even after a hearing', () => {
    const { refusals } = evaluateRequestedAction(fl, {
      step: 'impose_fine',
      hearingHeld: true,
      violationCured: true,
      fineAmountCents: 5000,
    })
    expect(refusals.some((r) => /720\.305\(2\)\(e\)/.test(r) && /cured/i.test(r))).toBe(true)
  })

  it('FL: allows a fine the committee approved at a hearing on an uncured violation', () => {
    expect(
      evaluateRequestedAction(fl, { step: 'impose_fine', hearingHeld: true, fineAmountCents: 5000 }).refusals,
    ).toEqual([])
  })

  it('FL: refuses a hearing notice shorter than 14 days, or a hearing set more than 90 days out', () => {
    expect(evaluateRequestedAction(fl, { step: 'hearing_notice', hearingNoticeDays: 7 }).refusals[0]).toMatch(
      /14 days/,
    )
    expect(evaluateRequestedAction(fl, { step: 'hearing_notice', hearingNoticeDays: 120 }).refusals[0]).toMatch(
      /90 days/,
    )
    expect(evaluateRequestedAction(fl, { step: 'hearing_notice', hearingNoticeDays: 14 }).refusals).toEqual([])
  })

  it('FL: a fine over $100 is a warning (governing documents may allow more), not a refusal', () => {
    const res = evaluateRequestedAction(fl, { step: 'impose_fine', hearingHeld: true, fineAmountCents: 25_000 })
    expect(res.refusals).toEqual([])
    expect(res.warnings.join(' ')).toMatch(/\$100.*governing documents/i)
  })

  it('CA: refuses a fine above $100 without a health/safety finding', () => {
    const { refusals } = evaluateRequestedAction(ca, {
      step: 'impose_fine',
      hearingHeld: true,
      fineAmountCents: 25_000,
    })
    expect(refusals).toHaveLength(1)
    expect(refusals[0]).toMatch(/\$100/)
    expect(refusals[0]).toMatch(/health or safety/i)
    expect(refusals[0]).toMatch(/verify against the statute/i)
  })

  it('CA: allows a fine above $100 when the board made a health/safety finding', () => {
    expect(
      evaluateRequestedAction(ca, {
        step: 'impose_fine',
        hearingHeld: true,
        fineAmountCents: 25_000,
        healthSafetyFinding: true,
      }).refusals,
    ).toEqual([])
  })

  it('CA: refuses late fees or interest on a fine', () => {
    const { refusals } = evaluateRequestedAction(ca, {
      step: 'impose_fine',
      hearingHeld: true,
      fineAmountCents: 5000,
      lateFeeOrInterestOnFine: true,
    })
    expect(refusals[0]).toMatch(/late fees or interest/i)
  })

  it('CA: refuses a hearing notice under 10 days, a fine without a hearing, and a fine on a cured violation', () => {
    expect(evaluateRequestedAction(ca, { step: 'hearing_notice', hearingNoticeDays: 5 }).refusals[0]).toMatch(
      /10 days/,
    )
    expect(evaluateRequestedAction(ca, { step: 'impose_fine', fineAmountCents: 5000 }).refusals[0]).toMatch(
      /hearing/i,
    )
    expect(
      evaluateRequestedAction(ca, { step: 'impose_fine', hearingHeld: true, violationCured: true }).refusals[0],
    ).toMatch(/cured/i)
  })

  it('other states: never refuses, always warns to verify against the state statute', () => {
    const res = evaluateRequestedAction(other, { step: 'impose_fine', fineAmountCents: 99_999 })
    expect(res.refusals).toEqual([])
    expect(res.warnings.join(' ')).toMatch(/verify against your state's statute/i)
  })

  it('assertRequestedActionAllowed throws a StatuteRuleRefusalError carrying every reason', () => {
    try {
      assertRequestedActionAllowed(ca, {
        step: 'impose_fine',
        fineAmountCents: 25_000,
        lateFeeOrInterestOnFine: true,
      })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(StatuteRuleRefusalError)
      const e = err as StatuteRuleRefusalError
      expect(e.jurisdiction).toBe('CA')
      expect(e.reasons.length).toBe(3) // no hearing, over cap, late fee
      expect(e.message).toMatch(/^statute_rule_refusal/)
    }
  })
})

describe('verifyStatuteQuotes — citation validation (W32 validator)', () => {
  const fl = selectStateRules('FL')

  it('every Florida quote appears verbatim in the official §720.305 text', () => {
    const res = verifyStatuteQuotes(fl, FL_720_305, 'impose_fine')
    expect(res.verified.map((q) => q.pinpoint)).toEqual(FL_720_305_QUOTES.map((q) => q.pinpoint))
    expect(res.rejected).toEqual([])
    for (const q of res.verified) {
      expect(q.citation).toBe('Fla. Stat. § 720.305')
      expect(q.sourceUrl).toMatch(/^https:\/\/www\.flsenate\.gov\//)
    }
  })

  it('the 30-day payment quote is only offered for a fine-imposition letter', () => {
    const first = verifyStatuteQuotes(fl, FL_720_305, 'first_notice')
    expect(first.verified.map((q) => q.pinpoint)).not.toContain('(2)(f)')
  })

  it('drops (never paraphrases) a quote the stored text no longer contains', () => {
    const amended = FL_720_305.replace('at least 14 days’ written notice', 'at least 21 days’ written notice')
    const res = verifyStatuteQuotes(fl, amended, 'first_notice')
    expect(res.verified.map((q) => q.pinpoint)).not.toContain('(2)(b)')
    expect(res.rejected).toContain('(2)(b)')
    expect(res.note).toMatch(/verify against the statute/i)
  })

  it('quotes nothing when the statute text was never ingested', () => {
    const res = verifyStatuteQuotes(fl, null, 'first_notice')
    expect(res.verified).toEqual([])
    expect(res.note).toMatch(/not ingested/i)
  })

  it('quotes nothing for CA or other states, whatever text is supplied', () => {
    expect(verifyStatuteQuotes(selectStateRules('CA'), FL_720_305, 'first_notice').verified).toEqual([])
    expect(verifyStatuteQuotes(selectStateRules('TX'), FL_720_305, 'first_notice').verified).toEqual([])
  })
})

describe('applyStateRulesToDraft — notice language present', () => {
  const modelNotice = 'Dear Owner,\n\nThe front door was repainted without approval.\n\nSincerely,\nThe Board'

  it('FL: appends the 14-day hearing and cure language with the validated quotes', () => {
    const out = applyStateRulesToDraft({
      rules: selectStateRules('FL'),
      requestedAction: undefined,
      modelNotice,
      statuteText: FL_720_305,
      recommendedFineAmountCents: 5000,
    })
    expect(out.notice.startsWith(modelNotice)).toBe(true)
    expect(out.notice).toContain('Fla. Stat. § 720.305')
    expect(out.notice).toMatch(/at least 14 days/)
    expect(out.notice).toMatch(/committee/)
    expect(out.notice).toMatch(/cure/i)
    expect(out.notice).toContain(
      '“A fine or suspension levied by the board of administration may not be imposed unless the board first provides at least 14 days’ written notice of the parcel owner’s right to a hearing',
    )
    expect(out.stateRules.quotes.length).toBeGreaterThanOrEqual(2)
    expect(out.stateRules.jurisdiction).toBe('FL')
  })

  it('FL with no ingested statute: keeps the notice language but quotes nothing', () => {
    const out = applyStateRulesToDraft({
      rules: selectStateRules('FL'),
      requestedAction: undefined,
      modelNotice,
      statuteText: null,
      recommendedFineAmountCents: 5000,
    })
    expect(out.notice).toMatch(/at least 14 days/)
    expect(out.notice).not.toContain('“')
    expect(out.stateRules.quotes).toEqual([])
    expect(out.stateRules.warnings.join(' ')).toMatch(/verify against the statute/i)
  })

  it('CA: appends 10-day notice, $100 cap and no-late-fee language, with verify wording and no quote', () => {
    const out = applyStateRulesToDraft({
      rules: selectStateRules('CA'),
      requestedAction: undefined,
      modelNotice,
      statuteText: null,
      recommendedFineAmountCents: 25_000,
    })
    expect(out.notice).toMatch(/at least 10 days/)
    expect(out.notice).toMatch(/\$100/)
    expect(out.notice).toMatch(/late fees or interest/i)
    expect(out.notice).toMatch(/verify against the statute/i)
    expect(out.notice).not.toContain('“')
    // Recommended fine clamped to the cap: there is no health/safety finding.
    expect(out.recommendedFineAmountCents).toBe(10_000)
  })

  it('CA: keeps a recommended fine above $100 when the board made a health/safety finding', () => {
    const out = applyStateRulesToDraft({
      rules: selectStateRules('CA'),
      requestedAction: { step: 'impose_fine', hearingHeld: true, healthSafetyFinding: true, fineAmountCents: 25_000 },
      modelNotice,
      statuteText: null,
      recommendedFineAmountCents: 25_000,
    })
    expect(out.recommendedFineAmountCents).toBe(25_000)
  })

  it('other states: appends generic verify-against-your-statute wording', () => {
    const out = applyStateRulesToDraft({
      rules: selectStateRules('TX'),
      requestedAction: undefined,
      modelNotice,
      statuteText: null,
      recommendedFineAmountCents: 5000,
    })
    expect(out.notice).toMatch(/verify against your state's statute/i)
    expect(out.stateRules.citation).toBeNull()
  })

  it('refuses before assembling a letter for a forbidden step', () => {
    expect(() =>
      applyStateRulesToDraft({
        rules: selectStateRules('FL'),
        requestedAction: { step: 'impose_fine', fineAmountCents: 5000 },
        modelNotice,
        statuteText: FL_720_305,
        recommendedFineAmountCents: 5000,
      }),
    ).toThrow(StatuteRuleRefusalError)
  })
})
