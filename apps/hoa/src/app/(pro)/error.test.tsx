import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import React, { createElement } from 'react'

;(globalThis as { React?: unknown }).React = React

const h = vi.hoisted(() => ({ captured: [] as unknown[] }))
vi.mock('@sentry/nextjs', () => ({ captureException: (e: unknown) => h.captured.push(e) }))
vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  useEffect: (fn: () => void) => fn(),
}))

const { default: ProError } = await import('./error')

beforeEach(() => {
  h.captured = []
})

describe('(pro) error boundary', () => {
  it('renders a Try again button and a support address, without the error message', () => {
    const err = Object.assign(new Error('secret db detail'), { digest: 'abc123' })
    const html = renderToStaticMarkup(createElement(ProError, { error: err, reset: () => {} }))
    expect(html).toContain('Try again')
    expect(html).toContain('This page didn')
    expect(html).toContain('mailto:support@')
    expect(html).toContain('abc123')
    expect(html).not.toContain('secret db detail')
    expect(h.captured).toHaveLength(1)
  })
})
