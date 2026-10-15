'use client'

import { useActionState } from 'react'
import { Briefcase } from 'lucide-react'
import { Alert, Button, Field, Input } from '@homeowner-portal/ui'
import { createEvictionOrg, type OnboardingActionState } from './actions'

const initial: OnboardingActionState = {}

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createEvictionOrg, initial)

  return (
    <form action={action} className="space-y-5">
      <Field label="Workspace name" hint={<>Usually your company or LLC name. You can change it later.</>}>
        <Input
          name="name"
          required
          autoFocus
          placeholder="Acme Property Management"
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
        Create workspace
      </Button>
    </form>
  )
}
