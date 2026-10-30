import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { statusChips } from './status-chips'
import { StatusChips } from './StatusChips'

;(globalThis as { React?: typeof React }).React = React
vi.mock('next/link', () => ({
  default: ({ href, children, prefetch: _p, ...rest }: { href: string; children: React.ReactNode; prefetch?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))

const vals = (c: ReturnType<typeof statusChips>) => c.map((x) => `${x.key}=${x.value}`)

describe('statusChips', () => {
  it('shows on states and links to each card', () => {
    const c = statusChips({
      consent: { granted: true } as never,
      texts: { optIn: true },
      language: { ok: true, language: 'es', otherOrg: false },
    })
    expect(vals(c)).toEqual(['notices=On', 'texts=On', 'language=Español'])
    expect(c.map((x) => x.href)).toEqual(['#e-notices', '#text-messages', '#message-language'])
  })
  it('shows off states', () => {
    const c = statusChips({
      consent: { granted: false } as never,
      texts: { optIn: false },
      language: { ok: true, language: 'en', otherOrg: false },
    })
    expect(vals(c)).toEqual(['notices=Off', 'texts=Off', 'language=English'])
  })
  it('treats never chose as off, and no language row as both', () => {
    const c = statusChips({ consent: null, texts: { optIn: false }, language: { ok: true, language: null, otherOrg: false } })
    expect(vals(c)).toEqual(['notices=Off', 'texts=Off', 'language=English and Español'])
  })
  it('says Not available on a failed read, never Off', () => {
    const c = statusChips({ consent: 'failed', texts: 'failed', language: { ok: false } })
    expect(vals(c)).toEqual(['notices=Not available', 'texts=Not available', 'language=Not available'])
  })
  it('omits chips for cards the page does not show', () => {
    expect(statusChips({ consent: undefined, texts: null, language: null })).toEqual([])
    const html = renderToStaticMarkup(<StatusChips chips={statusChips({ consent: undefined, texts: { optIn: true }, language: null })} />)
    expect(html).toContain('href="#text-messages"')
    expect(html).not.toContain('#e-notices')
    expect(renderToStaticMarkup(<StatusChips chips={[]} />)).toBe('')
  })
})
