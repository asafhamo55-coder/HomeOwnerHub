import { describe, expect, it } from 'vitest'
import {
  buildFollowUpDraftRequest,
  followUpLabel,
  followUpOfRunInput,
  isFollowUpAwaitingSave,
  readFollowUpDraft,
  withFollowUpSaved,
  readStatuteRefusal,
  stepForLetter,
  type FollowUpViolation,
} from './violation-follow-up'
import { RequestedActionSchema, evaluateRequestedAction, selectStateRules } from '@homeowner-portal/workflows/W3-state-rules'

const V: FollowUpViolation = {
  id: '33333333-3333-4333-8333-333333333333',
  unitId: '11111111-1111-4111-8111-111111111111',
  violationType: 'parking',
  description: 'Boat trailer in the driveway for three weeks.',
  status: 'notice_sent',
  noticeSentAt: '2026-09-01T15:00:00.000Z',
}

describe('stepForLetter', () => {
  it('maps each letter kind onto a W3 step', () => {
    expect(stepForLetter('second_notice')).toBe('first_notice')
    expect(stepForLetter('hearing_notice')).toBe('hearing_notice')
    expect(stepForLetter('fine_notice')).toBe('impose_fine')
    expect(stepForLetter('decision_letter', 'fine')).toBe('impose_fine')
    expect(stepForLetter('decision_letter', 'suspension')).toBe('impose_suspension')
  })
})

describe('buildFollowUpDraftRequest', () => {
  it('second notice: violationId + kind, no penalty facts, a valid requested action', () => {
    const r = buildFollowUpDraftRequest(V, { kind: 'second_notice' })
    expect(r).toMatchObject({ unitId: V.unitId, violationId: V.id, letterKind: 'second_notice' })
    expect(r.requestedAction).toEqual({ step: 'first_notice' })
    expect(r.reporterNotes).toContain('SECOND NOTICE')
    expect(r.reporterNotes).toContain('2026-09-01')
    expect(RequestedActionSchema.safeParse(r.requestedAction).success).toBe(true)
  })

  it('fine notice: hearingHeld is false unless the board ticks it, fine in cents', () => {
    const not = buildFollowUpDraftRequest(V, { kind: 'fine_notice', fineDollars: 50 })
    expect(not.requestedAction).toEqual({ step: 'impose_fine', hearingHeld: false, fineAmountCents: 5000 })
    const held = buildFollowUpDraftRequest(V, { kind: 'fine_notice', hearingHeld: true })
    expect(held.requestedAction).toEqual({ step: 'impose_fine', hearingHeld: true })
  })

  it('decision letter with a suspension carries no fine', () => {
    const r = buildFollowUpDraftRequest(V, { kind: 'decision_letter', outcome: 'suspension', hearingHeld: true, fineDollars: 50 })
    expect(r.requestedAction).toEqual({ step: 'impose_suspension', hearingHeld: true })
  })

  it('hearing notice passes the days to the hearing', () => {
    const r = buildFollowUpDraftRequest(V, { kind: 'hearing_notice', hearingNoticeDays: 12 })
    expect(r.requestedAction).toEqual({ step: 'hearing_notice', hearingNoticeDays: 12 })
  })

  it('a cured violation tells the rules so', () => {
    const r = buildFollowUpDraftRequest({ ...V, status: 'cured' }, { kind: 'fine_notice', hearingHeld: true })
    expect(r.requestedAction.violationCured).toBe(true)
  })

  it('keeps a short description inside the route bounds and adds board notes', () => {
    const r = buildFollowUpDraftRequest({ ...V, description: 'Trailer' }, { kind: 'second_notice', notes: ' Owner called. ' })
    expect(r.description.length).toBeGreaterThanOrEqual(10)
    expect(r.reporterNotes).toContain('Board notes: Owner called.')
  })

  it('the state rules refuse what the board would expect them to', () => {
    const ca = selectStateRules('CA')
    const fl = selectStateRules('FL')
    const noHearing = buildFollowUpDraftRequest(V, { kind: 'fine_notice' }).requestedAction
    expect(evaluateRequestedAction(ca, noHearing).refusals.length).toBeGreaterThan(0)
    expect(evaluateRequestedAction(fl, noHearing).refusals.length).toBeGreaterThan(0)
    const second = buildFollowUpDraftRequest(V, { kind: 'second_notice' }).requestedAction
    expect(evaluateRequestedAction(ca, second).refusals).toEqual([])
    const held = buildFollowUpDraftRequest(V, { kind: 'decision_letter', hearingHeld: true }).requestedAction
    expect(evaluateRequestedAction(ca, held).refusals).toEqual([])
    expect(evaluateRequestedAction(ca, { ...held, financialCommitmentToCure: true }).refusals.join(' ')).toContain('5855(c)(2)')
  })
})

describe('route responses', () => {
  it('reads a draft with its state-law warnings', () => {
    expect(readFollowUpDraft({ runId: 'r1', notice: 'Dear owner', stateRules: { warnings: ['Deliver by hand.'] } })).toEqual({
      runId: 'r1',
      notice: 'Dear owner',
      warnings: ['Deliver by hand.'],
    })
    expect(readFollowUpDraft({ runId: 'r1', notice: '  ' })).toBeNull()
    expect(readFollowUpDraft(null)).toBeNull()
  })

  it('reads a statute refusal, and nothing else', () => {
    expect(
      readStatuteRefusal({ error: { code: 'unprocessable', reason: 'statute_refusal', jurisdiction: 'CA', reasons: ['No.'] } }),
    ).toEqual({ jurisdiction: 'CA', reasons: ['No.'] })
    expect(readStatuteRefusal({ error: { code: 'internal', message: 'x' } })).toBeNull()
    expect(readStatuteRefusal({ error: { reason: 'statute_refusal', reasons: [] } })).toBeNull()
  })
})

describe('followUpOfRunInput', () => {
  it('reads the follow-up off a run input, ignoring junk', () => {
    expect(followUpOfRunInput({ followUp: { violationId: V.id, letterKind: 'hearing_notice' } })).toEqual({
      violationId: V.id,
      letterKind: 'hearing_notice',
    })
    expect(followUpOfRunInput({ unitId: V.unitId })).toBeNull()
    expect(followUpOfRunInput({ followUp: { violationId: 'not-a-uuid' } })).toBeNull()
    expect(followUpLabel({ violationId: V.id })).toBe('Follow-up letter')
    expect(followUpLabel({ violationId: V.id, letterKind: 'decision_letter' })).toBe('Decision letter')
  })
})

describe('awaiting save (dialog drafts kept out of Approvals until saved)', () => {
  const input = { unitId: V.unitId, followUp: { violationId: V.id, letterKind: 'second_notice', awaitingSave: true } }

  it('reads the flag, and only a literal true counts', () => {
    expect(isFollowUpAwaitingSave(input)).toBe(true)
    expect(followUpOfRunInput(input)).toEqual({ violationId: V.id, letterKind: 'second_notice', awaitingSave: true })
    expect(isFollowUpAwaitingSave({ followUp: { violationId: V.id } })).toBe(false)
    expect(isFollowUpAwaitingSave({ followUp: { violationId: V.id, awaitingSave: 'true' } })).toBe(false)
    expect(isFollowUpAwaitingSave({ unitId: V.unitId })).toBe(false)
    expect(isFollowUpAwaitingSave(null)).toBe(false)
  })

  it('saving drops only the flag', () => {
    expect(withFollowUpSaved(input)).toEqual({ unitId: V.unitId, followUp: { violationId: V.id, letterKind: 'second_notice' } })
    expect(isFollowUpAwaitingSave(withFollowUpSaved(input))).toBe(false)
  })
})
