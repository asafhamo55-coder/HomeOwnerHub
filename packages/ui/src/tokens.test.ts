import { describe, expect, it } from 'vitest'
import {
  BRANDS,
  COLOR_ROLES,
  CONTRAST_PAIRS,
  contrastRatio,
  cssVariables,
  hexToHslChannels,
  hexToRgb,
  hslChannelsToRgb,
  palette,
  type HubKey,
  type ThemeMode,
} from './tokens'

// WCAG 2.2 AA for every text/background pair the design system promises
// (docs/specs/2026-10-15-design-system-v2.md). Measured on the HSL
// channels the CSS actually ships — not the hex source — so rounding in
// the conversion cannot hide a failure.

const HUBS = Object.keys(BRANDS) as HubKey[]
const MODES: ThemeMode[] = ['light', 'dark']

describe('contrast maths', () => {
  it('matches known WCAG reference values', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
    expect(contrastRatio(hexToRgb('#767676'), hexToRgb('#FFFFFF'))).toBeCloseTo(4.54, 2)
  })

  it('round-trips hex → HSL channels → rgb within one step', () => {
    for (const hex of ['#4F46E5', '#101828', '#F7F8FA', '#C4261B', '#0B0D11']) {
      const back = hslChannelsToRgb(hexToHslChannels(hex))
      const orig = hexToRgb(hex)
      back.forEach((v, i) => expect(Math.abs(v - orig[i]!)).toBeLessThan(1.5))
    }
  })
})

describe.each(HUBS)('%s hub', (hub) => {
  describe.each(MODES)('%s mode', (mode) => {
    const vars = cssVariables(hub, mode)
    const rgb = (role: string) => hslChannelsToRgb(vars[`--${role}`]!)

    it('defines every colour role', () => {
      for (const role of COLOR_ROLES) expect(vars[`--${role}`], role).toMatch(/^[\d.]+ [\d.]+% [\d.]+%$/)
    })

    it.each(CONTRAST_PAIRS.map((p) => [p.fg, p.bg, p.min] as const))(
      '%s on %s ≥ %s:1',
      (fg, bg, min) => {
        const ratio = contrastRatio(rgb(fg), rgb(bg))
        expect(ratio, `${hub}/${mode}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(min)
      },
    )
  })
})

it('HOA brand is indigo-600 — code and docs agree', () => {
  expect(palette('hoa', 'light').primary).toBe('#4F46E5')
})
