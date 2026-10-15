/**
 * Shared look for text-like form controls (Input, Textarea, Select
 * trigger). 40px / 16px text on phones — iOS zooms any input under 16px —
 * and 36px / 15px from `sm` up.
 */
export const controlBase = [
  'w-full rounded-lg border border-input bg-surface text-foreground shadow-xs',
  'text-base sm:text-sm placeholder:text-muted',
  'transition-[border-color,box-shadow] duration-fast ease-standard',
  'hover:border-foreground/40',
  'focus:outline-none focus-visible:outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/25',
  'disabled:cursor-not-allowed disabled:bg-subtle disabled:text-muted disabled:shadow-none',
  'read-only:bg-subtle',
].join(' ')

export const controlInvalid =
  'border-danger hover:border-danger focus:border-danger focus:ring-danger/25'

export const controlHeight = 'h-10 sm:h-9'
