'use client'

import { useState } from 'react'
import { Lock, Mail } from 'lucide-react'
import { Button, Input, Alert } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

// Minimum password length. Mirror this with the Supabase project policy
// (Auth → Policies → min length). Client check is UX only; the server is
// the real gate.
const MIN_PASSWORD = 10

// Email + password signup. Confirm-email is required at the project level,
// so a successful signUp shows a "check your email" state rather than
// dropping the user straight into the app.
export function SignupForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim() || !password) return

    if (password.length < MIN_PASSWORD) {
      setStatus('error')
      setErrorMessage(`Password must be at least ${MIN_PASSWORD} characters.`)
      return
    }

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
      <Alert variant="success" title="Confirm your email">
        <p>
          We sent a confirmation link to <strong>{email}</strong>. Open it to
          activate your account, then we&apos;ll set up your HOA.
        </p>
        <p className="mt-2 text-xs text-emerald-700/80">
          Didn&apos;t arrive within a minute? Check spam, or{' '}
          <button
            type="button"
            onClick={() => setStatus('idle')}
            className="underline underline-offset-2"
          >
            use a different address
          </button>
          .
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
          disabled={status === 'submitting'}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          placeholder={`At least ${MIN_PASSWORD} characters`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          prefix={<Lock className="h-4 w-4" aria-hidden />}
          error={status === 'error'}
          disabled={status === 'submitting'}
        />
      </div>

      {status === 'error' && errorMessage ? (
        <Alert variant="error" title="Couldn't create your account">
          {errorMessage}
        </Alert>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={status === 'submitting'}
      >
        Create account
      </Button>
    </form>
  )
}
