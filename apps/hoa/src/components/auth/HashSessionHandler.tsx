'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { safeNextPath } from '@/lib/safe-next-path'

/**
 * Fallback for Supabase links that deliver the session in the URL hash
 * (`#access_token=...&refresh_token=...`) instead of `?code=`. Server routes
 * never see a hash, so the browser finishes sign-in here. Does nothing unless
 * the hash carries both tokens or an auth error. Never logs tokens.
 */
export function HashSessionHandler() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    if (!hash) return
    const params = new URLSearchParams(hash)
    const clearHash = () =>
      window.history.replaceState(null, '', window.location.pathname + window.location.search)

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (params.get('error') || params.get('error_description')) {
      clearHash()
      return
    }
    if (!accessToken || !refreshToken) return

    const query = new URLSearchParams(window.location.search)
    const next = safeNextPath(query.get('next') ?? query.get('redirect'))
    const isRecovery = params.get('type') === 'recovery'
    let cancelled = false
    setBusy(true)

    void (async () => {
      let ok = false
      try {
        const supabase = getSupabaseBrowserClient()
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (!error) {
          const { data, error: userError } = await supabase.auth.getUser()
          ok = !userError && !!data?.user
        }
      } catch {
        ok = false
      }
      clearHash()
      if (cancelled) return
      if (ok) {
        router.replace(isRecovery ? '/reset-password' : next)
        router.refresh()
      } else {
        setBusy(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [router])

  if (!busy) return null
  return (
    <p role="status" className="mb-5 text-sm text-muted-foreground">
      Signing you in…
    </p>
  )
}
