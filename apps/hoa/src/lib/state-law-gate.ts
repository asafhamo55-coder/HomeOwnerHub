// Which /legal/ask view to show. Pure, so the "not loaded yet" guard is
// testable without rendering the page.
//
// GA, FL, CA and TX are all offered, but a state only has statute text once
// its source has been ingested. With none on file, the page says so plainly
// instead of offering a question box whose only possible answers would be
// "not loaded" (the W30 workflow refuses too, as a backstop).

import { STATE_NAMES, type SupportedStateCode } from '@/lib/status/knowledge'

export type StateLawAskGate =
  | { kind: 'unsupported' }
  | { kind: 'not_loaded'; state: SupportedStateCode; title: string; description: string }
  | { kind: 'ready'; state: SupportedStateCode }

export function stateLawAskGate(state: SupportedStateCode | null, liveStatutes: number): StateLawAskGate {
  if (!state) return { kind: 'unsupported' }
  if (liveStatutes > 0) return { kind: 'ready', state }
  const name = STATE_NAMES[state]
  return {
    kind: 'not_loaded',
    state,
    title: `${name} state law isn’t loaded yet`,
    description:
      `The assistant answers only from the statute text, never from general knowledge, so it can’t answer ` +
      `${name} questions until ${name}’s official statutes are loaded. Your association’s own documents can ` +
      `still be searched from Ask the Docs.`,
  }
}
