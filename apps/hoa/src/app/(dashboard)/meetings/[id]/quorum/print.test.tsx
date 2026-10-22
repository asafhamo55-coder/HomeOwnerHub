import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { printableHomes } from '@/lib/meeting-quorum/quorum'
import { proxyLaw } from '@/lib/meeting-quorum/law'
import { ProxyForm, SIGN_IN_BLANK_ROWS, SignInSheet } from './print'

;(globalThis as { React?: typeof React }).React = React

// BL-122 printables: names and addresses only — the roster rows carry
// emails and phones, and none of them may reach paper. Fixture names and
// contact details are invented.

const rows = [
  {
    propertyId: 'p1',
    address: '104 Example Way',
    unitNumber: null,
    lotNumber: '1',
    owners: [
      { name: 'Ana Rivera', share: '60%', email: 'ana.rivera@example.test', phone: '(555) 010-0001' },
      { name: 'Ben Rivera', share: '40%', email: 'ben@example.test', phone: '+1 555 010 0002' },
    ],
  },
  { propertyId: 'p2', address: '108 Example Way', unitNumber: '2B', lotNumber: '2', owners: [{ name: 'Cara Nguyen', share: '100%', email: 'cara@example.test', phone: '5550100003' }] },
  { propertyId: 'p3', address: '112 Example Way', unitNumber: null, lotNumber: null, owners: [] },
]
const homes = printableHomes(rows)
const header = { associationName: 'Maple HOA', meetingLabel: 'Annual meeting', meetingDate: 'Jan 15, 2027' }
const html = (el: React.ReactElement) => renderToStaticMarkup(el)

function expectNoContact(out: string) {
  expect(out).not.toMatch(/@/)
  expect(out).not.toContain('example.test')
  expect(out).not.toMatch(/555/)
}

describe('SignInSheet', () => {
  const out = html(<SignInSheet header={header} homes={homes} showShares />)

  it('one row per home with owner names, lot, votes and a signature column', () => {
    expect(out).toContain('Maple HOA — Annual meeting sign-in sheet')
    expect(out).toContain('104 Example Way')
    expect(out).toContain('108 Example Way, Unit 2B')
    expect(out).toContain('Ana Rivera')
    expect(out).toContain('(60%)')
    expect(out).toContain('No owner on record')
    expect(out).toContain('Signature')
    expect((out.match(/<tr/g) ?? []).length).toBe(1 + homes.length + SIGN_IN_BLANK_ROWS)
  })

  it('prints no email address or phone number', () => {
    expectNoContact(out)
  })

  it('leaves shares off when they say nothing', () => {
    const plain = html(<SignInSheet header={header} homes={printableHomes([rows[1]!])} showShares={false} />)
    expect(plain).not.toContain('(100%)')
  })
})

describe('ProxyForm', () => {
  it('Florida: § 720.306 lines, time and place, substitution clause, 90-day expiry; no contact details', () => {
    const out = html(<ProxyForm header={header} home={homes[0]!} law={proxyLaw('FL')} />)
    expect(out).toContain('Proxy — Annual meeting')
    expect(out).toContain('Ana Rivera, Ben Rivera')
    expect(out).toContain('Meeting time:')
    expect(out).toContain('Place:')
    expect(out).toContain('General proxy')
    expect(out).toContain('Limited (directed) proxy')
    expect(out).toContain('§ 720.306(8)(a)')
    expect(out).toContain('may appoint, in writing, a substitute')
    expect(out).toContain('expires 90 days after the meeting date')
    expectNoContact(out)
  })

  it('California: § 5130 and a detachable directions page', () => {
    const out = html(<ProxyForm header={header} home={homes[1]!} law={proxyLaw('CA')} />)
    expect(out).toContain('§ 5130')
    expect(out).toContain('detach and give to the proxy holder')
    expect(out).not.toContain('substitute')
    expectNoContact(out)
  })

  it('Georgia (BL-150): a dated-proxy line, notice-only revocation, joint and entity owners; never "revoke at any time"', () => {
    const out = html(<ProxyForm header={header} home={homes[0]!} law={proxyLaw('GA')} />)
    expect(out).toContain('An undated proxy is void')
    expect(out).toContain('revoked only by written notice delivered to the association')
    expect(out).toContain('all signing owners agree')
    expect(out).toContain('must vote by proxy')
    expect(out).toContain('§ 44-3-224(b)')
    expect(out).toContain('§ 44-3-228')
    // Revocable without notice would make a Georgia proxy void.
    expect(out).not.toContain('revoked at any time')
    expect(out).not.toContain('substitute')
    expect(out).toContain('Date:')
    expectNoContact(out)
  })

  it('elsewhere: no statute, check your bylaws', () => {
    const out = html(<ProxyForm header={header} home={homes[2]!} law={proxyLaw('TX')} />)
    expect(out).not.toContain('§')
    expect(out).toContain('Check your bylaws')
    expect(out).toContain('No owner on record')
    // An owner line to fill in by hand when no owner is on record.
    expect(out).toContain('Owner:')
  })
})
