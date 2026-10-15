'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CheckCircle2, Lock } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { MIN_PASSWORD, PasswordRules } from '@/components/auth/auth-fields'

// Sets a new password on the recovery session established by /auth/callback.
// updateUser requires an active session, so the user must arrive here via the
// reset link (not by typing the URL).
export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [confirmError, setConfirmError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const pProblem =
      password.length < MIN_PASSWORD ? `Password must be at least ${MIN_PASSWORD} characters.` : null
    const cProblem = !pProblem && password !== confirm ? 'Passwords do not match.' : null
    setPasswordError(pProblem)
    setConfirmError(cProblem)
    if (pProblem || cProblem) return

    setStatus('saving')
    setErrorMessage(null)
    setExpired(false)

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setStatus('error')
      // The recovery session can be missing/expired if the link was reused or
      // opened on a different device — surface that clearly.
      const sessionProblem = error.message.includes('session')
      setExpired(sessionProblem)
      setErrorMessage(
        sessionProblem
          ? 'Your reset link has expired or was already used. Request a new one.'
          : error.message,
      )
      return
    }

    setStatus('saved')
    setTimeout(() => {
      router.replace('/')
      router.refresh()
    }, 1200)
  }

  if (status === 'saved') {
    return (
      <div className="space-y-3 text-center" role="status">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-subtle text-success">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <p className="text-base font-semibold text-foreground">Password updated</p>
        <p className="text-sm text-muted">You’re all set. Taking you to your dashboard…</p>
      </div>
    )
  }

  const busy = status === 'saving'

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Field label="New password" error={passwordError}>
          <Input
            name="password"
            type="password"
            required
            minLength={MIN_PASSWORD}
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (passwordError && e.target.value.length >= MIN_PASSWORD) setPasswordError(null)
            }}
            prefix={<Lock aria-hidden />}
            disabled={busy}
          />
        </Field>
      </div>

      <Field label="Confirm new password" error={confirmError}>
        <Input
          name="confirm"
          type="password"
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value)
            if (confirmError && e.target.value === password) setConfirmError(null)
          }}
          prefix={<Lock aria-hidden />}
          disabled={busy}
        />
      </Field>

      <PasswordRules password={password} confirm={confirm} />

      {status === 'error' && errorMessage ? (
        <Alert variant="error" title="Couldn’t update your password">
          {errorMessage}
          {expired ? (
            <>
              {' '}
              <Link href="/forgot-password" className="font-medium underline">
                Send a new link
              </Link>
            </>
          ) : null}
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {busy ? 'Saving…' : 'Update password'}
      </Button>
    </form>
  )
}
