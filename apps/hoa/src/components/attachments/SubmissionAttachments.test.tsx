import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/submission-attachments', () => ({ deleteSubmissionAttachment: vi.fn() }))
vi.mock('@/lib/upload-attachment', () => ({ uploadAttachmentDirect: vi.fn() }))

const { SubmissionAttachments } = await import('./SubmissionAttachments')

const a = (id: string, signedUrl: string | null) => ({
  id, fileName: `${id}.pdf`, contentType: 'application/pdf', sizeBytes: 10,
  uploadedByRole: 'board' as const, createdAt: 'c', signedUrl,
})
const render = (attachments: Parameters<typeof SubmissionAttachments>[0]['attachments']) =>
  renderToStaticMarkup(<SubmissionAttachments threadType="ticket" parentId="p" attachments={attachments} />)

describe('SubmissionAttachments', () => {
  it('a failed list says so and is not the empty state', () => {
    const html = render(null)
    expect(html).toContain('Couldn’t load attachments')
    expect(html).toContain('Try again')
    expect(html).not.toContain('No documents attached yet')
  })
  it('an empty list is the empty state', () => {
    const html = render([])
    expect(html).toContain('No documents attached yet')
    expect(html).not.toContain('Couldn’t load')
  })
  it('a file without a URL shows Link unavailable and keeps the others linked', () => {
    const html = render([a('good', 'https://signed/good'), a('bad', null)])
    expect(html).toContain('Link unavailable')
    expect(html.match(/href="/g)).toHaveLength(1)
    expect(html).toContain('https://signed/good')
    expect(html).toContain('bad.pdf')
  })
})
