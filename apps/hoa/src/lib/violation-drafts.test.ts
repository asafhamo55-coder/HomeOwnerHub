import { describe, expect, it } from 'vitest'
import { queuedSupabase as fakeSupabase, payloadOf } from './test-utils/fake-supabase-queue'
import { approveViolationDraftWith, rejectViolationDraftWith, type DraftDb } from './violation-drafts'

const ORG = '00000000-0000-0000-0000-000000000001'
const RUN = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const UNIT = '33333333-3333-4333-8333-333333333333'
const PROP = '44444444-4444-4444-8444-444444444444'
const err = { code: '42501', message: 'permission denied' }

const NOTICE = 'Dear homeowner, please trim the hedge along the front walkway within 14 days.'

function run(over: Record<string, unknown> = {}) {
  return {
    id: RUN,
    status: 'pending_human_approval',
    input: { unitId: UNIT, violationType: 'landscaping', description: 'Hedge exceeds the height limit.' },
    output: {
      notice: NOTICE,
      citedSection: 'CC&R §7.3(b)',
      recommendedSeverity: 'low',
      recommendedFineAmountCents: 2500,
      recommendedCurePeriodDays: 14,
    },
    ...over,
  }
}

const OUTBOUND_TABLES = ['communications', 'communication_recipients', 'outbound_messages', 'inbox_drafts', 'notifications']

describe('approveViolationDraftWith', () => {
  it('claims the pending run, then files an OPEN violation with the letter — nothing marked sent', async () => {
    const { db, calls } = fakeSupabase({
      ai_runs: [
        { data: run(), error: null },
        { data: [{ id: RUN }], error: null },
      ],
      units: [{ data: { legacy_hoa_property_id: PROP }, error: null }],
      hoa_violations: [{ data: { id: 'v1' }, error: null }],
    })
    const r = await approveViolationDraftWith(db as unknown as DraftDb, { orgId: ORG, runId: RUN, userId: USER })
    expect(r).toEqual({ ok: true, violationId: 'v1' })

    // The read is scoped to this org's W3 runs.
    const read = calls[0].ops
    expect(read).toContainEqual(['eq', ['id', RUN]])
    expect(read).toContainEqual(['eq', ['organization_id', ORG]])
    expect(read).toContainEqual(['eq', ['workflow_id', 'W3']])

    // The claim is conditional on the run still pending (no double approve).
    const claim = calls[1].ops
    expect(claim).toContainEqual(['eq', ['status', 'pending_human_approval']])
    expect(payloadOf(calls, 'ai_runs', 'update')).toMatchObject({
      status: 'completed',
      human_approved: true,
      human_approver: USER,
    })

    const v = payloadOf(calls, 'hoa_violations', 'insert')!
    expect(v).toMatchObject({
      org_id: ORG,
      property_id: PROP,
      violation_type: 'landscaping',
      description: 'Hedge exceeds the height limit.',
      ccr_section: 'CC&R §7.3(b)',
      severity: 'low',
      cure_period_days: 14,
      fine_amount: 25,
      ai_draft_letter: NOTICE,
      approved_letter: NOTICE,
      approved_by: USER,
      created_by: USER,
      status: 'open',
    })
    // Truthful: approving does not deliver anything, so nothing says it was sent.
    expect(v.notice_sent_at ?? null).toBeNull()
  })

  it('never touches an outbound table (no email/SMS path)', async () => {
    const { db, calls } = fakeSupabase({
      ai_runs: [
        { data: run(), error: null },
        { data: [{ id: RUN }], error: null },
      ],
      units: [{ data: { legacy_hoa_property_id: null }, error: null }],
      hoa_violations: [{ data: { id: 'v1' }, error: null }],
    })
    await approveViolationDraftWith(db as unknown as DraftDb, { orgId: ORG, runId: RUN, userId: USER })
    expect(calls.map((c) => c.table).filter((t) => OUTBOUND_TABLES.includes(t))).toEqual([])
    expect(new Set(calls.map((c) => c.table))).toEqual(new Set(['ai_runs', 'units', 'hoa_violations']))
  })

  it('files with no property when the draft has no unit', async () => {
    const { db, calls } = fakeSupabase({
      ai_runs: [
        { data: run({ input: { violationType: 'parking', description: 'Trailer in the driveway.' } }), error: null },
        { data: [{ id: RUN }], error: null },
      ],
      hoa_violations: [{ data: { id: 'v2' }, error: null }],
    })
    const r = await approveViolationDraftWith(db as unknown as DraftDb, { orgId: ORG, runId: RUN, userId: USER })
    expect(r).toEqual({ ok: true, violationId: 'v2' })
    expect(calls.some((c) => c.table === 'units')).toBe(false)
    expect(payloadOf(calls, 'hoa_violations', 'insert')).toMatchObject({ property_id: null })
  })

  it('refuses a draft that is gone or not this org’s, without writing', async () => {
    const { db, calls } = fakeSupabase({ ai_runs: [{ data: null, error: null }] })
    const r = await approveViolationDraftWith(db as unknown as DraftDb, { orgId: ORG, runId: RUN, userId: USER })
    expect(r.ok).toBe(false)
    expect(calls.some((c) => c.ops.some(([op]) => op === 'update' || op === 'insert'))).toBe(false)
  })

  it('says a decided draft was already decided, without writing', async () => {
    const { db, calls } = fakeSupabase({ ai_runs: [{ data: run({ status: 'completed' }), error: null }] })
    const r = await approveViolationDraftWith(db as unknown as DraftDb, { orgId: ORG, runId: RUN, userId: USER })
    expect(r).toEqual({ ok: false, error: 'Someone already decided this draft.' })
    expect(calls).toHaveLength(1)
  })

  it('refuses a draft with no letter text', async () => {
    const { db, calls } = fakeSupabase({ ai_runs: [{ data: run({ output: { notice: '  ' } }), error: null }] })
    const r = await approveViolationDraftWith(db as unknown as DraftDb, { orgId: ORG, runId: RUN, userId: USER })
    expect(r.ok).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it('loses a race cleanly: a claim that matched no row files nothing', async () => {
    const { db, calls } = fakeSupabase({
      ai_runs: [
        { data: run(), error: null },
        { data: [], error: null },
      ],
    })
    const r = await approveViolationDraftWith(db as unknown as DraftDb, { orgId: ORG, runId: RUN, userId: USER })
    expect(r).toEqual({ ok: false, error: 'Someone already decided this draft.' })
    expect(calls.some((c) => c.table === 'hoa_violations')).toBe(false)
  })

  it('a failed read is an error, not a pass', async () => {
    const { db } = fakeSupabase({ ai_runs: [{ data: null, error: err }] })
    const r = await approveViolationDraftWith(db as unknown as DraftDb, { orgId: ORG, runId: RUN, userId: USER })
    expect(r.ok).toBe(false)
  })

  it('puts the draft back in the queue when filing the violation fails', async () => {
    const { db, calls } = fakeSupabase({
      ai_runs: [
        { data: run(), error: null },
        { data: [{ id: RUN }], error: null },
        { data: null, error: null },
      ],
      units: [{ data: { legacy_hoa_property_id: PROP }, error: null }],
      hoa_violations: [{ data: null, error: err }],
    })
    const r = await approveViolationDraftWith(db as unknown as DraftDb, { orgId: ORG, runId: RUN, userId: USER })
    expect(r.ok).toBe(false)
    const revert = calls.filter((c) => c.table === 'ai_runs')[2]
    const patch = revert.ops.find(([op]) => op === 'update')![1][0]
    expect(patch).toMatchObject({ status: 'pending_human_approval', human_approved: null, human_approver: null, approved_at: null })
    // Only the claim this user made is undone.
    expect(revert.ops).toContainEqual(['eq', ['human_approver', USER]])
    expect(revert.ops).toContainEqual(['eq', ['status', 'completed']])
  })
})

describe('rejectViolationDraftWith', () => {
  it('records the rejection and the reason on the run, conditional on it still pending', async () => {
    const { db, calls } = fakeSupabase({ ai_runs: [{ data: [{ id: RUN }], error: null }] })
    const r = await rejectViolationDraftWith(db as unknown as DraftDb, { orgId: ORG, runId: RUN, userId: USER, reason: 'Wrong lot.' })
    expect(r).toEqual({ ok: true })
    expect(payloadOf(calls, 'ai_runs', 'update')).toMatchObject({
      status: 'completed',
      human_approved: false,
      human_approver: USER,
      human_feedback: 'Wrong lot.',
    })
    const ops = calls[0].ops
    expect(ops).toContainEqual(['eq', ['organization_id', ORG]])
    expect(ops).toContainEqual(['eq', ['workflow_id', 'W3']])
    expect(ops).toContainEqual(['eq', ['status', 'pending_human_approval']])
    expect(calls.some((c) => c.table === 'hoa_violations')).toBe(false)
  })

  it('says a decided draft was already decided', async () => {
    const { db } = fakeSupabase({ ai_runs: [{ data: [], error: null }] })
    expect(
      await rejectViolationDraftWith(db as unknown as DraftDb, { orgId: ORG, runId: RUN, userId: USER, reason: 'x' }),
    ).toEqual({ ok: false, error: 'Someone already decided this draft.' })
  })

  it('a failed write is an error', async () => {
    const { db } = fakeSupabase({ ai_runs: [{ data: null, error: err }] })
    expect((await rejectViolationDraftWith(db as unknown as DraftDb, { orgId: ORG, runId: RUN, userId: USER, reason: 'x' })).ok).toBe(
      false,
    )
  })
})
