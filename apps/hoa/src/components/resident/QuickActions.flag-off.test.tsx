import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@homeowner-portal/db/m9', () => ({ M9_APPLIED: false }))

import { QuickActions } from './QuickActions'
import { loadPollsToAnswer } from '@/lib/polls/resident-badge'
import type { PollsClient } from '@/lib/polls/store'

;(globalThis as { React?: typeof React }).React = React

describe('polls switched off (M9)', () => {
  it('shows no poll badge even when a count is passed', () => {
    const html = renderToStaticMarkup(<QuickActions newAnnouncements={0} pollsToAnswer={3} />)
    expect(html).not.toContain('to answer')
  })

  it('reads nothing and reports nothing to answer', async () => {
    const from = vi.fn()
    const r = await loadPollsToAnswer({ from, rpc: vi.fn() } as unknown as PollsClient, [{ unit_id: 'u', association_id: 'a' }], new Date())
    expect(r).toEqual({ count: 0, closingSoon: null })
    expect(from).not.toHaveBeenCalled()
  })
})
