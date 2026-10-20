import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/properties/resolve', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/properties/resolve')>()),
  resolvePropertyByEmail: vi.fn(),
}))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn(async () => 'America/New_York') }))

import { resolvePropertyByEmail } from '@/lib/properties/resolve'
import {
  WITHHELD_REASON,
  checkSenderForUnit,
  cureDate,
  decideSenderCheck,
  latestInboundSender,
} from './account-context'

// BL-101 A2 — the disclosure gate. Synthetic ids and addresses only.

describe('decideSenderCheck — who may be told a home’s account', () => {
  const base = { unitId: 'unit-12', senderEmail: 'writer@example.test', emailMatches: [], aliasMatches: [] }

  it('verifies a sender whose own address belongs to a resident of this home', () => {
    expect(
      decideSenderCheck({ ...base, emailMatches: [{ unitId: 'unit-12', residentId: 'res-1' }] }),
    ).toEqual({ verified: true, residentId: 'res-1', via: 'resident_email' })
  })

  it('verifies a sender the board saved as an alias for this home', () => {
    expect(
      decideSenderCheck({ ...base, aliasMatches: [{ unitId: 'unit-12', residentId: null }] }),
    ).toEqual({ verified: true, residentId: null, via: 'sender_alias' })
  })

  it('refuses a neighbour asking about this home (their address resolves to a different unit)', () => {
    expect(
      decideSenderCheck({
        ...base,
        emailMatches: [{ unitId: 'unit-14', residentId: 'res-neighbour' }],
        aliasMatches: [{ unitId: 'unit-14', residentId: null }],
      }),
    ).toEqual({ verified: false, reason: 'not_a_resident' })
  })

  it('refuses an unknown sender, an unfiled thread, and a missing address', () => {
    expect(decideSenderCheck(base)).toEqual({ verified: false, reason: 'not_a_resident' })
    expect(decideSenderCheck({ ...base, unitId: null })).toEqual({ verified: false, reason: 'not_filed' })
    expect(decideSenderCheck({ ...base, senderEmail: '  ' })).toEqual({ verified: false, reason: 'no_sender' })
  })

  it('has a PII-free reason for every refusal', () => {
    for (const reason of Object.values(WITHHELD_REASON)) {
      expect(reason).not.toMatch(/@|\$\d/)
    }
  })
})

describe('latestInboundSender', () => {
  it('is the newest inbound sender, lower-cased', () => {
    expect(
      latestInboundSender([
        { direction: 'inbound', fromEmail: 'first@example.test' },
        { direction: 'outbound', fromEmail: 'board@example.test' },
        { direction: 'inbound', fromEmail: ' Second@Example.test ' },
        { direction: 'outbound', fromEmail: 'board@example.test' },
      ]),
    ).toBe('second@example.test')
    expect(latestInboundSender([{ direction: 'outbound', fromEmail: 'board@example.test' }])).toBeNull()
  })
})

function aliasDb(result: { data: unknown; error: unknown }) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    ilike: vi.fn(() => chain),
    limit: vi.fn(async () => result),
  }
  return { from: vi.fn(() => chain) }
}

describe('checkSenderForUnit — fails closed', () => {
  beforeEach(() => {
    vi.mocked(resolvePropertyByEmail).mockReset()
  })

  it('verifies against the resident lookup', async () => {
    vi.mocked(resolvePropertyByEmail).mockResolvedValue([
      { ref: { unitId: 'unit-12' }, residentId: 'res-1', residentName: 'x', source: 'property_resident' },
    ] as never)
    const out = await checkSenderForUnit(aliasDb({ data: [], error: null }) as never, 'org-1', 'unit-12', 'w@example.test')
    expect(out).toEqual({ verified: true, residentId: 'res-1', via: 'resident_email' })
  })

  it('withholds when the resident lookup throws', async () => {
    vi.mocked(resolvePropertyByEmail).mockImplementation(async () => { throw Object.assign(new Error('boom'), { code: '08006' }) })
    const out = await checkSenderForUnit(aliasDb({ data: [], error: null }) as never, 'org-1', 'unit-12', 'w@example.test')
    expect(out).toEqual({ verified: false, reason: 'check_failed' })
  })

  it('withholds when the alias read errors, even if the email would have matched', async () => {
    vi.mocked(resolvePropertyByEmail).mockResolvedValue([
      { ref: { unitId: 'unit-12' }, residentId: 'res-1', residentName: 'x', source: 'property_resident' },
    ] as never)
    const out = await checkSenderForUnit(
      aliasDb({ data: null, error: { code: '42501', message: 'denied' } }) as never,
      'org-1',
      'unit-12',
      'w@example.test',
    )
    expect(out).toEqual({ verified: false, reason: 'check_failed' })
  })

  it('never reads anything for an unfiled thread', async () => {
    const db = aliasDb({ data: [], error: null })
    expect(await checkSenderForUnit(db as never, 'org-1', null, 'w@example.test')).toEqual({
      verified: false,
      reason: 'not_filed',
    })
    expect(db.from).not.toHaveBeenCalled()
    expect(resolvePropertyByEmail).not.toHaveBeenCalled()
  })

  it('logs no address', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(resolvePropertyByEmail).mockImplementation(async () => { throw new Error('boom') })
    await checkSenderForUnit(aliasDb({ data: [], error: null }) as never, 'org-1', 'unit-12', 'secret@example.test')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret@example.test')
    spy.mockRestore()
  })
})

describe('cureDate', () => {
  it('adds the cure period to the notice date', () => {
    expect(cureDate('2026-10-01T15:00:00Z', 14)).toBe('2026-10-15')
    expect(cureDate(null, 14)).toBeNull()
    expect(cureDate('2026-10-01', null)).toBeNull()
  })
})
