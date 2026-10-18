import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'

// BL-072: the sign-up setup page's properties step sent a normal admin to
// the platform-admin-only CSV import (/admin/import-units), which redirected
// them away. Both checklists now send them to /properties/new and, for a
// spreadsheet, to the board's own import at /properties/import (P4), in
// the same words.

vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: async () => 'America/New_York' }))

const { getSetupProgress } = await import('./queries')
const { buildSetupChecklist } = await import('@/lib/dashboard/setup-checklist')
const { SUPPORT_EMAIL } = await import('@/lib/support')

describe('setup checklists: the properties step (BL-072)', () => {
  it('the setup page step adds properties in the app, never the platform-admin import', async () => {
    const m = memorySupabase({ org_members: [{ org_id: 'org-1', user_id: 'u1' }] })
    const steps = await getSetupProgress(m.client as unknown as SupabaseClient as never, 'org-1')
    const step = steps.find((s) => s.key === 'properties')!
    expect(step).toMatchObject({ href: '/properties/new', cta: 'Add properties', done: false })
    expect(step.href).not.toContain('/admin')
    expect(step.title).not.toMatch(/import/i)
    expect(step.cta).not.toMatch(/csv|upload/i)
    // A spreadsheet goes to the board's own import, not to support (P4).
    expect(step.secondary).toEqual({ href: '/properties/import', label: 'Import a spreadsheet' })
    expect(step.description).not.toContain(SUPPORT_EMAIL)
    expect(step.description).not.toMatch(/contact support/i)
  })

  it('the dashboard checklist says the same', async () => {
    const m = memorySupabase({ org_members: [{ org_id: 'org-1', user_id: 'u1' }] })
    const setupPage = (await getSetupProgress(m.client as never, 'org-1')).find((s) => s.key === 'properties')!
    const dashboard = buildSetupChecklist({
      mailbox: [0],
      properties: [0, 0],
      residents: [0, 0],
      governingDocs: [0],
      dues: [0],
      board: [1],
    }).steps.find((s) => s.key === 'properties')!
    expect({
      title: dashboard.title,
      description: dashboard.description,
      href: dashboard.href,
      cta: dashboard.cta,
      secondary: dashboard.secondary,
    }).toEqual({
      title: setupPage.title,
      description: setupPage.description,
      href: setupPage.href,
      cta: setupPage.cta,
      secondary: setupPage.secondary,
    })
  })

  it('the support address is a plain address, shown as text', () => {
    expect(SUPPORT_EMAIL).toMatch(/^[a-z]+@[a-z0-9.-]+\.[a-z]+$/)
  })
})
