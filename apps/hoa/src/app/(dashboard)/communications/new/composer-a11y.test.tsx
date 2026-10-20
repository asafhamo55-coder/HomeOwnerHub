import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// WCAG 2.2 AA checks on the BL-102 composer's preview and autosave status,
// against server-rendered markup (no DOM in this harness).

;(globalThis as { React?: typeof React }).React = React

vi.mock('@/lib/communications/preview-actions', () => ({ previewForSample: vi.fn(), sendTestToMe: vi.fn() }))

const { PhonePreview } = await import('./PhonePreview')
const { DraftStatus } = await import('./DraftStatus')

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

describe('PhonePreview channel tabs', () => {
  const markup = html(
    <PhonePreview
      audience={null}
      subject="Water shut-off"
      bodyHtml="<p>Thursday</p>"
      spanish={null}
      showText
      showPortal
      disabled={false}
    />,
  )
  const tabs = markup.match(/<button[^>]*role="tab"[^>]*>/g) ?? []

  it('is a tablist whose tabs control a labelled tabpanel', () => {
    expect(markup).toContain('role="tablist"')
    expect(tabs).toHaveLength(3)
    const panelId = markup.match(/<div id="([^"]+)" role="tabpanel"/)?.[1]
    expect(panelId).toBeTruthy()
    for (const tab of tabs) expect(tab).toContain(`aria-controls="${panelId}"`)
    const selectedId = tabs.find((t) => t.includes('aria-selected="true"'))?.match(/id="([^"]+)"/)?.[1]
    expect(markup).toContain(`aria-labelledby="${selectedId}"`)
  })

  it('uses a roving tabindex: only the selected tab is in the tab order', () => {
    expect(tabs.filter((t) => t.includes('tabindex="0"'))).toHaveLength(1)
    expect(tabs.filter((t) => t.includes('tabindex="-1"'))).toHaveLength(2)
    expect(tabs.find((t) => t.includes('tabindex="0"'))).toContain('aria-selected="true"')
  })

  it('puts the selected tab’s text in the token made for a primary fill', () => {
    // `text-primary-foreground` is not a class in this design system, so the
    // label fell back to body text on blue: below 4.5:1 in both themes.
    const selected = tabs.find((t) => t.includes('aria-selected="true"'))!
    expect(selected).toMatch(/\bbg-primary\b/)
    expect(selected).toMatch(/\btext-primary-fg\b/)
    expect(markup).not.toContain('text-primary-foreground')
  })
})

describe('DraftStatus live region', () => {
  it('keeps the ticking "N seconds ago" out of the announcement', () => {
    const markup = html(<DraftStatus state={{ kind: 'saved', at: Date.now() }} />)
    expect(markup).toMatch(/role="status"[^>]*aria-live="polite"/)
    expect(markup).toMatch(/Draft saved <span aria-hidden="true">just now<\/span>/)
  })

  it('does not announce every autosave start', () => {
    const markup = html(<DraftStatus state={{ kind: 'saving' }} />)
    expect(markup).toMatch(/<span aria-hidden="true"[^>]*>.*Saving draft…<\/span>/)
  })

  it('still announces a failed save', () => {
    const markup = html(<DraftStatus state={{ kind: 'error', message: 'Couldn’t save the draft.' }} />)
    expect(markup).not.toMatch(/aria-hidden="true"[^>]*>[^<]*Couldn/)
    expect(markup).toContain('Couldn’t save the draft.')
  })
})
