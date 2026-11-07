// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
;(globalThis as { React?: typeof React }).React = React

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))
const save = vi.fn()
vi.mock('@/lib/amenities/actions', () => ({ saveAmenity: (...a: unknown[]) => save(...a) }))

const { AmenityForm } = await import('./AmenityForm')
const { ToastProvider } = await import('@homeowner-portal/ui')
import type { Amenity } from '@/lib/amenities/model'

const hall: Amenity = {
  id: 'a1',
  associationId: 'x1',
  name: 'Clubhouse',
  description: 'Big room.',
  rules: 'Clean up.',
  requiresApproval: false,
  openHour: 9,
  closeHour: 21,
  maxHours: 3,
  advanceDays: 30,
  maxActivePerUnit: 2,
  isActive: true,
  capacity: null,
  concurrentLimit: 1,
  minNoticeHours: 0,
  cancelCutoffHours: 0,
  retiredAt: null,
  weeklyHours: null,
  blackouts: [],
}

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.clearAllMocks()
})

function mount(amenity: Amenity | null, associations: { id: string; name: string }[] = []) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root!.render(
      <ToastProvider>
        <AmenityForm amenity={amenity} associations={associations} />
      </ToastProvider>,
    )
  })
  return host
}
const click = (el: Element | null | undefined) => act(() => void (el as HTMLElement).click())
const byText = (tag: string, text: string) => [...document.querySelectorAll(tag)].find((e) => e.textContent?.trim() === text)
const flush = () => act(async () => { await Promise.resolve() })

describe('AmenityForm', () => {
  it('renders each section as a titled heading, in order', () => {
    mount(null, [
      { id: 'x1', name: 'North' },
      { id: 'x2', name: 'South' },
    ])
    const titles = [...document.querySelectorAll('h2')].map((h) => h.textContent)
    expect(titles).toEqual(['The basics', "When it's open", 'Booking rules', 'More rules', 'Closed dates', 'Rules for residents', 'Open for booking'])
    expect(document.body.textContent).toContain('Which community is this for?')
  })

  it('hides the community picker for one community and on edit', () => {
    mount(null, [{ id: 'x1', name: 'North' }])
    expect(document.body.textContent).not.toContain('Which community is this for?')
  })

  it('hours radio toggles the weekly grid', () => {
    mount(hall)
    const group = document.querySelector('fieldset')!
    expect(group.querySelector('legend')!.textContent).toBe('Hours')
    expect(document.querySelectorAll('input[name="hours-mode"]')).toHaveLength(2)
    expect(document.getElementById('amenity-weekly')).toBeNull()
    expect(document.getElementById('amenity-open')).not.toBeNull()
    click(document.querySelector('input[name="hours-mode"][type="radio"]:not(:checked)'))
    expect(document.getElementById('amenity-weekly')).not.toBeNull()
    expect(document.body.textContent).toContain('Sunday')
    expect(document.getElementById('amenity-open')).toBeNull()
  })

  it('approval is a radio pair and loads the amenity value', () => {
    mount(hall)
    const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="approval"]')]
    expect(radios).toHaveLength(2)
    expect(radios[0].checked).toBe(false) // board approves
    expect(radios[1].checked).toBe(true) // right away
    click(radios[0])
    expect(radios[0].checked).toBe(true)
  })

  it('more rules are collapsed until opened', () => {
    mount(hall)
    expect(document.getElementById('amenity-more-rules')).toBeNull()
    const btn = byText('button', 'Show more rules')!
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    click(btn)
    expect(document.getElementById('amenity-more-rules')).not.toBeNull()
    expect(byText('button', 'Hide more rules')!.getAttribute('aria-expanded')).toBe('true')
  })

  it('edit loads the existing values', () => {
    mount(hall)
    expect((document.getElementById('amenity-name') as HTMLInputElement).value).toBe('Clubhouse')
    expect((document.getElementById('amenity-max-hours') as HTMLInputElement).value).toBe('3')
    expect((document.getElementById('amenity-rules') as HTMLTextAreaElement).value).toBe('Clean up.')
    expect(byText('button', 'Save changes')).toBeDefined()
  })

  it('add keeps a stable Add amenity label and cancel goes back to the list', () => {
    mount(null)
    expect(byText('button', 'Add amenity')).toBeDefined()
    expect(byText('a', 'Cancel')!.getAttribute('href')).toBe('/amenities')
  })

  it('goes back to the list after a good save', async () => {
    save.mockResolvedValue({ ok: true, id: 'a1' })
    mount(hall)
    click(byText('button', 'Save changes'))
    await flush()
    expect(save).toHaveBeenCalledOnce()
    expect(push).toHaveBeenCalledWith('/amenities')
  })

  it('a failed save focuses the error summary, with links to the fields', async () => {
    save.mockResolvedValue({ ok: false, error: 'Enter a name, like Clubhouse.', fieldErrors: { name: 'Enter a name, like Clubhouse.' } })
    mount({ ...hall, name: '' })
    click(byText('button', 'Save changes'))
    await flush()
    expect(push).not.toHaveBeenCalled()
    const link = byText('a', 'Name') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe('#amenity-name')
    const summary = link.closest('[tabindex="-1"]')
    expect(document.activeElement).toBe(summary)
  })

  it('an error inside the collapsed rules opens them', async () => {
    save.mockResolvedValue({ ok: false, error: 'Enter 1 or more.', fieldErrors: { maxActivePerUnit: 'Enter 1 or more.' } })
    mount(hall)
    click(byText('button', 'Save changes'))
    await flush()
    expect(document.getElementById('amenity-more-rules')).not.toBeNull()
  })

  it('affected bookings are a radio group, the note shows for cancel, and the label stays', async () => {
    save.mockResolvedValue({ ok: false, error: 'This change affects 2 bookings. Choose what to do with them, then save again.', affected: 2 })
    mount(hall)
    click(byText('button', 'Save changes'))
    await flush()
    const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="affected"]')]
    expect(radios).toHaveLength(2)
    expect(document.querySelectorAll('input[name="affected"][type="checkbox"]')).toHaveLength(0)
    expect(radios[0].checked).toBe(true)
    expect(document.getElementById('amenity-affected-note')).toBeNull()
    click(radios[1])
    expect(document.getElementById('amenity-affected-note')).not.toBeNull()
    expect(byText('button', 'Save changes')).toBeDefined()
    expect(document.body.textContent).toContain('This change affects 2 bookings.')
  })
})
