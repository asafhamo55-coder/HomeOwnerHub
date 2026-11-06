'use client'

import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@homeowner-portal/ui'
import { TEXT_SIZES, isTextSize } from '@/lib/larger-text'
import { useTextSize } from './useTextSize'

/**
 * "Text size" radio group for the board account menu. Radix menu radio items
 * are keyboard operable (arrows, Enter or Space) and announce their checked
 * state; the live region adds the confirmation sentence. The menu stays open
 * so the result is visible straight away.
 */
export function TextSizeMenuItems() {
  const { size, choose, message } = useTextSize()
  return (
    <>
      <DropdownMenuLabel>Text size</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={size} onValueChange={(v) => isTextSize(v) && choose(v)}>
        {TEXT_SIZES.map((s) => (
          <DropdownMenuRadioItem
            key={s.value}
            value={s.value}
            className="min-h-12 sm:py-2"
            onSelect={(e) => e.preventDefault()}
          >
            {s.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
    </>
  )
}
