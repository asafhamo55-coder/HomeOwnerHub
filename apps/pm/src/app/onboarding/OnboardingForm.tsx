'use client'

import { useActionState } from 'react'
import { Briefcase } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import { createPmOrg, type OnboardingActionState } from './actions'

const initial: OnboardingActionState = {}

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createPmOrg, initial)

  return (
    <form action={action} className="space-y-5">
      <Field label="Workspace name" hint={<>Usually your name or LLC. You&apos;ll add your first property next.</>}>
        <Input
          name="name"
          required
          autoFocus
          placeholder="My Rentals"
          prefix={<Briefcase className="size-4" aria-hidden />}
          disabled={pending}
        />
      </Field>

      {state.error ? (
        <Alert variant="error" title="Couldn't create the workspace">
          {state.error}
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="w-full" loading={pending}>
        Continue
      </Button>
    </form>
  )
}
