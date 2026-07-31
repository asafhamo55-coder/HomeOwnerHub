'use client'

import { useActionState, useState } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { updateScope, type MailboxActionState } from './actions'

const initial: MailboxActionState = {}

interface Props {
  accountId: string
  currentMode: 'address' | 'label' | 'all'
  currentValue: string | null
  addresses: string[]
  labels: Array<{ id: string; name: string }>
  recommendedAddress: string | null
}

export function ScopePicker({
  accountId,
  currentMode,
  currentValue,
  addresses,
  labels,
  recommendedAddress,
}: Props) {
  const [state, action, pending] = useActionState(updateScope, initial)
  const [mode, setMode] = useState(currentMode)
  const [value, setValue] = useState(currentValue ?? recommendedAddress ?? '')

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="scopeMode" value={mode} />
      <input type="hidden" name="scopeValue" value={mode === 'all' ? '' : value} />

      <p className="text-sm font-medium text-foreground">
        Which mail should HomeownerHub see?
      </p>

      <label
        className={`block cursor-pointer rounded-lg border p-3 ${
          mode === 'address' ? 'border-primary bg-primary/5' : 'border-border'
        }`}
      >
        <input
          type="radio"
          name="mode-ui"
          className="sr-only"
          checked={mode === 'address'}
          onChange={() => setMode('address')}
        />
        <span className="text-sm font-medium text-foreground">
          Mail sent to a specific address
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          Recommended. Other mail in this account stays private.
        </span>
        {mode === 'address' ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"
          >
            {addresses.map((address) => (
              <option key={address} value={address}>
                {address}
                {address === recommendedAddress ? ' — recommended' : ''}
              </option>
            ))}
          </select>
        ) : null}
      </label>

      <label
        className={`block cursor-pointer rounded-lg border p-3 ${
          mode === 'label' ? 'border-primary bg-primary/5' : 'border-border'
        }`}
      >
        <input
          type="radio"
          name="mode-ui"
          className="sr-only"
          checked={mode === 'label'}
          onChange={() => setMode('label')}
        />
        <span className="text-sm font-medium text-foreground">
          Only mail with a Gmail label
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          You sort in Gmail; we follow your label.
        </span>
        {mode === 'label' ? (
          <select
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"
          >
            <option value="">Pick a label…</option>
            {labels.map((label) => (
              <option key={label.id} value={label.id}>
                {label.name}
              </option>
            ))}
          </select>
        ) : null}
      </label>

      <label
        className={`block cursor-pointer rounded-lg border p-3 ${
          mode === 'all' ? 'border-primary bg-primary/5' : 'border-border'
        }`}
      >
        <input
          type="radio"
          name="mode-ui"
          className="sr-only"
          checked={mode === 'all'}
          onChange={() => setMode('all')}
        />
        <span className="text-sm font-medium text-foreground">
          Everything in this inbox
        </span>
        <span className="mt-0.5 block text-xs text-muted">
          Only choose this for a mailbox used solely for the HOA. Personal mail in
          this account would become visible to the whole board.
        </span>
      </label>

      {state.error ? <Alert variant="error">{state.error}</Alert> : null}
      {state.ok ? <Alert variant="success">Scope updated.</Alert> : null}

      <Button type="submit" loading={pending} size="sm">
        Save scope
      </Button>
    </form>
  )
}
