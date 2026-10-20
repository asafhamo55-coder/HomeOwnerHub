import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LedgerAssessment } from '@/lib/resident-ledger'
import { memorySupabase, type MemOptions } from '@/lib/test-utils/memory-supabase'
import { letterEventNote } from './audit'
import type { CollectionStatus } from '../statuses'
import type { LetterContext } from './load'
import { blankValues, buildLetter, letterChargeIds, letterTotals, type LetterInput } from './model'
import type { LetterPayload } from './proposal'

const { state } = vi.hoisted(() => ({
  state: {
    db: null as null | ReturnType<typeof import('@/lib/test-utils/memory-supabase').memorySupabase>,
    ctx: null as unknown,
  },
}))

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => ({ ok: true, role: 'board', orgId: ORG })),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => state.db!.client) }))
vi.mock('./load', () => ({ loadLetterContext: vi.fn(async () => state.ctx) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn() }))
vi.mock('@homeowner-portal/workflows', () => ({ proposeApproval: vi.fn() }))

import { recordLetterPrinted } from './actions'

const UNIT = '11111111-1111-4111-8111-111111111111'
const PROPERTY = '22222222-2222-4222-8222-222222222222'
const CASE = '33333333-3333-4333-8333-333333333333'
const ORG = '44444444-4444-4444-8444-444444444444'
const REQUEST = '55555555-5555-4555-8555-555555555555'
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

const input: LetterInput = {
  state: 'FL',
  associationName: 'Fixture HOA',
  propertyId: PROPERTY,
  address: '14 Oak Lane',
  unitNumber: null,
  unitId: UNIT,
  lotNumber: null,
  owners: ['Owner A'],
  charges: [charge('a-aug', '2026-08-01', 300), charge('a-sep', '2026-09-01', 300)],
  payments: [],
  plans: [],
  planInstallmentIds: [],
  timeZone: 'America/New_York',
}

const VALUES = {
  mailingAddress: '14 Oak Lane, Tampa FL',
  parcel: 'Lot 7, Block B',
  interest: '0',
  interestThrough: 'None',
  interestRate: '0',
  signer: 'Pat Board, President',
}

function payload(): LetterPayload {
  const l = buildLetter(input, 'fl_late_notice', TODAY, [])
  const t = letterTotals(l, VALUES)
  return {
    version: 1,
    kind: 'fl_late_notice',
    jurisdiction: 'FL',
    caseId: CASE,
    propertyId: PROPERTY,
    unitId: UNIT,
    draftedOn: TODAY,
    values: blankValues(l, VALUES),
    chargeIds: letterChargeIds(l),
    ledgerCents: t.ledgerCents,
    enteredCents: t.enteredCents!,
    totalCents: t.totalCents!,
  }
}

/** The context the loader returns: printedAt comes from the audit rows already written. */
function ctx(): LetterContext {
  const printed = state.db!.rows('audit_log').some((r) => r.entity_id === REQUEST)
  const status = (state.db!.rows('collection_cases')[0]?.status ?? 'collection_letter') as CollectionStatus
  return {
    input,
    today: TODAY,
    collectionCase: { id: CASE, status },
    events: [],
    requests: [
      { id: REQUEST, status: 'posted', proposedAt: '2026-10-18T12:00:00Z', decisionReason: null, error: null, payload: payload(), printedAt: printed ? '2026-10-19T12:00:00Z' : null },
    ],
  }
}

function db(opts: MemOptions = {}) {
  state.db = memorySupabase({ collection_cases: [{ id: CASE, organization_id: ORG, status: 'collection_letter' }] }, opts)
}

async function print() {
  state.ctx = ctx()
  return recordLetterPrinted({ propertyId: PROPERTY, approvalRequestId: REQUEST, verified: true })
}

beforeEach(() => db())

describe('recordLetterPrinted is idempotent per approval request', () => {
  it('first print: one event tied to the request, the case moves on, one audit row', async () => {
    const res = await print()
    expect(res.ok).toBe(true)
    const events = state.db!.rows('collection_events')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ event_type: 'lien_warning_sent', note: letterEventNote(REQUEST) })
    expect(state.db!.rows('collection_cases')[0]!.status).toBe('lien_warning')
    expect(state.db!.rows('audit_log')).toHaveLength(1)
    expect(state.db!.rows('audit_log')[0]!.metadata).toMatchObject({ collection_event_id: events[0]!.id, reprint: false })
  })

  it('a retry after the audit insert failed records no second event', async () => {
    db({ failOn: (c, nth) => (c.table === 'audit_log' && c.op === 'insert' && nth === 0 ? { code: '57014', message: 'timeout' } : null) })
    const first = await print()
    expect(first.ok).toBe(false)
    expect(state.db!.rows('collection_events')).toHaveLength(1)
    expect(state.db!.rows('audit_log')).toHaveLength(0)

    const retry = await print()
    expect(retry.ok).toBe(true)
    const events = state.db!.rows('collection_events')
    expect(events).toHaveLength(1)
    expect(state.db!.rows('audit_log')).toHaveLength(1)
    expect(state.db!.rows('audit_log')[0]!.metadata).toMatchObject({ collection_event_id: events[0]!.id, reprint: false })
  })

  it('a failed stage update is reported, nothing prints, and the retry finishes it', async () => {
    db({ failOn: (c, nth) => (c.table === 'collection_cases' && c.op === 'update' && nth === 0 ? { code: '57014', message: 'timeout' } : null) })
    const first = await print()
    expect(first.ok).toBe(false)
    expect(!first.ok && first.error).toContain('couldn’t move the case')
    expect(state.db!.rows('audit_log')).toHaveLength(0)
    expect(state.db!.rows('collection_cases')[0]!.status).toBe('collection_letter')

    const retry = await print()
    expect(retry.ok).toBe(true)
    expect(state.db!.rows('collection_events')).toHaveLength(1)
    expect(state.db!.rows('collection_cases')[0]!.status).toBe('lien_warning')
    expect(state.db!.rows('audit_log')).toHaveLength(1)
  })

  it('a reprint records no event and does not touch the case', async () => {
    expect((await print()).ok).toBe(true)
    const again = await print()
    expect(again).toEqual({ ok: true, message: 'Reprint recorded.' })
    expect(state.db!.rows('collection_events')).toHaveLength(1)
    expect(state.db!.rows('audit_log')).toHaveLength(2)
    expect(state.db!.rows('audit_log')[1]!.metadata).toMatchObject({ reprint: true })
  })
})
