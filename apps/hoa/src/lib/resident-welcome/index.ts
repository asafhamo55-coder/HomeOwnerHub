/**
 * First-run welcome on the resident home: one "Welcome" card, then one
 * "Add to your home screen" card, each shown once and remembered in this
 * browser. No server state and no migration. Storage can be blocked
 * (private windows), so every access is wrapped: when it is, the cards stay
 * hidden rather than coming back on every visit.
 */

export type WelcomeStorage = Pick<Storage, 'getItem' | 'setItem'>
export type HomeScreenPlatform = 'ios' | 'android' | 'other'

export const WELCOME_KEY_PREFIX = 'hh:resident-welcome-seen:'
export const HOME_SCREEN_KEY = 'hh:home-screen-helper-dismissed'

export function welcomeKey(scope: string): string {
  return `${WELCOME_KEY_PREFIX}${scope}`
}

function read(storage: WelcomeStorage | null, key: string): 'yes' | 'no' | 'unknown' {
  if (!storage) return 'unknown'
  try {
    return storage.getItem(key) === '1' ? 'yes' : 'no'
  } catch {
    return 'unknown'
  }
}

function write(storage: WelcomeStorage | null, key: string): void {
  try {
    storage?.setItem(key, '1')
  } catch {
    /* blocked: the card is hidden for this page view only */
  }
}

/** True only when storage works and the welcome card was never dismissed. */
export function shouldShowWelcome(storage: WelcomeStorage | null, scope: string): boolean {
  return read(storage, welcomeKey(scope)) === 'no'
}
export function dismissWelcome(storage: WelcomeStorage | null, scope: string): void {
  write(storage, welcomeKey(scope))
}
export function shouldShowHomeScreenHelper(storage: WelcomeStorage | null): boolean {
  return read(storage, HOME_SCREEN_KEY) === 'no'
}
export function dismissHomeScreenHelper(storage: WelcomeStorage | null): void {
  write(storage, HOME_SCREEN_KEY)
}

/**
 * Which set of steps to show. Desktop browsers get 'other' (no helper: the
 * page is already easy to bookmark). iPadOS reports a Mac user agent, so a
 * Mac with touch points counts as iOS.
 */
export function detectPlatform(ua: string, maxTouchPoints = 0): HomeScreenPlatform {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

export interface WelcomeTile {
  label: string
  plain: string
}

/** The four things most residents come for, in the words the tiles use. */
export const WELCOME_TILES: readonly WelcomeTile[] = [
  { label: 'New request', plain: 'Tell the board about a repair, a noise, or a question.' },
  { label: 'Ask the Docs', plain: 'Type a question about the rules and get an answer from your community’s papers.' },
  { label: 'Dues', plain: 'See what you owe and how to pay it.' },
  { label: 'Documents', plain: 'Find the rules, forms and meeting minutes.' },
]

export const HOME_SCREEN_STEPS: Record<'ios' | 'android', readonly string[]> = {
  ios: [
    'Open this page in Safari, the blue compass app.',
    'Tap the Share button. It is a square with an arrow pointing up, at the bottom of the screen.',
    'Scroll down and tap “Add to Home Screen”.',
    'Tap “Add” in the top right corner.',
  ],
  android: [
    'Open this page in Chrome.',
    'Tap the menu button, three dots in the top right corner.',
    'Tap “Add to Home screen” or “Install app”.',
    'Tap “Install” or “Add”.',
  ],
}
