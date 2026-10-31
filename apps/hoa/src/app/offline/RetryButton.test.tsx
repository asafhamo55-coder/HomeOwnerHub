import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

const { RetryButton } = await import('./RetryButton')

describe('RetryButton', () => {
  it('reloads the current page on click', () => {
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    const el = RetryButton() as React.ReactElement<{ onClick: () => void }>
    el.props.onClick()
    expect(reload).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })

  it('renders a button, not a link to /', () => {
    const html = renderToStaticMarkup(<RetryButton />)
    expect(html).toContain('<button')
    expect(html).not.toContain('href')
  })
})
