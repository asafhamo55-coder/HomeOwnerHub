import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readZelleSettings, signZelleSettings } from '@/lib/pay-by-zelle'
import type { PaperLetter } from '@/lib/dues-reminders/paper'
import { PaperReminderLetters, payHowFrom } from './PaperReminderLetters'

;(globalThis as { React?: typeof React }).React = React

// Real signing and reading, no mocks: what the board saves is what prints.
const SECRET = 'test-secret'
const ASSOC = 'a1'
const CHECKS = { payableTo: 'Madison Park HOA', mailTo: 'PO Box 9, Atlanta, GA 30301', dropOff: null }

function letter(): PaperLetter {
  return {
    addressLines: ['Pat Lee', '101 Oak St', 'Atlanta, GA 30301'],
    addressee: 'Pat Lee',
    named: true,
    packet: {
      email: '',
      ownerName: 'Pat Lee',
      userId: null,
      properties: [
        {
          unitId: 'p1',
          label: '101 Oak St',
          subtotal: 100,
          charges: [{ id: 'c1', assessmentType: 'regular', dueDate: '2026-10-01', amount: 100, paid: 0, balance: 100, pastDue: true, daysLate: 5 }],
        },
      ],
      totalDue: 100,
      pastDueTotal: 100,
      oldestDaysLate: 5,
      chargeCount: 1,
    },
  }
}

const html = (read: Parameters<typeof payHowFrom>[0]) =>
  renderToStaticMarkup(
    <PaperReminderLetters letters={[letter()]} associationName="Madison Park" dateLabel="November 7, 2026" pay={payHowFrom(read)} contacts={[]} />,
  )

describe('letters from real payment settings', () => {
  it('prints check details for a checks-only save, and no Zelle line', () => {
    const stored = signZelleSettings(ASSOC, { recipient: null, recipientName: null, instructions: null, checks: CHECKS }, SECRET)
    const read = readZelleSettings(ASSOC, { pay_by_zelle: stored }, SECRET, null)
    expect(read.state).toBe('checks_only')
    const out = html(read)
    expect(out).toContain('make it payable to Madison Park HOA')
    expect(out).toContain('PO Box 9, Atlanta, GA 30301')
    expect(out).not.toContain('By Zelle')
  })

  it('prints nothing about payment when the saved details do not verify', () => {
    const stored = signZelleSettings(ASSOC, { recipient: 'pay@example.org', recipientName: null, instructions: null, checks: CHECKS }, SECRET)
    const read = readZelleSettings(ASSOC, { pay_by_zelle: { ...stored, recipient: 'attacker@example.org' } }, SECRET, null)
    expect(read.state).toBe('unverified')
    const out = html(read)
    expect(out).not.toContain('attacker@example.org')
    expect(out).not.toContain('Madison Park HOA')
    expect(out).toContain('Please contact the board to find out how to pay.')
  })

  it('says to ask the board when no contact is set, and uses Hello without a name', () => {
    const read = readZelleSettings(ASSOC, {}, SECRET, null)
    const out = html(read)
    expect(out).toContain('Please ask the board for contact details.')
    const unnamed = renderToStaticMarkup(
      <PaperReminderLetters
        letters={[{ ...letter(), named: false, addressee: 'Current Resident' }]}
        associationName="Madison Park"
        dateLabel="November 7, 2026"
        pay={payHowFrom(read)}
        contacts={[]}
      />,
    )
    expect(unnamed).toContain('Hello,')
    expect(unnamed).not.toContain('Hi Current Resident')
  })
})
