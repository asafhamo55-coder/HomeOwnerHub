// Conversion events for Vercel Web Analytics (cookieless; inert until the
// project turns Analytics on, OA-35). Event props are plain labels only:
// a page path and a position name. Never an email, a name, an HOA name or
// anything the visitor typed.

export const ANALYTICS_EVENTS = ['demo_cta_click', 'demo_submit_success', 'pilot_cta_click'] as const
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number]

export type EventProps = Readonly<Record<string, string>>

/** Page paths are labels like "/georgia/late-fee-limits"; drop any query or fragment. */
export function pageLabel(pathname: string | null | undefined): string {
  return (pathname ?? '/').split(/[?#]/)[0] || '/'
}

/** Fire an event. Safe on the server and when analytics is blocked. */
export async function trackEvent(name: AnalyticsEvent, props: EventProps = {}): Promise<void> {
  if (typeof window === 'undefined') return
  try {
    const { track } = await import('@vercel/analytics')
    track(name, { ...props })
  } catch {
    // Analytics must never break a button.
  }
}
