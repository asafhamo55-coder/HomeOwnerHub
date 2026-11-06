'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import {
  dismissPasswordPrompt,
  lastSignInMethod,
  passwordPromptDismissed,
  shouldOfferPasswordPrompt,
} from './sign-in-memory-shared'

/**
 * One gentle, skippable note on the first screen after someone signs in with
 * an invite or email link and has never chosen a password. Shows nothing
 * otherwise, and nothing again once skipped or once a password is saved.
 */
export function ChoosePasswordPrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // Cheap local checks first, so most visits never call the auth API.
    if (lastSignInMethod() !== 'link' || passwordPromptDismissed()) return
    let cancelled = false
    void (async () => {
      try {
        const { data } = await getSupabaseBrowserClient().auth.getUser()
        if (cancelled || !data?.user) return
        setShow(
          shouldOfferPasswordPrompt({
            lastMethod: lastSignInMethod(),
            dismissed: passwordPromptDismissed(),
            userMetadata: data.user.user_metadata,
          }),
        )
      } catch {
        /* no prompt is fine */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!show) return null
  return (
    <section
      aria-label="Choose a password"
      className="mb-5 rounded-xl border border-border bg-primary-subtle p-5 text-base text-foreground"
    >
      <p className="text-lg font-semibold">Choose a password for next time (optional).</p>
      <p className="mt-1">You can skip this. We can always email you a new sign-in link.</p>
      <div className="mt-3 flex flex-wrap gap-3">
        <Button asChild size="lg" className="min-h-12">
          <Link href="/reset-password?welcome=1">Choose a password</Link>
        </Button>
        <Button
          type="button"
          size="lg"
          className="min-h-12"
          variant="secondary"
          onClick={() => {
            dismissPasswordPrompt()
            setShow(false)
          }}
        >
          Skip for now
        </Button>
      </div>
    </section>
  )
}
