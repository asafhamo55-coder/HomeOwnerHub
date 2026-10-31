import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

const h = vi.hoisted(() => ({
  docs: [] as unknown[],
  ok: true,
}))

vi.mock('@/lib/load-or-fail', () => ({
  loadOrFail: vi.fn(async () => (h.ok ? { ok: true, data: h.docs } : { ok: false })),
}))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1' })) }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({}) }) }) }),
  })),
}))
vi.mock('@/components/knowledge/DocumentTabs', () => ({ DocumentTabs: () => null, formatBytes: () => '1 KB' }))

const { default: DocumentsPage } = await import('./page')

const doc = (id: string, type: string, parsed: boolean) => ({
  id,
  name: `Doc ${id}`,
  type,
  file_size: 10,
  parsed_at: parsed ? '2026-10-01T00:00:00Z' : null,
  created_at: '2026-10-01T00:00:00Z',
})
const render = async (sp: { q?: string; type?: string; text?: string } = {}) =>
  renderToStaticMarkup((await DocumentsPage({ searchParams: Promise.resolve(sp) })) as React.ReactElement)

beforeEach(() => {
  h.ok = true
  h.docs = [doc('a', 'ccr', true), doc('b', 'ccr', false), doc('c', 'rules', false), doc('d', 'minutes', true)]
})

describe('/documents summary strip', () => {
  it('shows the four tiles linked to their filters', async () => {
    const html = await render()
    expect(html).toContain('data-testid="documents-summary"')
    for (const l of ['Total documents', 'Not searchable', 'CC&amp;Rs', 'Rules']) expect(html).toContain(l)
    expect(html).toContain('href="/documents?text=missing"')
    expect(html).toContain('href="/documents?type=ccr"')
    expect(html).toContain('href="/documents?type=rules"')
  })

  it('keeps tile counts library-wide when a search narrows the list', async () => {
    const html = await render({ q: 'Doc a' })
    expect(html).toContain('>4<')
    expect(html).not.toContain('Doc b<')
  })

  it('?text=missing lists only documents with no text', async () => {
    const html = await render({ text: 'missing' })
    expect(html).toContain('Doc b')
    expect(html).toContain('Doc c')
    expect(html).not.toContain('Doc a<')
    expect(html).not.toContain('Doc d<')
  })

  it('has no strip when the library is empty or the read failed', async () => {
    h.docs = []
    expect(await render()).not.toContain('documents-summary')
    h.ok = false
    expect(await render()).not.toContain('documents-summary')
  })
})
