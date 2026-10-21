import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// resident-ask--*.png (2026-10-20 prod ui-shots) showed the sample
// questions run together: "How many pets can I have?,When are dues due?,".
// The ", " sat inside each button, whose trailing space a button trims.

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}))
vi.mock('@/components/ai/AiRewriteButton', () => ({ AiRewriteButton: () => null }))
vi.mock('@/lib/api/client', () => ({ responseErrorMessage: vi.fn() }))

const { AskDocsClient } = await import('./AskDocsClient')

describe('AskDocsClient sample questions', () => {
  const markup = renderToStaticMarkup(<AskDocsClient />).replace(/<!-- -->/g, '')

  it('separates the questions outside the buttons, with a space after each comma', () => {
    expect(markup).not.toMatch(/,\s*<\/button>/)
    expect(markup).toMatch(/\?<\/button>, <button/)
  })
})
