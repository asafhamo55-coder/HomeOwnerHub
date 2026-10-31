import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

const m = vi.hoisted(() => ({ ticket: vi.fn() }))

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next/link', () => ({ default: (p: { children?: React.ReactNode }) => p.children }))
vi.mock('@/lib/tickets', () => ({ getTicketForBoard: m.ticket, listTicketActionItems: async () => [] }))
vi.mock('@/lib/submission-attachments', () => ({ listSubmissionAttachments: async () => [] }))
vi.mock('@/components/attachments/SubmissionAttachments', () => ({ SubmissionAttachments: () => null }))
vi.mock('./TicketReplyForm', () => ({ TicketReplyForm: () => <div>REPLY-BOX</div> }))
vi.mock('./TicketStatusEditor', () => ({ TicketStatusEditor: () => null }))
vi.mock('./TicketActionItems', () => ({ TicketActionItems: () => null }))
vi.mock('./TicketActions', () => ({ TicketActions: () => null }))

const { default: Page } = await import('./page')

const params = { params: Promise.resolve({ id: 't1' }) }
const ticket = {
  id: 't1', unit_id: null, unit_number: null, submitted_by: 'p', submitter_name: 'Rae', submitter_email: null,
  category: 'other', subject: 'Leak', description: 'Water everywhere', status: 'open', priority: 'normal',
  created_at: '2026-01-01T00:00:00Z', closed_at: null, closed_by: null,
  messages: [{ id: 'm1', author_id: 'a', author_role: 'board', author_name: 'Bo', body: 'Board reply text', internal: false, created_at: '2026-01-02T00:00:00Z' }],
}

beforeEach(() => vi.clearAllMocks())

describe('board ticket page', () => {
  it('success renders the thread and the reply box', async () => {
    m.ticket.mockResolvedValue({ ok: true, ticket, messagesFailed: false })
    const html = renderToStaticMarkup(await Page(params))
    expect(html).toContain('Board reply text')
    expect(html).toContain('REPLY-BOX')
    expect(html).not.toContain('Couldn’t load')
  })
  it('a real miss is notFound', async () => {
    m.ticket.mockResolvedValue({ ok: false, reason: 'not_found' })
    await expect(Page(params)).rejects.toThrow('NEXT_NOT_FOUND')
  })
  it('a failed ticket read is LoadFailed with retry, not a 404', async () => {
    m.ticket.mockResolvedValue({ ok: false, reason: 'error' })
    const html = renderToStaticMarkup(await Page(params))
    expect(html).toContain('Couldn’t load this ticket')
    expect(html).toContain('Try again')
  })
  it('failed messages show the ticket with a notice and no reply box', async () => {
    m.ticket.mockResolvedValue({ ok: true, ticket: { ...ticket, messages: [] }, messagesFailed: true })
    const html = renderToStaticMarkup(await Page(params))
    expect(html).toContain('Water everywhere')
    expect(html).toContain('Couldn’t load the conversation')
    expect(html).not.toContain('REPLY-BOX')
    expect(html).not.toContain('No replies yet')
  })
})
