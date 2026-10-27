/**
 * Only same-site paths: `/x` yes; `//evil.com`, `/\\evil.com`,
 * `https://evil.com` and anything else falls back to `/`. A crafted
 * magic link must not bounce a freshly signed-in user off-site.
 */
export function safeNextPath(value: string | null): string {
  if (!value || !/^\/(?![/\\])[^\s]*$/.test(value)) return '/'
  return value
}
