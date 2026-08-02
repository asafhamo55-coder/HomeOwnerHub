import { describe, it, expect } from 'vitest'
import { hasUnfilledBlanks, UNDO_WINDOW_SECONDS } from './blanks'

describe('hasUnfilledBlanks', () => {
  it('blocks approval while a blank marker remains in the body', () => {
    expect(hasUnfilledBlanks('We will review this.\n[[BLANK: money]]\nRegards,')).toBe(true)
  })

  it('allows approval once the marker is replaced', () => {
    expect(hasUnfilledBlanks('We will review this.\nNo fee will be charged.\nRegards,')).toBe(
      false,
    )
  })

  it('detects a marker of any kind', () => {
    for (const kind of ['money', 'enforcement', 'legal', 'other_resident']) {
      expect(hasUnfilledBlanks(`x [[BLANK: ${kind}]] y`)).toBe(true)
    }
  })

  it('tolerates spacing variation rather than letting a marker through', () => {
    expect(hasUnfilledBlanks('x [[BLANK:money]] y')).toBe(true)
    expect(hasUnfilledBlanks('x [[ BLANK : money ]] y')).toBe(true)
  })
})

describe('UNDO_WINDOW_SECONDS', () => {
  it('is exactly 30', () => {
    expect(UNDO_WINDOW_SECONDS).toBe(30)
  })
})
