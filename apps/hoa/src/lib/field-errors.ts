/**
 * Zod issues → `{ field: message }` for a server action's `fieldErrors`,
 * so a form can show each problem under its own field (design system v2
 * §4 "Forms": errors are per field). First issue per field wins, matching
 * lib/properties' createProperty. Keys are the schema's top-level input
 * names; nested paths (`lineItems.2.amount`) are joined with dots.
 *
 * Not a 'use server' module: those may only export async functions.
 */
export interface IssueLike {
  path: readonly PropertyKey[]
  message: string
}

export function fieldErrorsOf(error: { issues: readonly IssueLike[] }): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_'
    if (!out[key]) out[key] = issue.message
  }
  return out
}

/**
 * A failed action result split for a form: per-field messages for under
 * each field, and the form-level one (the `_` key, or the message when no
 * field was named) for the alert. Both can be present, and both show.
 */
export function splitFormErrors(result: { error: string; fieldErrors?: Record<string, string> }): {
  fields: Record<string, string>
  form: string | null
} {
  const { _: formLevel, ...fields } = result.fieldErrors ?? {}
  const hasFields = Object.keys(fields).length > 0
  return { fields, form: formLevel ?? (hasFields ? null : result.error) }
}
