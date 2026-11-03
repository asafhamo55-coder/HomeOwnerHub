import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The page is JSX compiled with the classic runtime under vitest.
;(globalThis as unknown as { React: unknown }).React = React

const h = vi.hoisted(() => ({
  actor: { id: 'user-1' as string | null, impersonating: false, client: null as unknown },
  reads: 0,
}))

vi.mock('@homeowner-portal/db/m8', () => ({ M8_APPLIED: true }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found')
  },
}))
vi.mock('@homeowner-portal/ui', () => ({ LoadFailed: () => null, Alert: () => null }))
vi.mock('@/lib/impersonation', () => ({ getResidentActor: vi.fn(async () => h.actor) }))
vi.mock('@/components/resident/SavedMethodsList', () => ({ SavedMethodsList: () => null }))
vi.mock('@/components/resident/screen', () => ({ Panel: () => null, ScreenHeader: () => null }))

import ResidentPaymentMethodsPage from './page'

beforeEach(() => {
  h.reads = 0
  h.actor = {
    id: 'user-1',
    impersonating: false,
    client: {
      from() {
        h.reads += 1
        const q: Record<string, unknown> = {
          select: () => q,
          eq: () => q,
          order: () => Promise.resolve({ data: [], error: null }),
        }
        return q
      },
    },
  }
})

describe('saved payment methods page', () => {
  it('reads the signed-in owner methods through their own client', async () => {
    await ResidentPaymentMethodsPage()
    expect(h.reads).toBe(1)
  })

  it('reads nothing while an admin is viewing as the homeowner', async () => {
    h.actor.impersonating = true
    await ResidentPaymentMethodsPage()
    expect(h.reads).toBe(0)
  })
})
