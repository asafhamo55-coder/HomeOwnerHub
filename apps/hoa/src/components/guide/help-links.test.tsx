import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, onClick: _onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))
vi.mock('../dashboard/DismissSetupButton', () => ({ DismissSetupButton: () => React.createElement('button', null, 'Dismiss') }))

const { SetupChecklistCard } = await import('../dashboard/SetupChecklistCard')
const { HowThisWorks } = await import('./HowThisWorks')
const { askGuideCommand, helpArticleCommands } = await import('./palette-help')
const { guideHref } = await import('@/lib/guide')
const { buildSetupChecklist } = await import('@/lib/dashboard/setup-checklist')
const { OPEN_HELP_EVENT } = await import('@/lib/guide/open-help')

const NOTHING = { mailbox: [0], properties: [0, 0], residents: [0, 0], governingDocs: [0], dues: [0], board: [1], association: [0], books: [0], payments: [0], bank: [0] }

afterEach(() => vi.unstubAllGlobals())

describe('setup checklist "How?" links (BL-070)', () => {
  it('every step keeps its own deep link and gains a separate How? link to its article', () => {
    const html = renderToStaticMarkup(<SetupChecklistCard checklist={buildSetupChecklist(NOTHING)} />)
    expect(html.match(/>How\?</g)).toHaveLength(9)
    expect(html).toContain('href="/help/setup-properties-residents"')
    expect(html).toContain('href="/help/dues-generate-monthly"')
    expect(html).toContain('href="/help/members-invite-board"')
    expect(html).toContain('aria-label="How to: Set up dues"')
    // the step links themselves are unchanged
    expect(html).toContain('href="/properties/new"')
    expect(html).toContain('href="/settings/members"')
    // never a link inside a link
    expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<a /s)
  })

  it('completion still comes from data: done steps say Done', () => {
    const html = renderToStaticMarkup(<SetupChecklistCard checklist={buildSetupChecklist({ ...NOTHING, dues: [3] })} />)
    expect(html).toContain('1 of 9 done')
  })
})

describe('"How this works" on empty states', () => {
  it('links to the article help page; guideHref refuses an unknown article', () => {
    const html = renderToStaticMarkup(<HowThisWorks href={guideHref('violations-report-and-letter')} />)
    expect(html).toMatch(/<a [^>]*href="\/help\/violations-report-and-letter"[^>]*>.*How this works/s)
    expect(guideHref('resident-portal-basics', 'resident')).toBe('/resident/help/resident-portal-basics')
    expect(() => guideHref('no-such-article')).toThrow(/unknown guide article/)
  })
})

describe('⌘K help commands', () => {
  it('article titles become Help commands with their keywords', () => {
    const [cmd] = helpArticleCommands([{ id: 'dues-record-payment', title: 'Record a payment by check or cash', href: '/help/dues-record-payment', keywords: ['cheque'] }])
    expect(cmd).toMatchObject({ id: 'help:dues-record-payment', group: 'Help', href: '/help/dues-record-payment', label: 'Record a payment by check or cash' })
    expect(cmd!.keywords).toContain('cheque')
  })

  it('"Ask the guide: <query>" opens the drawer with the question, or falls back to /help without it in the URL', () => {
    const seen: unknown[] = []
    let claimed = true
    vi.stubGlobal('window', {
      dispatchEvent: (e: Event & { detail?: unknown }) => {
        seen.push([e.type, e.detail])
        if (claimed) e.preventDefault()
        return !e.defaultPrevented
      },
    })
    const unhandled = vi.fn()
    const cmd = askGuideCommand('how do I record a check', unhandled)
    expect(cmd.label).toBe('Ask the guide: how do I record a check')
    expect(cmd.href).toBeUndefined()
    cmd.onSelect!()
    expect(seen).toEqual([[OPEN_HELP_EVENT, { question: 'how do I record a check' }]])
    expect(unhandled).not.toHaveBeenCalled()
    claimed = false
    cmd.onSelect!()
    expect(unhandled).toHaveBeenCalledOnce()
  })
})
