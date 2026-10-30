import { describe, expect, it } from 'vitest'
import { composeBilingualHtml } from '@/lib/communications/bilingual'
import {
  ANNOUNCEMENT_PREVIEW_CHARS,
  buildLatestAnnouncement,
  loadLatestAnnouncement,
  truncateFirstLine,
} from './resident-latest-announcement'

const ORG = 'org-1'
const UNITS = [{ unit_id: 'u1', association_name: 'Maple Grove' }]

/** Records every filter so scoping can be asserted; resolves to canned rows. */
function fakeDb(rows: { recipients?: unknown[]; comms?: unknown[]; recipientError?: boolean }) {
  const calls: Array<{ table: string; eq: Array<[string, unknown]>; or: string | null }> = []
  return {
    calls,
    from(table: string) {
      const call = { table, eq: [] as Array<[string, unknown]>, or: null as string | null }
      calls.push(call)
      const q: Record<string, unknown> = {}
      const done = () =>
        Promise.resolve({
          data: table === 'communication_recipients' ? (rows.recipients ?? []) : (rows.comms ?? []),
          error: table === 'communication_recipients' && rows.recipientError ? { message: 'x' } : null,
        })
      q.select = () => q
      q.eq = (c: string, v: unknown) => (call.eq.push([c, v]), q)
      q.or = (f: string) => ((call.or = f), q)
      q.is = () => q
      q.order = () => q
      q.limit = () => done()
      q.in = () => Object.assign(done(), { order: () => done() })
      return q
    },
  }
}

describe('truncateFirstLine', () => {
  it('returns the first non-empty line only', () => {
    expect(truncateFirstLine('\n\n  Pool closes Friday.  \nSecond line')).toBe('Pool closes Friday.')
  })
  it('leaves a short line untouched', () => {
    expect(truncateFirstLine('Short note')).toBe('Short note')
  })
  it('cuts a long line at a word boundary within the limit', () => {
    const out = truncateFirstLine('word '.repeat(80))
    expect(out.length).toBeLessThanOrEqual(ANNOUNCEMENT_PREVIEW_CHARS)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toMatch(/wor…$/)
  })
  it('handles unbroken text and empty input', () => {
    expect(truncateFirstLine('x'.repeat(300)).length).toBe(ANNOUNCEMENT_PREVIEW_CHARS)
    expect(truncateFirstLine('  \n ')).toBe('')
  })
})

describe('loadLatestAnnouncement', () => {
  const identity = { unitIds: ['u1'], userId: 'user-1', email: 'a@b.co' }

  it('scopes both reads to the resident association and identity', async () => {
    const db = fakeDb({
      recipients: [{ communication_id: 'c1', rendered_subject: 'Pool news', unit_id: 'u1', sent_at: '2026-10-01T10:00:00Z' }],
      comms: [{ id: 'c1', subject: 's', body_text: 'Pool closes Friday.\nMore', body_html: '<p>x</p>', sent_at: null, created_at: '2026-10-01T09:00:00Z' }],
    })
    const res = await loadLatestAnnouncement(db, ORG, identity, UNITS)
    expect(res).toEqual({
      ok: true,
      announcement: { id: 'c1', subject: 'Pool news', preview: 'Pool closes Friday.', sentAt: '2026-10-01T10:00:00Z' },
    })
    const rec = db.calls.find((c) => c.table === 'communication_recipients')!
    expect(rec.eq).toContainEqual(['organization_id', ORG])
    expect(rec.or).toContain('unit_id.in.(u1)')
    expect(rec.or).toContain('user_id.eq.user-1')
    const comm = db.calls.find((c) => c.table === 'communications')!
    expect(comm.eq).toContainEqual(['organization_id', ORG])
    expect(comm.eq).toContainEqual(['status', 'sent'])
  })

  it('reads nothing when the reader has no identity or org', async () => {
    const db = fakeDb({})
    expect(await loadLatestAnnouncement(db, ORG, { unitIds: [], userId: null, email: null }, [])).toEqual({ ok: true, announcement: null })
    expect(await loadLatestAnnouncement(db, null, identity, UNITS)).toEqual({ ok: true, announcement: null })
    expect(db.calls).toHaveLength(0)
  })

  it('empty state: no recipient rows gives null, a failed read gives ok:false', async () => {
    expect(await loadLatestAnnouncement(fakeDb({}), ORG, identity, UNITS)).toEqual({ ok: true, announcement: null })
    expect(await loadLatestAnnouncement(fakeDb({ recipientError: true }), ORG, identity, UNITS)).toEqual({ ok: false })
  })
})

describe('buildLatestAnnouncement language', () => {
  const html = composeBilingualHtml({
    englishHtml: '<p>The pool is closed.</p>',
    spanishSubject: 'Piscina cerrada',
    spanishHtml: '<p>La piscina está cerrada.</p>',
  })
  const comm = { id: 'c', subject: 'Pool', body_text: null, body_html: html, sent_at: '2026-10-01T00:00:00Z', created_at: '2026-10-01T00:00:00Z' }
  it('English by default, Spanish when the reader chose it', () => {
    expect(buildLatestAnnouncement(comm, undefined, 'X', null)).toMatchObject({ subject: 'Pool', preview: 'The pool is closed.' })
    expect(buildLatestAnnouncement(comm, undefined, 'X', 'es')).toMatchObject({ subject: 'Piscina cerrada', preview: 'La piscina está cerrada.' })
  })
})
