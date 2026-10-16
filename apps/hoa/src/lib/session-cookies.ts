// Cookies that only make sense for ONE signed-in user in ONE org. They
// must not survive a sign-out (the next person at the browser would
// inherit them) or an org switch (an impersonation started in org A must
// not follow the admin into org B). The impersonation token is also bound
// to (org, admin) cryptographically; clearing it is the second layer.

export const IMPERSONATION_COOKIE = 'hh_impersonate'
export const ROLE_OVERRIDE_COOKIE = 'hh_role_override'

export const SESSION_SCOPED_COOKIES = [IMPERSONATION_COOKIE, ROLE_OVERRIDE_COOKIE] as const

/** Deletes every session-scoped cookie from a next/headers cookie store. */
export function clearSessionScopedCookies(store: { delete: (name: string) => unknown }): void {
  for (const name of SESSION_SCOPED_COOKIES) store.delete(name)
}
