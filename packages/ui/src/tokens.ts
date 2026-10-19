/**
 * Design tokens — the single source of truth for colour, type, space,
 * radius, elevation and motion across every app.
 *
 * Spec: docs/specs/2026-10-15-design-system-v2.md
 *
 * How they reach the page: `packages/ui/tailwind.config.ts` turns these
 * values into CSS custom properties (`:root` = light, `.dark` = dark) with
 * a Tailwind plugin, and maps Tailwind colour names onto those properties.
 * Apps never declare colour variables themselves; they pick a hub, which
 * only swaps the brand hue. `tokens.test.ts` checks every text/background
 * pair below against WCAG 2.2 AA, so a value here cannot drift below
 * contrast without a red test.
 *
 * Brand direction: blue (BL-095, docs/decisions/2026-10-19-brand-logo-
 * palette.md). The HOA app, the marketing site and the HomeownerHub logo
 * share blue-600 (#2563EB) with light-blue tints and cool slate neutrals.
 * PM Hub (deeper blue) and Eviction Hub (violet) keep a hub tint — only
 * `primary*` changes per hub; neutrals, status colours, type and spacing
 * are identical everywhere. (Until 2026-10-19 the brand was indigo-600
 * #4F46E5.)
 *
 * (This file used to document HOA as teal #00C9A7 while the app shipped
 * indigo; nothing imported it. It is now what the CSS is generated from.)
 */

export type HubKey = 'hoa' | 'pm' | 'eviction'
export type ThemeMode = 'light' | 'dark'

/** Colour roles. Each becomes `--<name>` (HSL channels) on the root. */
export const COLOR_ROLES = [
  // Surfaces, from back to front.
  'background', // page canvas
  'surface', // cards, sidebar, table body
  'elevated', // popovers, menus, dialogs, toasts
  'subtle', // hover fill, table header, wells, inactive chips
  // Lines.
  'border', // decorative dividers and card edges
  'border-strong', // emphasised dividers, hovered card edges
  'input', // form-control boundary (WCAG 1.4.11: ≥3:1 against surface)
  'ring', // focus ring (≥3:1 against background and surface)
  // Text.
  'foreground', // primary text, headings
  'foreground-secondary', // body copy under a heading, descriptions
  'muted', // meta, labels, captions, placeholders — still AA
  // Brand.
  'primary', // CTA fill, links, active nav, selection
  'primary-hover',
  'primary-fg', // text/icon on a primary fill
  'primary-subtle', // tinted background behind primary text
  // AI affordance (amber). Decorative fill + an AA text colour.
  'accent',
  'accent-subtle',
  'accent-fg',
  // Status. `<tone>` is the text/icon colour (AA on every surface and on
  // its own subtle background); `<tone>-solid` is a fill that carries
  // `on-solid` text; `<tone>-subtle` is the tinted background.
  'success',
  'success-solid',
  'success-subtle',
  'warning',
  'warning-solid',
  'warning-subtle',
  'danger',
  'danger-solid',
  'danger-subtle',
  'info',
  'info-solid',
  'info-subtle',
  'on-solid',
] as const

export type ColorRole = (typeof COLOR_ROLES)[number]
export type Palette = Record<ColorRole, string>

type BrandRole = 'primary' | 'primary-hover' | 'primary-fg' | 'primary-subtle' | 'ring'
type NeutralPalette = Omit<Palette, BrandRole>
type BrandPalette = Pick<Palette, BrandRole>

const neutral: Record<ThemeMode, NeutralPalette> = {
  light: {
    background: '#F5F8FC', // cool, faintly blue canvas
    surface: '#FFFFFF',
    elevated: '#FFFFFF',
    subtle: '#EEF3F9',
    border: '#E2E8F0',
    'border-strong': '#CBD5E1',
    input: '#7A879C',
    foreground: '#0F172A',
    'foreground-secondary': '#334155',
    muted: '#526077',
    accent: '#F79009',
    'accent-subtle': '#FFF6E5',
    'accent-fg': '#93370D',
    success: '#067647',
    'success-solid': '#067647',
    'success-subtle': '#ECFDF3',
    warning: '#A6420A',
    'warning-solid': '#B54708',
    'warning-subtle': '#FFF8E6',
    danger: '#C4261B',
    'danger-solid': '#C4261B',
    'danger-subtle': '#FEF3F2',
    info: '#026AA2',
    'info-solid': '#026AA2',
    'info-subtle': '#EFF8FF',
    'on-solid': '#FFFFFF',
  },
  dark: {
    background: '#0A0F1A', // blue-black, not neutral grey
    surface: '#111827',
    elevated: '#182235',
    subtle: '#1E293B',
    border: '#243045',
    'border-strong': '#334155',
    input: '#6B7A90',
    foreground: '#F1F5F9',
    'foreground-secondary': '#CBD5E1',
    muted: '#94A3B8',
    accent: '#FDB022',
    'accent-subtle': '#2B2110',
    'accent-fg': '#FEC84B',
    success: '#4ACB8B',
    'success-solid': '#067647',
    'success-subtle': '#0D2419',
    warning: '#FDB022',
    'warning-solid': '#B54708',
    'warning-subtle': '#2B2110',
    danger: '#F97B70',
    'danger-solid': '#C4261B',
    'danger-subtle': '#2C1414',
    info: '#5CB5FD',
    'info-solid': '#026AA2',
    'info-subtle': '#0B2133',
    'on-solid': '#FFFFFF',
  },
}

/**
 * Hub tints. Light primaries carry white text (≥4.5:1); dark primaries are
 * lifted for legibility as link text on a dark canvas, so they carry dark
 * text instead (the same choice Vercel and GitHub make in dark mode).
 */
export const BRANDS: Record<HubKey, Record<ThemeMode, BrandPalette>> = {
  hoa: {
    light: {
      primary: '#2563EB', // blue-600 — the HomeownerHub logo tile
      'primary-hover': '#1D4ED8',
      'primary-fg': '#FFFFFF',
      'primary-subtle': '#EBF3FF', // light-blue tint
      ring: '#3B82F6',
    },
    dark: {
      primary: '#60A5FA',
      'primary-hover': '#93C5FD',
      'primary-fg': '#0A0F1A',
      'primary-subtle': '#132A4F',
      ring: '#60A5FA',
    },
  },
  pm: {
    light: {
      primary: '#1F5FD6',
      'primary-hover': '#1A4FB3',
      'primary-fg': '#FFFFFF',
      'primary-subtle': '#EEF4FF',
      ring: '#2E74F0',
    },
    dark: {
      primary: '#7AABFF',
      'primary-hover': '#9CC1FF',
      'primary-fg': '#0B0D11',
      'primary-subtle': '#13234A',
      ring: '#7AABFF',
    },
  },
  eviction: {
    light: {
      primary: '#6D3FE0',
      'primary-hover': '#5B2EC9',
      'primary-fg': '#FFFFFF',
      'primary-subtle': '#F3F0FF',
      ring: '#7F56F0',
    },
    dark: {
      primary: '#AE96FB',
      'primary-hover': '#C4B3FC',
      'primary-fg': '#0B0D11',
      'primary-subtle': '#251C47',
      ring: '#AE96FB',
    },
  },
}

/**
 * HomeownerHub logo colours (BL-098, concept C; tile and line from BL-094).
 * The mark is a blue tile carrying a white H whose crossbar is a roof, with
 * a light-blue door (`line`). In the wordmark, "Homeowner" is `text` and
 * "Hub" is `accent`. The static SVG/PNG files in
 * apps/{hoa,marketing}/public/brand/ and the generated favicons use exactly
 * these values; `tokens.test.ts` checks the mark's graphic contrast
 * (WCAG 1.4.11, ≥3:1) and the wordmark text (≥4.5:1).
 */
export const LOGO = {
  light: { tile: '#2563EB', glyph: '#FFFFFF', line: '#BFDBFE', text: '#0F172A', accent: '#2563EB' },
  // Same tile on dark (it still clears 3:1 against the dark canvas). The
  // wordmark text flips, and "Hub" lifts to the dark primary: #2563EB text
  // on the dark canvas is only ~3.7:1.
  dark: { tile: '#2563EB', glyph: '#FFFFFF', line: '#BFDBFE', text: '#F1F5F9', accent: '#60A5FA' },
} as const

export function palette(hub: HubKey, mode: ThemeMode): Palette {
  return { ...neutral[mode], ...BRANDS[hub][mode] }
}

/**
 * Pairs that must meet WCAG 2.2 AA. `min` is 4.5 for text, 3 for
 * non-text UI boundaries (1.4.11). The contrast test walks this list for
 * every hub in both modes.
 */
export const CONTRAST_PAIRS: { fg: ColorRole; bg: ColorRole; min: number }[] = [
  ...(['foreground', 'foreground-secondary', 'muted'] as const).flatMap((fg) =>
    (['background', 'surface', 'elevated', 'subtle'] as const).map((bg) => ({ fg, bg, min: 4.5 })),
  ),
  // Links and active nav text.
  { fg: 'primary', bg: 'background', min: 4.5 },
  { fg: 'primary', bg: 'surface', min: 4.5 },
  { fg: 'primary', bg: 'elevated', min: 4.5 },
  { fg: 'primary', bg: 'primary-subtle', min: 4.5 },
  { fg: 'primary-fg', bg: 'primary', min: 4.5 },
  { fg: 'primary-fg', bg: 'primary-hover', min: 4.5 },
  { fg: 'foreground', bg: 'primary-subtle', min: 4.5 },
  { fg: 'accent-fg', bg: 'accent-subtle', min: 4.5 },
  { fg: 'accent-fg', bg: 'surface', min: 4.5 },
  ...(['success', 'warning', 'danger', 'info'] as const).flatMap((tone) => [
    { fg: tone, bg: 'background' as ColorRole, min: 4.5 },
    { fg: tone, bg: 'surface' as ColorRole, min: 4.5 },
    { fg: tone, bg: 'elevated' as ColorRole, min: 4.5 },
    { fg: tone, bg: `${tone}-subtle` as ColorRole, min: 4.5 },
    { fg: 'foreground' as ColorRole, bg: `${tone}-subtle` as ColorRole, min: 4.5 },
    { fg: 'foreground-secondary' as ColorRole, bg: `${tone}-subtle` as ColorRole, min: 4.5 },
    { fg: 'on-solid' as ColorRole, bg: `${tone}-solid` as ColorRole, min: 4.5 },
  ]),
  // Non-text: control boundaries and the focus indicator.
  { fg: 'input', bg: 'surface', min: 3 },
  { fg: 'input', bg: 'background', min: 3 },
  { fg: 'ring', bg: 'background', min: 3 },
  { fg: 'ring', bg: 'surface', min: 3 },
]

// ── Colour maths ──────────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** `#4F46E5` → `"243.4 75.4% 58.6%"` — the format the CSS variables use. */
export function hexToHslChannels(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  const r1 = (x: number) => Math.round(x * 10) / 10
  return `${r1(h)} ${r1(s * 100)}% ${r1(l * 100)}%`
}

/** Inverse of hexToHslChannels, so tests measure what the CSS really says. */
export function hslChannelsToRgb(channels: string): [number, number, number] {
  const [hs, ss, ls] = channels.split(/\s+/)
  const h = parseFloat(hs!) / 360
  const s = parseFloat(ss!) / 100
  const l = parseFloat(ls!) / 100
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

// ── Type, space, shape, elevation, motion ─────────────────────────────────

export const fontFamily = {
  sans: ['var(--font-sans)', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
  mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
}

/**
 * Type scale (root = 16px in every app). `sm` is 15px rather than
 * Tailwind's 14px: it is the workhorse size for tables and controls, and
 * the HOA audience skews older (DESIGN_STRATEGY.md §6). Display sizes use
 * tighter tracking.
 */
export const fontSize: Record<string, [string, { lineHeight: string; letterSpacing?: string }]> = {
  '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }], // 11 — overline only
  xs: ['0.8125rem', { lineHeight: '1.125rem' }], // 13 — meta, captions, badges
  sm: ['0.9375rem', { lineHeight: '1.375rem' }], // 15 — UI default, table cells
  base: ['1rem', { lineHeight: '1.5rem' }], // 16 — reading text
  lg: ['1.125rem', { lineHeight: '1.625rem', letterSpacing: '-0.005em' }], // 18 — section titles
  xl: ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }], // 20
  '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '-0.015em' }], // 24 — page title
  '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }], // 30 — KPI value
  '4xl': ['2.25rem', { lineHeight: '2.5rem', letterSpacing: '-0.022em' }], // 36
  '5xl': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.025em' }],
  '6xl': ['3.75rem', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
}

/** Radii. Controls 6px, cards 12px, pills full. */
export const radius = {
  none: '0',
  sm: '4px',
  DEFAULT: '6px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  '3xl': '24px',
  full: '9999px',
}

/**
 * Elevation. Layered, low-opacity shadows (light); in dark mode shadows
 * barely read, so elevation is carried by the lighter `elevated` surface
 * plus a hairline highlight.
 */
export const shadows: Record<ThemeMode, Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', string>> = {
  light: {
    xs: '0 1px 2px 0 rgb(16 24 40 / 0.05)',
    sm: '0 1px 3px 0 rgb(16 24 40 / 0.08), 0 1px 2px -1px rgb(16 24 40 / 0.06)',
    md: '0 4px 8px -2px rgb(16 24 40 / 0.08), 0 2px 4px -2px rgb(16 24 40 / 0.05)',
    lg: '0 12px 16px -4px rgb(16 24 40 / 0.08), 0 4px 6px -2px rgb(16 24 40 / 0.03)',
    xl: '0 20px 24px -4px rgb(16 24 40 / 0.10), 0 8px 8px -4px rgb(16 24 40 / 0.04)',
  },
  dark: {
    xs: '0 1px 2px 0 rgb(0 0 0 / 0.4)',
    sm: '0 1px 3px 0 rgb(0 0 0 / 0.5), inset 0 1px 0 0 rgb(255 255 255 / 0.03)',
    md: '0 4px 8px -2px rgb(0 0 0 / 0.5), inset 0 1px 0 0 rgb(255 255 255 / 0.04)',
    lg: '0 12px 16px -4px rgb(0 0 0 / 0.55), inset 0 1px 0 0 rgb(255 255 255 / 0.05)',
    xl: '0 20px 24px -4px rgb(0 0 0 / 0.6), inset 0 1px 0 0 rgb(255 255 255 / 0.06)',
  },
}

/** Motion. Every animation is disabled under prefers-reduced-motion. */
export const motion = {
  duration: { instant: '80ms', fast: '120ms', base: '180ms', slow: '260ms' },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
  },
}

/** Fixed content widths (Page) and shell dimensions. */
export const layout = {
  sidebarWidth: '15rem',
  sidebarCollapsedWidth: '3.75rem',
  topbarHeight: '3.5rem',
  pageWidths: { narrow: '48rem', default: '64rem', wide: '80rem' },
}

/** CSS custom properties for one hub + mode, as emitted by the Tailwind plugin. */
export function cssVariables(hub: HubKey, mode: ThemeMode): Record<string, string> {
  const p = palette(hub, mode)
  const out: Record<string, string> = {}
  for (const role of COLOR_ROLES) out[`--${role}`] = hexToHslChannels(p[role])
  for (const [k, v] of Object.entries(shadows[mode])) out[`--shadow-${k}`] = v
  return out
}

/**
 * Legacy flat shape (pre-v2). Kept so nothing that imported `tokens`
 * breaks; values now come from the palette above.
 */
export const tokens = Object.fromEntries(
  (['hoa', 'pm', 'eviction'] as const).map((hub) => {
    const p = palette(hub, 'light')
    return [
      hub,
      {
        primary: p.primary,
        primaryFg: p['primary-fg'],
        accent: p.accent,
        bg: p.background,
        surface: p.surface,
        border: p.border,
        text: p.foreground,
        muted: p.muted,
        fontSizeBase: '16px',
      },
    ]
  }),
) as Record<
  HubKey,
  {
    primary: string
    primaryFg: string
    accent: string
    bg: string
    surface: string
    border: string
    text: string
    muted: string
    fontSizeBase: string
  }
>
