import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadLatestMeetingNotice, stampNoticePosted } from './notice-record'

const ORG = 'org-1'
const MEETING = '0b6c8f1e-3a51-4c11-9d2e-1f5a7e9c2b40'
const COMM = '5d1f0c3a-8e7b-4a6d-9c2f-0e1b2a3c4d5e'

interface Call {
  table: string
  op: string
  args: unknown[]
}

/** A chainable fake that records every call and answers per (table, terminal op). */
function fakeClient(answers: Record<string, { data: unknown; error: unknown }>) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      let mode = 'select'
      const q: Record<string, unknown> = {}
      const chain = (op: string) =>
        (...args: unknown[]) => {
          calls.push({ table, op, args })
          if (op === 'update') mode = 'update'
          return q
        }
      for (const op of ['select', 'update', 'eq', 'in', 'is', 'order']) q[op] = chain(op)
      const settle = () => Promise.resolve(answers[`${table}.${mode}`] ?? { data: null, error: null })
      q.limit = (...args: unknown[]) => {
        calls.push({ table, op: 'limit', args })
        return settle()
      }
      q.maybeSingle = () => {
        calls.push({ table, op: 'maybeSingle', args: [] })
        return settle()
      }
      // An update chain is awaited after .select('id').
      q.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => settle().then(res, rej)
      return q
    },
  }
  return { client, calls }
}

afterEach(() => vi.restoreAllMocks())

describe('M1 gating of notice_posted_at', () => {
  it('m1 false: nothing is read or written at all', async () => {
    const { client, calls } = fakeClient({})
    const out = await stampNoticePosted(client, { m1: false, orgId: ORG, meetingId: MEETING, communicationId: COMM })
    expect(out).toBe('flag_off')
    expect(calls).toEqual([])
  })

  it('m1 true + a sent notice for this meeting: stamps notice_posted_at with the sent time, only if empty', async () => {
    const sentAt = '2026-10-20T14:00:00.000Z'
    const { client, calls } = fakeClient({
      'communications.select': {
        data: { id: COMM, status: 'sent', sent_at: sentAt, related_resource: { type: 'meeting', id: MEETING } },
        error: null,
      },
      'hoa_meeting_minutes.update': { data: [{ id: MEETING }], error: null },
    })
    const out = await stampNoticePosted(client, { m1: true, orgId: ORG, meetingId: MEETING, communicationId: COMM })
    expect(out).toBe('stamped')
    const update = calls.find((c) => c.table === 'hoa_meeting_minutes' && c.op === 'update')
    expect(update?.args[0]).toEqual({ notice_posted_at: sentAt })
    const filters = calls.filter((c) => c.table === 'hoa_meeting_minutes').map((c) => [c.op, ...c.args])
    expect(filters).toContainEqual(['eq', 'org_id', ORG])
    expect(filters).toContainEqual(['is', 'notice_posted_at', null])
    // The communication is read org-scoped.
    expect(calls).toContainEqual({ table: 'communications', op: 'eq', args: ['organization_id', ORG] })
  })

  it('an earlier date is never overwritten', async () => {
    const { client } = fakeClient({
      'communications.select': {
        data: { id: COMM, status: 'sent', sent_at: '2026-10-20T14:00:00Z', related_resource: { type: 'meeting', id: MEETING } },
        error: null,
      },
      'hoa_meeting_minutes.update': { data: [], error: null },
    })
    expect(await stampNoticePosted(client, { m1: true, orgId: ORG, meetingId: MEETING, communicationId: COMM })).toBe('already_set')
  })

  it.each([
    ['another meeting', { status: 'sent', sent_at: 'x', related_resource: { type: 'meeting', id: 'other' } }],
    ['a follow-up', { status: 'sent', sent_at: 'x', related_resource: { type: 'follow_up', id: MEETING } }],
    ['scheduled, not sent', { status: 'scheduled', sent_at: null, related_resource: { type: 'meeting', id: MEETING } }],
    ['failed', { status: 'failed', sent_at: null, related_resource: { type: 'meeting', id: MEETING } }],
  ])('m1 true but the communication is %s: no write', async (_label, row) => {
    const { client, calls } = fakeClient({ 'communications.select': { data: { id: COMM, ...row }, error: null } })
    expect(await stampNoticePosted(client, { m1: true, orgId: ORG, meetingId: MEETING, communicationId: COMM })).toBe('not_sent')
    expect(calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('a failed write logs the code only', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient({
      'communications.select': {
        data: { id: COMM, status: 'sent', sent_at: 'x', related_resource: { type: 'meeting', id: MEETING } },
        error: null,
      },
      'hoa_meeting_minutes.update': { data: null, error: { code: '42703', message: 'column "notice_posted_at" does not exist' } },
    })
    expect(await stampNoticePosted(client, { m1: true, orgId: ORG, meetingId: MEETING, communicationId: COMM })).toBe('failed')
    expect(JSON.stringify(err.mock.calls)).not.toContain('does not exist')
  })
})

describe('loadLatestMeetingNotice — "sent on <date>" from the communication record', () => {
  it('reads org-scoped by related_resource, sent or scheduled, newest first', async () => {
    const { client, calls } = fakeClient({
      'communications.select': {
        data: [{ id: COMM, status: 'sent', sent_at: '2026-10-20T14:00:00Z', scheduled_for: null, created_at: '2026-10-20T13:59:00Z' }],
        error: null,
      },
    })
    const out = await loadLatestMeetingNotice(client, { orgId: ORG, meetingId: MEETING })
    expect(out).toEqual({ communicationId: COMM, at: '2026-10-20T14:00:00Z', status: 'sent' })
    const ops = calls.map((c) => [c.op, ...c.args])
    expect(ops).toContainEqual(['eq', 'organization_id', ORG])
    expect(ops).toContainEqual(['eq', 'related_resource->>type', 'meeting'])
    expect(ops).toContainEqual(['eq', 'related_resource->>id', MEETING])
    expect(ops).toContainEqual(['in', 'status', ['sent', 'scheduled']])
    // Never names the M1 column.
    expect(JSON.stringify(calls)).not.toContain('notice_posted_at')
  })

  it('scheduled → the scheduled time; none → null; a failed read → "failed"', async () => {
    const sched = fakeClient({
      'communications.select': {
        data: [{ id: COMM, status: 'scheduled', sent_at: null, scheduled_for: '2026-10-25T13:00:00Z', created_at: '2026-10-20T13:00:00Z' }],
        error: null,
      },
    })
    expect(await loadLatestMeetingNotice(sched.client, { orgId: ORG, meetingId: MEETING })).toMatchObject({ status: 'scheduled', at: '2026-10-25T13:00:00Z' })
    expect(await loadLatestMeetingNotice(fakeClient({ 'communications.select': { data: [], error: null } }).client, { orgId: ORG, meetingId: MEETING })).toBeNull()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await loadLatestMeetingNotice(fakeClient({ 'communications.select': { data: null, error: { code: '500' } } }).client, { orgId: ORG, meetingId: MEETING }),
    ).toBe('failed')
  })
})
