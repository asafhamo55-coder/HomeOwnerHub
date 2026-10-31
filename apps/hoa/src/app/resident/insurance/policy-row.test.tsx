import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { PolicyRow } from './policy-row'
import type { OwnerPolicySummary } from '@/lib/insurance/analysis'

// IconTile in resident/screen.tsx relies on the automatic JSX runtime; give it React here.
vi.stubGlobal('React', React)

const base: OwnerPolicySummary = {
  id: 'p1',
  associationId: null,
  kind: 'property',
  carrier: 'Acme Mutual',
  coverageLimitCents: 100_000_000,
  deductibleCents: 500_000,
  expiresOn: '2027-01-01',
}

describe('PolicyRow', () => {
  it('shows the in-force-through date without a timezone shift', () => {
    expect(renderToStaticMarkup(<PolicyRow p={base} />)).toContain('In force through Jan 1, 2027')
  })

  it('leaves the line out when the date is missing', () => {
    expect(renderToStaticMarkup(<PolicyRow p={{ ...base, expiresOn: '' }} />)).not.toContain('In force through')
  })
})
