import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

const h = vi.hoisted(() => ({ admin: false }))

vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => h.admin) }))
vi.mock('@/lib/state-law', () => ({
  getAssociationState: vi.fn(async () => 'GA'),
  listAllUpdatesForManager: vi.fn(async () => [
    {
      id: 'upd-9',
      state: 'GA',
      headline: 'Fine cap raised',
      summary: 'A summary that is long enough to read.',
      action_items: null,
      category: null,
      effective_date: null,
      source_url: null,
      related_statute_id: null,
      posted_at: '2026-10-01T00:00:00Z',
      archived_at: null,
    },
  ]),
  archiveLawUpdate: vi.fn(),
  unarchiveLawUpdate: vi.fn(),
  deleteLawUpdate: vi.fn(),
}))
vi.mock('@/components/knowledge/LegalTabs', () => ({ LegalTabs: () => null }))
vi.mock('./ArchiveButton', () => ({ ArchiveButton: () => null }))
vi.mock('./DeleteUpdateButton', () => ({ DeleteUpdateButton: () => null }))

const { default: UpdatesAdminPage } = await import('./page')
const render = async () => renderToStaticMarkup((await UpdatesAdminPage()) as React.ReactElement)

beforeEach(() => {
  h.admin = false
})

describe('/legal/updates Edit action', () => {
  it('is shown to platform admins and links to the edit page', async () => {
    h.admin = true
    const html = await render()
    expect(html).toContain('href="/legal/updates/upd-9/edit"')
  })

  it('is hidden from everyone else', async () => {
    const html = await render()
    expect(html).not.toContain('/edit')
    expect(html).not.toContain('Post update')
  })
})
