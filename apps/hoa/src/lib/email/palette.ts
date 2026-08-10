/**
 * Accent colour validation for email.
 *
 * Every accent in the library has to survive dark-mode inversion. Gmail iOS
 * and classic Outlook force-invert with no opt-out; Outlook.com and Gmail
 * Android invert *partially*, flipping backgrounds they judge light while
 * leaving others alone. A pastel accent inverts to near-white and disappears;
 * a near-black one is indistinguishable from body text.
 *
 * The 0.10–0.30 window is the band that reads as a deliberate accent in both
 * directions. It will reject colours a designer wants. That is the point.
 */

export const MIN_ACCENT_LUMINANCE = 0.1
export const MAX_ACCENT_LUMINANCE = 0.3

/** The neutral every tinted panel is composited over. Never pure white —
 *  #ffffff is the value partial-inversion engines most aggressively flip. */
export const PANEL_BASE = '#FAFAFA'

function parseHex(hex: string): [number, number, number] {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
    throw new Error(`invalid hex colour: ${hex}`)
  }
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
  ]
}

function toHex(r: number, g: number, b: number): string {
  const part = (n: number): string =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0')
  return `#${part(r)}${part(g)}${part(b)}`
}

/** WCAG relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex)
  const channel = (v: number): number => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export function isValidAccent(hex: string): boolean {
  const l = relativeLuminance(hex)
  return l >= MIN_ACCENT_LUMINANCE && l <= MAX_ACCENT_LUMINANCE
}

/** Throws with the offending value — used at module load by the registry so
 *  a bad accent fails the build rather than shipping an invisible banner. */
export function assertAccent(hex: string): void {
  const l = relativeLuminance(hex)
  if (l < MIN_ACCENT_LUMINANCE || l > MAX_ACCENT_LUMINANCE) {
    throw new Error(
      `accent ${hex} has luminance ${l.toFixed(3)}, outside the required ` +
        `${MIN_ACCENT_LUMINANCE}–${MAX_ACCENT_LUMINANCE} window for dark-mode survival`,
    )
  }
}

/** Composite `hex` over `base` at `alpha`. Used for the tinted panel behind
 *  a pictogram, which must be a flat opaque colour — email cannot do alpha. */
export function tintOver(hex: string, alpha: number, base: string = PANEL_BASE): string {
  const [r1, g1, b1] = parseHex(hex)
  const [r0, g0, b0] = parseHex(base)
  return toHex(
    r0 + (r1 - r0) * alpha,
    g0 + (g1 - g0) * alpha,
    b0 + (b1 - b0) * alpha,
  )
}
