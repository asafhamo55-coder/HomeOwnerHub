import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'
import typography from '@tailwindcss/typography'
import {
  cssVariables,
  fontFamily,
  fontSize,
  layout,
  motion,
  radius,
  type HubKey,
} from './src/tokens'

/**
 * The one Tailwind preset every app uses. Spec:
 * docs/specs/2026-10-15-design-system-v2.md.
 *
 * Apps call `createTailwindConfig('<hub>')` and add their own `content`.
 * Colour variables are emitted from `src/tokens.ts` by the plugin below —
 * apps must NOT redeclare `--primary` & co. in their globals.css.
 */

const c = (name: string) => `hsl(var(--${name}) / <alpha-value>)`

function tone(name: string) {
  return {
    DEFAULT: c(name),
    solid: c(`${name}-solid`),
    subtle: c(`${name}-subtle`),
  }
}

function designSystemPlugin(hub: HubKey) {
  return plugin(({ addBase, addVariant, addUtilities }) => {
    addBase({
      ':root': { ...cssVariables(hub, 'light'), colorScheme: 'light' },
      ':root.dark': { ...cssVariables(hub, 'dark'), colorScheme: 'dark' },
      // Paper is white: a dark-theme reader printing a board packet or a
      // statement gets the light palette, not light-grey text the printer
      // renders on nothing (browsers drop dark backgrounds by default).
      // Same specificity as the rule above and later, so it wins in print.
      '@media print': {
        ':root.dark': { ...cssVariables(hub, 'light'), colorScheme: 'light' },
      },
      html: {
        fontSize: '16px',
        WebkitTextSizeAdjust: '100%',
      },
      body: {
        backgroundColor: 'hsl(var(--background))',
        color: 'hsl(var(--foreground))',
        fontFamily: fontFamily.sans.join(', '),
        // Inter's alternates: open digits off, disambiguated l/I, straight-
        // sided a — the "UI Inter" look Linear and Vercel ship.
        fontFeatureSettings: '"cv02", "cv03", "cv04", "cv11"',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeLegibility',
      },
      // Bare headings still look intentional; components set their own.
      h1: { fontSize: fontSize['2xl']![0], lineHeight: fontSize['2xl']![1].lineHeight, letterSpacing: '-0.015em', fontWeight: '600', color: 'hsl(var(--foreground))' },
      h2: { fontSize: fontSize.lg![0], lineHeight: fontSize.lg![1].lineHeight, fontWeight: '600', color: 'hsl(var(--foreground))' },
      h3: { fontSize: fontSize.base![0], lineHeight: fontSize.base![1].lineHeight, fontWeight: '600', color: 'hsl(var(--foreground))' },
      '*:focus-visible': {
        outline: '2px solid hsl(var(--ring))',
        outlineOffset: '2px',
      },
      '::selection': { backgroundColor: 'hsl(var(--primary) / 0.18)' },
      '@media (prefers-reduced-motion: reduce)': {
        '*, *::before, *::after': {
          animationDuration: '0.01ms !important',
          animationIterationCount: '1 !important',
          transitionDuration: '0.01ms !important',
          scrollBehavior: 'auto !important',
        },
      },
    })

    // Sidebar rail. `data-sidebar="collapsed"` is set on <html> before
    // paint by THEME_INIT_SCRIPT, so a collapsed sidebar never flashes open.
    //   sidebar-collapsed:  the element itself, when collapsed (the <aside>)
    //   in-rail:            anything inside a *collapsible* sidebar, when
    //                       collapsed — a non-collapsible sidebar on the same
    //                       origin (platform admin) is unaffected.
    addVariant('sidebar-collapsed', ':root[data-sidebar="collapsed"] &')
    addVariant('in-rail', ':root[data-sidebar="collapsed"] [data-collapsible] &')

    // Top-bar container queries. The bar's AVAILABLE width depends on the
    // sidebar (expanded/rail) and the docked Copilot column, not just the
    // viewport — 1440 with Copilot open leaves ~820px — so top-bar items
    // size themselves against the bar (`AppShellHeader` is the `topbar`
    // container), never against viewport breakpoints.
    //   bar-sm:  ≥32rem — the search field is a full field (icon below)
    //   bar-lg:  ≥58rem — secondary items (View as, Platform, Copilot, hub)
    //            show text labels; below it they are icon-only buttons
    //            with an accessible name and a tooltip title.
    addVariant('bar-sm', '@container topbar (min-width: 32rem)')
    addVariant('bar-lg', '@container topbar (min-width: 58rem)')

    // Content container queries. `.cq` makes an element an (unnamed)
    // inline-size container; `cq-sm/md/lg:` inside it respond to ITS width.
    // Use for page sections whose column count must follow the space the
    // page actually has — with the Copilot column docked, a 1440 viewport
    // leaves ~720px of page, which viewport `lg:` cannot see.
    // Note: a container is a containing block for position:fixed
    // descendants, so do not put `.cq` around anything that renders a
    // non-portalled fixed overlay.
    addUtilities({ '.cq': { containerType: 'inline-size' } })
    addVariant('cq-xs', '@container (min-width: 12rem)')
    addVariant('cq-sm', '@container (min-width: 30rem)')
    addVariant('cq-md', '@container (min-width: 44rem)')
    addVariant('cq-lg', '@container (min-width: 56rem)')

    addUtilities({
      // Money and counts: tabular, lining figures so columns align.
      '.num': { fontVariantNumeric: 'tabular-nums lining-nums', fontFeatureSettings: '"tnum", "lnum", "cv02", "cv03", "cv04", "cv11"' },
      // The one focus treatment for custom controls.
      '.focus-ring': {
        '&:focus-visible': {
          outline: '2px solid hsl(var(--ring))',
          outlineOffset: '2px',
        },
      },
      '.scrollbar-none': { scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } },
    })
  })
}

export function createTailwindConfig(hub: HubKey = 'hoa'): Config {
  return {
    darkMode: 'class',
    content: ['./src/**/*.{ts,tsx}'],
    theme: {
      extend: {
        colors: {
          background: c('background'),
          surface: c('surface'),
          card: c('surface'),
          elevated: c('elevated'),
          subtle: c('subtle'),
          border: { DEFAULT: c('border'), strong: c('border-strong') },
          input: c('input'),
          ring: c('ring'),
          foreground: {
            DEFAULT: c('foreground'),
            secondary: c('foreground-secondary'),
            muted: c('muted'),
          },
          muted: c('muted'),
          primary: {
            DEFAULT: c('primary'),
            hover: c('primary-hover'),
            fg: c('primary-fg'),
            subtle: c('primary-subtle'),
          },
          accent: { DEFAULT: c('accent'), subtle: c('accent-subtle'), fg: c('accent-fg') },
          success: tone('success'),
          warning: tone('warning'),
          danger: tone('danger'),
          // Legacy name for danger; 145 call sites use text-destructive.
          destructive: tone('danger'),
          info: tone('info'),
          'on-solid': c('on-solid'),
        },
        fontFamily,
        fontSize,
        borderRadius: radius,
        boxShadow: {
          xs: 'var(--shadow-xs)',
          sm: 'var(--shadow-sm)',
          DEFAULT: 'var(--shadow-sm)',
          md: 'var(--shadow-md)',
          lg: 'var(--shadow-lg)',
          xl: 'var(--shadow-xl)',
          '2xl': 'var(--shadow-xl)',
        },
        ringColor: { DEFAULT: c('ring') },
        ringOffsetColor: { DEFAULT: c('background') },
        transitionDuration: {
          DEFAULT: motion.duration.fast,
          instant: motion.duration.instant,
          fast: motion.duration.fast,
          base: motion.duration.base,
          slow: motion.duration.slow,
        },
        transitionTimingFunction: {
          DEFAULT: motion.easing.standard,
          standard: motion.easing.standard,
          emphasized: motion.easing.emphasized,
          exit: motion.easing.exit,
        },
        width: { sidebar: layout.sidebarWidth, 'sidebar-collapsed': layout.sidebarCollapsedWidth },
        height: { topbar: layout.topbarHeight },
        zIndex: { overlay: '50', modal: '60', popover: '70', toast: '80' },
        animation: {
          'fade-in': `fadeIn ${motion.duration.base} ${motion.easing.standard}`,
          'fade-out': `fadeOut ${motion.duration.fast} ${motion.easing.exit}`,
          'scale-in': `scaleIn ${motion.duration.base} ${motion.easing.emphasized}`,
          'slide-up': `slideUp ${motion.duration.slow} ${motion.easing.emphasized}`,
          'slide-down': `slideDown ${motion.duration.base} ${motion.easing.emphasized}`,
          'slide-in-right': `slideInRight ${motion.duration.slow} ${motion.easing.emphasized}`,
          'slide-in-left': `slideInLeft ${motion.duration.slow} ${motion.easing.emphasized}`,
          'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
          shimmer: 'shimmer 1.6s linear infinite',
        },
        keyframes: {
          fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
          fadeOut: { from: { opacity: '1' }, to: { opacity: '0' } },
          scaleIn: {
            from: { opacity: '0', transform: 'scale(0.97) translateY(4px)' },
            to: { opacity: '1', transform: 'scale(1) translateY(0)' },
          },
          slideUp: {
            from: { opacity: '0', transform: 'translateY(8px)' },
            to: { opacity: '1', transform: 'translateY(0)' },
          },
          slideDown: {
            from: { opacity: '0', transform: 'translateY(-4px)' },
            to: { opacity: '1', transform: 'translateY(0)' },
          },
          slideInRight: {
            from: { transform: 'translateX(100%)' },
            to: { transform: 'translateX(0)' },
          },
          slideInLeft: {
            from: { transform: 'translateX(-100%)' },
            to: { transform: 'translateX(0)' },
          },
          pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.6' } },
          shimmer: {
            from: { backgroundPosition: '200% 0' },
            to: { backgroundPosition: '-200% 0' },
          },
        },
      },
    },
    plugins: [typography, designSystemPlugin(hub)],
  }
}

/** Default export: the HOA (indigo) preset. Prefer `createTailwindConfig(hub)`. */
const config = createTailwindConfig('hoa')
export default config
