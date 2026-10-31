import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

const { DeadlineChips } = await import('./DeadlineChips')
const { titleFromParam, deadlineTitles } = await import('./deadline-chips')

describe('DeadlineChips', () => {
  it('renders the five chips with encoded links', () => {
    const html = renderToStaticMarkup(<DeadlineChips state="FL" />)
    expect(html).toContain('Common deadlines')
    expect(html).toContain('href="/events/new?title=Annual%20meeting"')
    expect(html).toContain('href="/events/new?title=Audit%20or%20financial%20review"')
    expect(html.match(/<a /g)).toHaveLength(5)
  })

  it('shows the Georgia chip only for GA', () => {
    expect(renderToStaticMarkup(<DeadlineChips state="GA" />)).toContain(
      'href="/events/new?title=Georgia%20annual%20registration"',
    )
    expect(renderToStaticMarkup(<DeadlineChips state="ga" />)).toContain('Georgia annual registration')
    for (const s of ['FL', null, undefined, '']) {
      expect(deadlineTitles(s)).not.toContain('Georgia annual registration')
    }
  })
})

describe('titleFromParam', () => {
  it('keeps and trims a plain title', () => {
    expect(titleFromParam('  Annual meeting ')).toBe('Annual meeting')
  })
  it('drops over-long, odd or non-string input', () => {
    expect(titleFromParam('x'.repeat(201))).toBeUndefined()
    expect(titleFromParam('x'.repeat(200))).toHaveLength(200)
    expect(titleFromParam('<script>alert(1)</script>')).toBeUndefined()
    expect(titleFromParam('a\nb')).toBeUndefined()
    expect(titleFromParam('   ')).toBeUndefined()
    expect(titleFromParam(['a', 'b'])).toBeUndefined()
    expect(titleFromParam(undefined)).toBeUndefined()
  })
})

describe('new event page', () => {
  it('prefills the form title from ?title= and drops bad input', async () => {
    vi.resetModules()
    vi.doMock('@/lib/events', () => ({ listEventNotifyProperties: async () => [] }))
    vi.doMock('./EventForm', () => ({
      EventForm: ({ defaultTitle }: { defaultTitle?: string }) => <i data-t={defaultTitle ?? ''} />,
    }))
    vi.doMock('@homeowner-portal/ui', () => ({
      Page: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }))
    const { default: NewEventPage } = await import('./new/page')
    const render = async (title: string | string[] | undefined) =>
      renderToStaticMarkup(await NewEventPage({ searchParams: Promise.resolve({ title }) }))
    expect(await render('Insurance renewal')).toContain('data-t="Insurance renewal"')
    expect(await render('x'.repeat(201))).toContain('data-t=""')
    expect(await render('<b>hi</b>')).toContain('data-t=""')
  })
})
