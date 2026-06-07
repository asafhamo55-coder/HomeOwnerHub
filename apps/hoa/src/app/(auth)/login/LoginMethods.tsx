'use client'

import { useState } from 'react'
import { Button } from '@homeowner-portal/ui'
import { MagicLinkForm } from './MagicLinkForm'
import { PasswordForm } from './PasswordForm'

type Method = 'password' | 'magic-link'

// Toggles between the two sign-in methods. Password is the default; the
// magic-link form is kept verbatim for users who prefer it (and for the
// existing magic-link-only accounts).
export function LoginMethods({ redirectTo }: { redirectTo?: string }) {
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
          Password
        </Button>
        <Button
          type="button"
          variant={method === 'magic-link' ? 'default' : 'ghost'}
          size="sm"
          className="w-full"
          onClick={() => setMethod('magic-link')}
        >
          Email me a link
        </Button>
      </div>

      {method === 'password' ? (
        <PasswordForm redirectTo={redirectTo} />
      ) : (
        <MagicLinkForm redirectTo={redirectTo} />
      )}
    </div>
  )
}
