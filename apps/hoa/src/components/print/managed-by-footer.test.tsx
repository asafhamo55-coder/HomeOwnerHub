import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ManagedByFooter } from './ManagedByFooter'
import { JoinNotice } from '@/app/(dashboard)/people/join-notice/JoinNotice'
import { HearingNoticePrint } from '@/app/(dashboard)/violations/[id]/hearing-notice/HearingNoticePrint'
import { PaperReminderLetters, payHowFrom } from '@/app/(dashboard)/dues/paper-reminders/PaperReminderLetters'
import { StatementDocument } from '@/components/statement/StatementDocument'
import { readZelleSettings } from '@/lib/pay-by-zelle'
import type { PaperLetter } from '@/lib/dues-reminders/paper'

;(globalThis as { React?: typeof React }).React = React

const LINE = 'Managed by Homeside & Sons, (404) 555-0100'
const ESCAPED = 'Managed by Homeside &amp; Sons, (404) 555-0100'

describe('ManagedByFooter', () => {
  it('prints the escaped line', () => {
    const html = renderToStaticMarkup(<ManagedByFooter line={'Managed by Homeside & Sons <script>x</script>'} />)
    expect(html).toContain('data-managed-by')
    expect(html).toContain('Managed by Homeside &amp; Sons')
    expect(html).not.toContain('<script')
  })
  it('renders nothing for an empty line', () => {
    for (const line of [undefined, null, '', '  ']) expect(renderToStaticMarkup(<ManagedByFooter line={line} />)).toBe('')
  })
  it('never splits across a page and never starts a page by itself', () => {
    for (const compact of [false, true]) {
      const html = renderToStaticMarkup(<ManagedByFooter line={LINE} compact={compact} />)
      expect(html).toContain('break-inside-avoid')
      expect(html).toContain('break-before-avoid')
    }
  })
  it('compact spacing is tighter than the default', () => {
    expect(renderToStaticMarkup(<ManagedByFooter line={LINE} />)).toContain('mt-6')
    const compact = renderToStaticMarkup(<ManagedByFooter line={LINE} compact />)
    expect(compact).toContain('mt-2')
    expect(compact).not.toContain('mt-6')
  })
})

describe('the line on each printed document', () => {
  const join = { associationName: 'Madison Park', joinUrl: 'https://x.test/join', welcomeUrl: 'https://x.test/welcome', qrSvg: '<svg></svg>', contacts: [] }

  it('join notice: compact footer, only when set', () => {
    const html = renderToStaticMarkup(<JoinNotice {...join} managedBy={LINE} />)
    expect(html).toContain(ESCAPED)
    expect(html).toContain('mt-2')
    expect(renderToStaticMarkup(<JoinNotice {...join} />)).not.toContain('data-managed-by')
  })

  it('hearing notice', () => {
    const view = { association: 'Madison Park', dateLabel: 'Nov 7, 2026', ownerName: 'Pat', addressLines: ['1 Oak', 'Atlanta, GA 30301'], subject: 'Hearing', bodyHtml: '<p>Body</p>' }
    expect(renderToStaticMarkup(<HearingNoticePrint view={{ ...view, managedBy: LINE }} />)).toContain(ESCAPED)
    expect(renderToStaticMarkup(<HearingNoticePrint view={view} />)).not.toContain('data-managed-by')
  })

  it('paper dues reminder: one footer per letter, compact', () => {
    const letter = (n: number): PaperLetter => ({
      addressLines: [`Owner ${n}`, `${n} Oak St`, 'Atlanta, GA 30301'],
      addressee: `Owner ${n}`,
      named: true,
      packet: {
        email: '',
        ownerName: `Owner ${n}`,
        userId: null,
        properties: [
          { unitId: 'p1', label: `${n} Oak St`, subtotal: 100, charges: [{ id: 'c1', assessmentType: 'regular', dueDate: '2026-10-01', amount: 100, paid: 0, balance: 100, pastDue: true, daysLate: 5 }] },
          { unitId: 'p2', label: `${n} Elm St`, subtotal: 50, charges: [{ id: 'c2', assessmentType: 'regular', dueDate: '2026-10-01', amount: 50, paid: 0, balance: 50, pastDue: true, daysLate: 5 }] },
        ],
        totalDue: 150,
        pastDueTotal: 150,
        oldestDaysLate: 5,
        chargeCount: 2,
      },
    })
    const pay = payHowFrom(readZelleSettings('a1', {}, 'secret', null))
    const html = renderToStaticMarkup(
      <PaperReminderLetters letters={[letter(1), letter(2)]} associationName="Madison Park" dateLabel="Nov 7, 2026" pay={pay} contacts={[]} managedBy={LINE} />,
    )
    expect(html.match(/data-managed-by/g)).toHaveLength(2)
    expect(html).toContain(ESCAPED)
    expect(html).toContain('break-inside-avoid')
    expect(html).toContain('mt-2')
  })

  it('statement: the line sits in the footer, escaped, and is absent when empty', () => {
    const props = {
      associationName: 'Madison Park',
      statementDate: '2026-11-06',
      period: 'All activity',
      all: true,
      from: '2026-01-01',
      window: { openingBalance: 0, entries: [], closingBalance: 0, totals: { charges: 0, payments: 0 } as never },
      preparedFor: { name: 'Pat Sample' },
      homes: ['12 Oak Ln'],
      truncated: false,
      truncatedNote: '',
      emptyHint: 'Nothing yet',
      footer: 'Thanks',
    }
    const html = renderToStaticMarkup(<StatementDocument {...props} managedBy={LINE} />)
    expect(html).toContain(ESCAPED)
    expect(html.indexOf('Thanks')).toBeLessThan(html.indexOf('data-managed-by'))
    expect(html.indexOf('data-managed-by')).toBeLessThan(html.indexOf('</footer>'))
    expect(renderToStaticMarkup(<StatementDocument {...props} />)).not.toContain('data-managed-by')
  })
})
