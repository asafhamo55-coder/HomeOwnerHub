import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '../W30-state-law-brain/sources/florida'
import { STATUTE_EVAL_CASES, runStatuteEvalCase, runStatuteEvalSuite } from './eval'

// Offline: the statute text is the recorded official flsenate.gov page and
// the model's prose is a stub inside eval.ts. No network, no model.
const FL_RECORDS = parseFloridaChapter(
  readFileSync(resolve(__dirname, '../../../../scripts/fixtures/state-law/flsenate-ch720-2026.html'), 'utf8'),
  2026,
)
const statuteTextFor = (rules: { citation: string | null }) =>
  FL_RECORDS.find((r) => r.code_citation === rules.citation)?.body ?? null

describe('W3 statute eval set (BL-019)', () => {
  it('covers Florida, California and a non-encoded state, with refusal cases for both encoded states', () => {
    const states = new Set(STATUTE_EVAL_CASES.map((c) => c.state?.slice(0, 2).toUpperCase()))
    expect(states).toEqual(new Set(['FL', 'CA', 'TX']))
    const refusedFor = (p: string) =>
      STATUTE_EVAL_CASES.filter((c) => c.expect.refused && c.state?.toUpperCase().startsWith(p)).length
    expect(refusedFor('F')).toBeGreaterThanOrEqual(3)
    expect(refusedFor('C')).toBeGreaterThanOrEqual(3)
  })

  it('every case passes', () => {
    const suite = runStatuteEvalSuite(STATUTE_EVAL_CASES, { statuteTextFor })
    expect(suite.failures).toEqual([])
    expect(suite.passed).toBe(STATUTE_EVAL_CASES.length)
  })

  it('the harness actually fails a case whose expectation is wrong', () => {
    const wrong = { ...STATUTE_EVAL_CASES[0], expect: { refused: true as const, reasonContains: [] } }
    expect(runStatuteEvalCase(wrong, { statuteTextFor }).passed).toBe(false)
    const missingQuote = runStatuteEvalCase(STATUTE_EVAL_CASES[0], { statuteTextFor: () => null })
    expect(missingQuote.passed).toBe(false)
    expect(missingQuote.reasons.join(' ')).toMatch(/quote \(2\)\(b\) missing/)
  })
})
