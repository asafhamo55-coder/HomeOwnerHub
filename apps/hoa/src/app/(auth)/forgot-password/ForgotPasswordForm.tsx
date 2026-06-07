'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Button, Input, Alert } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

// Sends a password-reset link. The link routes through /auth/callback (which
// exchanges the code for a recovery session) and on to /reset-password.
//
// Doubles as "set a password" for magic-link-only accounts that never had
// one — same email, same Supabase user.
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim()) return

    setStatus('sending')
    setErrorMessage(null)

    const supabase = getSupabaseBrowserClient()
    const origin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    const callbackUrl = new URL('/auth/callback', origin)
    callbackUrl.searchParams.set('next', '/reset-password')

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: callbackUrl.toString(),
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }
    // Always show success even on unknown emails so we don't reveal which
    // addresses have accounts.
    setStatus('sent')
  }

  if (status === 'sent') {
    return (
      <Alert variant="success" title="Check your email">
        <p>
          If an account exists for <strong>{email}</strong>, we sent a link to
          reset your password. Open it on this device.
        </p>
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-foreground">
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
      </div>

      {status === 'error' && errorMessage ? (
        <Alert variant="error" title="Couldn't send the link">
          {errorMessage}
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={status === 'sending'}>
        Send reset link
      </Button>
    </form>
  )
}
