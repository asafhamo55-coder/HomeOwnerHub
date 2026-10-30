import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React, { createElement } from 'react'

// The component files use the classic JSX runtime under vitest.
;(globalThis as { React?: unknown }).React = React

// The dialog is the only send path. Stubbed so nothing can be sent here; the
// stub just records what the group button hands it.
const dialogProps: { emails: string[] | null; label: string }[] = []
vi.mock('./SendRemindersDialog', () => ({
  SendRemindersDialog: (p: { emails: string[] | null; label: string }) => {
    dialogProps.push(p)
    return createElement('button', { 'data-testid': 'dialog' }, p.label)
  },
}))

import { AgingFilter, agingHref } from './AgingFilter'
import { summarizeAging } from '@/lib/dues/aging'

const summary = summarizeAging([
  { bucket: 'current', amount: 100 },
  { bucket: '1-30', amount: 250.5 },
  { bucket: '1-30', amount: 100 },
  { bucket: '90+', amount: 900 },
])

describe('AgingFilter', () => {
  it('renders a count and dollar total for every bucket', () => {
    const html = renderToStaticMarkup(createElement(AgingFilter, { summary, selected: null, selectedEmails: [] }))
    expect(html).toContain('Filter by how late')
    expect(html).toContain('Current')
    expect(html).toContain('1–30 days')
    expect(html).toContain('31–60 days')
    expect(html).toContain('61–90 days')
    expect(html).toContain('Over 90 days')
    expect(html).toContain('$350.50')
    expect(html).toContain('$900.00')
    expect(html).toContain('$0.00')
    // "All" chip carries the total owner count (4).
    expect(html).toMatch(/All<\/span><span class="num[^"]*">4</)
  })

  it('links chips through the aging search param and marks the active one', () => {
    const html = renderToStaticMarkup(createElement(AgingFilter, { summary, selected: '1-30', selectedEmails: ['a@x.com'] }))
    expect(html).toContain('href="/dues?aging=1-30"')
    expect(html).toContain('href="/dues"')
    expect(html).toContain('href="/dues?aging=90%2B"')
    expect((html.match(/aria-current="true"/g) ?? []).length).toBe(1)
    expect(agingHref(null)).toBe('/dues')
  })

  it('hands the selected bucket emails to the reminders dialog', () => {
    dialogProps.length = 0
    const html = renderToStaticMarkup(
      createElement(AgingFilter, { summary, selected: '1-30', selectedEmails: ['a@x.com', 'b@x.com'] }),
    )
    expect(dialogProps).toHaveLength(1)
    expect(dialogProps[0].emails).toEqual(['a@x.com', 'b@x.com'])
    expect(html).toContain('Remind this group (2)')
  })

  it('shows no group button for All or for an empty bucket', () => {
    dialogProps.length = 0
    renderToStaticMarkup(createElement(AgingFilter, { summary, selected: null, selectedEmails: [] }))
    renderToStaticMarkup(createElement(AgingFilter, { summary, selected: '31-60', selectedEmails: [] }))
    expect(dialogProps).toHaveLength(0)
  })

  it('renders zero counts for an all-paid association', () => {
    const html = renderToStaticMarkup(
      createElement(AgingFilter, { summary: summarizeAging([]), selected: null, selectedEmails: [] }),
    )
    expect(html).not.toContain('Remind this group')
    expect(html).toMatch(/>0</)
  })
})
