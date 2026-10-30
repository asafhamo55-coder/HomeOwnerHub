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
  LOGO,
  palette,
  type ColorRole,
  type HubKey,
  type ThemeMode,
} from './tokens'
import { HUB_ACCENT_CLASS, MARK_TILE_CLASS } from './components/BrandLogo'

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

it('HOA brand is the website violet — code, logo and docs agree', () => {
  expect(palette('hoa', 'light').primary).toBe('#4B27C9')
  expect(palette('hoa', 'dark').primary).toBe('#CBC2FF')
  expect(LOGO.light.tile).toBe(palette('hoa', 'light').primary)
})

// BL-095 key pairs, stated as explicit ratios so a palette change that
// only just squeaks past AA is visible in review, not just "green".
describe('HOA violet palette — key pairs', () => {
  const hex = (mode: ThemeMode, role: ColorRole) => hexToRgb(palette('hoa', mode)[role])
  it.each([
    ['light', 'primary-fg', 'primary', 5.1],
    ['light', 'primary-fg', 'primary-hover', 6.6],
    ['light', 'primary', 'surface', 5.1],
    ['light', 'primary', 'background', 4.8],
    ['light', 'primary', 'primary-subtle', 4.5],
    ['light', 'foreground', 'background', 16],
    ['light', 'muted', 'subtle', 5.5],
    ['light', 'ring', 'background', 3.4],
    ['dark', 'primary-fg', 'primary', 7.5],
    ['dark', 'primary-fg', 'primary-hover', 10.5],
    ['dark', 'primary', 'surface', 6.9],
    ['dark', 'primary', 'primary-subtle', 5.5],
    ['dark', 'foreground', 'background', 17],
    ['dark', 'muted', 'subtle', 5.5],
  ] as const)('%s: %s on %s ≥ %s:1', (mode, fg, bg, min) => {
    expect(contrastRatio(hex(mode, fg), hex(mode, bg))).toBeGreaterThanOrEqual(min)
  })
})

describe('HomeownerHub logo colours (BL-098)', () => {
  const MODES_LOGO = ['light', 'dark'] as const
  it('"Hub" is the HOA primary in each mode', () => {
    expect(LOGO.light.accent).toBe(palette('hoa', 'light').primary)
    expect(LOGO.dark.accent).toBe(palette('hoa', 'dark').primary)
    expect(LOGO.dark.accent).toBe('#CBC2FF')
  })
  it('the wordmark\'s literal "Hub" classes match LOGO.accent', () => {
    expect(HUB_ACCENT_CLASS).toBe(`text-[${LOGO.light.accent}] dark:text-[${LOGO.dark.accent}]`)
  })
  it('the mark\'s literal tile classes match LOGO.tile', () => {
    expect(MARK_TILE_CLASS).toBe(`fill-[${LOGO.light.tile}] dark:fill-[${LOGO.dark.tile}]`)
  })
  it.each(MODES_LOGO)('%s: "Hub" text is AA on the canvas', (mode) => {
    const p = palette('hoa', mode)
    expect(contrastRatio(hexToRgb(LOGO[mode].accent), hexToRgb(p.background))).toBeGreaterThanOrEqual(4.5)
  })
  it.each(MODES_LOGO)('%s: H, roof and door read on the tile (≥3:1, WCAG 1.4.11)', (mode) => {
    const l = LOGO[mode]
    expect(contrastRatio(hexToRgb(l.glyph), hexToRgb(l.tile))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(hexToRgb(l.line), hexToRgb(l.tile))).toBeGreaterThanOrEqual(3)
  })
  it.each(MODES_LOGO)('%s: tile stands off the canvas and wordmark text is AA', (mode) => {
    const l = LOGO[mode]
    const p = palette('hoa', mode)
    expect(contrastRatio(hexToRgb(l.tile), hexToRgb(p.background))).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(hexToRgb(l.text), hexToRgb(p.background))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(hexToRgb(l.text), hexToRgb(p.surface))).toBeGreaterThanOrEqual(4.5)
  })
})
