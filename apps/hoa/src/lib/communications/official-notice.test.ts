import { describe, expect, it } from 'vitest'
import { deliverableChannels, officialNoticeApplies, paperNoticeLabel, planOfficialNotice } from './official-notice'
import type { LoadConsentResult } from '../email-consent'

const r = (
  userId: string | null,
  over: Partial<{ email: string | null; phone: string | null; recipientName: string | null }> = {},
) => ({
  userId,
  email: 'x@example.test' as string | null,
  phone: null as string | null,
  recipientName: userId ? `Name ${userId}` : null,
  unitAddress: '1 Elm St' as string | null,
  unitNumber: null as string | null,
  ...over,
})
const consent = (granted: Record<string, boolean>): LoadConsentResult => ({
  ok: true,
  available: true,
  consent: new Map(
    Object.entries(granted).map(([id, g]) => [id, { granted: g, method: 'portal' as const, at: '2026-10-01T00:00:00Z' }]),
  ),
})
const base = { channels: ['email', 'portal'], state: 'CA', officialNotice: true, m1: true }

describe('officialNoticeApplies', () => {
  it('only for a California association with M1 applied', () => {
    expect(officialNoticeApplies('CA', true)).toBe(true)
    expect(officialNoticeApplies(' ca ', true)).toBe(true)
    expect(officialNoticeApplies('CA', false)).toBe(false)
    expect(officialNoticeApplies('FL', true)).toBe(false)
    expect(officialNoticeApplies(null, true)).toBe(false)
  })
})

describe('planOfficialNotice', () => {
  const people = [r('a'), r('b'), r(null)]

  it('not official, not CA, or M1 off: does not apply', () => {
    expect(planOfficialNotice(people, { ...base, officialNotice: false, consent: consent({}) })).toEqual({ applies: false })
    expect(planOfficialNotice(people, { ...base, state: 'FL', consent: consent({}) })).toEqual({ applies: false })
    expect(planOfficialNotice(people, { ...base, m1: false, consent: consent({}) })).toEqual({ applies: false })
  })

  it('keeps email only for granted consent; no account means no consent', () => {
    const plan = planOfficialNotice(people, { ...base, consent: consent({ a: true, b: false }) })
    if (!plan.applies || !plan.ok) throw new Error('expected a plan')
    expect([...plan.emailKeep]).toEqual([people[0]])
    expect(plan.paper).toEqual({
      count: 2,
      recipients: [
        { name: 'Name b', home: '1 Elm St' },
        { name: 'Resident', home: '1 Elm St' },
      ],
    })
  })

  it('a consenting member with no email address still needs paper', () => {
    const plan = planOfficialNotice([r('a', { email: null })], { ...base, consent: consent({ a: true }) })
    expect(plan).toMatchObject({ applies: true, ok: true, paper: { count: 1 } })
  })

  it('without the email channel everyone needs paper', () => {
    const plan = planOfficialNotice(people, { ...base, channels: ['portal'], consent: consent({ a: true, b: true }) })
    expect(plan).toMatchObject({ applies: true, ok: true, paper: { count: 3 } })
  })

  it('consent that failed to load is not "everyone consented"', () => {
    expect(planOfficialNotice(people, { ...base, consent: { ok: false, error: 'x' } })).toEqual({ applies: true, ok: false })
    expect(planOfficialNotice(people, { ...base, consent: { ok: true, available: false } })).toEqual({ applies: true, ok: false })
    expect(planOfficialNotice(people, { ...base, consent: null })).toEqual({ applies: true, ok: false })
  })

  it('the paper list carries no contact details', () => {
    const plan = planOfficialNotice([r('b', { phone: '5550100' })], { ...base, consent: consent({}) })
    expect(JSON.stringify(plan.applies && plan.ok ? plan.paper : null)).not.toMatch(/example\.test|5550100/)
  })
})

describe('deliverableChannels', () => {
  const channels = ['email', 'sms', 'portal', 'mail'] as const

  it('without a plan: every channel the recipient can receive on (the old fan-out)', () => {
    expect(deliverableChannels(r('a', { phone: '5550100' }), channels, null)).toEqual(['email', 'sms', 'portal', 'mail'])
    expect(deliverableChannels(r(null, { email: null }), channels, null)).toEqual(['mail'])
  })

  it('with a plan: drops only the email row of a member without consent', () => {
    const yes = r('a')
    const no = r('b', { phone: '5550100' })
    const keep = new Set([yes])
    expect(deliverableChannels(yes, channels, keep)).toEqual(['email', 'portal', 'mail'])
    expect(deliverableChannels(no, channels, keep)).toEqual(['sms', 'portal', 'mail'])
  })
})

describe('paperNoticeLabel', () => {
  it('singular and plural', () => {
    expect(paperNoticeLabel(1)).toBe('1 member needs a paper notice')
    expect(paperNoticeLabel(3)).toBe('3 members need a paper notice')
  })
})
