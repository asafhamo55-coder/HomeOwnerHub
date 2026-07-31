/**
 * Structural rather than importing `PostgrestError` from
 * `@supabase/supabase-js` directly — this package depends on it only
 * transitively (through `@homeowner-portal/db`), and `.message`/`.code` is
 * all any caller here needs. Never log `.details`: on a PostgrestError it
 * can carry row values, which may include resident PII.
 */
export type DbError = { message: string; code?: string } | Error

export function logDbError(
  fn: string,
  table: string,
  context: Record<string, string | null>,
  error: DbError,
): void {
  console.error(`${fn}: query on "${table}" failed`, {
    ...context,
    code: 'code' in error ? error.code : undefined,
    message: error.message,
  })
}
