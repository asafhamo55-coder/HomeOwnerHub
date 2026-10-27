import { describe, expect, it } from 'vitest'
import {
  clockStartOf,
  describeMail,
  feeNoticeCleanOn,
  foreclosureEligibleOn,
  foreclosureEligibleOnFor,
  foreclosureWaitDays,
  mailRecordFor,
  mailingNote,
  validateMailFields,
  type MailEvent,
} from './mail-tracking'
import { checkCollectionsLetter, blockingFindings, type LetterCheckInput } from '@/lib/compliance/statute-drift'

const REQ = '11111111-1111-4111-8111-111111111111'
const ev = (over: Partial<MailEvent>): MailEvent => ({
  note: mailingNote(REQ),
  createdAt: '2026-09-01T10:00:00Z',
  method: null,
  trackingNumber: null,
  mailedOn: null,
  deliveredOn: null,
  ...over,
})

describe('validateMailFields', () => {
  const ok = (v: Parameters<typeof validateMailFields>[0]) => validateMailFields(v, '2026-10-20')
  it('nothing typed is no record; dates or a number need a method', () => {
    expect(ok({})).toEqual({ ok: true, record: null })
    expect(ok({ trackingNumber: 'T1' }).ok).toBe(false)
    expect(ok({ mailedOn: '2026-10-01' }).ok).toBe(false)
  })
  it('accepts a full record, trims the number, and refuses a bad method, a future date, delivered-before-mailed and a long number', () => {
    expect(ok({ mailMethod: 'certified', trackingNumber: ' 9407 ', mailedOn: '2026-10-01', deliveredOn: '2026-10-04' })).toEqual({
      ok: true,
      record: { method: 'certified', trackingNumber: '9407', mailedOn: '2026-10-01', deliveredOn: '2026-10-04' },
    })
    expect(ok({ mailMethod: 'pigeon' }).ok).toBe(false)
    expect(ok({ mailMethod: 'certified', deliveredOn: '2026-10-21' }).ok).toBe(false)
    expect(ok({ mailMethod: 'certified', mailedOn: '2026-10-05', deliveredOn: '2026-10-04' }).ok).toBe(false)
    expect(ok({ mailMethod: 'hand', trackingNumber: 'x'.repeat(101) }).ok).toBe(false)
  })
})

describe('mailRecordFor: append-only events fold into one record per letter', () => {
  it('a later delivery event completes the earlier mailing', () => {
    const rec = mailRecordFor(REQ, [
      ev({ createdAt: '2026-09-01T10:00:00Z', method: 'certified', trackingNumber: 'T1', mailedOn: '2026-09-01' }),
      ev({ createdAt: '2026-09-05T10:00:00Z', method: 'certified', deliveredOn: '2026-09-04' }),
    ])
    expect(rec).toEqual({ method: 'certified', trackingNumber: 'T1', mailedOn: '2026-09-01', deliveredOn: '2026-09-04' })
    expect(describeMail(rec!)).toBe('Certified mail · tracking T1 · mailed 2026-09-01 · delivered 2026-09-04')
  })
  it('an event on the case list repeating the tracking number joins the letter; another letter’s does not', () => {
    const rec = mailRecordFor(REQ, [
      ev({ method: 'certified', trackingNumber: 'T1', mailedOn: '2026-09-01' }),
      ev({ note: 'Green card came back', createdAt: '2026-09-06T00:00:00Z', method: 'certified', trackingNumber: 'T1', deliveredOn: '2026-09-05' }),
      ev({ note: mailingNote('22222222-2222-4222-8222-222222222222'), method: 'certified', trackingNumber: 'T9', deliveredOn: '2026-09-09' }),
    ])
    expect(rec?.deliveredOn).toBe('2026-09-05')
  })
  it('null when nothing was recorded for the letter', () => {
    expect(mailRecordFor(REQ, [])).toBeNull()
    expect(mailRecordFor(REQ, [ev({ note: 'something else', method: 'hand' })])).toBeNull()
  })
})

describe('the clocks count from delivered_on, for a statutory method only', () => {
  it('clockStartOf', () => {
    expect(clockStartOf({ method: 'certified', trackingNumber: null, mailedOn: null, deliveredOn: '2026-09-04' })).toBe('2026-09-04')
    expect(clockStartOf({ method: 'statutory_overnight', trackingNumber: null, mailedOn: null, deliveredOn: '2026-09-04' })).toBe('2026-09-04')
    expect(clockStartOf({ method: 'first_class', trackingNumber: null, mailedOn: null, deliveredOn: '2026-09-04' })).toBeNull()
    expect(clockStartOf({ method: 'certified', trackingNumber: null, mailedOn: '2026-09-01', deliveredOn: null })).toBeNull()
    expect(clockStartOf(null)).toBeNull()
  })
  it('30 days for the fee notice; 30 or 60 for the foreclosure notice by the day it was sent; a condo notice is always 30', () => {
    expect(feeNoticeCleanOn('2026-09-04')).toBe('2026-10-04')
    expect(foreclosureWaitDays('2026-12-31')).toBe(30)
    expect(foreclosureWaitDays('2027-01-01')).toBe(60)
    expect(foreclosureEligibleOn('2027-01-10', '2027-01-15')).toBe('2027-03-16')
    expect(foreclosureEligibleOn('2026-12-20', '2026-12-24')).toBe('2027-01-23')
    expect(foreclosureEligibleOnFor('ga_condo_pre_foreclosure', '2027-02-01', '2027-02-05')).toBe('2027-03-07')
  })
})

describe('the attorney-fee check reads the recorded delivery date (BL-166)', () => {
  const base = (over: Partial<LetterCheckInput>): LetterCheckInput => ({
    state: 'GA',
    kind: 'past_due',
    letterDate: '2026-10-20',
    listedChargeTypes: ['collection_legal'],
    values: {},
    events: [],
    printed: [],
    ...over,
  })
  const codes = (c: ReturnType<typeof checkCollectionsLetter>) => c.findings.map((f) => `${f.severity}:${f.code}`)

  it('a delivery 30+ days ago is a clean pass, even though the notice was printed long before', () => {
    const c = checkCollectionsLetter(base({ printed: [{ kind: 'ga_fee_notice', printedOn: '2026-08-01', deliveredOn: '2026-09-20' }] }))
    expect(codes(c)).toEqual([])
  })
  it('printed 60 days ago but delivered 10 days ago: blocked until 30 days after delivery', () => {
    const c = checkCollectionsLetter(base({ printed: [{ kind: 'ga_fee_notice', printedOn: '2026-08-21', deliveredOn: '2026-10-10' }] }))
    expect(codes(c)).toEqual(['block:ga_attorney_fees_prerequisites'])
    expect(blockingFindings(c)[0]!.message).toContain('2026-11-09')
  })
  it('no delivery recorded: exactly the old behaviour (a receipt warning once printed 30 days ago)', () => {
    expect(codes(checkCollectionsLetter(base({ printed: [{ kind: 'ga_fee_notice', printedOn: '2026-09-20' }] })))).toEqual(['warn:ga_attorney_fees_receipt'])
    expect(codes(checkCollectionsLetter(base({ printed: [{ kind: 'ga_fee_notice', printedOn: '2026-09-21' }] })))).toEqual(['block:ga_attorney_fees_prerequisites'])
  })
  it('mailTracking only changes the delivery wording of the notice itself', () => {
    const off = checkCollectionsLetter(base({ kind: 'ga_fee_notice', listedChargeTypes: ['regular', 'fine'] }))
    const on = checkCollectionsLetter(base({ kind: 'ga_fee_notice', listedChargeTypes: ['regular', 'fine'], mailTracking: true }))
    expect(codes(on)).toEqual(codes(off))
    expect(off.findings[0]!.message).toContain('doesn’t record how it was mailed')
    expect(on.findings[0]!.message).toContain('record how and when it was mailed')
  })
})
