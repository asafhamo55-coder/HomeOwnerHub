'use client'

import { useState } from 'react'
import { Button } from '@homeowner-portal/ui'
import { MagicLinkForm } from '../login/MagicLinkForm'
import { SignupForm } from './SignupForm'

type Method = 'password' | 'magic-link'

// Signup mirrors the login toggle: password by default, magic link as the
// no-password alternative. The magic-link form handles signup transparently
// (signInWithOtp with shouldCreateUser=true).
export function SignupMethods() {
  const [method, setMethod] = useState<Method>('password')

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
        <Button
          type="button"
          variant={method === 'password' ? 'default' : 'ghost'}
          size="sm"
          className="w-full"
          onClick={() => setMethod('password')}
        >
          Use a password
        </Button>
        <Button
          type="button"
          variant={method === 'magic-link' ? 'default' : 'ghost'}
          size="sm"
          className="w-full"
          onClick={() => setMethod('magic-link')}
        >
          No password
        </Button>
      </div>

      {method === 'password' ? (
        <SignupForm />
      ) : (
        <MagicLinkForm
          submitLabel="Send magic link"
          helperText="No password needed. We'll set up your HOA on the next step."
        />
      )}
    </div>
  )
}
