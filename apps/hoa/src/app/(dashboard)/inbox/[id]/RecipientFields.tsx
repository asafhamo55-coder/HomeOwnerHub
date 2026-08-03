'use client'

import { useState } from 'react'
import { isValidEmail } from '@/lib/inbox/draft/recipients'

// Same amber pair used for "needs a human decision" elsewhere in the inbox
// (DraftPanel, PropertyRail, MessageThread) — no `warning` token exists in
// packages/ui/tailwind.config.ts.
const INVALID_CHIP =
  'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'

interface Props {
  to: string[]
  cc: string[]
  onToChange: (next: string[]) => void
  onCcChange: (next: string[]) => void
  disabled?: boolean
}

/**
 * Chip-style recipient editor. There is deliberately no Bcc field: a blind
 * copy is invisible in the delivered message, and HOA mail carries balances
 * and violation history that every recipient should be on the record for.
 */
export function RecipientFields({ to, cc, onToChange, onCcChange, disabled }: Props) {
  // Cc stays hidden until asked for, or until it already has addresses (a
  // draft reopened after Cc was set must not appear to have lost them).
  const [showCc, setShowCc] = useState(cc.length > 0)

  return (
    <div className="space-y-2">
      <ChipField label="To" values={to} onChange={onToChange} disabled={disabled} />
      {showCc ? (
        <ChipField label="Cc" values={cc} onChange={onCcChange} disabled={disabled} />
      ) : (
        <button
          type="button"
          className="text-xs text-muted underline"
          onClick={() => setShowCc(true)}
          disabled={disabled}
        >
          Add Cc
        </button>
      )}
    </div>
  )
}

function ChipField({
  label,
  values,
  onChange,
  disabled,
}: {
  label: string
  values: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const [entry, setEntry] = useState('')

  function commit() {
    const trimmed = entry.trim().replace(/,$/, '')
    if (trimmed === '') return
    onChange([...values, trimmed])
    setEntry('')
  }

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background p-1">
        {values.map((address, index) => (
          <span
            key={`${address}-${index}`}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
              isValidEmail(address) ? 'border-border text-foreground' : INVALID_CHIP
            }`}
          >
            {address}
            <button
              type="button"
              aria-label={`Remove ${address}`}
              className="text-muted"
              onClick={() => onChange(values.filter((_, i) => i !== index))}
              disabled={disabled}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={entry}
          disabled={disabled}
          onChange={(event) => setEntry(event.target.value)}
          // Comma and Enter both commit; blur commits too, so an address
          // typed and then left alone is not silently dropped on Approve.
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Backspace' && entry === '' && values.length > 0) {
              onChange(values.slice(0, -1))
            }
          }}
          onBlur={commit}
          className="min-w-[12rem] flex-1 bg-transparent p-1 text-sm outline-none"
        />
      </div>
    </div>
  )
}
