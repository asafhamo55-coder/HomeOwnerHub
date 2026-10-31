import * as React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('@/lib/collections/actions', () => ({ setCollectionStatus: vi.fn(), recordCollectionEvent: vi.fn(), openCollectionCase: vi.fn() }))
vi.mock('@homeowner-portal/ui', async (orig) => ({ ...(await orig<Record<string, unknown>>()), useToast: () => vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { CollectionsSection } from './CollectionsSection'
import type { CollectionCase } from '@/lib/collections/queries'

;(globalThis as { React?: typeof React }).React = React

const closed = (over: Partial<CollectionCase>): CollectionCase =>
  ({
    id: 'c1',
    unitId: 'u1',
    status: 'written_off',
    attorneyFirm: null,
    attorneyReference: null,
    openedOn: '2026-01-05',
    closedOn: '2026-10-30',
    closedReason: 'Uncollectable',
    ...over,
  }) as CollectionCase

function render(cases: CollectionCase[], canChangeStatus = false) {
  return renderToStaticMarkup(
    <CollectionsSection unitId="u1" openCase={null} events={[]} closedCases={cases} today="2026-10-30" canChangeStatus={canChangeStatus} />,
  )
}

describe('earlier (closed) cases', () => {
  it('show the close date, the reason and the final status', () => {
    const html = render([closed({})])
    expect(html).toContain('2026-01-05')
    expect(html).toContain('2026-10-30')
    expect(html).toContain('Uncollectable')
    expect(html).toContain('Written off')
  })

  it('say "Not recorded" for a missing close date, never a dash', () => {
    const html = render([closed({ closedOn: null, closedReason: null })])
    expect(html).toContain('Not recorded')
    expect(html).not.toContain('→ —')
  })

  it('offer Reopen to board/admin only', () => {
    expect(render([closed({})], true)).toContain('Reopen')
    expect(render([closed({})], false)).not.toContain('Reopen')
  })
})
