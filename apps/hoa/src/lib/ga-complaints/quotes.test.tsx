import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { GA_17A5_COMPLAINT, GA_17A5_FEE, GA_17A5_STAY, GA_17A5_STAY_ENDS, GA_SB406_2027_FILE, GA_SB406_2027_IN_FORCE } from '@/lib/compliance/statute-drift'
import type { GaComplaintView } from './load'

;(globalThis as { React?: typeof React }).React = React
vi.mock('@/lib/ga-complaints/actions', () => ({ updateGaComplaint: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const { GA_COMPLAINT_PANEL_QUOTES, GaComplaintCard } = await import('@/app/(dashboard)/properties/[id]/GaComplaintPanel')

/**
 * BL-161: every sentence the complaint panel and the state law check quote
 * is word for word in scripts/fixtures/state-law/ga-sb406-2026-2027-text.txt,
 * inside the subdivision its citation names.
 */
const text = readFileSync(resolve(__dirname, '../../../../../scripts/fixtures/state-law', GA_SB406_2027_FILE), 'utf8')
const squash = (s: string) => s.replace(/\s+/g, ' ').trim()
const s5 = squash(text.slice(text.indexOf('\n43-17A-5.\n'), text.indexOf('\n43-17A-6.\n')))
const s9 = squash(text.slice(text.indexOf('=== SECTION 9.')))

describe('quotes are word for word in SB 406’s 2027 text', () => {
  it('the panel shows exactly the five quotes, all from the 2027 fixture', () => {
    expect(GA_COMPLAINT_PANEL_QUOTES).toEqual([GA_17A5_COMPLAINT, GA_17A5_STAY, GA_17A5_STAY_ENDS, GA_17A5_FEE, GA_SB406_2027_IN_FORCE])
    for (const q of GA_COMPLAINT_PANEL_QUOTES) expect(q.fixture).toBe(GA_SB406_2027_FILE)
  })

  it('each § 43-17A-5 quote opens or sits in the subdivision it cites', () => {
    expect(s5).toContain(`(a)(1) ${squash(GA_17A5_COMPLAINT.quote)}`)
    expect(s5).toContain(`(c) ${squash(GA_17A5_STAY.quote)} ${squash(GA_17A5_STAY_ENDS.quote)}`)
    expect(s5).toContain(`(d) ${squash(GA_17A5_FEE.quote)}`)
  })

  it('§ 9(a) is the 2027 text’s effective-date section', () => {
    expect(s9).toContain(`(a) ${squash(GA_SB406_2027_IN_FORCE.quote)}`)
  })
})

const UNIT = 'a0000000-0000-4000-8000-000000000001'
const running: GaComplaintView['complaints'] = [{ id: 'c0000000-0000-4000-8000-000000000001', filedOn: '2026-12-01', subject: 'fines', conclusionsOn: null, extended: false }]
const view = (over: Partial<GaComplaintView>): GaComplaintView => ({
  unitId: UNIT,
  today: '2026-12-15',
  verified: true,
  complaints: running,
  stay: { kind: 'running', filedOn: '2026-12-01', lastDay: null },
  live: false,
  ...over,
})

describe('the panel, both sides of Jan 1, 2027', () => {
  it('before: a warning only, nothing blocked yet', () => {
    const html = renderToStaticMarkup(<GaComplaintCard view={view({})} />)
    expect(html).toContain('warning only until Jan 1, 2027')
    expect(html).toContain('will block')
    expect(html).not.toContain('The only override')
  })

  it('from Jan 1, 2027: the stay holds fines and fees, attorney advised is the only override', () => {
    const html = renderToStaticMarkup(<GaComplaintCard view={view({ today: '2027-01-05', live: true })} />)
    expect(html).toContain('Stay running · fines and fees held')
    expect(html).toContain('The only override is “attorney advised”')
  })

  it('an unverified record says so', () => {
    const html = renderToStaticMarkup(<GaComplaintCard view={view({ verified: false, complaints: [], stay: { kind: 'unverified' }, live: true })} />)
    expect(html).toContain('can’t be verified')
  })

  it('every quote is shown', () => {
    const html = renderToStaticMarkup(<GaComplaintCard view={view({})} />)
    for (const q of GA_COMPLAINT_PANEL_QUOTES) expect(html).toContain(q.cite.replace(/'/g, '&#x27;'))
  })
})
