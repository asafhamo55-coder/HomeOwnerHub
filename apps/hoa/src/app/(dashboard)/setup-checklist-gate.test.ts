import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { guidanceFor } from '@/lib/guide/guidance-cards'

// The checklist read now includes the owner roster (service role), so the
// dashboard must not load it for anyone but an admin.

describe('dashboard setup checklist gate', () => {
  it('only an admin gets the setup checklist; board, resident and signed-out do not', () => {
    expect(guidanceFor('admin', false).setupChecklist).toBe(true)
    for (const role of ['board', 'resident', 'vendor', null]) {
      expect(guidanceFor(role, false).setupChecklist, String(role)).toBe(false)
    }
  })

  it('the page only loads the checklist behind that gate', () => {
    const src = readFileSync(path.join(__dirname, 'page.tsx'), 'utf8')
    // The section that loads it is rendered only when guidance.setupChecklist is true.
    expect(src).toMatch(/guidance\.setupChecklist \? \(\s*<Suspense[\s\S]{0,160}?<SetupChecklistSection/)
    // "Do this next" loads it only for an admin.
    expect(src).toContain('isAdmin ? setupChecklistFor(orgId) : Promise.resolve(null)')
    // No other caller.
    const calls = src.match(/setupChecklistFor\(/g) ?? []
    expect(calls.length).toBe(2) // SetupChecklistSection and the admin-only DoNextSection
    expect(src.match(/loadSetupChecklist\(/g)?.length).toBe(1)
  })
})
