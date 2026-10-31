import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CcrNotice } from './CcrNotice'

;(globalThis as { React?: typeof React }).React = React

describe('CcrNotice', () => {
  it('links missing CC&Rs to the governing documents upload', () => {
    const html = renderToStaticMarkup(<CcrNotice status="missing" />)
    expect(html).toContain('href="/documents/governing"')
    expect(html).toContain('Upload your CC&amp;Rs')
  })

  it('shows no warning when CC&Rs exist', () => {
    expect(renderToStaticMarkup(<CcrNotice status="ok" />)).toBe('')
  })

  it('a failed check shows a small note, not the missing warning', () => {
    const html = renderToStaticMarkup(<CcrNotice status="unknown" />)
    expect(html).toContain('couldn&#x27;t check')
    expect(html).not.toContain('Upload your')
  })
})
