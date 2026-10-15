import * as Sentry from '@sentry/nextjs'

// Report a failure the caller has decided not to throw — a best-effort
// write, a background cleanup — so it stops being invisible.
//
// `where` is a stable, low-cardinality label ("platform-admin.audit-write")
// used as a tag and in the console line. `context` must hold ids and
// counts only — never names, addresses, emails or message bodies.
// Safe to call with Sentry disabled (no DSN): the console line still
// lands in the Vercel logs.
export function reportError(
  error: unknown,
  where: string,
  context: Record<string, string | number | boolean | null | undefined> = {},
): void {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[${where}] ${message}`, context)
  Sentry.captureException(error instanceof Error ? error : new Error(message), {
    tags: { where },
    extra: context,
  })
}
