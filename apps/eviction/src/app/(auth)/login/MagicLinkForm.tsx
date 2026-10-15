'use client'

import { useState } from 'react'
import { Mail } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'

export function MagicLinkForm({
  redirectTo,
  submitLabel = 'Send magic link',
  helperText = "We'll email you a one-time link.",
}: {
  redirectTo?: string
  submitLabel?: string
  helperText?: string
}) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!email.trim()) {
      setStatus('error')
      setErrorMessage('Enter your email address.')
      return
    }

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
      <Alert
        variant="success"
        title="Check your email"
        actions={
          <Button type="button" variant="link" size="sm" onClick={() => setStatus('idle')}>
            Use a different address
          </Button>
        }
      >
        We sent a magic link to <strong>{email}</strong>. Open it on this device to sign in.
      </Alert>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <Field label="Email address" hint={helperText} error={status === 'error' ? errorMessage : null}>
        <Input
          name="email"
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          prefix={<Mail className="size-4" aria-hidden />}
          disabled={status === 'sending'}
        />
      </Field>

      <Button type="submit" size="lg" className="w-full" loading={status === 'sending'}>
        {submitLabel}
      </Button>
    </form>
  )
}
