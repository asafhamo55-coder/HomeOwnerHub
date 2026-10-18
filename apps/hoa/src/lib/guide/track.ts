/**
 * `trackHelp` (spec §8): fire-and-forget help analytics from the browser.
 * One beacon to POST /api/help/event, which validates against the
 * allowlist in help-events.ts and writes one log line. Never throws, never
 * awaits, never blocks navigation; an analytics failure is invisible.
 */
import type { HelpClientEvent } from './help-events'

export const HELP_EVENT_URL = '/api/help/event'

export function trackHelp(e: HelpClientEvent): void {
  try {
    const body = JSON.stringify(e)
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(HELP_EVENT_URL, new Blob([body], { type: 'application/json' }))) return
    }
    if (typeof fetch === 'function') {
      void fetch(HELP_EVENT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {})
    }
  } catch {
    // analytics must never break the page
  }
}
