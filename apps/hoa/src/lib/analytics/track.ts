/**
 * The one way product code sends an analytics event (BL-009).
 *
 * Typed by the allowlist in ./events, re-checked at runtime, and a no-op
 * unless analytics is switched on and the browser has not asked not to be
 * tracked. Never throws: analytics must not break the action it observes.
 */
import { track as vercelTrack } from '@vercel/analytics'
import { sanitizeEvent, type AnalyticsEventName, type AnalyticsEventProps } from './events'
import { analyticsEnabled, doNotTrack } from './privacy'

type Sender = (name: string, props: Record<string, string | number | boolean>) => void

/** Exposed for tests: decides and sends, with the sender and signals injected. */
export function sendEvent(
  name: string,
  props: unknown,
  deps: { enabled: boolean; dnt: boolean; send: Sender },
): boolean {
  if (!deps.enabled || deps.dnt) return false
  const event = sanitizeEvent(name, props)
  if (!event) return false
  try {
    deps.send(event.name, event.props)
    return true
  } catch {
    return false
  }
}

export function trackEvent<N extends AnalyticsEventName>(name: N, props: AnalyticsEventProps<N>): void {
  if (typeof window === 'undefined') return
  sendEvent(name, props, {
    enabled: analyticsEnabled(),
    dnt: doNotTrack(
      navigator as unknown as { doNotTrack?: string | null; globalPrivacyControl?: boolean },
      window as unknown as { doNotTrack?: string | null },
    ),
    send: vercelTrack,
  })
}
