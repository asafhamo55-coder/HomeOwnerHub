'use client'

import { useState, useTransition } from 'react'
import { Alert, Button } from '@homeownerhub/ui'
import { startPerCaseCheckout } from '@/lib/case-actions'

export function PerCasePayButton({ caseId }: { caseId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    setError(null)
    startTransition(async () => {
      const result = await startPerCaseCheckout(caseId)
      if (!result.ok) setError(result.error ?? 'Could not start checkout.')
    })
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} loading={pending} variant="default">
        Pay $249 to file
      </Button>
      <p className="text-xs text-muted-fg">
        Per-case billing. Skip this if your workspace is on the Unlimited plan.
      </p>
      {error ? (
        <Alert variant="error" title="Couldn't start checkout">
          {error}
        </Alert>
      ) : null}
    </div>
  )
}
