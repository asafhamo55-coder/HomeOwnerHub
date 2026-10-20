import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: async () => 'America/New_York' }))

import { buildSetupChecklist, type SetupFacts } from '@/lib/dashboard/setup-checklist'
import { SUPPORT_EMAIL } from '@/lib/support'
import * as inboxQueries from './queries'

// BL-072: the sign-up setup page's properties step sent a normal admin to
// the platform-admin-only CSV import (/admin/import-units). BL-127: the
// sign-up page and the dashboard now render ONE checklist model, so they
// cannot drift apart again.

const NOTHING: SetupFacts = {
  association: [0],
  books: [0],
  properties: [0, 0],
  residents: [0, 0],
  board: [1],
  dues: [0],
  payments: [0],
  governingDocs: [0],
  bank: [0],
  mailbox: [0],
}

const here = path.dirname(fileURLToPath(import.meta.url))
const onboardingPage = readFileSync(path.resolve(here, '../../app/onboarding/setup/page.tsx'), 'utf8')

describe('setup checklists: one model (BL-127)', () => {
  it('the sign-up page renders the shared checklist, not its own list', () => {
    expect(onboardingPage).toContain('loadSetupChecklist(')
    expect(onboardingPage).not.toContain('getSetupProgress')
    expect('getSetupProgress' in inboxQueries).toBe(false)
  })
})

describe('setup checklists: the properties step (BL-072)', () => {
  it('adds properties in the app, never the platform-admin import, and a spreadsheet goes to the board’s own import', () => {
    const step = buildSetupChecklist(NOTHING).steps.find((s) => s.key === 'properties')!
    expect(step).toMatchObject({ href: '/properties/new', cta: 'Add properties', state: 'todo' })
    expect(step.href).not.toContain('/admin')
    expect(step.title).not.toMatch(/import/i)
    expect(step.cta).not.toMatch(/csv|upload/i)
    expect(step.secondary).toEqual({ href: '/properties/import', label: 'Import a spreadsheet' })
    expect(step.description).not.toContain(SUPPORT_EMAIL)
    expect(step.description).not.toMatch(/contact support/i)
  })

  it('the support address is a plain address, shown as text', () => {
    expect(SUPPORT_EMAIL).toMatch(/^[a-z]+@[a-z0-9.-]+\.[a-z]+$/)
  })
})
