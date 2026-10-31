'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { CheckCircle2, Lock } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { AUTH_FIELD_CLASS, MIN_PASSWORD, PasswordRules, PasswordToggle } from '@/components/auth/auth-fields'
import { friendlyAuthError } from '@/components/auth/auth-errors-shared'
import { PASSWORD_SET_FLAG, dismissPasswordPrompt } from '@/components/auth/sign-in-memory-shared'

// Sets a password on the session established by /auth/callback (reset link) or
// by an invite / sign-in link (welcome). updateUser requires an active
// session, so the user must arrive here from a link (not by typing the URL).
//
// There is no "confirm password" box: the Show password button lets the person
// check what they typed, which is easier than retyping on a phone.
export function ResetPasswordForm({ welcome = false }: { welcome?: boolean } = {}) {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const pProblem =
      password.length < MIN_PASSWORD ? `Password must be at least ${MIN_PASSWORD} characters.` : null
    setPasswordError(pProblem)
    if (pProblem) return

    setStatus('saving')
    setErrorMessage(null)
    setExpired(false)

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.updateUser({ password, data: { [PASSWORD_SET_FLAG]: true } })

    if (error) {
      setStatus('error')
      // The session can be missing/expired if the link was reused or opened on
      // a different device. Say that plainly.
      const sessionProblem = /session/i.test(error.message)
      setExpired(sessionProblem)
      setErrorMessage(
        sessionProblem
          ? 'Your link has expired or was already used. Ask for a new one, then open it on this same phone or computer.'
          : friendlyAuthError(error),
      )
      return
    }

    dismissPasswordPrompt()
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
        <p className="text-lg font-semibold text-foreground">{welcome ? 'Password saved' : 'Password updated'}</p>
        <p className="text-base text-muted">You’re all set. Taking you to your dashboard…</p>
      </div>
    )
  }

  const busy = status === 'saving'

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Field label={welcome ? 'Password' : 'New password'} error={passwordError} className={AUTH_FIELD_CLASS}>
          <Input
            name="password"
            type={showPassword ? 'text' : 'password'}
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
            suffix={<PasswordToggle shown={showPassword} onToggle={() => setShowPassword((v) => !v)} />}
            disabled={busy}
          />
        </Field>
      </div>

      <PasswordRules password={password} />

      {status === 'error' && errorMessage ? (
        <Alert variant="error" title="Couldn’t update your password">
          {errorMessage}
          {expired ? (
            <>
              {' '}
              <Link href={welcome ? '/login' : '/forgot-password'} className="font-medium underline">
                {welcome ? 'Go to sign in' : 'Send a new link'}
              </Link>
            </>
          ) : null}
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={busy}>
        {busy ? 'Saving…' : welcome ? 'Save my password' : 'Update password'}
      </Button>
    </form>
  )
}
