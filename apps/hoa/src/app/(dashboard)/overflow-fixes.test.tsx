import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'
import { PageHeader } from '@homeowner-portal/ui'

// ui:overflow regressions, checked against server-rendered markup (the
// repo's component-test pattern: no DOM, so we assert the classes that
// let the layout wrap instead of overflowing).

;(globalThis as { React?: typeof React }).React = React

const { FollowUpActions } = await import('./communications/[id]/FollowUpActions')

const here = path.dirname(fileURLToPath(import.meta.url))
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')
const classOf = (tag: string) => (tag.match(/class="([^"]*)"/)?.[1] ?? '').split(/\s+/)

describe('inbox thread header (/inbox/[id] @1440: subject squeezed, bar 618px > 512px)', () => {
  const markup = html(
    <PageHeader
      title="Fence repair and the pool gate code"
      actionsBelow
      actions={
        <>
          <button type="button">Forward</button>
          <button type="button">Request from vendor</button>
          <button type="button">Create from email</button>
        </>
      }
    />,
  )

  it('stacks the title and actions in a column at every width — never a row', () => {
    // The wrapper holding both the title block and the action bar.
    const row = markup.match(/<div class="([^"]*)"><div class="min-w-0 flex-1 space-y-1">/)
    expect(row).not.toBeNull()
    const cls = row![1].split(/\s+/)
    expect(cls).toContain('flex-col')
    expect(cls.some((c) => /^(sm|md|lg|xl):flex-row$/.test(c))).toBe(false)
  })

  it('lets the action bar wrap and shrink instead of holding its width', () => {
    const bar = markup.match(/<div data-page-actions="[^"]*" class="[^"]*"/)
    expect(bar).not.toBeNull()
    const cls = classOf(bar![0])
    expect(cls).toEqual(expect.arrayContaining(['flex-wrap', 'min-w-0']))
    expect(cls).not.toContain('shrink-0')
  })

  it('gives the subject min-w-0 and break-words', () => {
    const h1 = markup.match(/<h1\b[^>]*>/)![0]
    expect(classOf(h1)).toEqual(expect.arrayContaining(['min-w-0', 'break-words']))
  })

  it('keeps the side-by-side layout for every other PageHeader', () => {
    const plain = html(<PageHeader title="Dues" actions={<button type="button">New</button>} />)
    expect(plain).toContain('sm:flex-row')
    expect(plain).toMatch(/data-page-actions="[^"]*" class="[^"]*shrink-0/)
  })

  it('the inbox thread page opts into actionsBelow', () => {
    const src = readFileSync(path.join(here, 'inbox', '[id]', 'page.tsx'), 'utf8')
    expect(src).toMatch(/<PageHeader[\s\S]*?\bactionsBelow\b[\s\S]*?actions=\{/)
  })
})

describe('communications follow-up buttons (/communications/[id] @375)', () => {
  const markup = html(<FollowUpActions commId="c1" count={2} textingReady />)
  const links = markup.match(/<a\b[^>]*>/g) ?? []

  it('renders both follow-up links', () => {
    expect(links).toHaveLength(2)
    expect(markup).toContain('Email again to the 2 who haven’t opened')
    expect(markup).toContain('aria-label="Text them: the 2 who haven’t opened"')
  })

  it('lets each button wrap its label and go full width on phones', () => {
    for (const tag of links) {
      const cls = classOf(tag)
      expect(cls).toEqual(
        expect.arrayContaining(['min-w-0', 'whitespace-normal', 'w-full', 'sm:w-auto', 'h-auto']),
      )
      // tailwind-merge must have dropped the kit's nowrap / fixed height.
      expect(cls).not.toContain('whitespace-nowrap')
      expect(cls).not.toContain('h-9')
      expect(cls).not.toContain('shrink-0')
    }
  })

  it('the row itself wraps', () => {
    const row = markup.match(/^<div class="([^"]*)"/)![1].split(/\s+/)
    expect(row).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'min-w-0']))
  })
})
