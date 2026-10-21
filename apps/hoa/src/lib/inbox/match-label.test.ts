import { describe, expect, it } from 'vitest'
import { filedByLine, matchRuleLabel } from './match-label'

// The thread rail printed the raw rule code: "Matched via resident_email"
// (inbox-thread--1440-*.png, 2026-10-20 prod ui-shots).

describe('matchRuleLabel', () => {
  it('words every MatchRule except none', () => {
    for (const rule of ['thread_continuity', 'sender_alias', 'resident_email', 'resident_email_ambiguous', 'address_in_body', 'sender_name']) {
      const label = matchRuleLabel(rule)
      expect(label).toBeTruthy()
      expect(label).not.toContain('_')
    }
  })

  it('is null for none, unknown codes, non-strings and prototype keys', () => {
    expect(matchRuleLabel('none')).toBeNull()
    expect(matchRuleLabel('something_new')).toBeNull()
    expect(matchRuleLabel(undefined)).toBeNull()
    expect(matchRuleLabel('toString')).toBeNull()
  })
})

describe('filedByLine', () => {
  it('reads as a sentence, never a code', () => {
    expect(filedByLine('resident_email', 'auto')).toBe('Matched by the sender’s email on file for a resident')
    expect(filedByLine('resident_email', 'manual')).toBe('Filed here by hand')
    expect(filedByLine(undefined, null)).toBe('Filed under this home')
  })
})
