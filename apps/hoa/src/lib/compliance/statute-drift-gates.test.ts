import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LedgerAssessment } from '@/lib/resident-ledger'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'
import type { LetterContext } from '@/lib/collections/letters/load'
import { blankValues, buildLetter, letterChargeIds, letterTotals, type LetterInput } from '@/lib/collections/letters/model'
import type { LetterPayload } from '@/lib/collections/letters/proposal'
import { STATUTE_OVERRIDE_ACTION } from './statute-drift'

/**
 * BL-130 at the server actions: a blocking state-law finding stops the
 * fine (violations) and the collections letter (save to Approvals, and
 * the print gate) unless the board records an allowed override reason,
 * and that reason lands in audit_log as codes and ids only.
 */

const { state } = vi.hoisted(() => ({
  state: {
    db: null as null | ReturnType<typeof import('@/lib/test-utils/memory-supabase').memorySupabase>,
    ctx: null as unknown,
    proposed: [] as Array<Record<string, unknown>>,
  },
}))

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => ({ ok: true, role: 'board', orgId: ORG })),
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => state.db!.client) }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: ORG, name: 'Fixture HOA' })) }))
vi.mock('@/lib/collections/letters/load', () => ({ loadLetterContext: vi.fn(async () => state.ctx) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn(() => state.db!.client) }))
// Fined is gated behind migration 0066 part 5; BL-130 runs with it on.
vi.mock('@homeowner-portal/db/violation-statuses', () => ({ VIOLATION_FINED_STATUS_LIVE: true }))
vi.mock('@homeowner-portal/workflows', () => ({
  proposeApproval: vi.fn(async (_db: unknown, args: Record<string, unknown>) => {
    state.proposed.push(args)
    return { id: 'req-1', status: 'proposed', created: true }
  }),
}))

import { updateViolationStatus } from '@/lib/violations'
import { recordLetterPrinted, saveLetterToApprovals } from '@/lib/collections/letters/actions'

const ORG = '44444444-4444-4444-8444-444444444444'
const VIOLATION = '66666666-6666-4666-8666-666666666666'
const UNIT = '11111111-1111-4111-8111-111111111111'
const PROPERTY = '22222222-2222-4222-8222-222222222222'
const CASE = '33333333-3333-4333-8333-333333333333'
const REQUEST = '55555555-5555-4555-8555-555555555555'
const TODAY = '2026-10-19'

/** Ids, codes, states and kinds only: no free text, names or addresses in the override row. */
function expectCodesOnly(metadata: unknown) {
  const s = JSON.stringify(metadata)
  expect(s).not.toMatch(/Oak Lane|Owner A|Pat Board/)
}

// ─── fines ───────────────────────────────────────────────────────────

// BL-140: in FL and CA a fine needs a hearing on record that meets the
// statute (or the attorney-advised override). This one meets both states.
const QUALIFYING_HEARING = {
  id: 'h-1',
  organization_id: ORG,
  violation_id: VIOLATION,
  status: 'held',
  requested_at: null,
  resident_statement: null,
  hearing_on: '2026-11-20',
  hearing_time: '18:30',
  location: null,
  panel: [
    { name: 'A', role: 'member' },
    { name: 'B', role: 'member' },
    { name: 'C', role: 'member' },
  ],
  notice_sent_on: '2026-11-01',
  outcome: 'upheld',
  decided_on: '2026-11-20',
  findings_sent_on: '2026-11-24',
  payment_due_on: '2026-12-31',
}

function violationDb(stateCode: string, fineAmount: number) {
  state.db = memorySupabase({
    associations: [{ id: 'assoc-1', organization_id: ORG, name: 'Fixture HOA', state: stateCode }],
    hoa_violations: [{ id: VIOLATION, org_id: ORG, status: 'notice_sent', fine_amount: fineAmount }],
    violation_hearings: [QUALIFYING_HEARING],
    org_members: [],
    profiles: [],
    audit_log: [],
  })
}

describe('levying a fine (updateViolationStatus → fined)', () => {
  it('CA over $100/day: refused without an override; nothing written', async () => {
    violationDb('CA', 150)
    const res = await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })
    expect(res.ok).toBe(false)
    expect(!res.ok && res.fieldErrors?.lawOverride).toContain('state law check')
    expect(state.db!.rows('hoa_violations')[0]!.status).toBe('notice_sent')
    expect(state.db!.rows('audit_log')).toHaveLength(0)
  })

  it('CA: an override the finding does not allow is refused (never silently allowed)', async () => {
    violationDb('CA', 150)
    const res = await updateViolationStatus({ violationId: VIOLATION, status: 'fined', lawOverrides: { ca_fine_over_cap: 'governing_documents_allow' } })
    expect(res.ok).toBe(false)
    expect(state.db!.rows('hoa_violations')[0]!.status).toBe('notice_sent')
  })

  it('CA with the health-or-safety finding: the override is audited, then the fine is levied', async () => {
    violationDb('CA', 150)
    const res = await updateViolationStatus({ violationId: VIOLATION, status: 'fined', lawOverrides: { ca_fine_over_cap: 'health_safety_finding' } })
    expect(res).toEqual({ ok: true })
    expect(state.db!.rows('hoa_violations')[0]!.status).toBe('fined')
    const audit = state.db!.rows('audit_log')
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({
      action: STATUTE_OVERRIDE_ACTION,
      org_id: ORG,
      entity_type: 'hoa_violation',
      entity_id: VIOLATION,
      metadata: { step: 'fine', state: 'CA', overrides: [{ code: 'ca_fine_over_cap', reason: 'health_safety_finding' }] },
    })
  })

  it('a failed override audit insert stops the fine', async () => {
    state.db = memorySupabase(
      {
        associations: [{ id: 'assoc-1', organization_id: ORG, name: 'Fixture HOA', state: 'FL' }],
        hoa_violations: [{ id: VIOLATION, org_id: ORG, status: 'notice_sent', fine_amount: 250 }],
        violation_hearings: [QUALIFYING_HEARING],
        org_members: [],
        profiles: [],
      },
      { failOn: (c) => (c.table === 'audit_log' && c.op === 'insert' ? { code: '57014', message: 'timeout' } : null) },
    )
    const res = await updateViolationStatus({ violationId: VIOLATION, status: 'fined', lawOverrides: { fl_fine_over_cap: 'governing_documents_allow' } })
    expect(res.ok).toBe(false)
    expect(state.db!.rows('hoa_violations')[0]!.status).toBe('notice_sent')
  })

  it('FL $25/day with a qualifying hearing: only warnings, so it goes ahead with no override row', async () => {
    violationDb('FL', 25)
    expect(await updateViolationStatus({ violationId: VIOLATION, status: 'fined' })).toEqual({ ok: true })
    expect(state.db!.rows('audit_log')).toHaveLength(0)
  })
})

// ─── collections letters ─────────────────────────────────────────────

const charge = (id: string, due: string, amount: number, type = 'regular'): LedgerAssessment => ({
  id,
  unit_id: UNIT,
  amount,
  due_date: due,
  status: 'open',
  assessment_type: type,
  memo_code: null,
})

const txInput: LetterInput = {
  state: 'TX',
  associationName: 'Fixture HOA',
  propertyId: PROPERTY,
  address: '14 Oak Lane',
  unitNumber: null,
  unitId: UNIT,
  lotNumber: null,
  owners: ['Owner A'],
  charges: [charge('a-aug', '2026-08-01', 300), charge('legal-1', '2026-09-15', 250, 'collection_legal')],
  payments: [],
  plans: [],
  planInstallmentIds: [],
  timeZone: 'America/Chicago',
}

const VALUES = { mailingAddress: '14 Oak Lane, Austin TX', payBy: 'November 15, 2026', signer: 'Pat Board, President' }

function letterCtx(requests: LetterContext['requests'] = []): LetterContext {
  return { input: txInput, today: TODAY, collectionCase: { id: CASE, status: 'collection_letter' }, events: [], requests }
}

describe('collections letter: save to Approvals', () => {
  beforeEach(() => {
    state.db = memorySupabase({ audit_log: [] })
    state.proposed = []
  })

  it('TX attorney fees with no § 209.0064 notice: refused, nothing proposed or audited', async () => {
    state.ctx = letterCtx()
    const res = await saveLetterToApprovals({ propertyId: PROPERTY, kind: 'past_due', values: VALUES, verified: true })
    expect(res.ok).toBe(false)
    expect(state.proposed).toHaveLength(0)
    expect(state.db!.rows('audit_log')).toHaveLength(0)
  })

  it('with an allowed override: audited first (codes only), then proposed carrying the override', async () => {
    state.ctx = letterCtx()
    const res = await saveLetterToApprovals({
      propertyId: PROPERTY,
      kind: 'past_due',
      values: VALUES,
      verified: true,
      lawOverrides: { tx_collection_fees_without_notice: 'not_collection_agent_fees' },
    })
    expect(res.ok).toBe(true)
    const [proposed] = state.proposed
    const payload = proposed!.payload as LetterPayload
    expect(payload.lawFindings).toEqual(['tx_collection_fees_without_notice'])
    expect(payload.lawOverrides).toEqual([{ code: 'tx_collection_fees_without_notice', reason: 'not_collection_agent_fees' }])
    const audit = state.db!.rows('audit_log')
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: STATUTE_OVERRIDE_ACTION, entity_type: 'collections_letter', entity_id: proposed!.subjectId })
    expect(audit[0]!.metadata).toMatchObject({ step: 'collections_letter', state: 'TX', collection_case_id: CASE, kind: 'past_due' })
    expectCodesOnly(audit[0]!.metadata)
  })

  it('a delinquency notice printed 45+ days earlier clears it with no override', async () => {
    state.ctx = letterCtx([
      {
        id: REQUEST,
        status: 'posted',
        proposedAt: '2026-08-01T12:00:00Z',
        decisionReason: null,
        error: null,
        payload: { ...approvedPayload(), kind: 'tx_delinquency' },
        printedAt: '2026-09-01T15:00:00Z',
      },
    ])
    const res = await saveLetterToApprovals({ propertyId: PROPERTY, kind: 'past_due', values: VALUES, verified: true })
    expect(res.ok).toBe(true)
    expect(state.db!.rows('audit_log')).toHaveLength(0)
  })
})

function approvedPayload(overrides?: LetterPayload['lawOverrides']): LetterPayload {
  const l = buildLetter(txInput, 'past_due', TODAY, [])
  const t = letterTotals(l, VALUES)
  return {
    version: 1,
    kind: 'past_due',
    jurisdiction: 'TX',
    caseId: CASE,
    propertyId: PROPERTY,
    unitId: UNIT,
    draftedOn: TODAY,
    values: blankValues(l, VALUES),
    chargeIds: letterChargeIds(l),
    ledgerCents: t.ledgerCents,
    enteredCents: t.enteredCents!,
    totalCents: t.totalCents!,
    ...(overrides ? { lawFindings: overrides.map((o) => o.code), lawOverrides: overrides } : {}),
  }
}

describe('collections letter: the print gate', () => {
  beforeEach(() => {
    state.db = memorySupabase({ collection_cases: [{ id: CASE, organization_id: ORG, status: 'collection_letter' }], audit_log: [] })
  })

  it('a blocking finding the board never overrode stops the print (a letter approved before BL-130)', async () => {
    state.ctx = letterCtx([{ id: REQUEST, status: 'posted', proposedAt: '2026-10-18T12:00:00Z', decisionReason: null, error: null, payload: approvedPayload(), printedAt: null }])
    const res = await recordLetterPrinted({ propertyId: PROPERTY, approvalRequestId: REQUEST, verified: true })
    expect(res.ok).toBe(false)
    expect(!res.ok && res.error).toContain('Tex. Prop. Code § 209.0064(b)')
    expect(state.db!.rows('collection_events')).toHaveLength(0)
    expect(state.db!.rows('audit_log')).toHaveLength(0)
  })

  it('the override recorded at save carries through to the print', async () => {
    const payload = approvedPayload([{ code: 'tx_collection_fees_without_notice', reason: 'notice_sent_outside_app' }])
    state.ctx = letterCtx([{ id: REQUEST, status: 'posted', proposedAt: '2026-10-18T12:00:00Z', decisionReason: null, error: null, payload, printedAt: null }])
    const res = await recordLetterPrinted({ propertyId: PROPERTY, approvalRequestId: REQUEST, verified: true })
    expect(res.ok).toBe(true)
  })
})
