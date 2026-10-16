// Route-side failure logging (RC-2). Context is ids, counts and error CODES
// only — never a message, name, email, address or body. A Postgres / storage
// / provider message routinely embeds the offending value
// ("Key (email)=(jane@…) already exists"), so `.message` never reaches a log
// line from here; Sentry gets the error object and scrubs it
// (packages/observability scrubEvent).

export type LogContext = Record<string, string | number | boolean | null | undefined>

/** The machine-readable code of a DB/storage/provider error, if it has one. */
export function errorCode(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined
  const e = err as { code?: unknown; statusCode?: unknown; status?: unknown; name?: unknown }
  if (typeof e.code === 'string' || typeof e.code === 'number') return String(e.code)
  if (typeof e.statusCode === 'string' || typeof e.statusCode === 'number') return String(e.statusCode)
  if (typeof e.status === 'number') return String(e.status)
  return undefined
}

export function logRouteFailure(where: string, err: unknown, context: LogContext = {}): void {
  const name = err instanceof Error ? err.name : typeof err
  console.error(`[api:${where}] failed`, { ...context, errorName: name, errorCode: errorCode(err) ?? null })
}
