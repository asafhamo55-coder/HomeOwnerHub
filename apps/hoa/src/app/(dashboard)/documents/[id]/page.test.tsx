import { describe, expect, it, vi } from 'vitest'

// BL-175a L9: the by-id document load is filtered to the current org
// (hoa_documents' org column is `org_id`).

const eqCalls: Array<[string, unknown]> = []
let org: { id: string } | null = { id: 'org-1' }

class NotFound extends Error {}
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFound('notFound')
  },
  unstable_rethrow: (e: unknown) => {
    if (e instanceof NotFound) throw e
  },
}))
vi.mock('next/link', () => ({ default: () => null }))
vi.mock('@homeowner-portal/ui', () => ({
  Button: () => null,
  Card: () => null,
  CardContent: () => null,
  CardDescription: () => null,
  CardHeader: () => null,
  CardTitle: () => null,
  LoadFailed: () => null,
  Page: () => null,
  StatusBadge: () => null,
}))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => org) }))
vi.mock('@/lib/documents', () => ({ listDocumentVersions: vi.fn(), signedDownloadUrl: vi.fn() }))
vi.mock('./ParsedTextEditor', () => ({ ParsedTextEditor: () => null }))
vi.mock('./DocumentActions', () => ({ DocumentActions: () => null }))
vi.mock('@/components/documents/OwnerVisibilitySwitch', () => ({ OwnerVisibilitySwitch: () => null }))
vi.mock('@/lib/inbox/provenance', () => ({ documentEmailSource: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => {
          eqCalls.push([c, v])
          return chain
        },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (r: (v: unknown) => unknown) => r({ data: null, error: null }),
      }
      return chain
    },
  })),
}))

import * as React from 'react'
import DocumentDetailPage from './page'
;(globalThis as { React?: unknown }).React = React

describe('DocumentDetailPage by-id load', () => {
  it('filters hoa_documents by org_id', async () => {
    eqCalls.length = 0
    await expect(
      DocumentDetailPage({ params: Promise.resolve({ id: 'doc-1' }) }),
    ).rejects.toBeInstanceOf(NotFound)
    expect(eqCalls).toContainEqual(['id', 'doc-1'])
    expect(eqCalls).toContainEqual(['org_id', 'org-1'])
  })

  it('is not found when there is no org', async () => {
    eqCalls.length = 0
    org = null
    await expect(
      DocumentDetailPage({ params: Promise.resolve({ id: 'doc-1' }) }),
    ).rejects.toBeInstanceOf(NotFound)
    expect(eqCalls).toEqual([])
    org = { id: 'org-1' }
  })
})
