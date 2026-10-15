'use client'

import { useState } from 'react'
import { Mail, MailCheck } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { emailProblem } from '@/components/auth/auth-fields'

export function MagicLinkForm({
  redirectTo,
  submitLabel = 'Email me a sign-in link',
  helperText = 'We’ll email you a one-time link. No password needed.',
  email: emailProp,
  onEmailChange,
}: {
  redirectTo?: string
  submitLabel?: string
  helperText?: string
  /** Controlled email, shared with the password tab. */
  email?: string
  onEmailChange?: (email: string) => void
}) {
  const [localEmail, setLocalEmail] = useState('')
  const email = emailProp ?? localEmail
  const setEmail = onEmailChange ?? setLocalEmail
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
      <div className="space-y-4 text-center" role="status">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-subtle text-success">
          <MailCheck className="size-6" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">Check your email</p>
          <p className="text-sm text-muted">
            We sent a sign-in link to <span className="font-medium text-foreground">{email.trim()}</span>.
            Open it on this device.
          </p>
        </div>
        <p className="text-xs text-muted">
          Nothing after a minute? Check spam, or{' '}
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            use a different address
          </button>
          .
        </p>
      </div>
    )
  }

  const busy = status === 'sending'

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label="Email address" hint={emailError ? undefined : helperText} error={emailError}>
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
        {busy ? 'Sending…' : submitLabel}
      </Button>
    </form>
  )
}
