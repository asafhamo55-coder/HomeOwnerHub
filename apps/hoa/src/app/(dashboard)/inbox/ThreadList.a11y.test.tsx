import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ThreadList } from './ThreadList'
import type { ThreadListItem } from '@/lib/inbox/queries'

;(globalThis as { React?: typeof React }).React = React

describe('ThreadList', () => {
  it('exposes the attachment paperclip as a named image, not a bare svg with aria-label', () => {
    const thread = {
      id: 't1',
      subject: 'Gate quote',
      fromName: 'Pat',
      fromEmail: null,
      hasAttachments: true,
      unitId: null,
      matchConfidence: null,
      lastMessageAt: null,
      snippet: null,
      assignedTo: null,
      gmailState: 'active',
    } as unknown as ThreadListItem
    const markup = renderToStaticMarkup(<ThreadList threads={[thread]} filter={'all' as never} now={0} />)
    const svg = markup.match(/<svg\b[^>]*aria-label="Has attachments"[^>]*>/)?.[0] ?? ''
    expect(svg).toMatch(/role="img"/)
  })
})
