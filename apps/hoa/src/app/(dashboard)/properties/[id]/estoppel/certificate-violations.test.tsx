import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildCertificate, type EstoppelInput } from '@/lib/properties/estoppel/model'

// The printed certificate's violation line, rendered statically. A FL
// estoppel answers § 720.30851(1)(h) item 7 — violations *noticed to the
// owner* — so an open violation without a recorded notice must not be
// listed under that answer; it shows on screen for the board only.

;(globalThis as { React?: typeof React }).React = React

// Server action: never called from a static render.
vi.mock('@/lib/properties/estoppel/actions', () => ({ recordEstoppelPrinted: vi.fn() }))

const { CertificateDocument } = await import('./EstoppelCertificate')

function input(state: string): EstoppelInput {
  return {
    state,
    associationName: 'Fixture HOA',
    propertyId: '22222222-2222-4222-8222-222222222222',
    address: '14 Oak Lane',
    unitNumber: null,
    unitId: '11111111-1111-4111-8111-111111111111',
    lotNumber: null,
    owners: ['Owner A'],
    charges: [],
    payments: [],
    violations: [
      { id: 'v-quiet', description: 'Lawn not mowed', status: 'open', noticeSentAt: null, resolvedAt: null },
      { id: 'v-noticed', description: 'Trash cans visible', status: 'notice_sent', noticeSentAt: '2026-10-01T12:00:00Z', resolvedAt: null },
    ],
    plans: [],
    planInstallmentIds: [],
    collectionCase: null,
    timeZone: 'America/New_York',
  }
}

function render(state: string) {
  const i = input(state)
  const cert = buildCertificate(i, { requestDate: '2026-10-09', issueDate: '2026-10-19', delivery: 'electronic', expedited: false })
  return renderToStaticMarkup(<CertificateDocument cert={cert} input={i} values={{}} printClass="" />)
}

/** The <dd> answering the violation question. */
function answer(html: string, label: RegExp): string {
  const m = html.match(new RegExp(`<dt[^>]*>${label.source}</dt><dd[^>]*>(.*?)</dd>`))
  if (!m) throw new Error('violation row not found')
  return m[1]!
}

describe('certificate violation line', () => {
  it('FL: Yes (1) lists only the noticed violation; the un-noticed one is a print-hidden board check', () => {
    const html = render('FL')
    const dd = answer(html, /Is there any open violation of rule or regulation noticed to the parcel owner in the association official records\?/)
    expect(dd).toContain('Yes (1)')
    expect(dd).toContain('Trash cans visible')
    expect(dd).not.toContain('Lawn not mowed')
    expect(dd).not.toContain('no notice recorded')

    const check = html.match(/<div data-testid="violations-board-check" class="([^"]*)">(.*?)<\/div>/)
    expect(check).not.toBeNull()
    expect(check![1]).toContain('print:hidden')
    expect(check![2]).toContain('Open violations not yet noticed to the owner (board to verify) (1)')
    expect(check![2]).toContain('Lawn not mowed')
  })

  it('TX lists every open violation on record and has no board check', () => {
    const html = render('TX')
    const dd = answer(html, /Open violations on record \(§ 207\.003\(b\)\(11\)\)/)
    expect(dd).toContain('Yes (2)')
    expect(dd).toContain('Lawn not mowed')
    expect(html).not.toContain('violations-board-check')
  })
})
