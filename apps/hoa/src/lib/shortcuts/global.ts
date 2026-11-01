/**
 * App-wide keyboard shortcuts: only "?" opens the help dialog. There are no
 * "g then letter" navigation chords: a stray keypress must never move a
 * person to another page. Pure, so the "never while typing" and "defer to
 * the inbox" rules are unit-tested. The component that binds it is
 * components/layout/ShortcutsHelp.tsx. ("/" for search lives in the UI
 * package's command palette, next to the visible Search button.)
 */
import type { KeyEventLike } from '@/lib/inbox/keys'

export type GlobalKeyResult = { type: 'none' } | { type: 'help' }

/** The inbox owns its own letters (a approves, j/k move) and its own "?". */
export function isInboxPath(pathname: string | null | undefined): boolean {
  return pathname === '/inbox' || (pathname ?? '').startsWith('/inbox/')
}

export function isTypingTarget(event: Pick<KeyEventLike, 'targetTag' | 'targetEditable'>): boolean {
  const tag = event.targetTag?.toLowerCase() ?? ''
  return event.targetEditable || tag === 'input' || tag === 'textarea' || tag === 'select'
}

export function globalKeyStep(event: KeyEventLike & { pathname: string | null }): GlobalKeyResult {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return { type: 'none' }
  if (isTypingTarget(event) || isInboxPath(event.pathname)) return { type: 'none' }
  if (event.key === '?') return { type: 'help' }
  return { type: 'none' }
}
