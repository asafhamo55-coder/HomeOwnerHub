/**
 * Normalizes the merge-field answers a board member retypes on the resend
 * form before they reach the render.
 *
 * Lives outside send.ts for the same reason merge-bag.ts does — a
 * `'use server'` file can only export async server actions — but the
 * trimming is not cosmetic. `renderTemplateStrict` counts an empty string
 * as a MISSING field, while `unresolvedFields` counts any present key as
 * satisfied. A field left blank on the form would therefore pass the
 * preflight check and then throw once per recipient inside
 * buildEmailPayloads, marking all 37 rows failed with the very message the
 * form exists to prevent. Dropping blanks here keeps the two agreeing: an
 * unfilled field stays "unresolved", gets named back to the caller, and no
 * mail goes out.
 *
 * Values are deliberately not HTML-escaped. They substitute into a body the
 * same board member authored — a role that can already write arbitrary HTML
 * there — and the send pipeline has never escaped `extraFields` (dues
 * reminders pass their own pre-escaped values, which double-escaping would
 * mangle).
 *
 * Pure: no Supabase, no network, no clock.
 */

import type { MergeBag } from './templates'

/** What `{{...}}` can actually name — see PLACEHOLDER_RE in templates.ts. */
const FIELD_NAME_RE = /^[a-zA-Z0-9_]+$/

/**
 * Trim each answer, drop the blanks, and ignore anything that could not be
 * a placeholder in the first place.
 *
 * The argument arrives from the browser, so the keys are only *expected* to
 * be the ones the preflight handed out. A junk key is harmless — nothing
 * renders it — but filtering keeps the bag to fields a template could
 * reference, and a supplied field can never shadow an ambient one anyway:
 * buildRecipientBag puts `extraFields` at the lowest precedence.
 */
export function normalizeSuppliedFields(
  supplied: Record<string, string> | null | undefined,
): MergeBag {
  const bag: MergeBag = {}
  if (!supplied) return bag
  for (const [name, value] of Object.entries(supplied)) {
    if (!FIELD_NAME_RE.test(name)) continue
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) bag[name] = trimmed
  }
  return bag
}
