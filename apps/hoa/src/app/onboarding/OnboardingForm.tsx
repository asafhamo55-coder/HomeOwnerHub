'use client'

import { useActionState } from 'react'
import { Building2 } from 'lucide-react'
import { Button, Input, Alert } from '@homeowner-portal/ui'
import { createHoaOrg, type OnboardingActionState } from './actions'

const initial: OnboardingActionState = {}

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createHoaOrg, initial)

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium text-muted">
          HOA name
        </label>
        <Input
          id="name"
          name="name"
          required
          autoFocus
          placeholder="Madison Park Homeowners Association"
          prefix={<Building2 className="h-4 w-4" aria-hidden />}
          disabled={pending}
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="doors_count" className="text-sm font-medium text-muted">
          Number of homes <span className="text-muted-fg">(optional)</span>
        </label>
        <Input
          id="doors_count"
          name="doors_count"
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="49"
          disabled={pending}
        />
        <p className="text-xs text-muted-fg">
          Used to size your dashboard. You can edit this later in settings.
        </p>
      </div>

      {state.error ? (
        <Alert variant="error" title="Couldn't create the HOA">
          {state.error}
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Create HOA
      </Button>
    </form>
  )
}
