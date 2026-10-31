'use client'

import { useState } from 'react'
import { Mail, MailCheck } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import { AUTH_FIELD_CLASS, emailProblem } from '@/components/auth/auth-fields'
import { sendSignInLink } from '@/components/auth/send-sign-in-link'

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

    const failure = await sendSignInLink(email, redirectTo)
    if (failure) {
      setStatus('error')
      setErrorMessage(failure)
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
          <p className="text-lg font-semibold text-foreground">Check your email</p>
          <p className="text-base text-muted">
            We sent a sign-in link to <span className="font-medium text-foreground">{email.trim()}</span>.
          </p>
        </div>
        <p className="rounded-lg bg-subtle p-3 text-left text-base text-foreground">
          <strong className="font-semibold">Open the email on this same phone or computer.</strong> The
          link only works on the device where you asked for it.
        </p>
        <p className="text-sm text-muted">
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
      <Field label="Email address" hint={emailError ? undefined : helperText} error={emailError} className={AUTH_FIELD_CLASS}>
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
