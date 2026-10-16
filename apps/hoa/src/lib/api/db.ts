// Every Supabase write's error is checked (RC-6). checkWrite turns a failed
// insert/update/upsert/delete/storage call into a thrown ApiRouteError:
// a generic 500 by default, or a 409 conflict when the caller says what a
// unique violation (23505) means. Logs the code and ids, never the message.

import { ApiRouteError } from './errors'
import { logRouteFailure, type LogContext } from './log'

type DbError = { code?: string | number; message?: string } | null | undefined

export function checkWrite(
  result: { error: DbError },
  where: string,
  context: LogContext = {},
  opts: { conflict?: { reason: string; message: string } } = {},
): void {
  const { error } = result
  if (!error) return
  if (String(error.code) === '23505' && opts.conflict) {
    throw new ApiRouteError('conflict', opts.conflict.message, { reason: opts.conflict.reason })
  }
  logRouteFailure(where, error, context)
  throw new ApiRouteError('internal')
}
