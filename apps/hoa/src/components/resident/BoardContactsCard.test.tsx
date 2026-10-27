import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BoardContactsCard } from './BoardContactsCard'

;(globalThis as { React?: typeof React }).React = React

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

describe('BoardContactsCard', () => {
  it('renders nothing when there are no contacts', () => {
    expect(html(<BoardContactsCard contacts={[]} />)).toBe('')
  })

  it('shows label, name, tel and mailto links, and the emergency line', () => {
    const out = html(
      <BoardContactsCard
        contacts={[
          { label: 'President', name: 'Pat Example', phone: '(555) 010-0100', email: 'pat@example.org', emergencyLine: '' },
          { label: 'Gate', name: '', phone: '', email: '', emergencyLine: 'After hours: 555 010 0199' },
        ]}
      />,
    )
    expect(out).toContain('Board and emergency contacts')
    expect(out).toContain('President')
    expect(out).toContain('Pat Example')
    expect(out).toContain('href="tel:5550100100"')
    expect(out).toContain('href="mailto:pat@example.org"')
    expect(out).toContain('Emergency: ')
    expect(out).toContain('After hours: 555 010 0199')
  })

  it('escapes markup in published text and names the community when asked', () => {
    const out = html(
      <BoardContactsCard
        communityName="Alpha"
        contacts={[{ label: '<b>x</b>', name: '', phone: '', email: '', emergencyLine: 'call' }]}
      />,
    )
    expect(out).not.toContain('<b>x</b>')
    expect(out).toContain('&lt;b&gt;x&lt;/b&gt;')
    expect(out).toContain('· Alpha')
  })
})
