'use client'

import { safeNextPath } from '@/lib/safe-next-path'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { emailProblem } from '@/components/auth/auth-fields'

// Email + password sign-in. The email is the username. Runs alongside the
// magic-link form (see LoginMethods); both resolve to the same Supabase user.
export function PasswordForm({
  redirectTo,
  email: emailProp,
  onEmailChange,
}: {
  redirectTo?: string
  /** Controlled email, shared with the magic-link tab. */
  email?: string
  onEmailChange?: (email: string) => void
}) {
  const router = useRouter()
  const [localEmail, setLocalEmail] = useState('')
  const email = emailProp ?? localEmail
  const setEmail = onEmailChange ?? setLocalEmail
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<'idle' | 'signing-in' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const eProblem = emailProblem(email)
    const pProblem = password ? null : 'Enter your password.'
    setEmailError(eProblem)
    setPasswordError(pProblem)
    if (eProblem || pProblem) return

    setStatus('signing-in')
    setErrorMessage(null)

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setStatus('error')
      // Supabase returns a generic "Invalid login credentials" for both wrong
      // password and unknown email — we surface it verbatim so we don't leak
      // which accounts exist.
      setErrorMessage(error.message)
      return
    }

    // Full reload so the server picks up the freshly-set auth cookie before
    // rendering the gated destination.
    router.replace(safeNextPath(redirectTo ?? null))
    router.refresh()
  }

  const busy = status === 'signing-in'

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

      <Field
        label="Password"
        error={passwordError}
        labelAside={
          <Link href="/forgot-password" className="font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        }
      >
        <Input
          name="password"
          type={showPassword ? 'text' : 'password'}
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value)
            if (passwordError) setPasswordError(null)
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
          error={status === 'error'}
          disabled={busy}
        />
      </Field>

      {status === 'error' && errorMessage ? (
        <Alert variant="error" title="Couldn’t sign you in">
          {errorMessage}
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
