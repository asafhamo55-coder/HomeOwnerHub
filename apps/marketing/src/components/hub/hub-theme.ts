// Sub-brand color dialects per the design strategy.
// HOA: emerald (governance / compliance)
// PM: ember (warmth for landlords)
// Eviction: violet (calm, serious, AAA contrast)

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
  accentSolid: string       // 600-tone solid
  dotClass: string
  buttonClass: string       // primary button background
  badgeClass: string
}

export const HUBS: Record<HubKey, HubTheme> = {
  hoa: {
    key: 'hoa',
    name: 'HOA Hub',
    tagline: 'For volunteer boards.',
    audience: 'Built for self-managed HOAs',
    bgGradient: 'from-emerald-50/70 via-white to-brand-50/40',
    ringGradient: 'from-emerald-100/60 via-white to-brand-100/40',
    accentBg: 'bg-emerald-50',
    accentText: 'text-emerald-700',
    accentRing: 'ring-emerald-100',
    accentSolid: 'bg-emerald-600',
    dotClass: 'bg-emerald-500',
    buttonClass: 'bg-ink-900 hover:bg-ink-800',
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  },
  pm: {
    key: 'pm',
    name: 'PM Hub',
    tagline: 'For small landlords.',
    audience: 'Built for 2–50 unit landlords',
    bgGradient: 'from-ember-50/70 via-white to-brand-50/40',
    ringGradient: 'from-ember-100/60 via-white to-brand-100/40',
    accentBg: 'bg-ember-50',
    accentText: 'text-ember-700',
    accentRing: 'ring-ember-100',
    accentSolid: 'bg-ember-600',
    dotClass: 'bg-ember-500',
    buttonClass: 'bg-ink-900 hover:bg-ink-800',
    badgeClass: 'bg-ember-50 text-ember-700 ring-ember-100',
  },
  eviction: {
    key: 'eviction',
    name: 'Eviction Hub',
    tagline: 'For when it goes wrong.',
    audience: 'Attorney-reviewed, demo-only filings',
    bgGradient: 'from-violet-50/70 via-white to-slate-50/40',
    ringGradient: 'from-violet-100/60 via-white to-slate-100/40',
    accentBg: 'bg-violet-50',
    accentText: 'text-violet-700',
    accentRing: 'ring-violet-100',
    accentSolid: 'bg-violet-600',
    dotClass: 'bg-violet-500',
    buttonClass: 'bg-ink-900 hover:bg-ink-800',
    badgeClass: 'bg-violet-50 text-violet-700 ring-violet-100',
  },
}
