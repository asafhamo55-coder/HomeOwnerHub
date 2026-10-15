'use client'

import { useState } from 'react'
import { Mail, MailCheck } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { emailProblem } from '@/components/auth/auth-fields'

// Sends a password-reset link. The link routes through /auth/callback (which
// exchanges the code for a recovery session) and on to /reset-password.
//
// Doubles as "set a password" for magic-link-only accounts that never had
// one — same email, same Supabase user.
export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const problem = emailProblem(email)
    setEmailError(problem)
    if (problem) return

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
      <div className="space-y-4 text-center" role="status">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-subtle text-success">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">Check your email</p>
          <p className="text-sm text-muted">
            If an account exists for{' '}
            <span className="font-medium text-foreground">{email.trim()}</span>, we sent a link to reset
            your password. Open it on this device.
          </p>
        </div>
      </div>
    )
  }

  const busy = status === 'sending'

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label="Email address" error={emailError}>
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (emailError) setEmailError(null)
          }}
          onBlur={() => {
            if (email.trim()) setEmailError(emailProblem(email))
          }}
          prefix={<Mail aria-hidden />}
          error={status === 'error'}
          disabled={busy}
        />
      </Field>

      {status === 'error' && errorMessage ? (
        <Alert variant="error" title="Couldn’t send the link">
          {errorMessage}
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {busy ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  )
}
