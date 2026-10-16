// The one JSON error envelope every API route handler returns (RC-1 in
// .claude/skills/api-route-conventions/SKILL.md):
//
//   { "error": { "code": "<fixed code>", "message": "<human text>", ...extra } }
//
// `code` comes from the fixed map below and decides the HTTP status; a
// handler never picks a status by hand. Finer distinctions a client may
// branch on ("already_submitted", "statute_refusal") go in `extra.reason`.
// `message` is written for the person using the app — never raw database,
// storage, Zod or provider text (RC-2).
//
// Edge-safe: imported by middleware, so no node: imports here.

import { NextResponse } from 'next/server'

export const API_ERROR_STATUS = {
  invalid_json: 400,
  validation_failed: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  /** Only for a token we recognise that has expired / been used. Unknown tokens are 404. */
  gone: 410,
  payload_too_large: 413,
  unsupported_media_type: 415,
  /** A well-formed request the domain refuses (statute refusal, period closed, …). */
  unprocessable: 422,
  rate_limited: 429,
  /** Generic. The message is ALWAYS the default — detail goes to the log, not the client. */
  internal: 500,
  not_configured: 503,
  upstream_unavailable: 503,
} as const

export type ApiErrorCode = keyof typeof API_ERROR_STATUS

export const API_ERROR_DEFAULT_MESSAGE: Record<ApiErrorCode, string> = {
  invalid_json: 'The request body is not valid JSON.',
  validation_failed: 'Some fields are missing or invalid.',
  unauthenticated: 'Your session has ended. Sign in again to continue.',
  forbidden: 'You do not have permission to do this.',
  not_found: 'We could not find that.',
  conflict: 'This conflicts with something that already exists.',
  gone: 'This link has expired or has already been used.',
  payload_too_large: 'That is too large to upload.',
  unsupported_media_type: 'That file type is not supported.',
  unprocessable: 'This request cannot be completed.',
  rate_limited: 'Too many requests. Wait a moment and try again.',
  internal: 'Something went wrong on our side. Try again in a moment.',
  not_configured: 'This feature is not set up yet.',
  upstream_unavailable: 'A service we depend on is not reachable right now. Try again shortly.',
}

/** A field-level validation problem: dotted path + human message. */
export interface FieldIssue {
  path: string
  message: string
}

/** Extra fields nested inside `error`. Keys are camelCase (RC-12). */
export interface ApiErrorExtra {
  /** Stable snake_case sub-code a client may branch on. */
  reason?: string
  /** validation_failed only. */
  issues?: FieldIssue[]
  [key: string]: unknown
}

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string } & ApiErrorExtra
}

function publicMessage(code: ApiErrorCode, message: string | undefined): string {
  // internal never carries caller-supplied text: that is exactly where raw
  // DB / provider messages would leak (R-04, R-05).
  if (code === 'internal' || !message) return API_ERROR_DEFAULT_MESSAGE[code]
  return message
}

/** Build the error response. The status is derived from `code`. */
export function apiError(
  code: ApiErrorCode,
  message?: string,
  extra?: ApiErrorExtra,
  headers?: HeadersInit,
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = { error: { ...extra, code, message: publicMessage(code, message) } }
  return NextResponse.json(body, { status: API_ERROR_STATUS[code], headers })
}

/**
 * Throw from anywhere inside a `withRoute` handler (or a helper it calls)
 * to short-circuit with that envelope. The `require*` / `parse*` helpers
 * throw these, which is what keeps the auth → role → parse → validate →
 * work order (RC-3) to one line per step.
 */
export class ApiRouteError extends Error {
  readonly status: number
  readonly publicMessage: string

  constructor(
    readonly code: ApiErrorCode,
    message?: string,
    readonly extra?: ApiErrorExtra,
    readonly headers?: HeadersInit,
  ) {
    super(`api_error:${code}`)
    this.name = 'ApiRouteError'
    this.status = API_ERROR_STATUS[code]
    this.publicMessage = publicMessage(code, message)
  }

  toResponse(): NextResponse<ApiErrorBody> {
    return apiError(this.code, this.publicMessage, this.extra, this.headers)
  }
}

export function isApiErrorBody(body: unknown): body is ApiErrorBody {
  if (!body || typeof body !== 'object') return false
  const err = (body as { error?: unknown }).error
  return (
    !!err &&
    typeof err === 'object' &&
    typeof (err as { code?: unknown }).code === 'string' &&
    typeof (err as { message?: unknown }).message === 'string'
  )
}
