import { describe, expect, it, vi } from 'vitest'

// BL-175a L9: the by-id violation load is filtered to the current org
// (hoa_violations' org column is `org_id`).

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
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => org) }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: () => {
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => {
          eqCalls.push([c, v])
          return chain
        },
        is: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (r: (v: unknown) => unknown) => r({ data: null, error: null }),
      }
      return chain
    },
  })),
}))

import * as React from 'react'
import ViolationPage from './page'
;(globalThis as { React?: unknown }).React = React

describe('violation detail page by-id load', () => {
  it('filters hoa_violations by org_id', async () => {
    eqCalls.length = 0
    await expect(ViolationPage({ params: Promise.resolve({ id: 'v-1' }) })).rejects.toBeInstanceOf(NotFound)
    expect(eqCalls).toContainEqual(['id', 'v-1'])
    expect(eqCalls).toContainEqual(['org_id', 'org-1'])
  })

  it('is not found when there is no org, without querying', async () => {
    eqCalls.length = 0
    org = null
    await expect(ViolationPage({ params: Promise.resolve({ id: 'v-1' }) })).rejects.toBeInstanceOf(NotFound)
    expect(eqCalls).toEqual([])
    org = { id: 'org-1' }
  })
})
