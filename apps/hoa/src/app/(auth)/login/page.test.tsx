import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
vi.mock('./LoginView', () => ({ LoginView: () => null }))

import * as React from 'react'
import LoginPage from './page'

// The vitest JSX transform here is the classic one; the page only needs React at call time.
;(globalThis as { React?: unknown }).React = React

// BL-175a H6: the ?redirect= handed to the client form is sanitised.
async function redirectProp(redirect?: string) {
  const el = (await LoginPage({ searchParams: Promise.resolve({ redirect }) })) as {
    props: { redirect?: string }
  }
  return el.props.redirect
}

describe('LoginPage ?redirect=', () => {
  it.each(['javascript:alert(1)', '//evil.com', 'https://evil.com'])('collapses %s to /', async (v) => {
    expect(await redirectProp(v)).toBe('/')
  })

  it('keeps a same-site path and leaves an absent redirect absent', async () => {
    expect(await redirectProp('/dues')).toBe('/dues')
    expect(await redirectProp(undefined)).toBeUndefined()
  })
})
