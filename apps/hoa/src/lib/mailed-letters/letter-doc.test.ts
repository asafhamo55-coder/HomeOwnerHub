import { describe, expect, it } from 'vitest'
import { buildLetter, letterTotals, usdCents, type LetterInput } from '@/lib/collections/letters/model'
import { FL_LATE_NOTICE_BODY } from '@/lib/collections/letters/law'
import { blanksLeft, letterDocument } from './letter-doc'
import { renderLetterPdf, winAnsi } from './pdf'
import { checkAddress, guessAddress } from './address'
import { describeMailedLetter, type MailedLetterView } from './status'
import { getMailProvider, readMailPricing } from './config'

const input: LetterInput = {
  state: 'FL',
  associationName: 'Fixture HOA',
  propertyId: 'p',
  address: '14 Oak Lane',
  unitNumber: null,
  unitId: 'u',
  lotNumber: null,
  owners: ['Owner A'],
  charges: [
    { id: 'a-aug', unit_id: 'u', amount: 300, due_date: '2026-08-01', status: 'open', assessment_type: 'regular', memo_code: null },
    { id: 'a-sep', unit_id: 'u', amount: 300, due_date: '2026-09-01', status: 'open', assessment_type: 'regular', memo_code: null },
  ],
  payments: [],
  plans: [],
  planInstallmentIds: [],
  timeZone: 'America/New_York',
}
const VALUES = {
  mailingAddress: '14 Oak Lane\nTampa, FL 33601',
  parcel: 'Lot 7, Block B',
  interest: '0',
  interestThrough: 'None',
  interestRate: '0',
  signer: 'Pat Board, President',
}

describe('letterDocument', () => {
  const letter = buildLetter(input, 'fl_late_notice', '2026-10-19', [], VALUES)
  const blocks = letterDocument(letter, input, VALUES)
  it('carries the same total and law text as the printed letter', () => {
    const total = letterTotals(letter, VALUES).totalCents!
    const json = JSON.stringify(blocks)
    expect(json).toContain(usdCents(total))
    expect(json).toContain(FL_LATE_NOTICE_BODY('Fixture HOA').slice(0, 40))
    expect(blanksLeft(blocks)).toEqual([])
  })
  it('reports blanks that are still empty', () => {
    const empty = letterDocument(buildLetter(input, 'fl_late_notice', '2026-10-19', [], {}), input, {})
    expect(blanksLeft(empty).length).toBeGreaterThan(0)
  })
  it('renders a real PDF with a page count', async () => {
    const r = await renderLetterPdf(blocks)
    expect(Buffer.from(r.pdf.slice(0, 5)).toString()).toBe('%PDF-')
    expect(r.pages).toBeGreaterThanOrEqual(1)
  })
})

describe('pdf text', () => {
  it('keeps typographic quotes and marks what Helvetica cannot draw', () => {
    expect(winAnsi('Owner’s § 5')).toBe('Owner’s § 5')
    expect(winAnsi('ok ✓')).toBe('ok ?')
  })
})

describe('addresses', () => {
  it('guesses the parts of a mailing address', () => {
    expect(guessAddress('Owner A', '14 Oak Lane\nTampa, FL 33601')).toEqual({ name: 'Owner A', line1: '14 Oak Lane', city: 'Tampa', state: 'FL', zip: '33601' })
  })
  it('leaves unreadable text blank rather than guessing', () => {
    const g = guessAddress('A', 'somewhere near the lake')
    expect(g.city).toBeUndefined()
    expect(checkAddress({ name: 'A', line1: 'x', city: '', state: 'GA', zip: '30303' }, 'recipient').ok).toBe(false)
  })
  it('accepts a complete address', () => {
    const r = checkAddress({ name: 'A', line1: '1 Main', city: 'Atlanta', state: 'ga', zip: '30303' }, 'return')
    expect(r.ok && r.address.state).toBe('GA')
  })
})

describe('status', () => {
  const m: MailedLetterView = {
    approvalRequestId: 'r',
    mailService: 'certified',
    status: 'delivered',
    trackingNumber: 'T1',
    expectedDeliveryOn: null,
    mailedOn: '2026-10-20',
    deliveredOn: '2026-10-23',
    confirmedCents: 810,
    color: false,
    pages: 2,
  }
  it('describes a delivered certified letter', () => {
    expect(describeMailedLetter(m, (d) => d)).toEqual(['Certified mail: Delivered.', 'Tracking number T1.', 'Mailed 2026-10-20.', 'Delivered 2026-10-23.'])
  })
})

describe('config', () => {
  it('has no provider without pricing, and none in production', () => {
    expect(getMailProvider(null, { MAIL_PROVIDER: 'fake' })).toBeNull()
    const pricing = readMailPricing({ MAIL_PRICING_JSON: JSON.stringify({ baseCents: 1, colorCents: 1, extraPageCents: 1, certifiedCents: 1, certifiedReturnReceiptCents: 1 }) })
    expect(pricing).not.toBeNull()
    expect(getMailProvider(pricing, { MAIL_PROVIDER: 'fake', NODE_ENV: 'production' })).toBeNull()
    expect(getMailProvider(pricing, { MAIL_PROVIDER: 'fake', NODE_ENV: 'test' })?.name).toBe('fake')
    expect(getMailProvider(pricing, {})).toBeNull()
  })
  it('rejects bad pricing', () => {
    expect(readMailPricing({ MAIL_PRICING_JSON: '{"baseCents":-1}' })).toBeNull()
    expect(readMailPricing({ MAIL_PRICING_JSON: 'nope' })).toBeNull()
  })
})
