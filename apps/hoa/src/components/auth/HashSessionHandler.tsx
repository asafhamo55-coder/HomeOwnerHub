'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { safeNextPath } from '@/lib/safe-next-path'
import { HASH_SESSION_DONE_EVENT } from './HideDuringHashSession'
import { rememberSignInMethod } from './sign-in-memory-shared'

/** /login?error=link_expired, carrying next and redirect so the way forward survives. */
function expiredLoginUrl(): string {
  const query = new URLSearchParams(window.location.search)
  const carry = new URLSearchParams({ error: 'link_expired' })
  for (const key of ['next', 'redirect']) {
    const v = query.get(key)
    if (v) carry.set(key, v)
  }
  return `/login?${carry.toString()}`
}

/** Clean the address bar and tell the login page the hash is dealt with. */
function clearHash() {
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  window.dispatchEvent(new Event(HASH_SESSION_DONE_EVENT))
}

/** Only a real "this link is no good" answer counts as expired, never a dropped connection. */
function isAuthRejection(error: { name?: string } | null | undefined): boolean {
  return !!error && error.name !== 'AuthRetryableFetchError'
}

interface Pending {
  access: string
  refresh: string
  next: string
  isRecovery: boolean
}

/**
 * Fallback for Supabase links that deliver the session in the URL hash
 * (`#access_token=...&refresh_token=...`) instead of `?code=`. Server routes
 * never see a hash, so the browser finishes sign-in here. Does nothing unless
 * the hash carries both tokens or an auth error. Never logs tokens.
 *
 * Outcomes: signed in; link rejected (expired help on /login); or a network
 * problem (say so, keep the tokens in memory and offer "Try again").
 */
export function HashSessionHandler() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const [busy, setBusy] = useState(false)
  const [offline, setOffline] = useState(false)
  const pending = useRef<Pending | null>(null)

  const finish = useCallback(
    async (t: Pending) => {
      setOffline(false)
      setBusy(true)
      let outcome: 'ok' | 'expired' | 'network' = 'network'
      try {
        const supabase = getSupabaseBrowserClient()
        const { error } = await supabase.auth.setSession({ access_token: t.access, refresh_token: t.refresh })
        if (error) {
          outcome = isAuthRejection(error) ? 'expired' : 'network'
        } else {
          outcome = 'ok'
          try {
            const { data, error: userError } = await supabase.auth.getUser()
            const status = (userError as { status?: number } | null)?.status
            if (userError && (status === 401 || status === 403)) outcome = 'expired'
            else if (!userError && !data?.user) outcome = 'expired'
            // Any other getUser failure (a dropped connection): the session was
            // saved, so carry on; the next page checks it again.
          } catch {
            /* keep the saved session */
          }
        }
      } catch {
        outcome = 'network'
      }
      if (!mounted.current) return
      const router = routerRef.current
      if (outcome === 'ok') {
        // Invites and magic links both arrive here: remember "by link" so the
        // login defaults to that tab and the first screen can offer a password.
        if (!t.isRecovery) rememberSignInMethod('link')
        pending.current = null
        clearHash()
        router.replace(t.isRecovery ? '/reset-password' : t.next)
        router.refresh()
      } else if (outcome === 'expired') {
        pending.current = null
        setBusy(false)
        const url = expiredLoginUrl()
        clearHash()
        router.replace(url)
      } else {
        setBusy(false)
        setOffline(true)
      }
    },
    [],
  )

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return
    const params = new URLSearchParams(hash)

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (params.get('error') || params.get('error_description')) {
      // An expired or already-used link. Say so on /login (the alert also
      // switches to the "Email me a link" tab) instead of showing a bare form.
      // The error text itself is never rendered.
      const url = expiredLoginUrl()
      clearHash()
      routerRef.current.replace(url)
      return
    }
    if (!accessToken || !refreshToken) return

    const query = new URLSearchParams(window.location.search)
    const t: Pending = {
      access: accessToken,
      refresh: refreshToken,
      next: safeNextPath(query.get('next') ?? query.get('redirect')),
      isRecovery: params.get('type') === 'recovery',
    }
    pending.current = t
    // The hash stays until the outcome is known: it keeps the expired-link
    // notice hidden meanwhile, and the tokens stay for "Try again".
    void finish(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (offline) {
    return (
      <div role="alert" className="mb-5 space-y-3 rounded-xl border border-border bg-subtle p-4 text-base text-foreground">
        <p className="font-semibold">We couldn’t finish signing you in.</p>
        <p>Check your connection and try again.</p>
        <Button
          type="button"
          size="lg"
          className="min-h-12"
          onClick={() => {
            if (pending.current) void finish(pending.current)
          }}
        >
          Try again
        </Button>
      </div>
    )
  }
  if (!busy) return null
  return (
    <p role="status" className="mb-5 text-base text-muted">
      Signing you in…
    </p>
  )
}
