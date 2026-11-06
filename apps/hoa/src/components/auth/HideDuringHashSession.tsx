'use client'

import { useEffect, useState, type ReactNode } from 'react'

/** Fired by HashSessionHandler once it has dealt with the hash and cleaned the address. */
export const HASH_SESSION_DONE_EVENT = 'hh:hash-session-done'

function hashHasSession(): boolean {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return !!params.get('access_token') && !!params.get('refresh_token')
}

/**
 * Hides its children while the URL hash carries a session (an invite link
 * that sends `#access_token=...` lands on /login?error=missing_code). The
 * HashSessionHandler is signing the person in, so "That link has expired"
 * would be wrong. It looks again whenever the hash changes or the handler
 * says it is done, so a failed sign-in shows the notice afterwards.
 */
export function HideDuringHashSession({ children }: { children: ReactNode }) {
  const [hide, setHide] = useState(false)
  useEffect(() => {
    const check = () => setHide(hashHasSession())
    check()
    window.addEventListener('hashchange', check)
    window.addEventListener('popstate', check)
    window.addEventListener(HASH_SESSION_DONE_EVENT, check)
    return () => {
      window.removeEventListener('hashchange', check)
      window.removeEventListener('popstate', check)
      window.removeEventListener(HASH_SESSION_DONE_EVENT, check)
    }
  }, [])
  return hide ? null : <>{children}</>
}
