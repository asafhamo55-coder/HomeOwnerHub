'use client'

import { useId } from 'react'
import { TEXT_SIZES } from '@/lib/larger-text'
import { useTextSize } from './useTextSize'

/**
 * Text size picker: a native radio group (arrow keys move and select) with
 * 48px targets (never under 44px) and a polite live region that announces
 * the choice. Used on the resident Account page and, in `compact` form (one
 * row, no hint line), above the form on the signed-out sign-in and /join
 * screens. It needs no account: the choice lives in localStorage only.
 */
export function TextSizeControl({ compact = false }: { compact?: boolean }) {
  const name = useId()
  const { size, choose, message } = useTextSize()

  return (
    <fieldset className={compact ? 'flex min-w-0 flex-col gap-1.5' : 'min-w-0'}>
      <legend className={compact ? 'sr-only' : 'text-sm font-semibold text-foreground'}>Text size</legend>
      {compact ? (
        <span aria-hidden className="shrink-0 text-sm font-semibold text-foreground">
          Text size
        </span>
      ) : (
        <p className="mb-2 text-xs text-muted">Makes text bigger</p>
      )}
      <div className="grid flex-1 grid-cols-3 gap-2">
        {TEXT_SIZES.map((s) => (
          <label
            key={s.value}
            className="flex min-h-12 cursor-pointer items-center justify-center rounded-lg border border-border px-2 py-2 text-center text-sm font-medium text-foreground has-[:checked]:border-primary has-[:checked]:bg-primary-subtle has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary forced-colors:has-[:focus-visible]:outline forced-colors:has-[:focus-visible]:outline-2 forced-colors:has-[:checked]:border-2 forced-colors:has-[:checked]:border-[Highlight]"
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
