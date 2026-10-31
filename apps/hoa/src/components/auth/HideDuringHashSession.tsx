'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * Hides its children while the URL hash carries a session (an invite link
 * that sends `#access_token=...` lands on /login?error=missing_code). The
 * HashSessionHandler is signing the person in, so "That link has expired"
 * would be wrong. Without such a hash the children render as normal.
 */
export function HideDuringHashSession({ children }: { children: ReactNode }) {
  const [hide, setHide] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    setHide(!!params.get('access_token') && !!params.get('refresh_token'))
  }, [])
  return hide ? null : <>{children}</>
}
