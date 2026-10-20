import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseFloridaChapter } from '@homeowner-portal/workflows/state-law-florida'
import { recordsEmailRule } from './model'

/**
 * The records-request copy's email rule, checked against the official
 * text kept in the repo (BL-054 practice): FL chapter 720 (2026) and the
 * CA Civil Code. TX and GA have no records-access text in the fixtures,
 * which is why they fall to the conservative default (omit email).
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..')
const fixture = (name: string) => readFileSync(path.join(root, 'scripts/fixtures/state-law', name), 'utf8')

const fl303 = (parseFloridaChapter(fixture('flsenate-ch720-2026.html'), 2026).find((r) => r.code_citation === 'Fla. Stat. § 720.303')?.body ?? '')
  .replace(/\s+/g, ' ')

const caSection = (n: string) => {
  const t = fixture('ca-civ-davis-stirling-2026.txt')
  const start = t.indexOf(`=== Civ. Code § ${n}.  [`)
  const end = t.indexOf('\n=== ', start + 1)
  return start < 0 ? '' : t.slice(start, end)
}

describe('Florida § 720.303 — roster yes, email no', () => {
  it('the roster of members with designated mailing addresses and parcel identifications is an official record', () => {
    expect(fl303).toContain('A current roster of all members and their designated mailing addresses and parcel identifications')
  })
  it('electronic mailing addresses and telephone numbers are not accessible to members → omit', () => {
    expect(fl303).toContain('electronic mailing addresses, telephone numbers')
    expect(fl303).toContain('excluding the person’s name, parcel designation, mailing address, and property address')
    expect(recordsEmailRule('FL')).toBe('omit')
  })
})

describe('California §§ 5200(a)(9), 5220 — email unless opted out', () => {
  it('the membership list includes email, not for members who opted out', () => {
    const s = caSection('5200')
    expect(s).toContain('Membership lists, including name, property address, mailing address, email address')
    expect(s).toContain('not including information for members who have opted out pursuant to Section 5220')
    expect(recordsEmailRule('CA')).toBe('unless_opted_out')
  })
  it('§ 5220 opt-out covers name, property address, email and mailing address', () => {
    expect(caSection('5220')).toContain('opt out of the sharing of that member’s name, property address, email address, and mailing address')
  })
})

describe('Texas and Georgia — no verified records text, so email is omitted', () => {
  it('the TX fixture has no § 209.005', () => {
    expect(fixture('tx-prop-209-2026.txt')).not.toContain('Sec. 209.005.')
    expect(recordsEmailRule('TX')).toBe('omit')
    expect(recordsEmailRule('GA')).toBe('omit')
  })
})
