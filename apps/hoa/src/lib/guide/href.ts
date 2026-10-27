/**
 * Guide link builders with NO dependency on the compiled corpus
 * (`@/generated/guide`, ~1.9 MB). Client components must import from here, not
 * from ./index: reaching generated/guide.ts from a 'use client' file ships the
 * whole corpus to the browser (guide-client-boundary.test.ts enforces this).
 */
export type GuideAudience = 'board' | 'resident'

export function articleHref(id: string, audience: GuideAudience): string {
  return audience === 'resident' ? `/resident/help/${id}` : `/help/${id}`
}

/**
 * Unchecked at runtime on purpose (no corpus here). `pnpm guide:check` scans
 * the source for `guideHref('…')` literals and fails CI on any unknown or
 * draft article, so a renamed article still cannot become a 404.
 */
export function guideHrefUnchecked(id: string, audience: GuideAudience = 'board'): string {
  return articleHref(id, audience)
}
