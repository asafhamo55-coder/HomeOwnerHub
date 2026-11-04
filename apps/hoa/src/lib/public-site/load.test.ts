import { beforeEach, describe, expect, it, vi } from 'vitest'

// The public page is live (M12_APPLIED = true). The visitor has no session, so
// these pin what the service-role reads let through.

type Result = { data: unknown; error: { code?: string } | null }
const results = new Map<string, Result>()
const calls: { table: string; filters: [string, unknown][] }[] = []

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const call = { table, filters: [] as [string, unknown][] }
      calls.push(call)
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (col: string, val: unknown) => (call.filters.push([col, val]), q)
      q.order = () => q
      q.limit = () => q
      q.maybeSingle = () => Promise.resolve(results.get(table) ?? { data: null, error: null })
      q.then = (res: (v: unknown) => void) => res(results.get(table) ?? { data: [], error: null })
      return q
    },
  }),
}))

import { M12_APPLIED } from '@homeowner-portal/db/m12'
import { loadPublicDocument, loadPublicPage } from './load'

const SITE = {
  id: 's1',
  organization_id: 'org1',
  slug: 'oak-hollow',
  published: true,
  title: 'Oak Hollow',
  about: '',
  contact_email: null,
  contact_phone: null,
}
const ITEM = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  results.clear()
  calls.length = 0
})

describe('public page loader with the flag on', () => {
  it('is switched on', () => {
    expect(M12_APPLIED).toBe(true)
  })

  it('asks the database only for published sites, by exact slug', async () => {
    results.set('public_sites', { data: SITE, error: null })
    const view = await loadPublicPage('oak-hollow')
    expect(view?.title).toBe('Oak Hollow')
    const siteCall = calls.find((c) => c.table === 'public_sites')!
    expect(siteCall.filters).toContainEqual(['slug', 'oak-hollow'])
    expect(siteCall.filters).toContainEqual(['published', true])
  })

  it('answers null for an unknown or unpublished slug, and never reads items', async () => {
    expect(await loadPublicPage('nobody-here')).toBeNull()
    expect(calls.some((c) => c.table === 'public_site_items')).toBe(false)
  })

  it('rejects a malformed or reserved slug without touching the database', async () => {
    for (const slug of ['A', 'ab', '../etc', 'oak_hollow', 'admin', 'x'.repeat(60)]) {
      expect(await loadPublicPage(slug)).toBeNull()
    }
    expect(calls).toHaveLength(0)
  })

  it('does not serve a document whose id is not a uuid', async () => {
    expect(await loadPublicDocument('oak-hollow', 'not-a-uuid')).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('only serves a document item that sits on that site', async () => {
    results.set('public_sites', { data: SITE, error: null })
    results.set('public_site_items', { data: null, error: null })
    expect(await loadPublicDocument('oak-hollow', ITEM)).toBeNull()
    const itemCall = calls.find((c) => c.table === 'public_site_items')!
    expect(itemCall.filters).toContainEqual(['site_id', 's1'])
    expect(itemCall.filters).toContainEqual(['kind', 'document'])
  })

  it('refuses an AI-generated or replaced governing document, and scopes the file to the org', async () => {
    results.set('public_sites', { data: SITE, error: null })
    results.set('public_site_items', { data: { hoa_document_id: null, governing_document_id: 'g1' }, error: null })
    results.set('governing_documents', { data: { storage_path: 'o/f.pdf', ai_generated: true, superseded_at: null }, error: null })
    expect(await loadPublicDocument('oak-hollow', ITEM)).toBeNull()
    results.set('governing_documents', { data: { storage_path: 'o/f.pdf', ai_generated: false, superseded_at: '2026-01-01' }, error: null })
    expect(await loadPublicDocument('oak-hollow', ITEM)).toBeNull()
    results.set('governing_documents', { data: { storage_path: 'o/f.pdf', ai_generated: false, superseded_at: null }, error: null })
    expect(await loadPublicDocument('oak-hollow', ITEM)).toMatchObject({ path: 'o/f.pdf' })
    const gov = calls.filter((c) => c.table === 'governing_documents').at(-1)!
    expect(gov.filters).toContainEqual(['organization_id', 'org1'])
  })
})
