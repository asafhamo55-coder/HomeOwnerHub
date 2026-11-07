import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }))
vi.mock('@/lib/association-location-actions', () => ({ saveCommunityLocation: async () => ({ ok: true }) }))

import { COMMUNITY_LOCATION_HELP, saveCommunityLocationSchema } from '@/lib/association-location'
import { ToastProvider } from '@homeowner-portal/ui'
import { CommunityLocationForm } from './CommunityLocationForm'

// The city and ZIP asked for during setup. Same form and same validation as
// before; these tests pin the plain wording, the tap targets and the 5-digit
// ZIP rule the setup step relies on.

const ASSOC = '3f0c1a52-9a3b-4f6e-8a55-0c6c2f2f6b11'
const html = (el: React.ReactElement) => renderToStaticMarkup(el).replace(/<!-- -->/g, '')

describe('CommunityLocationForm', () => {
  const out = html(
    <ToastProvider>
      <CommunityLocationForm associationId={ASSOC} associationName="Oak Hollow" initialCity="Alpharetta" initialZip="30005" />
    </ToastProvider>,
  )

  it('is anchored so the setup step can link straight to it', () => {
    expect(out).toContain('id="community-location"')
  })

  it('explains in one plain sentence why it asks', () => {
    expect(COMMUNITY_LOCATION_HELP).toBe('This lets house photos show for homes whose address is only a street.')
    expect(out).toContain(COMMUNITY_LOCATION_HELP)
  })

  it('asks for the city and ZIP code, filled with what is saved', () => {
    expect(out).toContain('City')
    expect(out).toContain('ZIP code')
    expect(out).toContain('value="Alpharetta"')
    expect(out).toContain('value="30005"')
    expect(out).toContain('inputMode="numeric"')
  })

  it('has 44px tap targets on both fields and the save button', () => {
    expect(out.match(/min-h-11/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(out).toMatch(/<button[^>]*class="[^"]*h-11/)
    expect(out).toContain('Save location')
  })

  it('shows no em dashes', () => {
    expect(out).not.toContain('—')
    expect(COMMUNITY_LOCATION_HELP).not.toContain('—')
  })
})

describe('saveCommunityLocationSchema (the validation the setup step reuses)', () => {
  const parse = (city: string, zip: string) => saveCommunityLocationSchema.safeParse({ associationId: ASSOC, city, zip })

  it('accepts a 5-digit ZIP, a ZIP+4 and a blank pair', () => {
    expect(parse('Alpharetta', '30005').success).toBe(true)
    expect(parse('Alpharetta', '30005-1234').success).toBe(true)
    expect(parse('', '').success).toBe(true)
  })

  it('rejects a ZIP that is not 5 digits, in plain words', () => {
    for (const zip of ['3000', '300055', 'abcde', '30 005']) {
      const r = parse('Alpharetta', zip)
      expect(r.success, zip).toBe(false)
      if (!r.success) expect(r.error.issues[0]!.message).toBe('Enter a 5-digit ZIP code, like 30067.')
    }
  })

  it('rejects a city with digits or symbols', () => {
    expect(parse('Alpha1', '30005').success).toBe(false)
    expect(parse('St. Mary’s', '30005').success).toBe(true)
  })
})
