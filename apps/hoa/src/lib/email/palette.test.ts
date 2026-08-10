import { describe, it, expect } from 'vitest'
import {
  relativeLuminance,
  isValidAccent,
  assertAccent,
  tintOver,
  PANEL_BASE,
} from './palette'

describe('relativeLuminance', () => {
  it('returns 0 for black and 1 for white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5)
  })

  it('accepts hex with or without the leading hash, any case', () => {
    expect(relativeLuminance('2F8F5B')).toBeCloseTo(relativeLuminance('#2f8f5b'), 10)
  })

  it('throws on a malformed hex', () => {
    expect(() => relativeLuminance('#12345')).toThrow(/invalid hex/i)
    expect(() => relativeLuminance('nope')).toThrow(/invalid hex/i)
  })
})

describe('isValidAccent', () => {
  it('accepts a mid-tone accent', () => {
    // #2F8F5B — the pet-waste green, luminance ~0.22
    expect(isValidAccent('#2F8F5B')).toBe(true)
  })

  it('rejects a pastel that would vanish under dark-mode inversion', () => {
    expect(isValidAccent('#A8E6C4')).toBe(false)
  })

  it('rejects a near-black that reads as text rather than accent', () => {
    expect(isValidAccent('#0A0A0A')).toBe(false)
  })
})

describe('assertAccent', () => {
  it('names the offending colour and its luminance', () => {
    expect(() => assertAccent('#A8E6C4')).toThrow(/#A8E6C4/)
    expect(() => assertAccent('#A8E6C4')).toThrow(/luminance/i)
  })

  it('is silent for a valid accent', () => {
    expect(() => assertAccent('#2F8F5B')).not.toThrow()
  })
})

describe('tintOver', () => {
  it('composites the accent over the panel base at the given alpha', () => {
    // 8% of #2F8F5B over #FAFAFA
    expect(tintOver('#2F8F5B', 0.08)).toBe('#eaf1ed')
  })

  it('returns the base unchanged at alpha 0', () => {
    expect(tintOver('#2F8F5B', 0)).toBe(PANEL_BASE.toLowerCase())
  })

  it('returns the accent itself at alpha 1', () => {
    expect(tintOver('#2F8F5B', 1)).toBe('#2f8f5b')
  })
})
