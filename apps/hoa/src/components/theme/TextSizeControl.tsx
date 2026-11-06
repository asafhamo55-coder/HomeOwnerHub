'use client'

import { useId } from 'react'
import { TEXT_SIZES } from '@/lib/larger-text'
import { useTextSize } from './useTextSize'

/**
 * Text size picker for the resident Account page: a native radio group
 * (arrow keys move and select), 48px targets, and a polite live region that
 * announces the choice.
 */
export function TextSizeControl() {
  const name = useId()
  const { size, choose, message } = useTextSize()

  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-foreground">Text size</legend>
      <p className="mb-2 text-xs text-muted">Makes everything in the app bigger</p>
      <div className="grid grid-cols-3 gap-2">
        {TEXT_SIZES.map((s) => (
          <label
            key={s.value}
            className="flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-border px-2 py-2 text-center text-sm font-medium text-foreground has-[:checked]:border-primary has-[:checked]:bg-primary-subtle has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary"
          >
            <input
              type="radio"
              name={name}
              value={s.value}
              checked={size === s.value}
              onChange={() => choose(s.value)}
              className="sr-only"
            />
            {s.label}
          </label>
        ))}
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
    </fieldset>
  )
}
