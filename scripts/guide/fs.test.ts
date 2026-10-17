import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { routeSourceHash, routeTemplatesFrom } from './fs'

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'guide-fs-'))
  for (const [p, content] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true })
    writeFileSync(join(root, p), content)
  }
  return root
}

describe('routeTemplatesFrom', () => {
  it('lists page.tsx routes with route groups stripped, skipping private and parallel folders', () => {
    const app = tree({
      '(dashboard)/page.tsx': '',
      '(dashboard)/dues/page.tsx': '',
      '(dashboard)/dues/_components/X.tsx': '',
      '(dashboard)/violations/[id]/page.tsx': '',
      '(dashboard)/_private/page.tsx': '',
      '@modal/page.tsx': '',
      'resident/help/[slug]/page.tsx': '',
      'api/health/route.ts': '',
    })
    expect(routeTemplatesFrom(app)).toEqual(['/', '/dues', '/resident/help/[slug]', '/violations/[id]'])
  })
})

describe('routeSourceHash', () => {
  it('hashes the route page dir and its private components, not child routes', () => {
    const files = {
      '(dashboard)/dues/page.tsx': 'a',
      '(dashboard)/dues/_components/X.tsx': 'b',
      '(dashboard)/dues/new/page.tsx': 'c',
    }
    const app1 = tree(files)
    const app2 = tree({ ...files, '(dashboard)/dues/new/page.tsx': 'changed child route' })
    const app3 = tree({ ...files, '(dashboard)/dues/_components/X.tsx': 'changed component' })
    const h1 = routeSourceHash(app1, '/dues')
    expect(h1).toMatch(/^[0-9a-f]{40}$/)
    expect(routeSourceHash(app2, '/dues')).toBe(h1)
    expect(routeSourceHash(app3, '/dues')).not.toBe(h1)
  })

  it('returns null for a route with no page', () => {
    expect(routeSourceHash(tree({ 'x/page.tsx': '' }), '/nope')).toBeNull()
  })
})
