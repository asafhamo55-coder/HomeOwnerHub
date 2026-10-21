import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// WCAG 2.2 AA checks on the BL-101 thread-view controls, against the
// server-rendered markup (the repo's component-test pattern: no DOM).

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/inbox/actions', () => ({ setThreadStatus: vi.fn() }))
vi.mock('@/lib/inbox/attachment-file', () => ({ saveAttachmentToDocuments: vi.fn() }))
vi.mock('@/lib/inbox/attachment-bill', () => ({ scanAttachmentAsBill: vi.fn() }))
vi.mock('@/lib/inbox/saved-replies-actions', () => ({ resolveSavedReply: vi.fn() }))

const { MobileActionBar } = await import('./MobileActionBar')
const { SaveToDocumentsButton } = await import('./SaveToDocumentsButton')
const { SavedReplyPicker } = await import('./SavedReplyPicker')
const { ScanAsBillButton } = await import('./ScanAsBillButton')

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')
const buttons = (markup: string) => markup.match(/<button\b[^>]*>/g) ?? []

describe('MobileActionBar', () => {
  const markup = html(<MobileActionBar threadId="t1" hasDraft status="open" afterCloseHref="/inbox" />)

  it('gives every thumb-bar action a 44px target, not the 32px of size sm', () => {
    const tags = buttons(markup)
    expect(tags).toHaveLength(4)
    for (const tag of tags) {
      expect(tag).toMatch(/\bh-11\b/)
      expect(tag).not.toMatch(/\bh-8\b/)
    }
  })

  it('stacks icon over label so "Approve" fits a quarter of a 375px screen (was clipped)', () => {
    for (const tag of buttons(markup)) {
      expect(tag).toMatch(/\bflex-col\b/)
      expect(tag).toMatch(/\btext-xs\b/)
      expect(tag).toMatch(/\bpx-1\b/)
      expect(tag).not.toMatch(/\bpx-3\b/)
      expect(tag).not.toMatch(/\btext-sm\b/)
    }
  })
})

describe('SaveToDocumentsButton', () => {
  it('has an accessible name that starts with its visible label (2.5.3 Label in Name)', () => {
    const markup = html(<SaveToDocumentsButton attachmentId="a1" fileName="gate-quote.pdf" />)
    const label = markup.match(/aria-label="([^"]+)"/)?.[1]
    expect(markup).toContain('Save to documents')
    expect(label).toBe('Save to documents: gate-quote.pdf')
  })
})

describe('ScanAsBillButton', () => {
  it('has an accessible name that starts with its visible label (2.5.3 Label in Name)', () => {
    const markup = html(<ScanAsBillButton attachmentId="a1" fileName="invoice-42.pdf" />)
    expect(markup).toContain('Scan as a bill')
    expect(markup.match(/aria-label="([^"]+)"/)?.[1]).toBe('Scan as a bill: invoice-42.pdf')
  })
})

describe('SavedReplyPicker', () => {
  const markup = html(<SavedReplyPicker threadId="t1" />)

  it('mounts its status live region before there is anything to say', () => {
    // A region inserted together with its text is often not announced.
    expect(markup).toMatch(/<p[^>]*aria-live="polite"[^>]*><\/p>/)
  })

  it('is a collapsed disclosure until opened', () => {
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('aria-controls')
  })
})
