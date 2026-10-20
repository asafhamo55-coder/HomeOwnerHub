// withRoute — every exported route handler is wrapped in this (RC-10).
//
// - An ApiRouteError (thrown by the require*/parse* helpers or the handler)
//   becomes its JSON envelope.
// - Anything else becomes a generic JSON 500 `internal`: logged with the
//   route name and error code only, and reported to Sentry. Never the
//   framework's HTML 500, never the error's text (R-20, R-05).
// - An AiPausedError (BL-112: AI_PLATFORM_KILL_SWITCH stopped a model call
//   at the client layer) becomes BL-108's friendly 503 `ai_paused`.
// - Next's own control-flow throws (redirect(), notFound(), dynamic-usage
//   bailouts) are rethrown untouched so the framework can handle them.
//
//   export const POST = withRoute('ai.rewrite', async (request) => { … })
//   export const GET = withRoute('vendors.documents', async (request, ctx: { params: Promise<{ id: string }> }) => { … })

import * as Sentry from '@sentry/nextjs'
import { ApiRouteError, apiError } from './errors'
import { errorCode, logRouteFailure } from './log'
import { isAiPausedError } from '@homeowner-portal/ai/guard'
import { aiPausedError } from './ai-spend'

function isNextControlFlow(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const digest = (err as { digest?: unknown }).digest
  return (
    typeof digest === 'string' &&
    (digest.startsWith('NEXT_') || digest === 'DYNAMIC_SERVER_USAGE' || digest === 'BAILOUT_TO_CLIENT_SIDE_RENDERING')
  )
}

type Result = Promise<Response> | Response

export function withRoute<R extends Request = Request>(
  name: string,
  handler: (request: R) => Result,
): (request: R) => Promise<Response>
export function withRoute<R extends Request, C>(
  name: string,
  handler: (request: R, context: C) => Result,
): (request: R, context: C) => Promise<Response>
export function withRoute<R extends Request, C>(
  name: string,
  handler: (request: R, context: C) => Result,
): (request: R, context: C) => Promise<Response> {
  return async (request: R, context: C) => {
    try {
      return await handler(request, context)
    } catch (err) {
      if (err instanceof ApiRouteError) return err.toResponse()
      if (isNextControlFlow(err)) throw err
      // BL-112: the kill switch stopped a model or embedding call at the
      // client layer (a route with no requireAiQuota in front of it, or one
      // already past it). Same friendly 503 the quota gate gives, not a 500.
      if (isAiPausedError(err)) return aiPausedError().toResponse()
      logRouteFailure(name, err, { stage: 'unhandled' })
      Sentry.captureException(err, { tags: { where: `api:${name}`, code: errorCode(err) ?? 'none' } })
      return apiError('internal')
    }
  }
}
