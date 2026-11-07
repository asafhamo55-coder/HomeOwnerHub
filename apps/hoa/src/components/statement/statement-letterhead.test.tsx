import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { StatementDocument } from './StatementDocument'

;(globalThis as { React?: typeof React }).React = React

describe('StatementDocument letterhead', () => {
  it('prints the website logo with alt text above the association name', () => {
    const html = renderToStaticMarkup(
      <StatementDocument
        associationName="Madison Park"
        statementDate="2026-11-06"
        period="All activity"
        all
        from="2026-01-01"
        window={{
          openingBalance: 0,
          entries: [],
          closingBalance: 0,
          totals: { charges: 0, payments: 0 } as never,
        }}
        preparedFor={{ name: 'Pat Sample' }}
        homes={['12 Oak Ln']}
        truncated={false}
        truncatedNote=""
        emptyHint="Nothing yet"
        footer="Thanks"
      />,
    )
    expect(html).toContain('src="/brand-site/logo-full.svg"')
    expect(html).toContain('alt="HomeownerHub"')
    expect(html).toContain('print-color-adjust:exact')
    expect(html).toContain('Madison Park')
  })
})
