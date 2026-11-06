import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/link', () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

import WelcomePage from './page'
import { TRANSCRIPT } from './transcript'

;(globalThis as { React?: typeof React }).React = React

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/'/g, '&#x27;').replace(/"/g, '&quot;')

describe('/welcome page', () => {
  const html = renderToStaticMarkup(<WelcomePage />)

  it('plays the video inline with a poster and no caption track (captions are burned in)', () => {
    expect(html).toContain('src="/welcome/welcome.mp4"')
    expect(html).toContain('poster="/welcome/poster.jpg"')
    expect(html).toMatch(/playsinline/i)
    expect(html).not.toContain('<track')
  })

  it('carries the HomeownerHub logo with alt text', () => {
    expect(html).toContain('src="/brand/logo-full.svg"')
    expect(html).toContain('alt="HomeownerHub"')
  })

  it('lists the steps in words and offers a sign-in button', () => {
    expect(html).toContain('Add to Home Screen')
    expect(html).toContain('Install app')
    expect(html).toContain('Pay your dues')
    expect(html).toContain('The Pay screen shows the ways your board accepts payment')
    expect(html).toContain('may say Log in instead')
    expect(html).toContain('href="/login"')
    expect(html).toContain('short video')
    expect(html).not.toContain('one-minute')
  })

  it('stays generic outside the transcript: no community name in the steps', () => {
    const beforeTranscript = html.split('Read the video instead')[0]
    expect(beforeTranscript).not.toContain('Madison Park')
  })

  it('shows the full narration as a transcript', () => {
    expect(html).toContain('Read the video instead')
    for (const scene of TRANSCRIPT) for (const line of scene.lines) expect(html).toContain(esc(line))
  })
})

describe('transcript stays in sync with the narration script', () => {
  it('matches tools/welcome-video/script.json (re-run render.mjs if this fails)', () => {
    const file = path.resolve(__dirname, '../../../../../tools/welcome-video/script.json')
    const script = JSON.parse(readFileSync(file, 'utf8')) as {
      scenes: Array<{ title: string; lines: Array<string | { text: string }> }>
    }
    const expected = script.scenes.map((s) => ({
      title: s.title,
      lines: s.lines.map((l) => (typeof l === 'string' ? l : l.text)),
    }))
    expect(JSON.parse(JSON.stringify(TRANSCRIPT))).toEqual(expected)
  })
})
