import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ canSend: true }))

vi.mock('next/link', () => ({
  default: (p: { children?: unknown; href: string; className?: string }) => <a href={p.href} className={p.className}>{p.children as never}</a>,
}))
vi.mock('@/lib/meetings/notice-queries', () => ({
  loadMeetingNoticeStatus: vi.fn(async () => ({ check: null, latest: null, canSend: h.canSend })),
}))

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as { React?: unknown }).React = React
import { MeetingNoticeSection } from './MeetingNoticeSection'

const MEETING = { id: '11111111-2222-4333-8444-555555555555', meetingDate: '2026-12-10', meetingType: 'annual', status: 'draft' }

beforeEach(() => {
  h.canSend = true
})

describe('MeetingNoticeSection print button', () => {
  it('links to the print page with a 44px target and plain words', async () => {
    const html = renderToStaticMarkup(await MeetingNoticeSection({ meeting: MEETING }))
    expect(html).toContain(`href="/meetings/${MEETING.id}/notice"`)
    expect(html).toContain('Print notice to post')
    expect(html).toContain('min-h-12')
    expect(html).not.toContain('—')
  })

  it('is not offered once the meeting cannot be noticed', async () => {
    h.canSend = false
    const html = renderToStaticMarkup(await MeetingNoticeSection({ meeting: MEETING }))
    expect(html).not.toContain('Print notice to post')
  })
})
