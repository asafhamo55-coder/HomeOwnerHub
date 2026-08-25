import { describe, expect, it } from 'vitest'
import {
  acceptInsights,
  acceptSuggestion,
  MAX_INSIGHT_WHY_CHARS,
  MAX_INSIGHTS,
  MAX_SUGGESTION_CHARS,
} from './daily-digest'

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

describe('acceptInsights', () => {
  const ALLOWED = ['dues_trend', 'lease_cap', 'coi_expiring', 'arc_backlog', 'untriaged_mail']

  function json(items: unknown): string {
    return JSON.stringify(items)
  }

  it('accepts a well-formed list', () => {
    expect(
      acceptInsights(
        json([
          { kind: 'dues_trend', why: 'Collections are slipping before the budget vote.' },
          { kind: 'lease_cap', why: 'Approving one more lease would breach the CC&Rs.' },
        ]),
        ALLOWED,
      ),
    ).toEqual([
      { kind: 'dues_trend', why: 'Collections are slipping before the budget vote.' },
      { kind: 'lease_cap', why: 'Approving one more lease would breach the CC&Rs.' },
    ])
  })

  it('unwraps a fenced code block', () => {
    // Models wrap JSON in ```json fences unprompted; rejecting a response
    // that is otherwise perfect costs the board the whole section.
    const raw = '```json\n[{"kind":"lease_cap","why":"Cap breach needs a vote."}]\n```'
    expect(acceptInsights(raw, ALLOWED)).toEqual([
      { kind: 'lease_cap', why: 'Cap breach needs a vote.' },
    ])
  })

  it('returns nothing for malformed JSON', () => {
    expect(acceptInsights('not json at all', ALLOWED)).toEqual([])
  })

  it('returns nothing for JSON that is not an array', () => {
    expect(acceptInsights(json({ kind: 'lease_cap', why: 'x' }), ALLOWED)).toEqual([])
  })

  it('returns nothing for null, undefined and empty input', () => {
    expect(acceptInsights(null, ALLOWED)).toEqual([])
    expect(acceptInsights(undefined, ALLOWED)).toEqual([])
    expect(acceptInsights('   ', ALLOWED)).toEqual([])
  })

  it('drops a kind that was not offered', () => {
    // The kind is what binds the model's prose to OUR headline and link.
    // An invented kind has nothing to attach to.
    expect(
      acceptInsights(json([{ kind: 'reserve_study_overdue', why: 'Invented.' }]), ALLOWED),
    ).toEqual([])
  })

  it('keeps only the first of a repeated kind', () => {
    expect(
      acceptInsights(
        json([
          { kind: 'lease_cap', why: 'First.' },
          { kind: 'lease_cap', why: 'Second.' },
        ]),
        ALLOWED,
      ),
    ).toEqual([{ kind: 'lease_cap', why: 'First.' }])
  })

  it('drops an entry whose why is missing or blank', () => {
    expect(
      acceptInsights(
        json([{ kind: 'lease_cap' }, { kind: 'dues_trend', why: '   ' }]),
        ALLOWED,
      ),
    ).toEqual([])
  })

  it('trims surrounding whitespace from why', () => {
    expect(acceptInsights(json([{ kind: 'lease_cap', why: '  Needs a vote.  ' }]), ALLOWED)).toEqual(
      [{ kind: 'lease_cap', why: 'Needs a vote.' }],
    )
  })

  it('drops an entry whose why exceeds the cap', () => {
    const tooLong = 'x'.repeat(MAX_INSIGHT_WHY_CHARS + 1)
    expect(acceptInsights(json([{ kind: 'lease_cap', why: tooLong }]), ALLOWED)).toEqual([])
  })

  it('keeps an entry whose why is exactly at the cap', () => {
    const atCap = 'x'.repeat(MAX_INSIGHT_WHY_CHARS)
    expect(acceptInsights(json([{ kind: 'lease_cap', why: atCap }]), ALLOWED)).toEqual([
      { kind: 'lease_cap', why: atCap },
    ])
  })

  it('drops a non-object entry without discarding its siblings', () => {
    expect(
      acceptInsights(json(['garbage', 7, null, { kind: 'lease_cap', why: 'Real.' }]), ALLOWED),
    ).toEqual([{ kind: 'lease_cap', why: 'Real.' }])
  })

  it('caps the list at MAX_INSIGHTS', () => {
    const five = ALLOWED.map((kind) => ({ kind, why: `Why ${kind}.` }))
    expect(five.length).toBeGreaterThan(MAX_INSIGHTS)
    expect(acceptInsights(json(five), ALLOWED)).toHaveLength(MAX_INSIGHTS)
  })

  it('preserves the order the model returned', () => {
    // The model is asked for most-urgent-first; re-sorting here would
    // throw away the only judgement it was hired to make.
    expect(
      acceptInsights(
        json([
          { kind: 'arc_backlog', why: 'Third.' },
          { kind: 'dues_trend', why: 'First.' },
        ]),
        ALLOWED,
      ).map((i) => i.kind),
    ).toEqual(['arc_backlog', 'dues_trend'])
  })
})
