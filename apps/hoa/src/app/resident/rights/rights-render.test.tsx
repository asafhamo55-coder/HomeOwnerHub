import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GA_OWNER_RIGHTS } from '@/lib/owner-rights/law'
import { georgiaScope } from '@/lib/owner-rights/scope'
import { OwnerRightsView } from './OwnerRightsView'

;(globalThis as { React?: typeof React }).React = React

// BL-164: the rights page quotes all twelve rights (the quotes themselves
// are checked against the fixture in lib/owner-rights/law.test.ts), links
// each to the portal, and reads "takes effect Jan 1, 2027" before then.

const html = (today: string, recordsLive = true) => renderToStaticMarkup(<OwnerRightsView today={today} recordsLive={recordsLive} />)
const unescape = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&')

describe('OwnerRightsView', () => {
  it('before 2027: every right is shown, marked "takes effect Jan 1, 2027"', () => {
    const out = unescape(html('2026-10-26'))
    for (const r of GA_OWNER_RIGHTS) expect(out).toContain(`“${r.quote}”`)
    expect(out.split('takes effect Jan 1, 2027').length - 1).toBe(13)
  })

  it('from 2027: no "takes effect" wording', () => {
    const out = html('2027-01-01')
    expect(out).not.toContain('takes effect')
    expect(out).toContain('every owner in a Georgia owners’ association is entitled to')
  })

  it('links each right to where the owner uses it', () => {
    const out = html('2027-01-01')
    for (const href of ['/resident/records/new', '/resident/insurance', '/resident/meetings', '/resident/documents', '/resident/dues', '/resident/tickets/new']) {
      expect(out).toContain(`href="${href}"`)
    }
    expect(html('2027-01-01', false)).not.toContain('href="/resident/records/new"')
  })
})

describe('georgiaScope', () => {
  const rows = [
    { id: 'ga', state: 'GA', governing_law_state: null },
    { id: 'fl', state: 'FL', governing_law_state: null },
    { id: 'gov', state: 'FL', governing_law_state: 'Georgia' },
  ]
  it('the resident’s homes decide; governing-law state wins over the address', () => {
    expect(georgiaScope(rows, ['fl']).map((r) => r.id)).toEqual([])
    expect(georgiaScope(rows, ['gov']).map((r) => r.id)).toEqual(['gov'])
    expect(georgiaScope(rows, []).map((r) => r.id)).toEqual(['ga', 'gov'])
  })
})
