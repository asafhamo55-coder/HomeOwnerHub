import { describe, expect, it } from 'vitest'
import { candidateReminders, planReminders, type PlanAssessment, type PlanOwnership } from './plan'
import { reminderCommunicationId } from './schedule'

/**
 * Who gets a reminder today, and who is skipped. Pure — the I/O lives in
 * run.ts behind a store interface.
 */

const TODAY = '2026-10-06'
const OFFSETS = [-3, 5, 15]

function assessment(over: Partial<PlanAssessment> & { id: string; unitId: string }): PlanAssessment {
  return {
    dueDate: '2026-10-01', // +5 on TODAY
    amount: 325,
    paid: 0,
    assessmentType: 'regular',
    unitLabel: 'Unit',
    ...over,
  }
}

function owner(unitId: string, email: string | null, name = 'Owner'): PlanOwnership {
  return { unitId, ownerName: name, ownerEmail: email, ownerUserId: null }
}

const BASE = {
  today: TODAY,
  offsets: OFFSETS,
  activePlanUnitIds: new Set<string>(),
  attorneyUnitIds: new Set<string>(),
  sentIds: new Set<string>(),
}

describe('candidateReminders', () => {
  it('includes only regular/special dues with a balance whose step fires today', () => {
    const c = candidateReminders(
      [
        assessment({ id: 'a1', unitId: 'u1' }),
        assessment({ id: 'a2', unitId: 'u2', assessmentType: 'special' }),
        assessment({ id: 'a3', unitId: 'u3', assessmentType: 'late_fee' }),
        assessment({ id: 'a4', unitId: 'u4', paid: 325 }),
        assessment({ id: 'a5', unitId: 'u5', dueDate: '2026-10-03' }), // +3: nothing
      ],
      TODAY,
      OFFSETS,
    )
    expect(c.map((x) => [x.assessment.id, x.step])).toEqual([
      ['a1', 5],
      ['a2', 5],
    ])
    expect(c[0].communicationId).toBe(reminderCommunicationId('a1', 5))
  })
})

describe('planReminders', () => {
  it('plans one send per (assessment, step) to every active owner with an email', () => {
    const plan = planReminders({
      ...BASE,
      assessments: [assessment({ id: 'a1', unitId: 'u1' })],
      ownerships: [owner('u1', 'One@Example.test'), owner('u1', 'two@example.test')],
    })
    expect(plan.sends).toHaveLength(1)
    expect(plan.sends[0]).toMatchObject({ assessmentId: 'a1', unitId: 'u1', step: 5 })
    expect(plan.sends[0].recipients.map((r) => r.email)).toEqual(['one@example.test', 'two@example.test'])
  })

  it('de-duplicates the same owner listed twice', () => {
    const plan = planReminders({
      ...BASE,
      assessments: [assessment({ id: 'a1', unitId: 'u1' })],
      ownerships: [owner('u1', 'one@example.test'), owner('u1', ' ONE@example.test ')],
    })
    expect(plan.sends[0].recipients).toHaveLength(1)
  })

  it('skips a unit on an active payment plan', () => {
    const plan = planReminders({
      ...BASE,
      activePlanUnitIds: new Set(['u1']),
      assessments: [assessment({ id: 'a1', unitId: 'u1' }), assessment({ id: 'a2', unitId: 'u2' })],
      ownerships: [owner('u1', 'a@example.test'), owner('u2', 'b@example.test')],
    })
    expect(plan.sends.map((s) => s.unitId)).toEqual(['u2'])
    expect(plan.skipped.paymentPlan).toBe(1)
  })

  it('skips a unit in collections at the attorney stage', () => {
    const plan = planReminders({
      ...BASE,
      attorneyUnitIds: new Set(['u2']),
      assessments: [assessment({ id: 'a1', unitId: 'u1' }), assessment({ id: 'a2', unitId: 'u2' })],
      ownerships: [owner('u1', 'a@example.test'), owner('u2', 'b@example.test')],
    })
    expect(plan.sends.map((s) => s.unitId)).toEqual(['u1'])
    expect(plan.skipped.attorney).toBe(1)
  })

  it('skips an (assessment, step) that was already sent — idempotent', () => {
    const plan = planReminders({
      ...BASE,
      sentIds: new Set([reminderCommunicationId('a1', 5)]),
      assessments: [assessment({ id: 'a1', unitId: 'u1' })],
      ownerships: [owner('u1', 'a@example.test')],
    })
    expect(plan.sends).toEqual([])
    expect(plan.skipped.alreadySent).toBe(1)
  })

  it('still sends the NEXT step for an assessment whose earlier step was sent', () => {
    const plan = planReminders({
      ...BASE,
      today: '2026-10-16',
      sentIds: new Set([reminderCommunicationId('a1', -3), reminderCommunicationId('a1', 5)]),
      assessments: [assessment({ id: 'a1', unitId: 'u1' })],
      ownerships: [owner('u1', 'a@example.test')],
    })
    expect(plan.sends.map((s) => s.step)).toEqual([15])
  })

  it('counts a unit with no owner email as skipped, not sent', () => {
    const plan = planReminders({
      ...BASE,
      assessments: [assessment({ id: 'a1', unitId: 'u1' })],
      ownerships: [owner('u1', null)],
    })
    expect(plan.sends).toEqual([])
    expect(plan.skipped.noRecipient).toBe(1)
  })

  it("carries the unit's whole open balance (incl. fees) for the email body", () => {
    const plan = planReminders({
      ...BASE,
      assessments: [
        assessment({ id: 'a1', unitId: 'u1' }),
        assessment({ id: 'f1', unitId: 'u1', assessmentType: 'late_fee', amount: 16.25, dueDate: '2026-09-01' }),
        assessment({ id: 'p1', unitId: 'u1', assessmentType: 'regular', amount: 325, paid: 325, dueDate: '2026-09-01' }),
      ],
      ownerships: [owner('u1', 'a@example.test')],
    })
    expect(plan.sends).toHaveLength(1)
    const charges = plan.sends[0].charges
    expect(charges.map((c) => c.id)).toEqual(['f1', 'a1']) // past-due oldest first; paid-off dropped
    expect(charges[0]).toMatchObject({ pastDue: true, daysLate: 35, balance: 16.25 })
    expect(charges[1]).toMatchObject({ pastDue: true, daysLate: 5, balance: 325 })
  })
})
