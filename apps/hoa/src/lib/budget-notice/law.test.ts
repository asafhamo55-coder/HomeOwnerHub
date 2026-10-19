import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import { CA_ITEMS_NOT_GENERATED, CA_WINDOW_DAYS, FL_COPY_BUSINESS_DAYS } from './law'

/**
 * The statute duties in law.ts, checked against the official text kept
 * in the repo (BL-054 practice): the Florida Senate's 2026 chapter 720
 * and the California Legislative Counsel's bulk-data Civil Code.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const fixture = (name: string) => readFileSync(path.join(root, 'scripts/fixtures/state-law', name), 'utf8')

const fl = parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026)
const flSection = (cite: string) => (fl.find((r) => r.code_citation === cite)?.body ?? '').replace(/\s+/g, ' ')

const caSection = (n: string) => {
  const t = fixture('ca-civ-davis-stirling-2026.txt')
  const start = t.indexOf(`=== Civ. Code § ${n}.  [`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = t.indexOf('\n=== ', start + 1)
  return t.slice(start, end === -1 ? undefined : end)
}

describe('Florida § 720.303(6)', () => {
  const s = flSection('Fla. Stat. § 720.303')

  it('the budget contents: operating expenses, revenues and expenses, surplus or deficit, amenity fees', () => {
    expect(s).toContain('The association shall prepare an annual budget that sets out the annual operating expenses.')
    expect(s).toContain('the estimated surplus or deficit as of the end of the current year')
    expect(s).toContain('must set out separately all fees or charges paid for by the association for recreational amenities')
  })

  it('the duty: a copy, or notice that a copy is available at no charge, within subsection (5) time limits', () => {
    expect(s).toContain('shall provide each member with a copy of the annual budget or a written notice that a copy of the budget is available upon request at no charge to the member')
    expect(s).toContain('The copy must be provided to the member within the time limits set forth in subsection (5).')
    expect(FL_COPY_BUSINESS_DAYS).toBe(10)
    expect(s).toContain('within 10 business days after receipt by the board or its designee of a written request')
  })

  it('reserves are optional unless the members establish them', () => {
    expect(s).toContain('the budget may include reserve accounts for capital expenditures and deferred maintenance')
  })

  it('§ 720.308(1)(a): proportional share under the governing documents', () => {
    expect(flSection('Fla. Stat. § 720.308')).toContain('Assessments levied pursuant to the annual budget or special assessment must be in the member’s proportional share of expenses as described in the governing document')
  })
})

describe('California § 5300', () => {
  const s = caSection('5300')

  it('30 to 90 days before the end of the fiscal year', () => {
    expect(CA_WINDOW_DAYS).toEqual({ earliest: 90, latest: 30 })
    expect(s).toContain('shall distribute an annual budget report 30 to 90 days before the end of its fiscal year')
  })

  it('(b)(1) is the pro forma operating budget the notice generates', () => {
    expect(s).toContain('(1)A pro forma operating budget, showing the estimated revenue and expenses on an accrual basis.')
  })

  it('every § 5300 item not generated and not a board BLANK is listed', () => {
    for (const n of [2, 3, 7, 9, 10, 11, 12]) expect(s).toContain(`\n(${n})`)
    expect(s).toContain('(e)The Assessment and Reserve Funding Disclosure Summary form, prepared pursuant to Section 5570')
    expect(CA_ITEMS_NOT_GENERATED.map((i) => i.cite)).toEqual([
      '§ 5300(b)(2)',
      '§ 5300(b)(3)',
      '§ 5300(b)(7)',
      '§ 5300(b)(9)',
      '§ 5300(b)(10)',
      '§ 5300(b)(11)',
      '§ 5300(b)(12)',
      '§ 5300(e)',
    ])
    // (b)(4), (5), (6), (8) are board BLANKs; (b)(1) is generated.
    expect(s).toContain('(4)A statement as to whether the board has determined to defer')
    expect(s).toContain('(8)A statement as to whether the association has any outstanding loans')
  })

  it('§ 5320: full report or summary by individual delivery', () => {
    expect(caSection('5320')).toContain('the association shall deliver one of the following documents to all members by individual delivery pursuant to Section 4040')
  })
})
