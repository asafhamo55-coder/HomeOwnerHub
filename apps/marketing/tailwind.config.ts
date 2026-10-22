import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'
import { createTailwindConfig } from '@homeowner-portal/ui/tailwind.config'
import { BRANDS } from '@homeowner-portal/ui/tokens'

// Marketing takes the shared colour tokens, shadows and motion from the
// design-system preset (docs/specs/2026-10-15-design-system-v2.md) but keeps
// its own brochure type scale and larger radii — it is a static site with a
// different visual brief (UX plan decision 6), and the app scale (15px `sm`,
// 12px cards) would reflow every hero.
//
// No raw palette scales (ink/brand/ember) any more: every colour is a
// semantic token. The only additions are the two product sub-brands, read
// from the same token source the PM and Eviction apps use, so the site and
// the hubs cannot drift. HOA is the default `primary` (HomeownerHub blue, #2563EB).
const sharedConfig = createTailwindConfig('hoa')

function rgbChannels(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

function hubColor(hub: 'pm' | 'eviction') {
  const p = BRANDS[hub].light
  const c = (hex: string) => `rgb(${rgbChannels(hex)} / <alpha-value>)`
  return { DEFAULT: c(p.primary), hover: c(p['primary-hover']), subtle: c(p['primary-subtle']) }
}

const config: Config = {
  ...sharedConfig,
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    ...sharedConfig.theme,
    extend: {
      ...sharedConfig.theme?.extend,
      fontSize: defaultTheme.fontSize,
      borderRadius: {
        DEFAULT: '14px',
        lg: '18px',
        xl: '22px',
        '2xl': '30px',
      },
      colors: {
        ...(sharedConfig.theme?.extend as Record<string, unknown>)?.colors as Record<string, unknown>,
        pm: hubColor('pm'),
        eviction: hubColor('eviction'),
      },
      fontFamily: {
        display: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(to right, hsl(var(--foreground) / 0.05) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--foreground) / 0.05) 1px, transparent 1px)',
        'radial-spot':
          'radial-gradient(60% 50% at 50% 0%, hsl(var(--primary) / 0.12) 0%, hsl(var(--accent) / 0.06) 40%, transparent 70%)',
      },
      animation: {
        ...(sharedConfig.theme?.extend as Record<string, unknown>)?.animation as Record<string, unknown>,
        'float-slow': 'floatSlow 8s ease-in-out infinite',
        'blink': 'blink 1s steps(1) infinite',
        'marquee': 'marquee 55s linear infinite',
      },
      keyframes: {
        ...(sharedConfig.theme?.extend as Record<string, unknown>)?.keyframes as Record<string, unknown>,
        floatSlow: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        blink: {
          '50%': { opacity: '0' },
        },
        // Translate -50% so the duplicated track wraps seamlessly.
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
      },
    },
  },
}

export default config
