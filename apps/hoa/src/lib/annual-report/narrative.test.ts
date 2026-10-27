import { describe, expect, it } from 'vitest'
import { NARRATIVE_MAX } from './message'
import { MAX_STORED_NARRATIVES, NARRATIVES_KEY, readNarrative, withNarrative } from './narrative'

const M1 = 'b0000000-0000-4000-8000-000000000001'
const M2 = 'b0000000-0000-4000-8000-000000000002'
const stamp = (t: string) => ({ updatedAt: t, updatedBy: 'user-1' })

describe('annual report narrative storage', () => {
  it('reads nothing from empty, null or malformed settings', () => {
    for (const v of [null, undefined, {}, [], 'x', { [NARRATIVES_KEY]: 'x' }, { [NARRATIVES_KEY]: { [M1]: 5 } }, { [NARRATIVES_KEY]: { [M1]: { text: 7 } } }]) {
      expect(readNarrative(v, M1)).toBe('')
    }
  })

  it('round-trips per meeting and keeps every other settings key', () => {
    const base = { arc_decision_clock: { days: 30 } }
    const a = withNarrative(base, M1, 'We repaved the lot.', stamp('2026-10-01T00:00:00Z'))
    const b = withNarrative(a, M2, 'Second.', stamp('2026-10-02T00:00:00Z'))
    expect(b.arc_decision_clock).toEqual({ days: 30 })
    expect(readNarrative(b, M1)).toBe('We repaved the lot.')
    expect(readNarrative(b, M2)).toBe('Second.')
    expect(base).toEqual({ arc_decision_clock: { days: 30 } })
  })

  it('saving empty text removes that meeting only', () => {
    const a = withNarrative(withNarrative({}, M1, 'one', stamp('2026-10-01T00:00:00Z')), M2, 'two', stamp('2026-10-02T00:00:00Z'))
    const b = withNarrative(a, M1, '  \n ', stamp('2026-10-03T00:00:00Z'))
    expect(readNarrative(b, M1)).toBe('')
    expect(readNarrative(b, M2)).toBe('two')
  })

  it('cuts text to the limit', () => {
    const b = withNarrative({}, M1, 'x'.repeat(NARRATIVE_MAX + 50), stamp('2026-10-01T00:00:00Z'))
    expect(readNarrative(b, M1)).toHaveLength(NARRATIVE_MAX)
  })

  it('keeps at most the cap, dropping the longest-unchanged, never the one just saved', () => {
    let s: Record<string, unknown> = {}
    const ids = Array.from({ length: MAX_STORED_NARRATIVES + 2 }, (_, i) => `b0000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}`)
    ids.forEach((id, i) => {
      s = withNarrative(s, id, `t${i}`, stamp(`2026-10-${String(i + 1).padStart(2, '0')}T00:00:00Z`))
    })
    const kept = Object.keys(s[NARRATIVES_KEY] as object)
    expect(kept).toHaveLength(MAX_STORED_NARRATIVES)
    expect(kept).toContain(ids[ids.length - 1])
    expect(kept).not.toContain(ids[0])
  })
})
