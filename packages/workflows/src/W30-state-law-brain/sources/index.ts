// Registry of official-source adapters.
//
//   FL — flsenate.gov, Fla. Stat. ch. 720 (sub-project F phase 0)
//   CA — leginfo bulk database, Cal. Civ. Code §§ 4000–6150 (Davis-Stirling)
//   TX — Texas Legislative Council statute files, Tex. Prop. Code ch. 202, 209
//
// GA is deliberately absent: it has no fetchable official text (O.C.G.A. is
// LexisNexis-hosted), so its curated JSONL keeps flowing through
// scripts/ingest-state-statutes.ts unchanged. The refresh job iterates
// SOURCE_STATES, so a state with no adapter is simply not refreshed — it
// never reads as "every section was repealed".

import { californiaAdapter } from './california'
import { floridaAdapter } from './florida'
import { createPoliteGetter, createPoliteRangeGetter } from './http'
import { texasAdapter } from './texas'
import type { HttpGetter, RangeGetter, StateLawAdapter, StatuteState } from './types'

export * from './types'
export { normalizeStatuteBody, statuteContentHash } from './normalize'
export { createPoliteGetter, createPoliteRangeGetter, DEFAULT_USER_AGENT } from './http'
export {
  floridaAdapter,
  parseFloridaChapter,
  chapterUrl as floridaChapterUrl,
  FL_MIN_SECTIONS,
} from './florida'
export { californiaAdapter, pubinfoUrl, CA_MIN_SECTIONS } from './california'
export { texasAdapter, texasChapterUrl, parseTexasChapter, TX_CHAPTERS, TX_MIN_SECTIONS } from './texas'

export const SOURCE_STATES: readonly StatuteState[] = ['FL', 'CA', 'TX']

export function isSourceState(state: string): state is StatuteState {
  return (SOURCE_STATES as readonly string[]).includes(state)
}

export interface AdapterDeps {
  /** Injected in tests to serve recorded fixtures. Defaults to the
   *  rate-limited network getter. */
  http?: HttpGetter
  /** Byte-range reads (CA's bulk zip). Defaults to the rate-limited getter. */
  ranges?: RangeGetter
  now?: () => Date
}

export function adapterFor(state: string, deps: AdapterDeps = {}): StateLawAdapter | null {
  switch (state) {
    case 'FL':
      return floridaAdapter({ http: deps.http ?? createPoliteGetter(), now: deps.now })
    case 'CA':
      // ~8 requests per run to a host with no robots.txt/crawl-delay: 1 s
      // spacing keeps the whole fetch inside one 60 s job step, and the
      // ~20 MB central-directory read gets a longer timeout than a page.
      return californiaAdapter({
        http: deps.ranges ?? createPoliteRangeGetter({ minIntervalMs: 1_000, timeoutMs: 45_000 }),
        now: deps.now,
      })
    case 'TX':
      return texasAdapter({ http: deps.http ?? createPoliteGetter() })
    default:
      return null
  }
}
