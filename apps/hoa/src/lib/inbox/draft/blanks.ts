/**
 * Constants and pure predicates shared by `actions.ts` (server-only) and the
 * client-side draft panel (a later task).
 *
 * Deliberately has NO `'use server'` directive. A `'use server'` module may
 * export only async functions — Next.js errors at build time on a
 * synchronous export or a plain constant. `UNDO_WINDOW_SECONDS` and
 * `hasUnfilledBlanks` are both synchronous, and the client component needs
 * `hasUnfilledBlanks` to disable the Approve button, which it could not
 * import from a server module anyway.
 */

/** Spec D6. One constant, referenced everywhere; never a literal. */
export const UNDO_WINDOW_SECONDS = 30

/**
 * True while any guardrail blank is still unfilled.
 *
 * Deliberately tolerant of spacing: the model writes these markers, and a
 * stricter regex that missed `[[ BLANK : money ]]` would let a draft through
 * with a placeholder where a fee decision belongs. Erring toward blocking is
 * the safe direction — the worst case is a human deleting a line.
 */
export function hasUnfilledBlanks(body: string): boolean {
  return /\[\[\s*BLANK\s*:\s*[a-z_]+\s*\]\]/i.test(body)
}
