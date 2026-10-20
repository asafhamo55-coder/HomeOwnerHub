import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { GUIDE_SHOTS, guideClipHeight } from '../guide-shots'
import { SHOTS } from '../ui-shots-list'
import { REPO_ROOT as ROOT } from './paths'

/**
 * The shot lists can't be exercised locally (the capture needs CI's
 * throwaway Supabase), so these checks are what stands between a typo and
 * a silently skipped or failed CI shot.
 */

const SEED_DIR = path.join(ROOT, 'scripts', 'ui-shots-seed')
const seedSources = [
  readFileSync(path.join(ROOT, 'scripts', 'ui-shots.ts'), 'utf8'),
  readFileSync(path.join(ROOT, 'scripts', 'ui-shots-seed.ts'), 'utf8'),
  ...readdirSync(SEED_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(path.join(SEED_DIR, f), 'utf8')),
].join('\n')

const pathVars = (p: string) => [...p.matchAll(/:([A-Za-z]\w*)/g)].map((m) => m[1]!)

describe('ui-shots list', () => {
  it('has unique shot names (they are the file names)', () => {
    const names = SHOTS.map((s) => s.name)
    expect(names.length).toBe(new Set(names).size)
    const guide = GUIDE_SHOTS.map((s) => s.name)
    expect(guide.length).toBe(new Set(guide).size)
  })

  it('fills every :var and org from a var some seeder actually exports', () => {
    const missing: string[] = []
    for (const s of [...SHOTS, ...GUIDE_SHOTS]) {
      for (const v of [...pathVars(s.path), ...(s.org ? [s.org] : [])]) {
        // Returned as `{ name }`, `name:` or assigned as `vars.name =`.
        const exported = new RegExp(`(vars\\.${v}\\s*=|\\b${v}\\s*[:,}]|\\{\\s*${v}\\s*\\})`).test(seedSources)
        if (!exported) missing.push(`${s.name}: ${v}`)
      }
    }
    expect(missing).toEqual([])
  })

  it('captures the release-note screens', () => {
    const byName = new Map(SHOTS.map((s) => [s.name, s]))
    expect(byName.get('inbox-thread')?.path).toBe('/inbox/:inboxThreadId')
    expect(byName.get('inbox-thread-create-menu')?.click).toContain('Create from email')
    expect(byName.get('communications-new')?.path).toBe('/communications/new')
    expect(byName.get('communications-results')?.path).toBe('/communications/:commsResultsId')
    expect(byName.get('communications-phone-preview')?.clickWaitFor).toContain('Phone preview')
    expect(byName.get('settings-billing-past-due')?.org).toBe('pastDueHoaOrgId')
    expect(byName.get('resident-ask')?.path).toBe('/resident/ask')
    expect(byName.get('properties-collections-letter')?.path).toBe('/properties/:propertyId/collections-letter')
    expect(byName.get('properties-estoppel')?.path).toBe('/properties/:propertyId/estoppel')
    expect(byName.get('accounting-budget-notice')?.path).toBe('/accounting/budget/:budgetNoticeId/notice')
  })
})

describe('guideClipHeight', () => {
  it('trims a container that stretches past its content', () => {
    // #main from y=64, 1800 tall (viewport min-height), content ends at y=600.
    expect(guideClipHeight({ y: 64, height: 1800 }, 600)).toBe(536)
  })

  it('never grows the box', () => {
    expect(guideClipHeight({ y: 0, height: 300 }, 900)).toBe(300)
  })

  it('keeps the box when there is no usable content edge', () => {
    expect(guideClipHeight({ y: 100, height: 400 }, null)).toBe(400)
    expect(guideClipHeight({ y: 100, height: 400 }, 80)).toBe(400)
    expect(guideClipHeight({ y: 100, height: 400 }, Number.NaN)).toBe(400)
  })

  it('rounds the content edge up so the last row is not cut', () => {
    expect(guideClipHeight({ y: 10, height: 1000 }, 210.2)).toBe(201)
  })
})
