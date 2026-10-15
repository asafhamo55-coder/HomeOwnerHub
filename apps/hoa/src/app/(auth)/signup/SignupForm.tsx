'use client'

import { useState } from 'react'
import { Eye, EyeOff, Lock, Mail, MailCheck } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { MIN_PASSWORD, PasswordRules, emailProblem } from '@/components/auth/auth-fields'

// Email + password signup. Confirm-email is required at the project level,
// so a successful signUp shows a "check your email" state rather than
// dropping the user straight into the app.
export function SignupForm({
  email: emailProp,
  onEmailChange,
}: {
  email?: string
  onEmailChange?: (email: string) => void
} = {}) {
  const [localEmail, setLocalEmail] = useState('')
  const email = emailProp ?? localEmail
  const setEmail = onEmailChange ?? setLocalEmail
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const eProblem = emailProblem(email)
    const pProblem =
      password.length < MIN_PASSWORD ? `Password must be at least ${MIN_PASSWORD} characters.` : null
    setEmailError(eProblem)
    setPasswordError(pProblem)
    if (eProblem || pProblem) return

    setStatus('submitting')
    setErrorMessage(null)

    const supabase = getSupabaseBrowserClient()
    const origin = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    const callbackUrl = new URL('/auth/callback', origin)
    callbackUrl.searchParams.set('next', '/onboarding')

    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: callbackUrl.toString() },
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
          <p className="text-base font-semibold text-foreground">Confirm your email</p>
          <p className="text-sm text-muted">
            We sent a confirmation link to{' '}
            <span className="font-medium text-foreground">{email.trim()}</span>. Open it to activate your
            account, then we’ll set up your HOA.
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

  const busy = status === 'submitting'

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

      <div className="space-y-2">
        <Field label="Password" error={passwordError}>
            <Input
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={MIN_PASSWORD}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (passwordError && e.target.value.length >= MIN_PASSWORD) setPasswordError(null)
              }}
              prefix={<Lock aria-hidden />}
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="rounded p-0.5 text-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </button>
              }
              error={status === 'error' || Boolean(passwordError)}
              disabled={busy}
            />
        </Field>
        <PasswordRules password={password} />
      </div>

      {status === 'error' && errorMessage ? (
        <Alert variant="error" title="Couldn’t create your account">
          {errorMessage}
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {busy ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  )
}
