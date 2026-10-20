import { describe, expect, it, vi } from 'vitest'
import {
  getAnnouncementReply,
  listAnnouncementReplies,
  replyPreview,
  toAnnouncementReply,
  type AnnouncementReplyRow,
} from './announcement-replies'

const row = (over: Partial<AnnouncementReplyRow> = {}): AnnouncementReplyRow => ({
  id: 'r1',
  channel: 'email',
  subject: 'Re: Pool closing',
  body: 'Thanks!',
  ai_summary: null,
  received_at: '2026-10-20T12:00:00Z',
  read_at: null,
  communication_id: 'c1',
  from_email: 'a@example.test',
  from_phone: null,
  communication: { subject: '{{association_name}} pool closing' },
  recipient: { unit_id: 'u1', recipient_name: 'Resident A', rendered_subject: null },
  ...over,
})

describe('toAnnouncementReply', () => {
  it('prefers the subject the resident actually received', () => {
    const r = toAnnouncementReply(
      row({ recipient: { unit_id: 'u1', recipient_name: 'Resident A', rendered_subject: 'Oak HOA pool closing' } }),
      'Elm HOA',
    )
    expect(r.announcementSubject).toBe('Oak HOA pool closing')
  })

  it('falls back to the template resolved for display, then a generic label', () => {
    expect(toAnnouncementReply(row(), 'Elm HOA').announcementSubject).toBe('Elm HOA pool closing')
    expect(toAnnouncementReply(row({ communication: null }), 'Elm HOA').announcementSubject).toBe('Announcement')
  })

  it('names the sender from the recipient row, then the reply address', () => {
    expect(toAnnouncementReply(row(), 'x').from).toBe('Resident A')
    expect(toAnnouncementReply(row({ recipient: null }), 'x').from).toBe('a@example.test')
    expect(toAnnouncementReply(row({ recipient: null, from_email: null, from_phone: '+1555' }), 'x').from).toBe('+1555')
  })

  it('carries the home and read state', () => {
    const r = toAnnouncementReply(row(), 'x')
    expect(r.unitId).toBe('u1')
    expect(r.unread).toBe(true)
    expect(toAnnouncementReply(row({ read_at: '2026-10-20T13:00:00Z', recipient: null }), 'x')).toMatchObject({
      unread: false,
      unitId: null,
    })
  })
})

describe('replyPreview', () => {
  it('uses the AI summary when present and collapses whitespace', () => {
    expect(replyPreview({ aiSummary: null, body: 'a\n\n b' })).toBe('a b')
    expect(replyPreview({ aiSummary: 'Asks about hours', body: 'long' })).toBe('Asks about hours')
    expect(replyPreview({ aiSummary: null, body: 'x'.repeat(200) }, 10)).toBe(`${'x'.repeat(9)}…`)
  })
})

function fakeDb(result: { data: unknown; error: { message: string } | null; count?: number | null }) {
  const calls: Array<[string, unknown[]]> = []
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'range']) {
    chain[m] = vi.fn((...args: unknown[]) => {
      calls.push([m, args])
      return chain
    })
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result))
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
  const db = { from: vi.fn(() => chain) }
  return { db: db as never, calls }
}

describe('listAnnouncementReplies', () => {
  it('reads one org-scoped page, newest first', async () => {
    const { db, calls } = fakeDb({ data: [row()], error: null, count: 51 })
    const out = await listAnnouncementReplies(db, 'org1', 'Elm HOA', { page: 2 })
    expect(out.total).toBe(51)
    expect(out.rows.map((r) => r.id)).toEqual(['r1'])
    expect(calls).toContainEqual(['eq', ['organization_id', 'org1']])
    expect(calls).toContainEqual(['order', ['received_at', { ascending: false }]])
    expect(calls).toContainEqual(['range', [50, 99]])
  })

  it('throws on a failed read instead of showing no replies', async () => {
    const { db } = fakeDb({ data: null, error: { message: 'boom' } })
    await expect(listAnnouncementReplies(db, 'org1', 'x', { page: 1 })).rejects.toThrow('boom')
  })
})

describe('getAnnouncementReply', () => {
  it('is org-scoped and returns null when missing', async () => {
    const { db, calls } = fakeDb({ data: null, error: null })
    expect(await getAnnouncementReply(db, 'org1', 'x', 'r9')).toBeNull()
    expect(calls).toContainEqual(['eq', ['organization_id', 'org1']])
    expect(calls).toContainEqual(['eq', ['id', 'r9']])
  })
})
