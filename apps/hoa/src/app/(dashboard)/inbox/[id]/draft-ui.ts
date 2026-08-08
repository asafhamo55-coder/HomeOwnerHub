/**
 * Presentation constants shared by DraftPanel and Composer.
 *
 * No `warning` token exists in the shared Tailwind config
 * (packages/ui/tailwind.config.ts defines only primary/accent/background/
 * surface/border/foreground/muted/destructive as CSS-variable tokens), so the
 * "needs a human decision" tone is this literal amber + dark: pair. The same
 * pair is used in PropertyRail.tsx and MessageThread.tsx; those are left alone
 * here because this task has no other reason to touch them.
 */
export const AMBER_BOX =
  'rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'

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
