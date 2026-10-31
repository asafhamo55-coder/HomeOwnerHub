// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const h = vi.hoisted(() => ({
  push: vi.fn(),
  createLawUpdate: vi.fn(async () => ({ ok: true as const, data: { updateId: 'new-1' } })),
  updateLawUpdate: vi.fn(async (): Promise<{ ok: boolean; error?: string }> => ({ ok: true })),
}))

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
vi.mock('@/components/ai/AiRewriteButton', () => ({ AiRewriteButton: () => null }))
vi.mock('@/lib/state-law', () => ({
  createLawUpdate: h.createLawUpdate,
  updateLawUpdate: h.updateLawUpdate,
}))
vi.mock('@homeowner-portal/ui', async (orig) => ({
  ...(await orig<typeof import('@homeowner-portal/ui')>()),
  useToast: () => vi.fn(),
}))

const { NewUpdateForm } = await import('./NewUpdateForm')

const ID = '11111111-1111-4111-8111-111111111111'
const initial = {
  id: ID,
  headline: 'Fine cap raised to $200',
  summary: 'The cap on per-violation fines rises, effective January 1, for every association.',
  action_items: ['Update the fine schedule', 'Notify owners'],
  category: 'fines',
  effective_date: '2027-01-01',
  source_url: 'https://example.org/law',
  related_statute_id: null,
}

let root: Root
let host: HTMLElement

beforeEach(() => {
  h.push.mockClear()
  h.createLawUpdate.mockClear()
  h.updateLawUpdate.mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

const field = (name: string) => host.querySelector<HTMLInputElement>(`[name="${name}"]`)!

describe('NewUpdateForm in edit mode', () => {
  it('prefills every field from the existing update', async () => {
    await act(async () => root.render(<NewUpdateForm statutes={[]} initial={initial} />))
    expect(field('headline').value).toBe(initial.headline)
    expect(field('summary').value).toBe(initial.summary)
    expect(field('category').value).toBe('fines')
    expect(field('effective_date').value).toBe('2027-01-01')
    expect(field('source_url').value).toBe(initial.source_url)
    const items = [...host.querySelectorAll<HTMLInputElement>('input[placeholder^="Schedule a structural"]')]
    expect(items.map((i) => i.value)).toEqual(initial.action_items)
    expect(host.textContent).toContain('Save changes')
  })

  it('saving calls updateLawUpdate with the update id, not createLawUpdate', async () => {
    await act(async () => root.render(<NewUpdateForm statutes={[]} initial={initial} />))
    await act(async () => {
      host.querySelector('form')!.requestSubmit()
    })
    expect(h.createLawUpdate).not.toHaveBeenCalled()
    expect(h.updateLawUpdate).toHaveBeenCalledTimes(1)
    expect(h.updateLawUpdate).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({
        headline: initial.headline,
        actionItems: initial.action_items,
        category: 'fines',
        effectiveDate: '2027-01-01',
      }),
    )
    expect(h.push).toHaveBeenCalledWith('/legal/updates')
  })

  it('shows the refusal and stays on the page when the action refuses', async () => {
    h.updateLawUpdate.mockResolvedValueOnce({ ok: false, error: 'Only the platform team can edit law updates.' })
    await act(async () => root.render(<NewUpdateForm statutes={[]} initial={initial} />))
    await act(async () => {
      host.querySelector('form')!.requestSubmit()
    })
    expect(host.textContent).toContain('Only the platform team can edit law updates.')
    expect(h.push).not.toHaveBeenCalled()
  })

  it('create mode is unchanged: empty fields and createLawUpdate', async () => {
    await act(async () => root.render(<NewUpdateForm statutes={[]} />))
    expect(field('headline').value).toBe('')
    expect(host.textContent).toContain('Post update')
  })
})
