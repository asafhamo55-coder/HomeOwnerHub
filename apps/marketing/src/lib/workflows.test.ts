import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { SHIPPED_HOA_WORKFLOWS, WORKFLOWS } from './workflows'

const here = path.dirname(fileURLToPath(import.meta.url))
const hoaApp = path.resolve(here, '../../../hoa/src/app')

/** Does this URL path exist in apps/hoa, as a page or an API route? */
function routeExists(route: string): boolean {
  const rel = route.replace(/^\//, '')
  const candidates = route.startsWith('/api/')
    ? [path.join(hoaApp, rel, 'route.ts')]
    : [path.join(hoaApp, '(dashboard)', rel, 'page.tsx'), path.join(hoaApp, rel, 'page.tsx')]
  return candidates.some((c) => existsSync(c))
}

describe('marketing workflow list (BL-042 truth rule)', () => {
  it('every shipped HOA workflow names the apps/hoa route that proves it', () => {
    for (const w of SHIPPED_HOA_WORKFLOWS) {
      expect(w.route, `${w.name} has no route`).toBeTruthy()
      expect(routeExists(w.route!), `${w.name}: ${w.route} not found in apps/hoa`).toBe(true)
    }
  })

  it('the route check itself rejects a route that does not exist', () => {
    expect(routeExists('/reserve-live')).toBe(false)
    expect(routeExists('/api/ai/translate')).toBe(false)
    expect(routeExists('/properties/import')).toBe(true)
  })

  it('names that BL-042 found unbuilt are never marked shipped', () => {
    // 'Multilingual Comms' and 'ARC Recommender' shipped narrower than those
    // names promised, as 'Spanish announcements' (BL-025) and 'AI ARC review'
    // (BL-024/027/079). The old names stay banned (BL-090).
    for (const name of ['Reserve Live', 'Multilingual Comms', 'ARC Recommender', 'Vendor Oracle', 'Minutes Engine', 'Onboarding Agent']) {
      const w = WORKFLOWS.find((x) => x.name === name)
      if (w) expect(w.status, name).not.toBe('shipped')
    }
  })

  it('BL-090: Spanish announcements and AI ARC review are listed as shipped', () => {
    for (const name of ['Spanish announcements', 'AI ARC review']) {
      const w = SHIPPED_HOA_WORKFLOWS.find((x) => x.name === name)
      expect(w, name).toBeTruthy()
    }
  })

  it('a planned HOA workflow carries no quality bar', () => {
    for (const w of WORKFLOWS.filter((x) => x.hub === 'HOA' && x.status !== 'shipped')) {
      expect(w.bar, w.name).toBe('—')
    }
  })

  it('ids are unique', () => {
    expect(new Set(WORKFLOWS.map((w) => w.id)).size).toBe(WORKFLOWS.length)
  })
})
