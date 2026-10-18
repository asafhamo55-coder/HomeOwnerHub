import { describe, expect, it } from 'vitest'
import { NOTE_MAX, checkNote } from './note'

describe('checkNote', () => {
  it('trims and accepts a note', () => {
    expect(checkNote('  Called about the gate code.  ')).toEqual({ ok: true, note: 'Called about the gate code.' })
  })
  it('refuses an empty or whitespace note', () => {
    expect(checkNote('   ')).toEqual({ ok: false, error: 'Write the note first.' })
    expect(checkNote(undefined)).toMatchObject({ ok: false })
  })
  it('refuses an over-long note, saying the limit', () => {
    expect(checkNote('x'.repeat(NOTE_MAX + 1))).toEqual({ ok: false, error: 'Keep the note under 2,000 characters.' })
    expect(checkNote('x'.repeat(NOTE_MAX)).ok).toBe(true)
  })
})
