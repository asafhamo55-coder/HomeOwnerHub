import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SpanishVersion, englishKey } from './SpanishVersion'

// BL-146: the Spanish body is edited in PlainEditor (like the English), not
// a monospace HTML textarea, and the "I've read" tick stays. Server-
// rendered (no DOM in this harness).

;(globalThis as { React?: typeof React }).React = React

const noop = () => {}
const SUBJECT = 'Water shut-off'
const BODY = '<p>Thursday</p>'

function render(over: Partial<React.ComponentProps<typeof SpanishVersion>['value'] & object> = {}, error?: string) {
  const value = {
    subject: 'Corte de agua',
    bodyHtml: '<p>Hola {{ resident_name }},</p><p>El jueves.</p>',
    viewed: false,
    sourceKey: englishKey(SUBJECT, BODY),
    ...over,
  }
  return renderToStaticMarkup(
    <SpanishVersion subject={SUBJECT} bodyHtml={BODY} value={value} onChange={noop} error={error} />,
  ).replace(/<!-- -->/g, '')
}

describe('SpanishVersion', () => {
  it('edits the body in the plain editor, with its own accessible name', () => {
    const html = render()
    expect(html).toContain('role="toolbar"')
    expect(html).toContain('aria-label="Spanish message body"')
    // Plain text, not HTML tags, in the box.
    expect(html).toContain('El jueves.')
    expect(html).not.toMatch(/<textarea[^>]*font-mono/)
    expect(html).not.toContain('&lt;p&gt;')
  })

  it('a body the plain editor cannot hold falls back to HTML, still labelled as Spanish', () => {
    const html = render({ bodyHtml: '<table><tr><td>x</td></tr></table>' })
    expect(html).toContain('aria-label="Spanish message body (HTML)"')
  })

  it('keeps the "I\'ve read" tick, unticked until the board confirms', () => {
    const html = render()
    expect(html).toContain('I&#x27;ve read the Spanish version')
    const tick = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []
    expect(tick).toHaveLength(1)
    expect(tick[0]).not.toContain('checked=""')
    expect(render({ viewed: true }).match(/<input[^>]*type="checkbox"[^>]*>/)?.[0]).toContain('checked=""')
  })

  it('shows the send-blocking error next to the tick', () => {
    expect(render({}, 'Confirm you have read the Spanish version.')).toContain('role="alert"')
  })
})
