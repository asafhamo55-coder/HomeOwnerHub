// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
;(globalThis as { React?: typeof React }).React = React

const request = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/amenities/actions', () => ({ requestReservation: (...a: unknown[]) => request(...a) }))

const { BookingForm } = await import('./BookingForm')
const { dayStrip } = await import('@/lib/amenities/model')
const { ToastProvider } = await import('@homeowner-portal/ui')
import type { Amenity } from '@/lib/amenities/model'

const TZ = 'America/New_York'
const NOW = new Date('2026-11-02T15:00:00Z')
const TODAY = '2026-11-02'

const hall: Amenity = {
  id: 'a1',
  associationId: 'x1',
  name: 'Clubhouse',
  description: 'Big room with a kitchen.',
  rules: null,
  requiresApproval: true,
  openHour: 8,
  closeHour: 22,
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
const pool: Amenity = { ...hall, id: 'a2', name: 'Pool', description: null, requiresApproval: false }

function space(a: Amenity, held: { startsAt: string; endsAt: string }[] = []) {
  return {
    amenity: a,
    homes: [{ id: 'u1', label: '1 Oak St' }],
    days: dayStrip({ amenity: a, timeZone: TZ, now: NOW, held, count: a.advanceDays + 1 }),
    today: TODAY,
    timeZone: TZ,
  }
}

let root: Root | null = null
let host: HTMLElement | null = null
afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  request.mockReset()
})

function mount(spaces: ReturnType<typeof space>[]) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<ToastProvider><BookingForm spaces={spaces} /></ToastProvider>))
  return host
}
const btn = (label: RegExp | string) =>
  Array.from(document.querySelectorAll('button')).find((b) =>
    typeof label === 'string' ? (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label : label.test(b.getAttribute('aria-label') ?? b.textContent ?? ''),
  ) as HTMLButtonElement | undefined
const click = (el: HTMLElement | undefined) => {
  if (!el) throw new Error('button not found')
  act(() => el.click())
}

describe('BookingForm', () => {
  it('starts with big cards for each space and plain rules', () => {
    const el = mount([space(hall), space(pool)])
    expect(el.textContent).toContain('What would you like to book?')
    expect(el.textContent).toContain('Clubhouse')
    expect(el.textContent).toContain('Big room with a kitchen.')
    expect(el.textContent).toContain('Open 8 am to 10 pm. Up to 3 hours. Book up to 30 days ahead.')
    expect(el.textContent).toContain('Step 1 of 4')
  })

  it('walks through day, time, length and review, then books', async () => {
    request.mockResolvedValue({ ok: true, status: 'pending' })
    const el = mount([space(hall), space(pool)])
    click(btn(/^Clubhouse/))
    expect(el.textContent).toContain('Which day for Clubhouse?')
    // Today and earlier days cannot be picked; a later day can.
    expect(btn(/Monday, November 2, today/)?.disabled).toBe(false)
    click(btn(/Saturday, November 14, has free times/))
    expect(el.textContent).toContain('What time on Saturday, November 14?')
    click(btn(/^2:00 pm/))
    expect(el.textContent).toContain('How long?')
    expect(btn('4 hours')).toBeUndefined()
    click(btn('2 hours'))
    click(btn('Next: check my booking'))
    expect(el.textContent).toContain('Clubhouse, Saturday, November 14, 2:00 pm to 4:00 pm')
    expect(el.textContent).toContain('The board will confirm this booking. We’ll let you know.')
    await act(async () => btn('Book it')!.click())
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ amenityId: 'a1', unitId: 'u1', day: '2026-11-14', startHour: 14, endHour: 16 }),
    )
    expect(el.textContent).toContain('Your request is sent.')
  })

  it('shows past hours and booked hours as unavailable with words', () => {
    const held = [{ startsAt: '2026-11-02T19:00:00Z', endsAt: '2026-11-02T21:00:00Z' }] // 2 to 4 pm today
    const el = mount([space(hall, held)])
    click(btn(/Monday, November 2, today/))
    const nine = btn(/^9:00 am/)!
    expect(nine.disabled).toBe(true)
    expect(nine.textContent).toContain('Passed')
    const two = btn(/^2:00 pm/)!
    expect(two.disabled).toBe(true)
    expect(two.textContent).toContain('Booked')
    expect(btn(/^1:00 pm/)!.disabled).toBe(false)
    expect(el.textContent).toContain('Booked')
  })

  it('only offers lengths that fit before a booked hour', () => {
    const held = [{ startsAt: '2026-11-14T19:00:00Z', endsAt: '2026-11-14T20:00:00Z' }] // 2 pm
    mount([space(hall, held)])
    click(btn(/Saturday, November 14/))
    click(btn(/^12:00 pm/))
    expect(btn('1 hour')).toBeDefined()
    expect(btn('2 hours')).toBeDefined()
    expect(btn('3 hours')).toBeUndefined()
  })

  it('greys out days outside the window and stops the month buttons at the edges', () => {
    mount([space(hall)])
    // single space skips step 1
    expect(btn('Previous month')?.disabled).toBe(true)
    expect(btn(/Monday, November 2, today/)?.getAttribute('aria-current')).toBe('date')
    expect(btn(/Sunday, November 1, already passed/)?.disabled).toBe(true)
    click(btn('Next month'))
    expect(btn('Previous month')?.disabled).toBe(false)
    expect(btn(/Wednesday, December 2, has free times/)?.disabled).toBe(false)
    expect(btn(/Thursday, December 3, not open for booking yet/)?.disabled).toBe(true)
    expect(btn('Next month')?.disabled).toBe(true)
  })

  it('asks for the house rules tick before booking', async () => {
    const withRules = { ...hall, rules: 'No glitter.' }
    const el = mount([space(withRules)])
    click(btn(/Saturday, November 14/))
    click(btn(/^2:00 pm/))
    click(btn('1 hour'))
    click(btn('Next: check my booking'))
    await act(async () => btn('Book it')!.click())
    expect(request).not.toHaveBeenCalled()
    expect(el.textContent).toContain('Please tick the box to say you read the house rules.')
  })

  it('tells the resident to pick a time before moving on', () => {
    const el = mount([space(hall)])
    click(btn(/Saturday, November 14/))
    click(btn('Next: check my booking'))
    expect(el.textContent).toContain('Tap a start time first.')
  })

  it('says a no-approval booking is confirmed right away', () => {
    const el = mount([space(pool)])
    click(btn(/Saturday, November 14/))
    click(btn(/^2:00 pm/))
    click(btn('1 hour'))
    click(btn('Next: check my booking'))
    expect(el.textContent).toContain('This booking is confirmed right away.')
  })
})
