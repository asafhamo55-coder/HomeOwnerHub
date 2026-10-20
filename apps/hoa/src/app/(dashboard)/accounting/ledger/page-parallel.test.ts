import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

;(globalThis as { React?: typeof React }).React = React

// BL-099 static pass: with no explicit `?period=<id>` the ledger already
// knows which period to page, so the entries read goes out alongside the
// period list. An explicit period still waits: it must be checked against
// the list first, and an unknown id falls back to the current period.

const h = vi.hoisted(() => {
  const state = {
    started: [] as string[],
    entriesPeriod: [] as Array<string | undefined>,
    held: new Set<string>(),
    release: () => {},
    gate: Promise.resolve(),
  }
  const reset = () => {
    state.started = []
    state.entriesPeriod = []
    state.held = new Set()
    state.gate = new Promise<void>((r) => {
      state.release = r
    })
  }
  reset()
  return { state, reset }
})

const PERIODS = [
  { id: 'fy26', start_date: '2026-01-01', end_date: '2026-12-31', status: 'open' },
  { id: 'fy25', start_date: '2025-01-01', end_date: '2025-12-31', status: 'closed' },
]

vi.mock('@/lib/accounting/queries', () => ({
  getAccountingContext: vi.fn(async () => {
    h.state.started.push('context')
    return {
      organizationId: 'org-1',
      associationId: 'assoc-1',
      associationName: 'Maple HOA',
      currentPeriod: PERIODS[0],
      timeZone: 'America/New_York',
    }
  }),
  listFiscalPeriods: vi.fn(async () => {
    h.state.started.push('periods')
    if (h.state.held.has('periods')) await h.state.gate
    return PERIODS
  }),
  pageJournalEntries: vi.fn(async (_assoc: string, filters: { periodId?: string }) => {
    h.state.started.push('entries')
    h.state.entriesPeriod.push(filters.periodId)
    return { rows: [], total: 0 }
  }),
}))

const { default: GeneralLedgerPage } = await import('./page')

async function settle() {
  for (let i = 0; i < 500; i++) await Promise.resolve()
}

beforeEach(() => h.reset())

describe('/accounting/ledger loads in parallel (BL-099)', () => {
  it('pages the current period while the period list is in flight', async () => {
    h.state.held.add('periods')
    const page = GeneralLedgerPage({ searchParams: Promise.resolve({}) })
    await settle()
    expect([...h.state.started].sort()).toEqual(['context', 'entries', 'periods'])
    expect(h.state.entriesPeriod).toEqual(['fy26'])
    h.state.release()
    expect(await page).toBeTruthy()
  })

  it('period=all pages every period, also without waiting', async () => {
    h.state.held.add('periods')
    const page = GeneralLedgerPage({ searchParams: Promise.resolve({ period: 'all' }) })
    await settle()
    expect(h.state.entriesPeriod).toEqual([undefined])
    h.state.release()
    await page
  })

  it('an explicit period is checked against the list first; an unknown one falls back to the current period', async () => {
    h.state.held.add('periods')
    const page = GeneralLedgerPage({ searchParams: Promise.resolve({ period: 'not-a-period' }) })
    await settle()
    expect(h.state.started).not.toContain('entries')
    h.state.release()
    await page
    expect(h.state.entriesPeriod).toEqual(['fy26'])
  })

  it('a known explicit period is paged as asked', async () => {
    await GeneralLedgerPage({ searchParams: Promise.resolve({ period: 'fy25' }) })
    expect(h.state.entriesPeriod).toEqual(['fy25'])
  })
})
