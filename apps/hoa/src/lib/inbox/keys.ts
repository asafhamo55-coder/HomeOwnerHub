/**
 * Inbox keyboard shortcuts (BL-101 A3). Pure mapping from a key event to
 * an action, so the "never while typing" rule is unit-tested rather than
 * hoped for. The hook that binds it lives in app/(dashboard)/inbox/useInboxKeys.ts.
 */

export type InboxKeyAction = 'next' | 'prev' | 'approve_close' | 'edit' | 'close' | 'help'

export const INBOX_SHORTCUTS: Array<{ key: string; action: InboxKeyAction; label: string }> = [
  { key: 'j', action: 'next', label: 'Next conversation' },
  { key: 'k', action: 'prev', label: 'Previous conversation' },
  { key: 'a', action: 'approve_close', label: 'Approve and send, then close' },
  { key: 'e', action: 'edit', label: 'Edit the draft' },
  { key: 'c', action: 'close', label: 'Close the conversation' },
  { key: '?', action: 'help', label: 'Show these shortcuts' },
]

const BY_KEY = new Map(INBOX_SHORTCUTS.map((s) => [s.key, s.action]))

export interface KeyEventLike {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  defaultPrevented: boolean
  /** The focused element's tag (event.target), upper or lower case. */
  targetTag: string | null
  targetEditable: boolean
}

/**
 * null when the key is not a shortcut, or when the person is typing: in
 * an input, textarea, select or contenteditable, or with a modifier held
 * (Cmd+A is select-all, not approve).
 */
export function inboxKeyAction(event: KeyEventLike): InboxKeyAction | null {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return null
  const tag = event.targetTag?.toLowerCase() ?? ''
  if (event.targetEditable || tag === 'input' || tag === 'textarea' || tag === 'select') return null
  return BY_KEY.get(event.key) ?? null
}

/** Window events the composer listens for, so the keyboard layer never reaches into its state. */
export const INBOX_APPROVE_CLOSE_EVENT = 'inbox:approve-close'
export const INBOX_EDIT_EVENT = 'inbox:edit'
