import { describe, expect, it } from 'vitest'
import { addBuyer, checkDraft, draftToRaw, emptySaleDraft, evenShares, removeBuyer, sharesTotal, updateBuyer } from './sale-form'

const TODAY = '2026-10-17'

describe('sale form state', () => {
  it('starts on today with one buyer at 100%; the tenants question is open only when there are tenants', () => {
    expect(emptySaleDraft(TODAY, false)).toMatchObject({ settlementDate: TODAY, carryTenants: false, addBuyersAsResidents: true, buyers: [{ pct: '100' }] })
    expect(emptySaleDraft(TODAY, true).carryTenants).toBeNull()
  })

  it('even shares always add up to exactly 100', () => {
    expect(evenShares(1)).toEqual(['100'])
    expect(evenShares(2)).toEqual(['50', '50'])
    expect(evenShares(3)).toEqual(['33.33', '33.33', '33.34'])
    for (let n = 1; n <= 6; n++) expect(evenShares(n).reduce((t, x) => t + Math.round(Number(x) * 100), 0)).toBe(10_000)
  })

  it('adding and removing buyers re-splits the shares; at least one, at most six', () => {
    let d = emptySaleDraft(TODAY, false)
    d = addBuyer(d)
    expect(d.buyers.map((b) => b.pct)).toEqual(['50', '50'])
    d = addBuyer(d)
    expect(sharesTotal(d)).toBe(100)
    d = removeBuyer(d, d.buyers[0]!.key)
    expect(d.buyers.map((b) => b.pct)).toEqual(['50', '50'])
    d = removeBuyer(removeBuyer(d, d.buyers[0]!.key), d.buyers[1]!.key)
    expect(d.buyers).toHaveLength(1)
    for (let i = 0; i < 10; i++) d = addBuyer(d)
    expect(d.buyers).toHaveLength(6)
  })

  it('one buyer is sent at 100% whatever was typed', () => {
    const d = updateBuyer(emptySaleDraft(TODAY, false), emptySaleDraft(TODAY, false).buyers[0]!.key, {})
    const one = { ...d, buyers: [{ ...d.buyers[0]!, name: 'B', pct: '12' }] }
    expect(draftToRaw(one).buyers).toEqual([{ name: 'B', email: '', phone: '', mailingAddress: '', pct: 100 }])
  })

  it('checks the draft with the server’s rules, plus the unanswered tenants question', () => {
    const d = emptySaleDraft(TODAY, true)
    const r = checkDraft(d, TODAY)
    expect(r).toMatchObject({ ok: false, fieldErrors: { 'buyers.0.name': expect.any(String), carryTenants: 'Choose whether the tenants stay.' } })
    const filled = updateBuyer({ ...d, carryTenants: true }, d.buyers[0]!.key, { name: 'Buyer One', email: 'b@example.test' })
    expect(checkDraft(filled, TODAY)).toMatchObject({ ok: true, raw: { carryTenants: true, addBuyersAsResidents: true } })
    expect(checkDraft({ ...filled, settlementDate: '2026-10-18' }, TODAY)).toMatchObject({ ok: false, fieldErrors: { settlementDate: expect.any(String) } })
  })
})
