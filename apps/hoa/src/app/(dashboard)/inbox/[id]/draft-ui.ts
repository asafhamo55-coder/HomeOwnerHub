/**
 * Presentation constants shared by DraftPanel and Composer.
 *
 * The "needs a human decision" well: warning tokens (design system v2), so
 * it themes in dark mode without a `dark:` pair and its text is AA on its
 * own background (packages/ui tokens.test.ts).
 */
export const AMBER_BOX =
  'rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-xs text-foreground'

/**
 * `blank.kind` names a category the model is forbidden from writing itself.
 * This only labels the callout — `blank.prompt` is what actually tells the
 * human what to decide, and is rendered verbatim.
 *
 * Two workflows feed this map and their kinds do not overlap except for
 * `money`, which both forbid for the same reason. W32 (replies to residents)
 * emits the first four; W34 (work orders to vendors) emits the last four.
 * One flat map rather than two, because the renderer only ever has a `kind`
 * string in hand — it does not know which workflow produced the draft, and
 * an unknown key already falls back to the raw kind.
 */
export const BLANK_KIND_LABELS: Record<string, string> = {
  money: 'Money',
  enforcement: 'Enforcement outcome',
  legal: 'Legal interpretation',
  other_resident: "Another resident's details",
  // W34 — see the vendor request composer spec, D8.
  authority: 'Authorization to proceed',
  access: 'Site access',
  date: 'Deadline',
  scope: 'Scope of work',
}
