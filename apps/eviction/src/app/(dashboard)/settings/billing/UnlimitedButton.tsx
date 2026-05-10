'use client'

import { useState, useTransition } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { startEvictionUnlimited } from '@/lib/billing'

export function UnlimitedButton({ disabled }: { disabled?: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await startEvictionUnlimited()
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="space-y-3">
      <Button onClick={handleClick} loading={pending} disabled={disabled}>
        Upgrade to Unlimited
      </Button>
      {error ? (
        <Alert variant="error" title="Couldn't start checkout">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
