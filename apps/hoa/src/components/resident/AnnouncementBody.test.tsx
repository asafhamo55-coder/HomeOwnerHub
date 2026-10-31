import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnnouncementBody } from './AnnouncementBody'

;(globalThis as { React?: typeof React }).React = React

describe('AnnouncementBody', () => {
  it('short body has no toggle', () => {
    const out = renderToStaticMarkup(<AnnouncementBody body="Pool closes Friday." />)
    expect(out).not.toContain('Read more')
    expect(out).not.toContain('aria-expanded')
  })
  it('long body is clamped with a collapsed toggle', () => {
    const out = renderToStaticMarkup(<AnnouncementBody body={'word '.repeat(100)} />)
    expect(out).toContain('line-clamp-6')
    expect(out).toContain('aria-expanded="false"')
    expect(out).toContain('Read more')
  })
})
