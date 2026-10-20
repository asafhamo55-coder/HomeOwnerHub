'use client'

import { useEffect, useRef } from 'react'
import { inboxKeyAction, type InboxKeyAction } from '@/lib/inbox/keys'

/**
 * Binds the inbox shortcuts (lib/inbox/keys.ts) to the window for as long
 * as the calling component is mounted. The handler is kept in a ref so a
 * re-render with new hrefs never re-binds the listener.
 */
export function useInboxKeys(onAction: (action: InboxKeyAction) => void) {
  const handler = useRef(onAction)
  handler.current = onAction

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target instanceof HTMLElement ? event.target : null
      const action = inboxKeyAction({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        defaultPrevented: event.defaultPrevented,
        targetTag: target?.tagName ?? null,
        // A shortcut must not fire behind an open dialog or menu either:
        // "j" in the vendor modal is not "next conversation".
        targetEditable: Boolean(
          target?.isContentEditable || target?.closest('[role="dialog"],[role="menu"],[role="listbox"]'),
        ),
      })
      if (!action) return
      event.preventDefault()
      handler.current(action)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
