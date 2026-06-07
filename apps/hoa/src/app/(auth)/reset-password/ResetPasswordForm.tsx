'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Lock } from 'lucide-react'
import { Button, Input, Alert } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

const MIN_PASSWORD = 10

// Sets a new password on the recovery session established by /auth/callback.
// updateUser requires an active session, so the user must arrive here via the
// reset link (not by typing the URL).
export function ResetPasswordForm() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (password.length < MIN_PASSWORD) {
      setStatus('error')
      setErrorMessage(`Password must be at least ${MIN_PASSWORD} characters.`)
      return
    }
    if (password !== confirm) {
      setStatus('error')
      setErrorMessage('Passwords do not match.')
      return
    }

    setStatus('saving')
    setErrorMessage(null)

    const supabase = getSupabaseBrowserClient()
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setStatus('error')
      // The recovery session can be missing/expired if the link was reused or
      // opened on a different device — surface that clearly.
      setErrorMessage(
        error.message.includes('session')
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
      <Alert variant="success" title="Password updated">
        <p>You&apos;re all set. Taking you to your dashboard…</p>
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          New password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          autoFocus
          placeholder={`At least ${MIN_PASSWORD} characters`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          prefix={<Lock className="h-4 w-4" aria-hidden />}
          error={status === 'error'}
          disabled={status === 'saving'}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirm" className="text-sm font-medium text-foreground">
          Confirm new password
        </label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={MIN_PASSWORD}
          autoComplete="new-password"
          placeholder="Re-enter your password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          prefix={<Lock className="h-4 w-4" aria-hidden />}
          error={status === 'error'}
          disabled={status === 'saving'}
        />
      </div>

      {status === 'error' && errorMessage ? (
        <Alert variant="error" title="Couldn't update your password">
          {errorMessage}
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={status === 'saving'}>
        Update password
      </Button>
    </form>
  )
}
