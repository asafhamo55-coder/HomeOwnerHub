import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Ballot, EnvelopeLabels, TallySheet } from './print-kit'

;(globalThis as { React?: typeof React }).React = React

// BL-141 printables: candidate names, seats and inspectors only. The
// ballot never identifies a voter (CA § 5115(c)); the voter signs only the
// outer envelope. Fixture names are invented.

const header = { associationName: 'Peachtree Commons HOA', meetingLabel: 'Annual meeting', meetingDate: 'Mar 10, 2027' }
const names = ['Pat Lee', 'Sam Ortiz', 'Robin Park']

describe('Ballot', () => {
  it('lists the candidates and the number to vote for, with nowhere to name the voter', () => {
    const html = renderToStaticMarkup(<Ballot header={header} candidates={names} seats={2} jurisdiction="CA" />)
    for (const n of names) expect(html).toContain(n)
    expect(html).toContain('Vote for up to 2 candidates.')
    expect(html).toContain('Official secret ballot')
    expect(html).toContain('Do not sign this ballot')
    expect(html).not.toMatch(/Signature:|Printed name:|Lot:/)
  })

  it('Georgia: no secret-ballot rule is claimed; the bylaws decide', () => {
    const html = renderToStaticMarkup(<Ballot header={header} candidates={names} seats={null} jurisdiction="GA" />)
    expect(html).toContain('Official ballot')
    expect(html).not.toContain('secret ballot')
    expect(html).toContain('Your bylaws decide')
    expect(html).toContain('Vote for up to ____ candidates.')
  })

  it('Florida: the absentee two-envelope instructions, only where the documents allow it', () => {
    const html = renderToStaticMarkup(<Ballot header={header} candidates={names} seats={1} jurisdiction="FL" />)
    expect(html).toContain('only where your governing documents allow it')
    expect(html).toContain('Two ballots for one lot are both disqualified')
  })
})

describe('Envelopes and tally', () => {
  it('the outer envelope carries the signature, addressed to the inspectors (CA)', () => {
    const html = renderToStaticMarkup(<EnvelopeLabels header={header} jurisdiction="CA" inspectors={['Jo Notary']} />)
    expect(html).toContain('SECRET BALLOT')
    expect(html).toContain('Signature:')
    expect(html).toContain('Inspector of elections: Jo Notary')
  })

  it('CA prints the inspector’s independence checks; elsewhere a tellers’ sheet', () => {
    const ca = renderToStaticMarkup(<TallySheet header={header} candidates={names} jurisdiction="CA" inspectors={['Jo Notary']} />)
    expect(ca).toContain('I am not a director, a candidate')
    expect(ca).toContain('Inspector 1: Jo Notary')
    const ga = renderToStaticMarkup(<TallySheet header={header} candidates={names} jurisdiction="GA" inspectors={[]} />)
    expect(ga).toContain('Tally sheet')
    expect(ga).toContain('Teller 3:')
    for (const n of names) expect(ga).toContain(n)
  })
})
