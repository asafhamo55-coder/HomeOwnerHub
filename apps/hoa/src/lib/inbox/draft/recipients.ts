/**
 * Pure recipient validation, shared by the server action that queues a send
 * and the client composer that has to disable Approve.
 *
 * Deliberately has NO `'use server'` directive, for the same reason as
 * blanks.ts: a `'use server'` module may export only async functions, and
 * the client component needs these synchronously.
 *
 * The email predicate is intentionally pragmatic rather than RFC 5322
 * complete. It has one hard job: guarantee that whatever reaches
 * buildMimeMessage cannot break out of a header. Anything containing CR,
 * LF, a comma, or an angle bracket is refused here so that the injection
 * guard downstream is a second line of defence rather than the only one.
 */

/** One address per chip; display names are not supported. */
const EMAIL = /^[^\s@,<>;"]+@[^\s@,<>;"]+\.[^\s@,<>;"]{2,}$/

/** Spec: at most 25 recipients across To and Cc. Never a literal. */
export const MAX_RECIPIENTS = 25

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim())
}

export function normalizeRecipients(
  to: string[],
  cc: string[],
):
  | { ok: true; to: string[]; cc: string[] }
  | { ok: false; error: string } {
  const clean = (list: string[]) => list.map((v) => v.trim()).filter((v) => v !== '')

  const rawTo = clean(to)
  const rawCc = clean(cc)

  if (rawTo.length === 0) {
    return { ok: false, error: 'Add at least one recipient before sending.' }
  }

  for (const address of [...rawTo, ...rawCc]) {
    if (!isValidEmail(address)) {
      // Safe to echo: this string came from the user's own input box and is
      // shown back to them inline. It is never written to a log.
      return { ok: false, error: `"${address}" is not a valid email address.` }
    }
  }

  // Case-insensitive dedupe. A Cc that duplicates a To is dropped rather
  // than rejected — the user's intent is unambiguous and Gmail would
  // otherwise deliver the same message twice.
  const seen = new Set<string>()
  const dedupe = (list: string[]) =>
    list
      .map((v) => v.toLowerCase())
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)))

  const finalTo = dedupe(rawTo)
  const finalCc = dedupe(rawCc)

  if (finalTo.length + finalCc.length > MAX_RECIPIENTS) {
    return {
      ok: false,
      error: `A message can have at most ${MAX_RECIPIENTS} recipients.`,
    }
  }

  return { ok: true, to: finalTo, cc: finalCc }
}
