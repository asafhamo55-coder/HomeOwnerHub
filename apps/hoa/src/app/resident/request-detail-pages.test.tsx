import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

const m = vi.hoisted(() => ({
  ticket: vi.fn(),
  arc: vi.fn(),
  report: vi.fn(),
  home: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/lib/resident-tickets', () => ({ getMyTicket: m.ticket }))
vi.mock('@/lib/resident-submissions', () => ({ getMyArcRequest: m.arc, getMyViolationReport: m.report }))
vi.mock('@/lib/violation-response-load', () => ({ loadMyHomeViolation: m.home }))
vi.mock('@/lib/submission-attachments', () => ({ listSubmissionAttachments: async () => [] }))
vi.mock('@/components/attachments/SubmissionAttachments', () => ({ SubmissionAttachments: () => null }))
vi.mock('@/components/resident/ReplyComposer', () => ({ ReplyComposer: () => null }))
vi.mock('./arc/[id]/WithdrawArcButton', () => ({ WithdrawArcButton: () => null }))
vi.mock('./violations/[id]/HomeViolationView', () => ({ HomeViolationView: () => null }))

// Imported after the React global is set: the pages use the classic JSX runtime.
const { default: TicketPage } = await import('./tickets/[id]/page')
const { default: ArcPage } = await import('./arc/[id]/page')
const { default: ViolationPage } = await import('./violations/[id]/page')

const params = { params: Promise.resolve({ id: 'abc' }) }
const msg = { id: 'm1', author_role: 'board', author_name: null, body: 'Board reply text', created_at: '2026-01-02T00:00:00Z' }

const ticket = { id: 't1', subject: 'Leak', description: 'd', status: 'open', category: 'other', priority: 'normal', created_at: '2026-01-01T00:00:00Z', closed_at: null, messages: [msg] }
const arc = {
  id: 'a1', unit_id: 'u', category: 'other', summary: 'Fence', scope_description: 's', proposed_start: null, proposed_completion: null,
  contractor_name: null, contractor_license: null, status: 'submitted', board_response: null, board_response_at: null,
  submitted_at: '2026-01-01T00:00:00Z', messages: [msg],
}
const report = { id: 'r1', category: 'other', description: 'd', about_address: null, occurred_at: null, status: 'submitted', submitted_at: '2026-01-01T00:00:00Z', messages: [msg] }

beforeEach(() => vi.clearAllMocks())

const pages = [
  { name: 'ticket', Page: TicketPage, mock: m.ticket, key: 'ticket', row: ticket },
  { name: 'ARC', Page: ArcPage, mock: m.arc, key: 'request', row: arc },
  { name: 'violation report', Page: ViolationPage, mock: m.report, key: 'report', row: report },
] as const

describe.each(pages)('$name detail page', ({ Page, mock, key, row }) => {
  it('success renders the thread, no failure notice', async () => {
    mock.mockResolvedValue({ ok: true, [key]: row, messagesFailed: false })
    const html = renderToStaticMarkup(await Page(params))
    expect(html).toContain('Board reply text')
    expect(html).not.toContain('Couldn’t load')
  })

  it('a real miss is notFound', async () => {
    mock.mockResolvedValue({ ok: false, reason: 'not_found' })
    m.home.mockResolvedValue({ ok: false, reason: 'not_found' })
    await expect(Page(params)).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('a failed parent read is LoadFailed with retry, not a 404', async () => {
    mock.mockResolvedValue({ ok: false, reason: 'error' })
    const html = renderToStaticMarkup(await Page(params))
    expect(html).toContain('Couldn’t load')
    expect(html).toContain('Try again')
  })

  it('a failed messages read shows the request with a replies notice, not an empty thread', async () => {
    mock.mockResolvedValue({ ok: true, [key]: { ...row, messages: [] }, messagesFailed: true })
    const html = renderToStaticMarkup(await Page(params))
    expect(html).toContain('Couldn’t load replies')
    expect(html).not.toContain('No messages yet')
  })
})
