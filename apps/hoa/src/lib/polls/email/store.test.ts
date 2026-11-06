import { beforeEach, describe, expect, it, vi } from 'vitest'

const resolveAudience = vi.fn()
const loadPreferenceMap = vi.fn()
vi.mock('@/lib/communications/audience', () => ({ resolveAudience: (...a: unknown[]) => resolveAudience(...a) }))
vi.mock('@/lib/communications/preferences', async (orig) => ({
  ...(await orig<typeof import('@/lib/communications/preferences')>()),
  loadPreferenceMap: (...a: unknown[]) => loadPreferenceMap(...a),
}))

import { supabasePollEmailStore, tallyFromTables, loadPollEmailSummary } from './store'
import { pollEmailCommunicationId } from './run'

const ASSOC = 'aaaaaaaa-0000-4000-8000-000000000001'
const ORG = 'bbbbbbbb-0000-4000-8000-000000000002'

const rec = (n: number, over: Record<string, unknown> = {}) => ({
  unitId: `u${n}`,
  unitAddress: null,
  unitNumber: null,
  recipientName: `Name ${n}`,
  email: `r${n}@example.test`,
  phone: null,
  userId: `user${n}`,
  ...over,
})

beforeEach(() => {
  resolveAudience.mockReset()
  loadPreferenceMap.mockReset()
})

describe('loadRecipients', () => {
  it('asks for the poll’s own association only, everyone in it', async () => {
    resolveAudience.mockResolvedValue({ recipients: [rec(1)], summary: '' })
    loadPreferenceMap.mockResolvedValue({ ok: true, map: new Map() })
    const store = supabasePollEmailStore({ from: vi.fn() }, async () => [])
    await store.loadRecipients({ id: ASSOC, organizationId: ORG })
    expect(resolveAudience).toHaveBeenCalledWith(expect.anything(), ASSOC, { kind: 'everyone' })
    expect(loadPreferenceMap).toHaveBeenCalledWith(expect.anything(), ORG)
  })

  it('skips residents who turned email off and counts them', async () => {
    resolveAudience.mockResolvedValue({ recipients: [rec(1), rec(2), rec(3)], summary: '' })
    loadPreferenceMap.mockResolvedValue({
      ok: true,
      map: new Map([['user2', { email: false, sms: false }]]),
    })
    const store = supabasePollEmailStore({ from: vi.fn() }, async () => [])
    const out = await store.loadRecipients({ id: ASSOC, organizationId: ORG })
    expect(out.recipients.map((r) => r.email)).toEqual(['r1@example.test', 'r3@example.test'])
    expect(out.optedOut).toBe(1)
  })

  it('a resident with no portal account has no preference row and is emailed', async () => {
    resolveAudience.mockResolvedValue({ recipients: [rec(1, { userId: null })], summary: '' })
    loadPreferenceMap.mockResolvedValue({ ok: true, map: new Map() })
    const store = supabasePollEmailStore({ from: vi.fn() }, async () => [])
    expect((await store.loadRecipients({ id: ASSOC, organizationId: ORG })).recipients).toHaveLength(1)
  })

  it('drops homes with no email and repeated addresses', async () => {
    resolveAudience.mockResolvedValue({
      recipients: [rec(1), rec(2, { email: 'R1@example.test' }), rec(3, { email: null }), rec(4, { email: '  ' })],
      summary: '',
    })
    loadPreferenceMap.mockResolvedValue({ ok: true, map: new Map() })
    const store = supabasePollEmailStore({ from: vi.fn() }, async () => [])
    const out = await store.loadRecipients({ id: ASSOC, organizationId: ORG })
    expect(out.recipients.map((r) => r.unitId)).toEqual(['u1'])
    expect(out.optedOut).toBe(0)
  })

  it('refuses to send when preferences cannot be read, rather than emailing everyone', async () => {
    resolveAudience.mockResolvedValue({ recipients: [rec(1)], summary: '' })
    loadPreferenceMap.mockResolvedValue({ ok: false })
    const store = supabasePollEmailStore({ from: vi.fn() }, async () => [])
    await expect(store.loadRecipients({ id: ASSOC, organizationId: ORG })).rejects.toThrow(/preferences read/)
  })
})

describe('claim', () => {
  it('stores ids only and treats a primary-key conflict as already handled', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '23505' } })
    const store = supabasePollEmailStore({ from: () => ({ insert }) }, async () => [])
    const res = await store.claim({
      id: 'id1',
      organizationId: ORG,
      associationId: ASSOC,
      pollId: 'p1',
      kind: 'results',
      trigger: 'auto',
      subject: 's',
      html: '<p>h</p>',
      text: 't',
      recipientCount: 2,
    })
    expect(res).toEqual({ ok: false, reason: 'exists' })
    const row = insert.mock.calls[0]![0]
    expect(row).toMatchObject({ id: 'id1', source: 'workflow', channels: ['email'], status: 'sending' })
    expect(row.related_resource).toEqual({ type: 'poll_email', id: 'p1', event: 'results', auto: true })
    expect(JSON.stringify(row.audience_definition)).not.toContain('@')
  })

  it('any other database error throws with the code only', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: '42501', message: 'row for r1@example.test' } })
    const store = supabasePollEmailStore({ from: () => ({ insert }) }, async () => [])
    await expect(
      store.claim({ id: 'i', organizationId: ORG, associationId: ASSOC, pollId: 'p', kind: 'opened', trigger: 'board', subject: '', html: '', text: '', recipientCount: 1 }),
    ).rejects.toThrow('poll-email: claim failed (42501)')
  })
})

describe('tallyFromTables', () => {
  it('counts homes per option from the answer rows, never names', async () => {
    const db = {
      from: (t: string) => {
        if (t === 'poll_options') {
          const q = { select: () => q, eq: () => q, order: () => Promise.resolve({ data: [{ id: 'a', label: 'Yes', position: 0 }, { id: 'b', label: 'No', position: 1 }], error: null }) }
          return q
        }
        const q = {
          select: () => q,
          eq: () => q,
          order: () => q,
          range: () =>
            Promise.resolve({
              data: [
                { id: 'r1', poll_response_choices: [{ option_id: 'a' }] },
                { id: 'r2', poll_response_choices: [{ option_id: 'a' }, { option_id: 'b' }] },
                { id: 'r3', poll_response_choices: [] },
              ],
              error: null,
            }),
        }
        return q
      },
    }
    const rows = await tallyFromTables(db, 'p1')
    expect(rows).toEqual([
      { option_id: 'a', label: 'Yes', option_position: 0, votes: 2, homes_answered: 3 },
      { option_id: 'b', label: 'No', option_position: 1, votes: 1, homes_answered: 3 },
    ])
  })
})

describe('loadPollEmailSummary (the board’s "Emailed N homes on <date>")', () => {
  function db(rowsById: Record<string, { status: string; sent_at: string | null; created_at: string } | null>, sentCount: number) {
    return {
      from: (table: string) => {
        let id = ''
        const q: Record<string, unknown> = {
          select: () => q,
          eq: (col: string, v: string) => {
            if (col === 'id' || col === 'communication_id') id = v
            return q
          },
          maybeSingle: () => Promise.resolve({ data: rowsById[id] ?? null, error: null }),
          then: (res: (v: unknown) => void) => res({ count: sentCount, error: null }),
        }
        void table
        return q
      },
    }
  }

  it('reports the sent count and date for what went out, and null for what did not', async () => {
    const opened = pollEmailCommunicationId('p1', 'opened')
    const s = await loadPollEmailSummary(
      db({ [opened]: { status: 'sent', sent_at: '2026-11-06T15:00:00Z', created_at: '2026-11-06T14:59:00Z' } }, 12),
      'p1',
    )
    expect(s?.opened).toEqual({ homes: 12, at: '2026-11-06T15:00:00Z', status: 'sent' })
    expect(s?.results).toBeNull()
  })

  it('a failed read shows nothing instead of breaking the page', async () => {
    const broken = { from: () => { throw new Error('x') } }
    expect(await loadPollEmailSummary(broken, 'p1')).toBeNull()
  })
})
