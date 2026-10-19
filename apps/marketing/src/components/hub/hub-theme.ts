// Sub-brand colour dialects — the same tints the products ship
// (packages/ui/src/tokens.ts BRANDS), so a visitor who clicks through
// lands in an app that looks like the page they left:
//   HOA: blue (`primary`, the HomeownerHub brand)
//   PM: blue (`pm`)
//   Eviction: violet (`eviction`)
// Status colours (success/warning/danger) stay reserved for status.

export type HubKey = 'hoa' | 'pm' | 'eviction'

export interface HubTheme {
  key: HubKey
  name: string
  tagline: string
  audience: string
  bgGradient: string        // hero radial / wash
  ringGradient: string      // accent ring around hero card
  accentBg: string          // chip bg
  accentText: string
  accentRing: string
  accentSolid: string       // solid fill (avatars, progress)
  dotClass: string
  buttonClass: string       // primary button background + text
  badgeClass: string
}

export const HUBS: Record<HubKey, HubTheme> = {
  hoa: {
    key: 'hoa',
    name: 'HOA Hub',
    tagline: 'For volunteer boards.',
    audience: 'Built for self-managed HOAs',
    bgGradient: 'from-primary-subtle/80 via-surface to-accent-subtle/40',
    ringGradient: 'from-primary-subtle/70 via-surface to-subtle/40',
    accentBg: 'bg-primary-subtle',
    accentText: 'text-primary',
    accentRing: 'ring-primary/15',
    accentSolid: 'bg-primary',
    dotClass: 'bg-primary',
    buttonClass: 'bg-primary text-primary-fg hover:bg-primary-hover',
    badgeClass: 'bg-primary-subtle text-primary ring-primary/15',
  },
  pm: {
    key: 'pm',
    name: 'PM Hub',
    tagline: 'For small landlords.',
    audience: 'Built for 2–50 unit landlords',
    bgGradient: 'from-pm-subtle/80 via-surface to-accent-subtle/40',
    ringGradient: 'from-pm-subtle/70 via-surface to-subtle/40',
    accentBg: 'bg-pm-subtle',
    accentText: 'text-pm',
    accentRing: 'ring-pm/15',
    accentSolid: 'bg-pm',
    dotClass: 'bg-pm',
    buttonClass: 'bg-pm text-primary-fg hover:bg-pm-hover',
    badgeClass: 'bg-pm-subtle text-pm ring-pm/15',
  },
  eviction: {
    key: 'eviction',
    name: 'Eviction Hub',
    tagline: 'For when it goes wrong.',
    audience: 'Attorney-reviewed, demo-only filings',
    bgGradient: 'from-eviction-subtle/80 via-surface to-subtle/40',
    ringGradient: 'from-eviction-subtle/70 via-surface to-subtle/40',
    accentBg: 'bg-eviction-subtle',
    accentText: 'text-eviction',
    accentRing: 'ring-eviction/15',
    accentSolid: 'bg-eviction',
    dotClass: 'bg-eviction',
    buttonClass: 'bg-eviction text-primary-fg hover:bg-eviction-hover',
    badgeClass: 'bg-eviction-subtle text-eviction ring-eviction/15',
  },
}
