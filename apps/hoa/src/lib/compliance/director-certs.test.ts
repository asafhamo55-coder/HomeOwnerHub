import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DIRECTOR_CERTS_KEY,
  DIRECTOR_CERT_FIXTURE,
  addDays,
  addYears,
  certificateDueOn,
  certificateRenewBy,
  certificateRetainUntil,
  directorCertAlerts,
  directorCertAssociation,
  directorCertDigestLine,
  directorCertRows,
  directorCertStatus,
  directorCertView,
  isAllowedDocumentUrl,
  isYmd,
  readDirectorCerts,
  signDirectorCert,
  withDirectorCert,
  type DirectorCert,
} from './director-certs'

const SECRET = 'test-secret'
const A = '11111111-1111-4111-8111-111111111111'
const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const U2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const cert = (over: Partial<DirectorCert> = {}): DirectorCert => ({
  electedOn: '2026-08-01',
  certifiedOn: null,
  documentUrl: null,
  updatedAt: '2026-10-21T12:00:00.000Z',
  updatedBy: U2,
  ...over,
})

describe('the statute text we cite is in the fixture', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const html = readFileSync(path.resolve(here, '../../../../../', DIRECTOR_CERT_FIXTURE), 'utf8')
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#8217;|&rsquo;/g, '’').replace(/\s+/g, ' ')
  it.each([
    'Within 90 days after being elected or appointed to the board, each director must submit a certificate of having satisfactorily completed the educational curriculum',
    'The certificate of completion is valid for up to 4 years.',
    'at least 4 hours of continuing education annually',
    'at least 8 hours of continuing education annually',
    'is suspended from the board until he or she complies with the requirement',
    'for inspection by the members for 5 years after the director',
    'does not affect the validity of any board action',
  ])('%s', (quote) => {
    expect(text).toContain(quote)
  })
})

describe('day math', () => {
  it('validates real calendar dates', () => {
    expect(isYmd('2026-02-28')).toBe(true)
    expect(isYmd('2026-02-30')).toBe(false)
    expect(isYmd('2026-2-3')).toBe(false)
    expect(isYmd(null)).toBe(false)
  })

  it('certificate due 90 days after election, across months and years', () => {
    expect(certificateDueOn('2026-08-01')).toBe('2026-10-30')
    expect(certificateDueOn('2026-11-15')).toBe('2027-02-13')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('valid 4 years, retained 5 years; Feb 29 falls back to Feb 28', () => {
    expect(certificateRenewBy('2026-10-01')).toBe('2030-10-01')
    expect(certificateRetainUntil('2026-10-01')).toBe('2031-10-01')
    expect(addYears('2028-02-29', 1)).toBe('2029-02-28')
    expect(addYears('2028-02-29', 4)).toBe('2032-02-29')
  })

  it('not recorded → no alert', () => {
    const s = directorCertStatus(null, '2026-10-21')
    expect(s).toMatchObject({ tone: 'not_recorded', alert: false, daysLeft: null })
  })

  it('more than 30 days left → pending, no alert', () => {
    const s = directorCertStatus(cert({ electedOn: '2026-10-01' }), '2026-10-21') // due 2026-12-30
    expect(s).toMatchObject({ tone: 'pending', daysLeft: 70, alert: false, dueOn: '2026-12-30' })
  })

  it('30 days left → due soon, alert', () => {
    const s = directorCertStatus(cert({ electedOn: '2026-08-22' }), '2026-10-21') // due 2026-11-20
    expect(s).toMatchObject({ tone: 'due_soon', daysLeft: 30, alert: true })
    expect(s.label).toBe('Certificate due in 30 days (Nov 20, 2026)')
  })

  it('day 90 itself is still on time; day 91 is overdue', () => {
    expect(directorCertStatus(cert(), '2026-10-30')).toMatchObject({ tone: 'due_soon', daysLeft: 0 })
    expect(directorCertStatus(cert(), '2026-10-30').label).toBe('Certificate due today (Oct 30, 2026)')
    const late = directorCertStatus(cert(), '2026-10-31')
    expect(late).toMatchObject({ tone: 'overdue', daysLeft: -1, alert: true })
    expect(late.label).toContain('suspended until filed')
  })

  it('certified: valid for 4 years, warns in the last 30 days, then expired', () => {
    const c = cert({ certifiedOn: '2026-09-15' })
    expect(directorCertStatus(c, '2026-10-21')).toMatchObject({ tone: 'certified', alert: false, dueOn: '2030-09-15' })
    expect(directorCertStatus(c, '2030-08-16')).toMatchObject({ tone: 'renewal_soon', daysLeft: 30, alert: true })
    expect(directorCertStatus(c, '2030-09-16')).toMatchObject({ tone: 'expired', alert: true })
  })

  it('a certificate from before the election (still valid) counts', () => {
    expect(directorCertStatus(cert({ electedOn: '2026-10-01', certifiedOn: '2025-01-10' }), '2026-12-31').tone).toBe(
      'certified',
    )
  })

  it('alerts: only the alerting rows, most overdue first; digest line cites the statute', () => {
    const certs = new Map([
      [U1, cert({ electedOn: '2026-07-01' })], // due 2026-09-29: overdue
      [U2, cert({ electedOn: '2026-08-22' })], // due soon
    ])
    const rows = directorCertRows(
      [
        { userId: U2, name: 'Pat Board' },
        { userId: U1, name: null },
        { userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'No Record' },
      ],
      certs,
      '2026-10-21',
    )
    expect(rows).toHaveLength(3)
    const alerts = directorCertAlerts(rows)
    expect(alerts.map((r) => r.userId)).toEqual([U1, U2])
    expect(directorCertDigestLine(alerts[0]!)).toBe(
      'A board member: certificate overdue since Sep 29, 2026 — suspended until filed. Fla. Stat. § 720.3033(1).',
    )
    expect(directorCertDigestLine(alerts[1]!)).toMatch(/^Pat Board: certificate due in 30 days/)
    expect(directorCertView(alerts[1]!)).toMatchObject({ electedLabel: 'Aug 22, 2026', retainLabel: 'Aug 22, 2031' })
  })
})

describe('state filter', () => {
  const assoc = (id: string, name: string, state: string | null, gov: string | null = null) => ({
    id,
    name,
    state,
    governingLawState: gov,
    complianceSettings: {},
  })

  it('Florida associations only, by governing-law state first', () => {
    expect(directorCertAssociation([assoc('a', 'Oak', 'GA'), assoc('b', 'Pine', 'TX'), assoc('c', 'Elm', 'CA')])).toBeNull()
    expect(directorCertAssociation([assoc('a', 'Oak', 'FL', 'GA')])).toBeNull()
    expect(directorCertAssociation([assoc('a', 'Oak', 'GA', 'Florida')])?.id).toBe('a')
    expect(directorCertAssociation([])).toBeNull()
  })

  it('picks the first Florida association by name', () => {
    expect(
      directorCertAssociation([assoc('z', 'Zephyr', 'FL'), assoc('g', 'Georgia One', 'GA'), assoc('b', 'Bay', 'fl')])?.id,
    ).toBe('b')
  })
})

describe('signature and storage', () => {
  it('round-trips a signed record, keeping other keys and other directors', () => {
    const one = signDirectorCert(A, U1, cert({ certifiedOn: '2026-10-01', documentUrl: '/documents/abc' }), SECRET)
    const two = signDirectorCert(A, U2, cert(), SECRET)
    let settings: unknown = { arc_clock: { x: 1 } }
    settings = withDirectorCert(settings, U1, one)
    settings = withDirectorCert(settings, U2, two)
    expect((settings as Record<string, unknown>).arc_clock).toEqual({ x: 1 })
    const read = readDirectorCerts(A, settings, SECRET)
    expect(read.size).toBe(2)
    expect(read.get(U1)).toMatchObject({ certifiedOn: '2026-10-01', documentUrl: '/documents/abc' })
  })

  it('a forged or tampered value reads as not recorded', () => {
    const stored = signDirectorCert(A, U1, cert(), SECRET)
    const tampered = withDirectorCert({}, U1, { ...stored, elected_on: '2026-10-20' })
    expect(readDirectorCerts(A, tampered, SECRET).size).toBe(0)
    const forged = { [DIRECTOR_CERTS_KEY]: { [U1]: { ...stored, sig: 'ab'.repeat(32) } } }
    expect(readDirectorCerts(A, forged, SECRET).size).toBe(0)
  })

  it('bound to the association and the member: a copied record does not verify', () => {
    const stored = signDirectorCert(A, U1, cert(), SECRET)
    expect(readDirectorCerts('22222222-2222-4222-8222-222222222222', withDirectorCert({}, U1, stored), SECRET).size).toBe(0)
    expect(readDirectorCerts(A, withDirectorCert({}, U2, stored), SECRET).size).toBe(0)
  })

  it('no secret or a wrong secret: nothing verifies', () => {
    const settings = withDirectorCert({}, U1, signDirectorCert(A, U1, cert(), SECRET))
    expect(readDirectorCerts(A, settings, null).size).toBe(0)
    expect(readDirectorCerts(A, settings, 'other').size).toBe(0)
  })

  it('malformed values are skipped, never thrown', () => {
    expect(readDirectorCerts(A, null, SECRET).size).toBe(0)
    expect(readDirectorCerts(A, { [DIRECTOR_CERTS_KEY]: [] }, SECRET).size).toBe(0)
    expect(readDirectorCerts(A, { [DIRECTOR_CERTS_KEY]: { [U1]: 'x' } }, SECRET).size).toBe(0)
  })

  it('refuses to sign bad dates or links', () => {
    expect(() => signDirectorCert(A, U1, cert({ electedOn: '2026-13-01' }), SECRET)).toThrow(RangeError)
    expect(() => signDirectorCert(A, U1, cert({ documentUrl: 'javascript:alert(1)' }), SECRET)).toThrow(RangeError)
  })

  it('document links: https or an in-app /documents path only', () => {
    expect(isAllowedDocumentUrl('https://drive.example.com/cert.pdf')).toBe(true)
    expect(isAllowedDocumentUrl('/documents/123')).toBe(true)
    expect(isAllowedDocumentUrl('http://example.com/cert.pdf')).toBe(false)
    expect(isAllowedDocumentUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedDocumentUrl('//evil.example.com')).toBe(false)
    expect(isAllowedDocumentUrl('/settings')).toBe(false)
    expect(isAllowedDocumentUrl('https://a.example.com/' + 'x'.repeat(500))).toBe(false)
  })
})
