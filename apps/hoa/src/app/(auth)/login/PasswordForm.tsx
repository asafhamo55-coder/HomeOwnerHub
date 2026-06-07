'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Lock, Mail } from 'lucide-react'
import { Button, Input, Alert } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

// Email + password sign-in. The email is the username. Runs alongside the
// magic-link form (see LoginMethods); both resolve to the same Supabase user.
export function PasswordForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<'idle' | 'signing-in' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim() || !password) return

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
    router.replace(redirectTo || '/')
    router.refresh()
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
          disabled={status === 'signing-in'}
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          prefix={<Lock className="h-4 w-4" aria-hidden />}
          error={status === 'error'}
          disabled={status === 'signing-in'}
        />
      </div>

      {status === 'error' && errorMessage ? (
        <Alert variant="error" title="Couldn't sign you in">
          {errorMessage}
        </Alert>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={status === 'signing-in'}
      >
        Sign in
      </Button>
    </form>
  )
}
