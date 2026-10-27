'use client'

import { useId, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { Button, cn } from '@homeowner-portal/ui'
import { isValidEmail } from '@/lib/inbox/draft/recipients'

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
    <div className="space-y-3">
      <ChipField
        label="To"
        values={to}
        onChange={onToChange}
        disabled={disabled}
        aside={
          showCc ? null : (
            <Button type="button" variant="link" size="xs" onClick={() => setShowCc(true)} disabled={disabled}>
              Add Cc
            </Button>
          )
        }
      />
      {showCc ? <ChipField label="Cc" values={cc} onChange={onCcChange} disabled={disabled} /> : null}
    </div>
  )
}

function ChipField({
  label,
  values,
  onChange,
  disabled,
  aside,
}: {
  label: string
  values: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  aside?: React.ReactNode
}) {
  const [entry, setEntry] = useState('')
  const id = `rcpt-${useId().replace(/:/g, '')}`
  const invalidCount = values.filter((v) => !isValidEmail(v)).length

  function commit() {
    const trimmed = entry.trim().replace(/,$/, '')
    if (trimmed === '') return
    onChange([...values, trimmed])
    setEntry('')
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {aside}
      </div>
      <div
        className={cn(
          'flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-surface px-2 py-1.5 shadow-xs sm:min-h-9',
          'focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/25',
          disabled && 'bg-subtle',
        )}
      >
        {values.map((address, index) => {
          const valid = isValidEmail(address)
          return (
            <span
              key={`${address}-${index}`}
              className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pl-2.5 pr-1 text-xs',
                valid
                  ? 'border-border bg-subtle text-foreground'
                  : 'border-warning/30 bg-warning-subtle text-warning',
              )}
            >
              {valid ? null : <AlertTriangle className="size-3 shrink-0" aria-hidden />}
              <span className="truncate">{address}</span>
              {valid ? null : <span className="sr-only">(not a valid address)</span>}
              <button
                type="button"
                aria-label={`Remove ${address}`}
                className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-border hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                disabled={disabled}
              >
                <X className="size-3" aria-hidden />
              </button>
            </span>
          )
        })}
        <input
          id={id}
          type="text"
          value={entry}
          disabled={disabled}
          placeholder={values.length === 0 ? 'name@example.com' : undefined}
          aria-describedby={`${id}-hint`}
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
          className="min-w-[10rem] flex-1 bg-transparent px-1 py-0.5 text-base text-foreground outline-none placeholder:text-muted sm:text-sm"
        />
      </div>
      <p id={`${id}-hint`} className={cn('text-xs', invalidCount > 0 ? 'font-medium text-warning' : 'text-muted')}>
        {invalidCount > 0
          ? `${invalidCount} address${invalidCount === 1 ? ' looks' : 'es look'} invalid — fix or remove before sending.`
          : 'Press Enter or comma to add an address.'}
      </p>
    </div>
  )
}
