import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React, { createElement } from 'react'

;(globalThis as { React?: unknown }).React = React

import { SummaryStrip } from './SummaryStrip'
import { APPROVAL_SOURCES, buildInbox, type ApprovalSource, type InboxItem, type InboxSection } from '@/lib/approvals-inbox/model'

function sec(source: ApprovalSource, createdAt: string, n: number): InboxSection {
  const items: InboxItem[] = Array.from({ length: n }, (_, i) => ({
    source, id: `${source}${i}`, title: 't', detail: null, amount: null, amountNote: null, createdAt, reasoning: null, citations: [], confidenceLabel: null, href: '/x', decision: null,
  }))
  return { source, ok: true, items, total: n }
}
/** Every source present (empty unless given), as the page loads them. */
function all(given: InboxSection[]): InboxSection[] {
  return APPROVAL_SOURCES.map((src) => given.find((g) => g.source === src) ?? { source: src, ok: true as const, items: [], total: 0 })
}
const NOW = new Date('2026-10-30T16:00:00Z')

describe('SummaryStrip', () => {
  it('renders the waiting count, oldest wait and AI share', () => {
    const sections = all([sec('w3', '2026-10-25T15:00:00Z', 2), sec('contact', '2026-10-29T15:00:00Z', 2)])
    const html = renderToStaticMarkup(createElement(SummaryStrip, { inbox: buildInbox(sections, 'all'), sections, timeZone: 'America/New_York', now: NOW }))
    expect(html).toContain('data-testid="approvals-summary"')
    expect(html).toContain('Waiting now')
    expect(html).toMatch(/>4</)
    expect(html).toContain('5 days')
    expect(html).toContain('50%')
    expect(html).toContain('2 of 4 waiting items')
  })

  it('shows a dash, not zero, when a source failed', () => {
    const sections: InboxSection[] = [sec('w3', '2026-10-25T15:00:00Z', 1), { source: 'bill', ok: false }]
    const html = renderToStaticMarkup(createElement(SummaryStrip, { inbox: buildInbox(sections, 'all'), sections, timeZone: 'America/New_York', now: NOW }))
    expect(html).toContain('Some sections didn’t load')
    expect(html).not.toContain('0%')
  })

  it('shows loading tiles while the sources load', () => {
    const html = renderToStaticMarkup(createElement(SummaryStrip, { inbox: null, sections: [], timeZone: 'America/New_York' }))
    expect(html).toContain('Loading Waiting now')
  })
})
