import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LedgerAssessment, LedgerPayment } from '@/lib/resident-ledger'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'
import type { EstoppelContext } from './load'
import { buildCertificate, printSnapshot, type EstoppelInput } from './model'

const { state } = vi.hoisted(() => ({
  state: {
    db: null as null | ReturnType<typeof import('@/lib/test-utils/memory-supabase').memorySupabase>,
    loaded: null as unknown,
  },
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => ({ role: 'board', org: { id: 'org-1' } })),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => state.db!.client) }))
vi.mock('./load', () => ({ loadEstoppelInput: vi.fn(async () => state.loaded) }))

import { recordEstoppelPrinted } from './actions'

const UNIT = '11111111-1111-4111-8111-111111111111'
const PROPERTY = '22222222-2222-4222-8222-222222222222'
const TODAY = '2026-10-19'

const charge = (id: string, due: string, amount: number): LedgerAssessment => ({
  id,
  unit_id: UNIT,
  amount,
  due_date: due,
  status: 'open',
  assessment_type: 'regular',
  memo_code: null,
})
const pay = (id: string, assessmentId: string | null, amount: number): LedgerPayment => ({
  id,
  unit_id: UNIT,
  assessment_id: assessmentId,
  amount,
  paid_at: '2026-10-19T15:00:00Z',
  payment_method: 'check',
})

function input(over: Partial<EstoppelInput> = {}): EstoppelInput {
  return {
    state: 'FL',
    associationName: 'Fixture HOA',
    propertyId: PROPERTY,
    address: '14 Oak Lane',
    unitNumber: null,
    unitId: UNIT,
    lotNumber: null,
    owners: ['Owner A'],
    charges: [charge('a-sep', '2026-09-01', 300), charge('a-oct', '2026-10-01', 300), charge('a-nov', '2026-11-01', 300)],
    payments: [],
    violations: [],
    plans: [],
    planInstallmentIds: [],
    collectionCase: null,
    timeZone: 'America/New_York',
    ...over,
  }
}

const ctx = (i: EstoppelInput, today = TODAY): EstoppelContext => ({ input: i, today, timeZone: 'America/New_York' })
const request = { requestDate: '2026-10-15', delivery: 'electronic' as const, expedited: false }

/** What the browser holds: the certificate built from the page-load input. */
function pageSnapshot(i: EstoppelInput, today = TODAY) {
  return printSnapshot(buildCertificate(i, { ...request, issueDate: today }))
}

beforeEach(() => {
  state.db = memorySupabase()
})

describe('recordEstoppelPrinted refuses a stale page', () => {
  it('prints and records when the page figures still match the books', async () => {
    state.loaded = ctx(input())
    const res = await recordEstoppelPrinted({ propertyId: PROPERTY, ...request, feeCents: 25_000, figures: pageSnapshot(input()) })
    expect(res).toEqual({ ok: true })
    expect(state.db!.rows('audit_log')).toHaveLength(1)
  })

  it('refuses when a payment landed after the page loaded', async () => {
    const page = pageSnapshot(input())
    state.loaded = ctx(input({ payments: [pay('p', 'a-oct', 300)] }))
    const res = await recordEstoppelPrinted({ propertyId: PROPERTY, ...request, feeCents: 25_000, figures: page })
    expect(res).toEqual({ ok: false, error: 'Figures changed since this page loaded — reload' })
    expect(state.db!.rows('audit_log')).toHaveLength(0)
  })

  it('refuses when a new charge was billed after the page loaded', async () => {
    const page = pageSnapshot(input())
    state.loaded = ctx(input({ charges: [...input().charges, charge('a-dec', '2026-12-01', 300)] }))
    const res = await recordEstoppelPrinted({ propertyId: PROPERTY, ...request, feeCents: 25_000, figures: page })
    expect(res).toEqual({ ok: false, error: 'Figures changed since this page loaded — reload' })
    expect(state.db!.rows('audit_log')).toHaveLength(0)
  })

  it('refuses when the day rolled over since the page loaded', async () => {
    const page = pageSnapshot(input(), TODAY)
    state.loaded = ctx(input(), '2026-10-20')
    const res = await recordEstoppelPrinted({ propertyId: PROPERTY, ...request, feeCents: 25_000, figures: page })
    expect(res).toEqual({ ok: false, error: 'Figures changed since this page loaded — reload' })
    expect(state.db!.rows('audit_log')).toHaveLength(0)
  })

  it('refuses a request without the page figures', async () => {
    state.loaded = ctx(input())
    const res = await recordEstoppelPrinted({ propertyId: PROPERTY, ...request, feeCents: 25_000 } as never)
    expect(res.ok).toBe(false)
    expect(state.db!.rows('audit_log')).toHaveLength(0)
  })
})

describe('recordEstoppelPrinted re-checks the Texas and Georgia rules', () => {
  it('TX: refuses a fee above $375 (§ 207.003(c)) and prints at the cap', async () => {
    const tx = input({ state: 'TX' })
    state.loaded = ctx(tx)
    const over = await recordEstoppelPrinted({ propertyId: PROPERTY, ...request, feeCents: 37_501, figures: pageSnapshot(tx) })
    expect(over).toMatchObject({ ok: false, error: expect.stringMatching(/\$375\.00/) })
    expect(state.db!.rows('audit_log')).toHaveLength(0)
    const at = await recordEstoppelPrinted({ propertyId: PROPERTY, ...request, feeCents: 37_500, figures: pageSnapshot(tx) })
    expect(at).toEqual({ ok: true })
    expect(state.db!.rows('audit_log')).toHaveLength(1)
  })

  it('GA: refuses without a Yes to the POA Act, and a fee the declaration does not provide for', async () => {
    const ga = input({ state: 'GA' })
    state.loaded = ctx(ga)
    const figures = pageSnapshot(ga)
    const noAnswer = await recordEstoppelPrinted({ propertyId: PROPERTY, ...request, feeCents: 0, figures })
    expect(noAnswer).toMatchObject({ ok: false, error: expect.stringMatching(/^Answer whether/) })
    const notAct = await recordEstoppelPrinted({ propertyId: PROPERTY, ...request, feeCents: 0, figures, statute: { poaAct: false, feeAuthorized: false } })
    expect(notAct).toMatchObject({ ok: false, error: expect.stringMatching(/applies only to associations submitted/) })
    const unauthorizedFee = await recordEstoppelPrinted({ propertyId: PROPERTY, ...request, feeCents: 1_000, figures, statute: { poaAct: true, feeAuthorized: false } })
    expect(unauthorizedFee).toMatchObject({ ok: false, error: expect.stringMatching(/declaration provides/) })
    const overCap = await recordEstoppelPrinted({ propertyId: PROPERTY, ...request, feeCents: 1_001, figures, statute: { poaAct: true, feeAuthorized: true } })
    expect(overCap).toMatchObject({ ok: false, error: expect.stringMatching(/\$10\.00/) })
    expect(state.db!.rows('audit_log')).toHaveLength(0)
    const ok = await recordEstoppelPrinted({ propertyId: PROPERTY, ...request, feeCents: 1_000, figures, statute: { poaAct: true, feeAuthorized: true } })
    expect(ok).toEqual({ ok: true })
    expect(state.db!.rows('audit_log')).toHaveLength(1)
  })
})
