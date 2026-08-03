import { describe, expect, it } from 'vitest'
import { acceptSuggestion, MAX_SUGGESTION_CHARS } from './daily-digest'

describe('acceptSuggestion', () => {
  it('accepts a normal one-line suggestion', () => {
    expect(acceptSuggestion('Start with the retention pond thread — oldest, unanswered 6d')).toBe(
      'Start with the retention pond thread — oldest, unanswered 6d',
    )
  })

  it('trims surrounding whitespace', () => {
    expect(acceptSuggestion('  Start with the pond thread  ')).toBe('Start with the pond thread')
  })

  it('rejects an empty string', () => {
    expect(acceptSuggestion('')).toBeNull()
  })

  it('rejects a whitespace-only response', () => {
    expect(acceptSuggestion('   \n  ')).toBeNull()
  })

  it('rejects null and undefined', () => {
    expect(acceptSuggestion(null)).toBeNull()
    expect(acceptSuggestion(undefined)).toBeNull()
  })

  it('rejects a response longer than the cap', () => {
    // Past this the model has stopped answering "what should I start with"
    // and started writing prose — the failure this rewrite exists to end.
    expect(acceptSuggestion('x'.repeat(MAX_SUGGESTION_CHARS + 1))).toBeNull()
  })

  it('accepts a response exactly at the cap', () => {
    const atCap = 'x'.repeat(MAX_SUGGESTION_CHARS)
    expect(acceptSuggestion(atCap)).toBe(atCap)
  })
})
