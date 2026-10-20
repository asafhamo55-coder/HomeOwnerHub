// Registry of official-source adapters.
//
//   FL — flsenate.gov, Fla. Stat. ch. 720 (sub-project F phase 0)
//   CA — leginfo bulk database, Cal. Civ. Code §§ 4000–6150 (Davis-Stirling)
//   TX — Texas Legislative Council statute files, Tex. Prop. Code ch. 202, 209
//   GA — vetted snapshot of O.C.G.A. §§ 44-3-220 to 44-3-235 (offline: the
//        official Code is LexisNexis-hosted and not fetchable; see georgia.ts)
//
// The refresh job iterates SOURCE_STATES. A state with no adapter is simply
// not refreshed — it never reads as "every section was repealed".

import { californiaAdapter } from './california'
import { floridaAdapter } from './florida'
import { georgiaAdapter } from './georgia'
import {
  DEFAULT_PAGE_MAX_BYTES,
  DEFAULT_RANGE_MAX_BYTES,
  createPoliteGetter,
  createPoliteRangeGetter,
} from './http'
import { texasAdapter } from './texas'
import type { HttpGetter, RangeGetter, StateLawAdapter, StatuteState } from './types'

export * from './types'
export { normalizeStatuteBody, statuteContentHash } from './normalize'
export {
  createPoliteGetter,
  createPoliteRangeGetter,
  DEFAULT_USER_AGENT,
  DEFAULT_PAGE_MAX_BYTES,
  DEFAULT_RANGE_MAX_BYTES,
  ResponseTooLargeError,
} from './http'
export {
  floridaAdapter,
  parseFloridaChapter,
  chapterUrl as floridaChapterUrl,
  FL_MIN_SECTIONS,
} from './florida'
export { californiaAdapter, pubinfoUrl, CA_MIN_SECTIONS } from './california'
export { texasAdapter, texasChapterUrl, parseTexasChapter, TX_CHAPTERS, TX_MIN_SECTIONS } from './texas'
export { georgiaAdapter, georgiaCovers, parseGeorgiaSnapshot, GA_MIN_SECTIONS } from './georgia'

export const SOURCE_STATES: readonly StatuteState[] = ['FL', 'CA', 'TX', 'GA']

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
      return floridaAdapter({
        http: deps.http ?? createPoliteGetter({ maxBodyBytes: DEFAULT_PAGE_MAX_BYTES }),
        now: deps.now,
      })
    case 'CA':
      // ~8 requests per run to a host with no robots.txt/crawl-delay: 1 s
      // spacing keeps the whole fetch inside one 60 s job step, and the
      // ~20 MB central-directory read gets a longer timeout than a page.
      return californiaAdapter({
        http: deps.ranges ?? createPoliteRangeGetter({
            minIntervalMs: 1_000,
            timeoutMs: 45_000,
            maxBodyBytes: DEFAULT_RANGE_MAX_BYTES,
          }),
        now: deps.now,
      })
    case 'TX':
      return texasAdapter({ http: deps.http ?? createPoliteGetter({ maxBodyBytes: DEFAULT_PAGE_MAX_BYTES }) })
    case 'GA':
      // No network: the embedded snapshot. `now` drives its expiry check.
      return georgiaAdapter({ now: deps.now })
    default:
      return null
  }
}
