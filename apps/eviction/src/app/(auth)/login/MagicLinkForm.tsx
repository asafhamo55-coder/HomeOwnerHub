'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Button, Input, Alert } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

export function MagicLinkForm({
  redirectTo,
  submitLabel = 'Send magic link',
  helperText = "We'll email you a one-time link.",
}: {
  redirectTo?: string
  submitLabel?: string
  helperText?: string
}) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim()) return

    setStatus('sending')
    setErrorMessage(null)

    const supabase = getSupabaseBrowserClient()
    // Vercel auto-generates a project-specific URL alongside the canonical
    // production URL; both serve the same code but cookies don't cross
    // between them. Pin the magic-link callback to NEXT_PUBLIC_APP_URL so
    // a user on the long alias still gets sent back to the canonical host.
    const origin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    const callbackUrl = new URL('/auth/callback', origin)
    if (redirectTo) callbackUrl.searchParams.set('next', redirectTo)

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: callbackUrl.toString(),
        shouldCreateUser: true,
      },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }
    setStatus('sent')
  }

  if (status === 'sent') {
    return (
      <Alert variant="success" title="Check your email">
        <p>
          We sent a magic link to <strong>{email}</strong>. Open it on this device to sign in.
        </p>
        <p className="mt-2 text-xs text-emerald-700/80">
          Wrong email?{' '}
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="underline underline-offset-2"
          >
            try a different address
          </button>
          .
        </p>
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-muted">
          Email address
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          prefix={<Mail className="h-4 w-4" aria-hidden />}
          error={status === 'error'}
          disabled={status === 'sending'}
        />
        {status !== 'error' ? <p className="text-xs text-muted-fg">{helperText}</p> : null}
      </div>

      {status === 'error' && errorMessage ? (
        <Alert variant="error" title="Couldn't send the link">
          {errorMessage}
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={status === 'sending'}>
        {submitLabel}
      </Button>
    </form>
  )
}
