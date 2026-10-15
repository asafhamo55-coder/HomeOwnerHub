import { describe, expect, it } from 'vitest'
import { toStatuteEvent } from './state-law-refresh'

const H1 = 'a'.repeat(64)
const H2 = 'b'.repeat(64)
const base = { id: 'chg-1', statute_id: 'st-1', state: 'FL', code_citation: 'Fla. Stat. § 720.303' }

describe('toStatuteEvent (change-log row → Inngest event)', () => {
  it('a changed section emits law/statute.changed with both hashes', () => {
    expect(toStatuteEvent({ ...base, change_kind: 'changed', old_hash: H1, new_hash: H2 })).toEqual({
      id: 'statute-change-chg-1',
      name: 'law/statute.changed',
      data: {
        state: 'FL',
        statute_id: 'st-1',
        code_citation: 'Fla. Stat. § 720.303',
        change_kind: 'changed',
        old_hash: H1,
        new_hash: H2,
      },
    })
  })

  // F spec §3: "A new citation emits the same event with old_hash: null."
  it('a new or reinstated citation emits law/statute.changed with old_hash null', () => {
    for (const kind of ['added', 'reinstated'] as const) {
      const e = toStatuteEvent({ ...base, change_kind: kind, old_hash: H1, new_hash: H2 })
      expect(e.name).toBe('law/statute.changed')
      expect(e.data).toMatchObject({ change_kind: kind, old_hash: null, new_hash: H2 })
    }
  })

  it('a removal emits law/statute.removed with the last hash', () => {
    expect(toStatuteEvent({ ...base, change_kind: 'removed', old_hash: H1, new_hash: null })).toEqual({
      id: 'statute-change-chg-1',
      name: 'law/statute.removed',
      data: { state: 'FL', statute_id: 'st-1', code_citation: 'Fla. Stat. § 720.303', old_hash: H1 },
    })
  })

  it('derives the event id from the change-log id, so a re-send is deduplicated', () => {
    const row = { ...base, change_kind: 'changed' as const, old_hash: H1, new_hash: H2 }
    expect(toStatuteEvent(row).id).toBe(toStatuteEvent(row).id)
  })
})
