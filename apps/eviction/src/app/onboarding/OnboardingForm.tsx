'use client'

import { useActionState } from 'react'
import { Briefcase } from 'lucide-react'
import { Button, Input, Alert } from '@homeowner-portal/ui'
import { createEvictionOrg, type OnboardingActionState } from './actions'

const initial: OnboardingActionState = {}

export function OnboardingForm() {
  const [state, action, pending] = useActionState(createEvictionOrg, initial)

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium text-foreground">
          Workspace name
        </label>
        <Input
          id="name"
          name="name"
          required
          autoFocus
          placeholder="Acme Property Management"
          prefix={<Briefcase className="h-4 w-4" aria-hidden />}
          disabled={pending}
        />
        <p className="text-xs text-muted">
          Usually your company or LLC name. You can change it later.
        </p>
      </div>

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
