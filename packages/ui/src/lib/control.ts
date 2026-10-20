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
  // Grey only a control that really carries the readonly attribute. The
  // `read-only:` variant is the :read-only pseudo-class, which matches EVERY
  // element that is not user-editable — a Select trigger <button>, the
  // prefixed Input's wrapper <div> — so it greyed all of them (BL-059).
  // Only <input>/<textarea> can carry `readonly`; the prefixed Input greys
  // its wrapper from the prop instead (Input.tsx).
  '[&[readonly]]:bg-subtle',
].join(' ')

export const controlInvalid =
  'border-danger hover:border-danger focus:border-danger focus:ring-danger/25'

export const controlHeight = 'h-10 sm:h-9'
