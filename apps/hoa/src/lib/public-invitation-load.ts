import { ApiRouteError } from '@/lib/api/errors'
import { logRouteFailure } from '@/lib/api/log'

// Public invitation pages (/rfp-bid/[token], /vendor-onboard/[token]) load
// their token through validators that THROW when the lookup fails on our
// side (a DB error must never read as "invalid link"). A route turns that
// throw into a 500 envelope via withRoute; a page has no such wrapper, so
// without this the throw lands on Next's generic error page. This turns it
// into a third state the page renders as a branded "try again" (BL-056).

export type PublicInvitationLoad<T> = { state: 'loaded'; value: T } | { state: 'unavailable' }

export async function loadPublicInvitation<T>(
  where: string,
  load: () => Promise<T>,
): Promise<PublicInvitationLoad<T>> {
  try {
    return { state: 'loaded', value: await load() }
  } catch (err) {
    // notFound() / redirect() / dynamic-usage bailouts are control flow,
    // not failures: Next marks them with a string `digest`.
    if (isNextControlFlow(err)) throw err
    // An ApiRouteError was logged (code only) where it was raised. Anything
    // else — a client that could not be built, a rejected fetch — is logged
    // here, by name and code, never its message (RC-2).
    if (!(err instanceof ApiRouteError)) logRouteFailure(where, err)
    return { state: 'unavailable' }
  }
}

function isNextControlFlow(err: unknown): boolean {
  return !!err && typeof err === 'object' && typeof (err as { digest?: unknown }).digest === 'string'
}
