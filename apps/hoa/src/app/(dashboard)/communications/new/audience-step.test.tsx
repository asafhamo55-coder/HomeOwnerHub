import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AudienceStep } from './AudienceStep'

// The audience options, server-rendered (communications-new--*.png:
// "Homes with an open violation" repeated its title as its hint, and
// "One home" showed 6 — the number of properties, not recipients).

;(globalThis as { React?: typeof React }).React = React

const noop = () => {}

function render(over: Partial<React.ComponentProps<typeof AudienceStep>> = {}) {
  const props: React.ComponentProps<typeof AudienceStep> = {
    pending: false,
    audience: 'everyone',
    setAudience: noop,
    audienceCounts: { everyone: 7, owners_only: 1, tenants_only: 0, late_on_dues: 6, open_violations: 1, board: 2 },
    properties: Array.from({ length: 6 }, (_, i) => ({ id: `p${i}`, label: `${i + 1} Sample Way` })),
    streets: [],
    selectedStreetKey: '',
    setSelectedStreetKey: noop,
    streetOwnersOnly: false,
    setStreetOwnersOnly: noop,
    manualContacts: [],
    draftName: '',
    setDraftName: noop,
    draftEmail: '',
    setDraftEmail: noop,
    draftPhone: '',
    setDraftPhone: noop,
    addManualContact: () => ({ ok: true }),
    setError: noop,
    removeContact: noop,
    selectedPropertyId: '',
    setSelectedPropertyId: noop,
    residents: [],
    residentsLoading: false,
    checkedResidentIds: new Set(),
    toggleResident: noop,
    selectAllResidents: noop,
    selectByRole: noop,
    clearResidents: noop,
    boardMembers: [],
    boardLoading: false,
    checkedBoardIds: new Set(),
    toggleBoardMember: noop,
    selectAllBoard: noop,
    clearBoard: noop,
    ...over,
  }
  return renderToStaticMarkup(<AudienceStep {...props} />).replace(/<!-- -->/g, '')
}

/** The markup of one audience option's <label>. */
function option(html: string, kind: string): string {
  const m = html.match(new RegExp(`<label for="audience-${kind}"[^>]*>(.*?)</label>`))
  if (!m) throw new Error(`no option ${kind}`)
  return m[1]!
}

describe('AudienceStep options', () => {
  it('the open-violation option has a real description, not its title again', () => {
    const o = option(render(), 'open_violations')
    expect(o).toContain('Homes with an open violation')
    expect(o.match(/Homes with an open violation/g)).toHaveLength(1)
    expect(o).toContain('violation not yet resolved')
  })

  it('"One home" shows no count until a home is chosen', () => {
    const o = option(render(), 'specific_property')
    expect(o).not.toMatch(/class="num[^"]*"/)
    expect(o).not.toContain('>6<')
  })

  it('"One home" counts the chosen home’s selected recipients', () => {
    const o = option(render({ selectedPropertyId: 'p1', checkedResidentIds: new Set(['r1', 'r2']) }), 'specific_property')
    expect(o).toMatch(/<span class="num[^"]*">2<\/span>/)
  })
})

// BL-146: the chosen street lists its homes, each tickable.
describe('AudienceStep street homes', () => {
  const streets = [
    {
      key: 'elm st',
      label: 'Elm St',
      unitIds: ['u1', 'u2', 'u3'],
      ownerCount: 2,
      homes: [
        { id: 'u1', label: '1 Elm St', hasOwner: true },
        { id: 'u2', label: '2 Elm St', hasOwner: true },
        { id: 'u3', label: '3 Elm St', hasOwner: false },
      ],
    },
  ]

  it('shows every home ticked except the excluded ones, with a count', () => {
    const html = render({ audience: 'street', streets, selectedStreetKey: 'elm st', streetExcluded: new Set(['u2']) })
    expect(html).toContain('(2 of 3 ticked)')
    for (const a of ['1 Elm St', '2 Elm St', '3 Elm St']) expect(html).toContain(a)
    const boxes = html.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []
    // Owners only + three homes.
    expect(boxes).toHaveLength(4)
    expect(boxes.filter((b) => / checked=""/.test(b))).toHaveLength(2)
  })

  it('owners only flags a home with no owner on file', () => {
    const html = render({ audience: 'street', streets, selectedStreetKey: 'elm st', streetOwnersOnly: true })
    expect(html).toContain('No owner on file, so nobody here gets it')
  })

  it('no list before a street is chosen', () => {
    expect(render({ audience: 'street', streets, selectedStreetKey: '' })).not.toContain('Homes on this street')
  })
})
