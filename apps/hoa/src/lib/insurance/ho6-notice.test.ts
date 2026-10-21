import { describe, expect, it } from 'vitest'
import type { InsurancePolicy } from './model'
import {
  HO6_NOTICE_DRAFT_KEY,
  HO6_NOTICE_FROM,
  HO6_NOTICE_WIZARD_HREF,
  buildHo6Notice,
  masterPolicyForNotice,
  readHo6NoticeDraft,
  writeHo6NoticeDraft,
} from './ho6-notice'

// BL-142: the optional HO-6 notice. Drafted only; the composer sends.

const TODAY = '2026-10-21'

function policy(over: Partial<InsurancePolicy> = {}): InsurancePolicy {
  return {
    id: 'p1',
    associationId: null,
    kind: 'property',
    carrier: 'Acme Mutual',
    policyNumber: 'SECRET-123',
    coverageLimitCents: 500_000_000,
    deductibleCents: 2_500_000,
    premiumCents: 4_200_000,
    effectiveOn: '2026-01-01',
    expiresOn: '2027-01-01',
    documentId: null,
    notes: 'agent cell 555-0100',
    ...over,
  }
}

function memoryStore() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

describe('masterPolicyForNotice', () => {
  it('picks the property policy in force, the later term when a renewal is on record', () => {
    const renewal = policy({ id: 'p2', effectiveOn: '2026-10-01', expiresOn: '2027-10-01' })
    expect(masterPolicyForNotice([policy(), renewal, policy({ id: 'd', kind: 'directors_officers' })], TODAY)!.id).toBe('p2')
  })
  it('null when no property policy is in force', () => {
    expect(masterPolicyForNotice([policy({ expiresOn: '2026-01-01' }), policy({ id: 'f', kind: 'fidelity' })], TODAY)).toBeNull()
    expect(masterPolicyForNotice([], TODAY)).toBeNull()
  })
})

describe('buildHo6Notice', () => {
  it('states the master policy’s owner-facing facts and suggests HO-6 coverage', () => {
    const d = buildHo6Notice({ associationName: 'Maple Grove HOA', master: policy() })
    expect(d.subject).toMatch(/master policy/)
    expect(d.bodyHtml).toContain('Acme Mutual')
    expect(d.bodyHtml).toContain('$5,000,000')
    expect(d.bodyHtml).toContain('$25,000')
    expect(d.bodyHtml).toContain('January 1, 2027')
    expect(d.bodyHtml).toContain('HO-6')
    expect(d.bodyHtml).toContain('loss assessment')
    expect(d.bodyHtml).toMatch(/governing documents/)
    expect(d.bodyHtml).toMatch(/not insurance or legal advice/)
    // What it covers is the board's to fill in.
    expect(d.bodyHtml).toContain('[From the declarations page')
  })

  it('never includes the premium, the policy number or the notes', () => {
    const d = buildHo6Notice({ associationName: 'Maple Grove HOA', master: policy() })
    expect(d.bodyHtml).not.toContain('SECRET-123')
    expect(d.bodyHtml).not.toContain('42,000')
    expect(d.bodyHtml).not.toContain('555-0100')
  })

  it('no master policy on record: bracketed blanks, never invented numbers', () => {
    const d = buildHo6Notice({ associationName: null, master: null })
    expect(d.bodyHtml).toContain('[insurer]')
    expect(d.bodyHtml).toContain('[limit]')
    expect(d.bodyHtml).toContain('[deductible]')
    expect(d.bodyHtml).toContain('the association')
    expect(d.bodyHtml).not.toMatch(/\$\d/)
  })

  it('missing limit or deductible stays a blank', () => {
    const d = buildHo6Notice({ associationName: 'X', master: policy({ coverageLimitCents: null, deductibleCents: null }) })
    expect(d.bodyHtml).toContain('Coverage limit: [limit]')
    expect(d.bodyHtml).toContain('Deductible: [deductible]')
  })

  it('escapes HTML in the names it holds', () => {
    const d = buildHo6Notice({ associationName: '<b>Oak</b> & Co', master: policy({ carrier: '<script>x</script>' }) })
    expect(d.bodyHtml).not.toContain('<script>')
    expect(d.bodyHtml).toContain('&lt;b&gt;Oak&lt;/b&gt; &amp; Co')
  })
})

describe('the hand-off', () => {
  it('opens the composer with ?from=ho6-notice', () => {
    expect(HO6_NOTICE_FROM).toBe('ho6-notice')
    expect(HO6_NOTICE_WIZARD_HREF).toBe('/communications/new?from=ho6-notice')
  })

  it('round-trips through storage', () => {
    const s = memoryStore()
    const d = buildHo6Notice({ associationName: 'Maple', master: policy() })
    expect(writeHo6NoticeDraft(s, d)).toBe(true)
    expect(readHo6NoticeDraft(s)).toEqual(d)
  })

  it('missing, blocked or malformed storage reads as null', () => {
    expect(writeHo6NoticeDraft(null, { subject: 's', bodyHtml: 'b' })).toBe(false)
    expect(
      writeHo6NoticeDraft(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error('blocked')
          },
        },
        { subject: 's', bodyHtml: 'b' },
      ),
    ).toBe(false)
    const s = memoryStore()
    expect(readHo6NoticeDraft(s)).toBeNull()
    s.m.set(HO6_NOTICE_DRAFT_KEY, '{nope')
    expect(readHo6NoticeDraft(s)).toBeNull()
    s.m.set(HO6_NOTICE_DRAFT_KEY, JSON.stringify({ subject: ' ', bodyHtml: 'b' }))
    expect(readHo6NoticeDraft(s)).toBeNull()
  })
})
