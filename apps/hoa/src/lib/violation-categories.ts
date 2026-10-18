// The violation categories offered wherever someone picks "what kind of
// issue": the resident report form and the board's inspection mode
// (BL-028). There is no per-association category table. Mapping a
// category to the CC&R section is W3's job (it retrieves the governing-doc
// section that matches the category and the note), so this list is only
// the shared vocabulary. Pure; safe in client components.

import type { ViolationCategory } from '@/lib/resident-submissions'

export const VIOLATION_CATEGORIES: ReadonlyArray<{ value: ViolationCategory; label: string }> = [
  { value: 'parking', label: 'Parking / vehicles' },
  { value: 'pet', label: 'Pet (off-leash, waste, etc.)' },
  { value: 'noise', label: 'Noise / quiet hours' },
  { value: 'lawn_landscape', label: 'Lawn / landscaping' },
  { value: 'trash', label: 'Trash / debris' },
  { value: 'architectural', label: 'Unapproved architectural change' },
  { value: 'rental', label: 'Short-term rental / leasing' },
  { value: 'nuisance', label: 'General nuisance' },
  { value: 'other', label: 'Other' },
]

export function violationCategoryLabel(value: string): string | null {
  return VIOLATION_CATEGORIES.find((c) => c.value === value)?.label ?? null
}

export function isViolationCategory(value: unknown): value is ViolationCategory {
  return typeof value === 'string' && VIOLATION_CATEGORIES.some((c) => c.value === value)
}
