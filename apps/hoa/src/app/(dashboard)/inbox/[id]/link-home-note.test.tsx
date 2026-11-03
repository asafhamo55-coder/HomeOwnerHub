import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

const { LinkHomeNote } = await import('./LinkHomeNote')

describe('LinkHomeNote', () => {
  it('says to link the message to a home, in 14px text, with a way to do it', () => {
    const markup = renderToStaticMarkup(<LinkHomeNote />).replace(/<!-- -->/g, '')
    expect(markup).toContain('Link this message to a home for better drafts')
    expect(markup).toContain('text-sm')
    expect(markup).not.toContain('text-xs')
    expect(markup).toContain('href="#thread-context"')
  })
})
