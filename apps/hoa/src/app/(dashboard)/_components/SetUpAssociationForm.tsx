'use client'

import { useActionState } from 'react'
import { Alert, Button, Field, Input, Select } from '@homeowner-portal/ui'
import { US_STATES } from '@/lib/us-states'
import { setUpAssociation, type SetUpAssociationState } from '@/lib/association-setup-actions'

const initial: SetUpAssociationState = {}

/**
 * Inline create for the "no association yet" empty state (BL-046). One
 * submit creates the association and opens its books (funds, chart of
 * accounts, this year's fiscal period), then returns to `returnTo`.
 */
export function SetUpAssociationForm({ defaultName, returnTo }: { defaultName: string; returnTo: string }) {
  const [state, action, pending] = useActionState(setUpAssociation, initial)
  const fe = state.fieldErrors ?? {}
  const hasFieldErrors = Boolean(fe.name || fe.state || fe.type)

  return (
    <form action={action} className="w-full max-w-sm space-y-4 text-left">
      <input type="hidden" name="return_to" value={returnTo} />
      <Field label="Association name" required error={fe.name}>
        <Input name="name" required minLength={2} maxLength={200} defaultValue={defaultName} disabled={pending} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="State" required error={fe.state} hint="Sets which state’s HOA law applies.">
          <Select name="state" required defaultValue="" disabled={pending}>
            <option value="" disabled>
              Pick a state
            </option>
            {US_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type" required error={fe.type}>
          <Select name="type" defaultValue="hoa" disabled={pending}>
            <option value="hoa">HOA</option>
            <option value="condo">Condo</option>
            <option value="coop">Co-op</option>
          </Select>
        </Field>
      </div>
      {state.error && !hasFieldErrors ? (
        <Alert variant="error" title="Couldn’t finish setup">
          {state.error}
        </Alert>
      ) : null}
      <Button type="submit" className="w-full" loading={pending}>
        Create association
      </Button>
    </form>
  )
}
