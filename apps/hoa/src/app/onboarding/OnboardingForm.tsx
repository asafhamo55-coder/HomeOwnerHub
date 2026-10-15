'use client'

import { useActionState, useState } from 'react'
import { ArrowRight, Building2 } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import { createHoaOrg, type OnboardingActionState } from './actions'

const initial: OnboardingActionState = {}

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createHoaOrg, initial)
  const [nameError, setNameError] = useState<string | null>(null)
  const fe = state.fieldErrors ?? {}
  const hasFieldErrors = Boolean(fe.name || fe.doors_count)

  return (
    <form action={action} className="space-y-5">
      <Field label="HOA name" required error={nameError ?? fe.name}>
        <Input
          name="name"
          required
          autoFocus
          placeholder="Willow Creek Homeowners Association"
          prefix={<Building2 aria-hidden />}
          disabled={pending}
          onBlur={(e) =>
            setNameError(
              e.currentTarget.value.trim().length > 0 && e.currentTarget.value.trim().length < 2
                ? 'Give your HOA a name (at least 2 characters).'
                : null,
            )
          }
          onChange={() => nameError && setNameError(null)}
        />
      </Field>

      <Field
        label="Number of homes"
        optional
        error={fe.doors_count}
        hint="Used to size your dashboard. You can change it later."
      >
        <Input name="doors_count" type="number" inputMode="numeric" min={1} placeholder="49" disabled={pending} />
      </Field>

      {state.error && !hasFieldErrors ? (
        <Alert variant="error" title="Couldn’t create the HOA">
          {state.error}
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={pending} iconRight={<ArrowRight aria-hidden />}>
        Create HOA
      </Button>
    </form>
  )
}
