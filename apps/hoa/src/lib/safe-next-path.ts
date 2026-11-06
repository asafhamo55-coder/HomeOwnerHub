/**
 * Only same-site paths: `/x` yes; `//evil.com`, `/\\evil.com`,
 * `https://evil.com` and anything else falls back to `/`. A crafted
 * magic link must not bounce a freshly signed-in user off-site.
 */
export function safeNextPath(value: string | null): string {
  if (!value || !/^\/(?![/\\])[^\s]*$/.test(value)) return '/'
  return value
}

/**
 * Where a new account lands after confirming its email: the same-site path
 * it came with (for example /join), else /onboarding. Anything unsafe
 * collapses to /onboarding, the default for board signups.
 */
export function signupNextPath(value: string | null | undefined): string {
  const safe = safeNextPath(value ?? null)
  return safe === '/' ? '/onboarding' : safe
}
