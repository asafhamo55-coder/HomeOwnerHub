// Registry of official-source adapters.
//
// Phase 0 of sub-project F implements Florida only. The other states are
// deliberately absent rather than stubbed (decision log, F spec §10):
//   - GA has no fetchable official text; its curated JSONL keeps flowing
//     through scripts/ingest-state-statutes.ts unchanged.
//   - CA needs the leginfo bulk-zip parser (F phase 4).
//   - TX has no known server-rendered source (F phase 4 spike).
// The refresh job iterates SOURCE_STATES, so a state with no adapter is
// simply not refreshed — it never reads as "every section was repealed".

import { floridaAdapter } from './florida'
import { createPoliteGetter } from './http'
import type { HttpGetter, StateLawAdapter, StatuteState } from './types'

export * from './types'
export { normalizeStatuteBody, statuteContentHash } from './normalize'
export { createPoliteGetter, DEFAULT_USER_AGENT } from './http'
export {
  floridaAdapter,
  parseFloridaChapter,
  chapterUrl as floridaChapterUrl,
  FL_MIN_SECTIONS,
} from './florida'

export const SOURCE_STATES: readonly StatuteState[] = ['FL']

export interface AdapterDeps {
  /** Injected in tests to serve recorded fixtures. Defaults to the
   *  rate-limited network getter. */
  http?: HttpGetter
  now?: () => Date
}

export function adapterFor(state: string, deps: AdapterDeps = {}): StateLawAdapter | null {
  switch (state) {
    case 'FL':
      return floridaAdapter({ http: deps.http ?? createPoliteGetter(), now: deps.now })
    default:
      return null
  }
}
