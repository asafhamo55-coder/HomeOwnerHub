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
