/**
 * App-wide keyboard shortcuts: "?" opens the help dialog, "g" then a letter
 * goes to a page. Pure, so the "never while typing" and "defer to the inbox"
 * rules are unit-tested. The component that binds it is
 * components/layout/ShortcutsHelp.tsx.
 */
import type { KeyEventLike } from '@/lib/inbox/keys'

export const GO_SHORTCUTS: ReadonlyArray<{ key: string; href: string; label: string }> = [
  { key: 'd', href: '/', label: 'Go to the dashboard' },
  { key: 'i', href: '/inbox', label: 'Go to the inbox' },
  { key: 'a', href: '/approvals', label: 'Go to approvals' },
]

const GO_BY_KEY = new Map(GO_SHORTCUTS.map((s) => [s.key, s.href]))

/** How long "g" waits for its second key. */
export const GO_CHORD_MS = 1500

export type GlobalKeyResult =
  | { type: 'none'; pendingG: false }
  | { type: 'pending'; pendingG: true }
  | { type: 'help'; pendingG: false }
  | { type: 'go'; href: string; pendingG: false }

/** The inbox owns its own letters (a approves, j/k move) and its own "?". */
export function isInboxPath(pathname: string | null | undefined): boolean {
  return pathname === '/inbox' || (pathname ?? '').startsWith('/inbox/')
}

export function isTypingTarget(event: Pick<KeyEventLike, 'targetTag' | 'targetEditable'>): boolean {
  const tag = event.targetTag?.toLowerCase() ?? ''
  return event.targetEditable || tag === 'input' || tag === 'textarea' || tag === 'select'
}

export function globalKeyStep(
  event: KeyEventLike & { pathname: string | null },
  pendingG: boolean,
): GlobalKeyResult {
  const none = { type: 'none', pendingG: false } as const
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return none
  if (isTypingTarget(event) || isInboxPath(event.pathname)) return none
  if (event.key === '?') return { type: 'help', pendingG: false }
  if (pendingG) {
    const href = GO_BY_KEY.get(event.key)
    return href ? { type: 'go', href, pendingG: false } : none
  }
  if (event.key === 'g') return { type: 'pending', pendingG: true }
  return none
}
