import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/properties/resolve', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/properties/resolve')>()),
  resolvePropertyByEmail: vi.fn(),
}))
vi.mock('@/lib/association-time-server', () => ({ orgTimeZone: vi.fn(async () => 'America/New_York') }))

import { resolvePropertyByEmail } from '@/lib/properties/resolve'
import {
  WITHHELD_REASON,
  applySenderAuth,
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

// BL-105 — the receiving server's SPF/DKIM/DMARC verdict.

describe('applySenderAuth', () => {
  const verified = { verified: true as const, residentId: 'res-1', via: 'resident_email' as const }

  it('leaves the check untouched when the verdict was not read', () => {
    expect(applySenderAuth(verified, null)).toEqual(verified)
  })

  it('turns a forged-but-matching sender into sender_unauthenticated', () => {
    expect(applySenderAuth(verified, 'fail')).toEqual({ verified: false, reason: 'sender_unauthenticated' })
  })

  it('a failed verdict also outranks not_a_resident and check_failed', () => {
    expect(applySenderAuth({ verified: false, reason: 'not_a_resident' }, 'fail')).toEqual({
      verified: false,
      reason: 'sender_unauthenticated',
    })
    expect(applySenderAuth({ verified: false, reason: 'check_failed' }, 'fail')).toEqual({
      verified: false,
      reason: 'sender_unauthenticated',
    })
  })

  it('keeps not_filed and no_sender, which say something more basic', () => {
    expect(applySenderAuth({ verified: false, reason: 'not_filed' }, 'fail')).toEqual({ verified: false, reason: 'not_filed' })
    expect(applySenderAuth({ verified: false, reason: 'no_sender' }, 'fail')).toEqual({ verified: false, reason: 'no_sender' })
  })

  it('pass and none keep today’s answer and carry the verdict', () => {
    expect(applySenderAuth(verified, 'pass')).toEqual({ ...verified, auth: 'pass' })
    expect(applySenderAuth(verified, 'none')).toEqual({ ...verified, auth: 'none' })
    expect(applySenderAuth({ verified: false, reason: 'not_a_resident' }, 'pass')).toEqual({
      verified: false,
      reason: 'not_a_resident',
    })
  })
})

/** inbox_messages → the verdict row; inbox_sender_aliases → aliases. */
function authDb(auth: { data: unknown; error: unknown }, aliases: { data: unknown; error: unknown } = { data: [], error: null }) {
  const msgChain = {
    select: vi.fn(() => msgChain),
    eq: vi.fn(() => msgChain),
    order: vi.fn(() => msgChain),
    limit: vi.fn(() => msgChain),
    maybeSingle: vi.fn(async () => auth),
  }
  const aliasChain = {
    select: vi.fn(() => aliasChain),
    eq: vi.fn(() => aliasChain),
    ilike: vi.fn(() => aliasChain),
    limit: vi.fn(async () => aliases),
  }
  return {
    from: vi.fn((t: string) => (t === 'inbox_messages' ? msgChain : aliasChain)),
    msgChain,
  }
}

describe('checkSenderForUnit — sender authentication (BL-105)', () => {
  const live = { threadId: 'thread-1', authColumnLive: true }
  beforeEach(() => {
    vi.mocked(resolvePropertyByEmail).mockReset()
    vi.mocked(resolvePropertyByEmail).mockResolvedValue([
      { ref: { unitId: 'unit-12' }, residentId: 'res-1', residentName: 'x', source: 'property_resident' },
    ] as never)
  })

  it('flag off: never reads the column, answer unchanged', async () => {
    const db = authDb({ data: { sender_auth: 'fail' }, error: null })
    const out = await checkSenderForUnit(db as never, 'org-1', 'unit-12', 'w@example.test', {
      threadId: 'thread-1',
      authColumnLive: false,
    })
    expect(out).toEqual({ verified: true, residentId: 'res-1', via: 'resident_email' })
    expect(db.from).not.toHaveBeenCalledWith('inbox_messages')
  })

  it('no thread given: never reads the column', async () => {
    const db = authDb({ data: { sender_auth: 'fail' }, error: null })
    const out = await checkSenderForUnit(db as never, 'org-1', 'unit-12', 'w@example.test', { authColumnLive: true })
    expect(out.verified).toBe(true)
    expect(db.from).not.toHaveBeenCalledWith('inbox_messages')
  })

  it('a failed verdict withholds even though the address matches, without the resident lookup', async () => {
    const db = authDb({ data: { sender_auth: 'fail' }, error: null })
    const out = await checkSenderForUnit(db as never, 'org-1', 'unit-12', 'w@example.test', live)
    expect(out).toEqual({ verified: false, reason: 'sender_unauthenticated' })
    expect(resolvePropertyByEmail).not.toHaveBeenCalled()
    // Scoped to the org and the thread's newest inbound message.
    expect(db.msgChain.eq).toHaveBeenCalledWith('organization_id', 'org-1')
    expect(db.msgChain.eq).toHaveBeenCalledWith('thread_id', 'thread-1')
    expect(db.msgChain.eq).toHaveBeenCalledWith('direction', 'inbound')
  })

  it('pass verifies and carries the verdict', async () => {
    const out = await checkSenderForUnit(authDb({ data: { sender_auth: 'pass' }, error: null }) as never, 'org-1', 'unit-12', 'w@example.test', live)
    expect(out).toEqual({ verified: true, residentId: 'res-1', via: 'resident_email', auth: 'pass' })
  })

  it('a row stored before the column was filled (null) reads as none', async () => {
    const out = await checkSenderForUnit(authDb({ data: { sender_auth: null }, error: null }) as never, 'org-1', 'unit-12', 'w@example.test', live)
    expect(out).toEqual({ verified: true, residentId: 'res-1', via: 'resident_email', auth: 'none' })
  })

  it('a failed verdict read fails closed, logging ids and the code only', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const db = authDb({ data: null, error: { code: '42703', message: 'column does not exist' } })
    const out = await checkSenderForUnit(db as never, 'org-1', 'unit-12', 'secret@example.test', live)
    expect(out).toEqual({ verified: false, reason: 'check_failed' })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret@example.test')
    expect(JSON.stringify(spy.mock.calls)).toContain('42703')
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
