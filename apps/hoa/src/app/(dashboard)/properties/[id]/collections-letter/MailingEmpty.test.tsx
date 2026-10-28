import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { MailingNotRecorded } from './MailingEmpty'

;(globalThis as { React?: typeof React }).React = React

const here = path.dirname(fileURLToPath(import.meta.url))
const page = readFileSync(path.join(here, 'page.tsx'), 'utf8')

describe('mail-tracking empty state (round-8 #5)', () => {
  it('explains why to record the mailing and which methods count', () => {
    const html = renderToStaticMarkup(React.createElement(MailingNotRecorded))
    expect(html).toContain('Not recorded yet')
    expect(html).toContain('fee and foreclosure clocks')
    expect(html).toContain('certified mail or statutory overnight')
  })

  it('renders only when there is no mailing record, and sits above the record action', () => {
    expect(page).toMatch(/clock \? <p[^>]*>\{clock\}<\/p> : <MailingNotRecorded \/>/)
    // clock stays null only in the no-record case
    expect(page).not.toContain("clock = 'Not recorded yet.")
    expect(page.indexOf('<MailingNotRecorded />')).toBeLessThan(page.indexOf('Record how and when it was mailed'))
    expect(page).toContain("'Record how and when it was mailed'")
  })
})
