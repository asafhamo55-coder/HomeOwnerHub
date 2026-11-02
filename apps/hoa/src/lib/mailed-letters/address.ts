/**
 * BL-032: postal addresses for the mailing screen. Pure.
 *
 * The letter keeps the owner's mailing address as free text. The provider
 * needs it in parts, so the screen shows editable boxes prefilled by a
 * best-effort read of that text. The board checks the boxes before sending.
 * Addresses go to the provider only; they are never logged or stored in
 * mailed_letters.
 */

import { z } from 'zod'
import type { PostalAddress } from './provider'

const clean = z.string().trim()

export const PostalAddressSchema = z.object({
  name: clean.min(1, 'Add a name.').max(80),
  line1: clean.min(1, 'Add the street address.').max(100),
  line2: clean.max(100).optional(),
  city: clean.min(1, 'Add the city.').max(60),
  state: clean.toUpperCase().regex(/^[A-Z]{2}$/, 'Use the two-letter state, like GA.'),
  zip: clean.regex(/^\d{5}(-\d{4})?$/, 'Use a 5-digit ZIP code.'),
})

export type AddressCheck = { ok: true; address: PostalAddress } | { ok: false; error: string }

export function checkAddress(raw: unknown, which: 'recipient' | 'return'): AddressCheck {
  const parsed = PostalAddressSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { ok: false, error: `The ${which} address: ${first?.message ?? 'check it.'}` }
  }
  const { line2, ...rest } = parsed.data
  return { ok: true, address: { ...rest, ...(line2 ? { line2 } : {}) } }
}

const CITY_LINE = /^(.*?),?\s+([A-Za-z]{2})\.?,?\s+(\d{5}(?:-\d{4})?)$/

/** Best-effort split of "123 Oak Ln\nAtlanta, GA 30303". Anything it cannot read stays blank. */
export function guessAddress(name: string, text: string): Partial<PostalAddress> {
  const lines = text
    .split(/\r?\n|;/)
    .map((l) => l.trim())
    .filter(Boolean)
  const out: Partial<PostalAddress> = { name: name.trim() }
  const last = lines[lines.length - 1]
  const m = last ? CITY_LINE.exec(last) : null
  if (m) {
    out.city = (m[1] ?? '').trim()
    out.state = (m[2] ?? '').toUpperCase()
    out.zip = m[3]
    lines.pop()
  }
  if (lines[0]) out.line1 = lines[0]
  if (lines[1]) out.line2 = lines.slice(1).join(', ')
  return out
}
