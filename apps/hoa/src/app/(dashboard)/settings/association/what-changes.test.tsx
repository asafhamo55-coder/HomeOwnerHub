import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describeStateChange } from '@/lib/association-settings'
import { WhatChangesBox } from './WhatChangesBox'

;(globalThis as { React?: typeof React }).React = React

// BL-176: the "What changes" box a state or type change shows before it is
// saved. Rendered from fixtures; no browser, no database.

const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('WhatChangesBox', () => {
  it('Georgia to Florida: SB 406, registration kit, collections letters, late-fee cap and State Law answers switch', () => {
    const out = text(
      html(
        <WhatChangesBox
          summary={describeStateChange(
            { state: 'GA', governingLawState: 'GA', type: 'hoa' },
            { state: 'FL', governingLawState: 'FL', type: 'hoa' },
          )}
        />,
      ),
    )
    expect(out).toContain('What changes')
    expect(out).toContain('Georgia SB 406')
    expect(out).toContain('stop applying')
    expect(out).toContain('Registration kit and deadlines')
    expect(out).toContain('switch from Georgia to Florida rules')
    expect(out).toContain('Collections letters')
    expect(out).toContain('no longer offered')
    expect(out).toContain('State Law answers draw on Florida law instead of Georgia')
    expect(out).toContain('Late-fee cap')
    expect(out).toContain('44-3-232(b)(1)')
    expect(out).toContain('720.3085(3)(a)')
    expect(out).toContain('Nothing already recorded is rewritten')
    expect(out).toContain('Late fees')
  })

  it('HOA to condominium in Georgia: the Condominium Act and its late-fee citation apply; no state items', () => {
    const summary = describeStateChange(
      { state: 'GA', governingLawState: 'GA', type: 'hoa' },
      { state: 'GA', governingLawState: 'GA', type: 'condo' },
    )
    const out = text(html(<WhatChangesBox summary={summary} />))
    expect(out).toContain('Condo vs HOA law')
    expect(out).toContain('Georgia Condominium Act applies instead of the Property Owners’ Association Act')
    expect(out).toContain('44-3-109(b)(1)')
    expect(out).not.toContain('Georgia SB 406')
    expect(out).not.toContain('State Law answers')
    expect(summary.items.map((i) => i.topic)).toEqual(['Condo vs HOA law', 'Late-fee cap'])
  })

  it('a change of governing-law state alone counts as a state change', () => {
    const summary = describeStateChange(
      { state: 'FL', governingLawState: 'FL', type: 'hoa' },
      { state: 'FL', governingLawState: 'GA', type: 'hoa' },
    )
    expect(summary.items.map((i) => i.topic)).toContain('Georgia SB 406')
  })

  it('moving to a state with no loaded rules says so', () => {
    const out = text(
      html(
        <WhatChangesBox
          summary={describeStateChange(
            { state: 'GA', governingLawState: 'GA', type: 'hoa' },
            { state: 'OH', governingLawState: 'OH', type: 'hoa' },
          )}
        />,
      ),
    )
    expect(out).toContain('Ohio has no state rules loaded yet')
    expect(out).toContain('no cap loaded')
  })

  it('renders nothing when only the name changed', () => {
    const summary = describeStateChange(
      { state: 'GA', governingLawState: null, type: 'hoa' },
      { state: 'GA', governingLawState: 'GA', type: 'hoa' },
    )
    expect(summary.changed).toBe(false)
    expect(html(<WhatChangesBox summary={summary} />)).toBe('')
  })
})
