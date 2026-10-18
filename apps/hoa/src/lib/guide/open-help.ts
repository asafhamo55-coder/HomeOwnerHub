/**
 * Open the "?" help drawer from anywhere on the page (a checklist "How?"
 * link, ⌘K "Ask the guide: …"). The drawer listens for this event and
 * calls preventDefault() to claim it; `openHelp` returns false when no
 * drawer is mounted, so the caller can fall back to a plain link.
 *
 * The detail never leaves the browser: no URL, no storage, no analytics.
 */
export const OPEN_HELP_EVENT = 'hoa:open-help'

export interface OpenHelpDetail {
  /** Show this article first, expanded to its steps. */
  articleId?: string
  /** Prefill "Ask the guide" with this question and ask it. */
  question?: string
}

export function openHelp(detail: OpenHelpDetail): boolean {
  if (typeof window === 'undefined') return false
  const e = new CustomEvent<OpenHelpDetail>(OPEN_HELP_EVENT, { detail, cancelable: true })
  return !window.dispatchEvent(e)
}
