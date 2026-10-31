import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ToastProvider } from '@homeowner-portal/ui'

;(globalThis as { React?: typeof React }).React = React
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/leases', () => ({ setLeaseCap: vi.fn(), suggestLeaseCapFromDocs: vi.fn() }))

const { LeaseCapEditor } = await import('./LeaseCapEditor')
const props = { associationId: 'as1', currentCapPct: null, aiSuggestedPct: null, aiSource: null }

describe('LeaseCapEditor', () => {
  it('is disabled when the cap read failed', () => {
    const html = renderToStaticMarkup(<ToastProvider><LeaseCapEditor {...props} disabled /></ToastProvider>)
    expect((html.match(/disabled=""/g) ?? []).length).toBe(2)
  })
  it('is enabled by default', () => {
    const html = renderToStaticMarkup(<ToastProvider><LeaseCapEditor {...props} /></ToastProvider>)
    expect(html).not.toContain('disabled=""')
  })
})
