import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Classic JSX runtime under the root vitest config — needs a global React.
;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, onClick: _onClick, ...rest }: { href: string; children: React.ReactNode; onClick?: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}))

const { AskGuideResult, ASK_FOOTER } = await import('./AskGuideResult')
const { AskGuide } = await import('./AskGuide')

const render = (el: React.ReactElement) => renderToStaticMarkup(el)

const answer = {
  kind: 'answer' as const,
  answer: 'To record a check:\n1. Open Dues from the sidebar. [1]\n2. Select [[Mark paid]] on the row. [1]\n3. Confirm. [2]',
  citations: [
    { articleId: 'dues-record-payment', title: 'Record a payment by check or cash', sectionHeading: 'Steps', href: '/help/dues-record-payment#steps' },
    { articleId: 'dues-record-payment', title: 'Record a payment by check or cash', sectionHeading: 'Good to know', href: '/help/dues-record-payment#good-to-know' },
  ],
  takeMeThere: { label: 'Record a payment by check or cash', href: '/dues' },
}
const suggestions = [
  { articleId: 'dues-record-payment', title: 'Record a payment by check or cash', summary: 'Mark a dues charge paid.', href: '/help/dues-record-payment' },
  { articleId: 'dues-generate-monthly', title: "Bill this month's dues", summary: 'Generate dues.', href: '/help/dues-generate-monthly' },
]

describe('AskGuideResult', () => {
  it('answer: numbered steps, control chips, citation chips that are real links, Take me there', () => {
    const html = render(<AskGuideResult result={answer} />)
    expect(html).toContain('data-ask-state="answer"')
    expect(html).toMatch(/<ol[^>]*>.*Open Dues from the sidebar/)
    expect(html).toContain('>Mark paid<')
    expect(html).toContain('href="/help/dues-record-payment#steps"')
    expect(html).toContain('href="/help/dues-record-payment#good-to-know"')
    expect(html).toMatch(/<a href="\/dues"[^>]*>Take me there/)
    expect(ASK_FOOTER).toMatch(/^Answers come only from the HomeownerHub guide/)
    expect(html).toContain('Answers come only from the HomeownerHub guide')
    expect(html).not.toContain('[1]')
    expect(html).not.toContain('[[')
  })

  it('answer without a deep link renders no Take me there', () => {
    expect(render(<AskGuideResult result={{ ...answer, takeMeThere: null }} />)).not.toContain('Take me there')
  })

  it('refusal: says the guide does not cover it and lists the closest articles', () => {
    const html = render(<AskGuideResult result={{ kind: 'not_covered', suggestions }} />)
    expect(html).toContain('data-ask-state="not_covered"')
    expect(html).toContain('The guide doesn’t cover that yet')
    expect(html).toContain('Closest articles')
    expect(html).toContain('href="/help/dues-generate-monthly"')
    expect(html).not.toContain('Take me there')
  })

  it('rules question: offers Ask the Docs at the role-correct page', () => {
    const html = render(<AskGuideResult result={{ kind: 'rules_question', askDocsHref: '/resident/ask' }} />)
    expect(html).toContain('data-ask-state="rules_question"')
    expect(html).toMatch(/<a href="\/resident\/ask"[^>]*>Ask the Docs/)
  })

  it('model unavailable: shows the matching articles instead', () => {
    const html = render(<AskGuideResult result={{ kind: 'unavailable', suggestions }} />)
    expect(html).toContain('data-ask-state="unavailable"')
    expect(html).toContain('Ask the guide isn’t available right now')
    expect(html).toContain('Matching articles')
    expect(html).toContain('href="/help/dues-record-payment"')
  })
})

describe('AskGuide', () => {
  it('renders the question box with a polite live region', () => {
    const html = render(<AskGuide />)
    expect(html).toContain('Ask the guide')
    expect(html).toMatch(/<textarea[^>]*maxLength="500"/)
    expect(html).toContain('aria-live="polite"')
    expect(html).toMatch(/<button(?=[^>]*type="submit")(?=[^>]*disabled)/)
  })

  it('renders a finished state in the live region', () => {
    const html = render(<AskGuide compact heading="Ask about this page" initialState={{ status: 'done', result: answer }} />)
    expect(html).toContain('Ask about this page')
    expect(html).toContain('data-ask-state="answer"')
  })

  it('a failed request shows the error, not an empty box', () => {
    const html = render(<AskGuide initialState={{ status: 'failed', message: 'Couldn’t ask the guide just now.' }} />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Couldn’t ask the guide just now.')
  })
})
