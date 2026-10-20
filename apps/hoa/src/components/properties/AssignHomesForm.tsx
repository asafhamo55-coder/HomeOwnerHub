'use client'

import { useActionState } from 'react'
import { Button, Select } from '@homeowner-portal/ui'
import { assignUnassignedHomesAction, type AssignHomesState } from '@/lib/properties/unassigned-homes-actions'

const initial: AssignHomesState = {}

/**
 * The "Assign them" control on UnassignedHomesNotice (BL-125). With one
 * association it is a single button; with several the board picks — we
 * never guess which community a home belongs to.
 */
export function AssignHomesForm({ associations }: { associations: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(assignUnassignedHomesAction, initial)
  const only = associations.length === 1 ? associations[0]! : null

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      {only ? (
        <input type="hidden" name="association_id" value={only.id} />
      ) : (
        <Select
          name="association_id"
          required
          defaultValue=""
          disabled={pending}
          aria-label="Association to assign the homes to"
          className="w-auto min-w-48"
        >
          <option value="" disabled>
            Pick an association
          </option>
          {associations.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      )}
      <Button type="submit" size="sm" loading={pending}>
        {only ? `Assign them to ${only.name}` : 'Assign them'}
      </Button>
      {state.error ? (
        <p role="alert" className="w-full text-xs text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}
