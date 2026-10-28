import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React, { createElement } from 'react'

// The component files use the classic JSX runtime under vitest.
;(globalThis as { React?: unknown }).React = React

const load = vi.fn()
vi.mock('@/lib/resident-ledger', () => ({ loadUnappliedCredits: (...a: unknown[]) => load(...a) }))

import { loadCreditByUnit } from './unit-credit'
import { CreditBadge } from '@/app/(dashboard)/dues/CreditBadge'

const db = {} as never
beforeEach(() => {
  load.mockReset()
})

describe('loadCreditByUnit', () => {
  it('sums credit per unit with a single query for many units', async () => {
    load.mockResolvedValue({
      ok: true,
      credits: [
        { unit_id: 'a', remaining: 50 },
        { unit_id: 'a', remaining: 25 },
        { unit_id: 'b', remaining: 10 },
      ],
    })
    const m = await loadCreditByUnit(db, ['a', 'b', 'a', 'c', null, undefined])
    expect(load).toHaveBeenCalledTimes(1)
    expect(load.mock.calls[0][1]).toEqual(['a', 'b', 'c'])
    expect(m.get('a')).toBe(75)
    expect(m.get('b')).toBe(10)
    expect(m.has('c')).toBe(false)
  })
  it('ignores zero credit', async () => {
    load.mockResolvedValue({ ok: true, credits: [{ unit_id: 'a', remaining: 0 }] })
    expect((await loadCreditByUnit(db, ['a'])).size).toBe(0)
  })
  it('returns an empty map on a failed read or throw', async () => {
    load.mockResolvedValue({ ok: false })
    expect((await loadCreditByUnit(db, ['a'])).size).toBe(0)
    load.mockImplementation(async () => {
      throw new Error('x')
    })
    expect((await loadCreditByUnit(db, ['a'])).size).toBe(0)
  })
  it('makes no query without units', async () => {
    await loadCreditByUnit(db, [])
    expect(load).not.toHaveBeenCalled()
  })
})

describe('CreditBadge', () => {
  it('shows text and links to the home page', () => {
    const html = renderToStaticMarkup(createElement(CreditBadge, { unitId: 'u1', amount: 120 }))
    expect(html).toContain('Credit $120')
    expect(html).toContain('href="/properties/u1"')
  })
  it('renders nothing at zero', () => {
    expect(renderToStaticMarkup(createElement(CreditBadge, { unitId: 'u1', amount: 0 }))).toBe('')
  })
})
