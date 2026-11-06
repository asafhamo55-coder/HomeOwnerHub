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
const more = vi.fn()
vi.mock('@/lib/amenities/booking-days', () => ({ loadBookingDays: (...a: unknown[]) => more(...a) }))

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

function space(a: Amenity, held: { startsAt: string; endsAt: string }[] = [], over: Record<string, unknown> = {}, count = a.advanceDays + 1) {
  return {
    amenity: a,
    homes: [{ id: 'u1', label: '1 Oak St' }],
    days: dayStrip({ amenity: a, timeZone: TZ, now: NOW, held, count }),
    today: TODAY,
    lastDay: '2026-12-02',
    timeZone: TZ,
    activeByHome: {} as Record<string, number>,
    ...over,
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
  more.mockReset()
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
const off = (el: HTMLElement | undefined) => el?.getAttribute('aria-disabled') === 'true'
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
    expect(off(btn(/Monday, November 2, today/))).toBe(false)
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
    expect(el.textContent).toContain('We\u2019ll let you know when the board answers.')
    expect(document.activeElement?.tagName).toBe('H2')
  })

  it('shows past hours and booked hours as unavailable with words', () => {
    const held = [{ startsAt: '2026-11-02T19:00:00Z', endsAt: '2026-11-02T21:00:00Z' }] // 2 to 4 pm today
    const el = mount([space(hall, held)])
    click(btn(/Monday, November 2, today/))
    const nine = btn(/^9:00 am/)!
    expect(off(nine)).toBe(true)
    expect(nine.textContent).toContain('Passed')
    const two = btn(/^2:00 pm/)!
    expect(off(two)).toBe(true)
    expect(two.textContent).toContain('Booked')
    expect(off(btn(/^1:00 pm/))).toBe(false)
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
    expect(btn('Earlier month')?.disabled).toBe(true)
    expect(btn(/Monday, November 2, today/)?.getAttribute('aria-current')).toBe('date')
    expect(off(btn(/Sunday, November 1, already passed/))).toBe(true)
    click(btn('Later month'))
    expect(btn('Earlier month')?.disabled).toBe(false)
    expect(off(btn(/Wednesday, December 2, has free times/))).toBe(false)
    expect(off(btn(/Thursday, December 3, not open for booking yet/))).toBe(true)
    expect(btn('Later month')?.disabled).toBe(true)
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

  it('moves focus to the step heading on every step change', () => {
    mount([space(hall)])
    click(btn(/Saturday, November 14/))
    expect(document.activeElement?.textContent).toContain('What time on Saturday, November 14?')
    click(btn(/^2:00 pm/))
    expect(document.activeElement?.textContent).toBe('How long?')
    click(btn('1 hour'))
    click(btn('Next: check my booking'))
    expect(document.activeElement?.textContent).toBe('Check your booking')
  })

  it('has no grid role and reaches closed days with a spoken reason', () => {
    const el = mount([space(hall)])
    expect(el.querySelector('[role="grid"]')).toBeNull()
    const passed = btn(/Sunday, November 1, already passed/)!
    expect(passed.disabled).toBe(false)
    click(passed)
    expect(el.textContent).not.toContain('What time on')
  })

  it('blocks the calendar and says why when the home is at its limit', () => {
    const el = mount([space(hall, [], { activeByHome: { u1: 2 } })])
    expect(el.textContent).toContain('You already have 2 of 2 bookings for Clubhouse. Cancel one or wait until it has passed.')
    click(btn(/Saturday, November 14/))
    expect(el.textContent).not.toContain('What time on')
    expect(off(btn(/Saturday, November 14/))).toBe(true)
  })

  it('checks the limit against the chosen home', () => {
    const two = { ...space(hall), homes: [{ id: 'u1', label: '1 Oak St' }, { id: 'u2', label: '2 Elm St' }], activeByHome: { u1: 2, u2: 0 } }
    const el = mount([two])
    expect(el.textContent).toContain('You already have 2 of 2')
    const select = el.querySelector('select') as HTMLSelectElement
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, 'u2')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(el.textContent).not.toContain('You already have')
  })

  it('sends the resident back to the day step when the server rejects the day', async () => {
    request.mockResolvedValue({ ok: false, error: 'Book at least 3 hours ahead.', fieldErrors: { day: 'Book at least 3 hours ahead.' } })
    const el = mount([space(hall)])
    click(btn(/Saturday, November 14/))
    click(btn(/^2:00 pm/))
    click(btn('1 hour'))
    click(btn('Next: check my booking'))
    await act(async () => btn('Book it')!.click())
    expect(el.textContent).toContain('Which day for Clubhouse?')
    expect(el.textContent).toContain('Book at least 3 hours ahead.')
  })

  it('shows a form error on the time step for a start-time rejection', async () => {
    request.mockResolvedValue({ ok: false, error: 'Someone else just booked that time. Pick another time.', fieldErrors: { startHour: 'Someone else just booked that time. Pick another time.' } })
    const el = mount([space(hall)])
    click(btn(/Saturday, November 14/))
    click(btn(/^2:00 pm/))
    click(btn('1 hour'))
    click(btn('Next: check my booking'))
    await act(async () => btn('Book it')!.click())
    expect(el.textContent).toContain('What time on Saturday, November 14?')
    expect(el.textContent).toContain('Someone else just booked that time.')
  })

  it('says so when no day has free times', () => {
    const closed = { ...hall, advanceDays: 30, blackouts: [{ startsOn: '2026-11-01', endsOn: '2026-12-31', reason: null }] }
    const el = mount([space(closed)])
    expect(el.textContent).toContain('There are no free times for Clubhouse right now. Ask the board.')
  })

  it('jumps to the next month that has free times', () => {
    const later = { ...hall, advanceDays: 30, blackouts: [{ startsOn: '2026-11-01', endsOn: '2026-11-30', reason: null }] }
    const el = mount([space(later)])
    click(btn('Next day with free times'))
    expect(el.textContent).toContain('December 2026')
  })

  it('fetches a later month on demand', async () => {
    const a = { ...hall, advanceDays: 90 }
    const first = space(a, [], { lastDay: '2027-01-31' }, 30)
    more.mockResolvedValue({ ok: true, days: dayStrip({ amenity: a, timeZone: TZ, now: NOW, held: [], count: 62 }).slice(30) })
    const el = mount([first])
    expect(el.textContent).toContain('November 2026')
    await act(async () => btn('Later month')!.click())
    expect(more).toHaveBeenCalledWith(expect.objectContaining({ amenityId: 'a1', fromDay: '2026-12-02' }))
    expect(el.textContent).toContain('December 2026')
    expect(off(btn(/Friday, December 11, has free times/))).toBe(false)
  })

  it('stays on the same month and offers Try again when a later month fails to load', async () => {
    const a = { ...hall, advanceDays: 90 }
    const first = space(a, [], { lastDay: '2027-01-31' }, 30)
    more.mockResolvedValueOnce({ ok: false, error: 'x' })
    const el = mount([first])
    await act(async () => btn('Later month')!.click())
    expect(el.textContent).toContain('November 2026')
    expect(el.textContent).not.toContain('December 2026')
    expect(el.textContent).toContain("We couldn't load that month.")
    const retry = btn('Try again')!
    expect(retry.className).toContain('min-h-12')
    more.mockResolvedValueOnce({ ok: true, days: dayStrip({ amenity: a, timeZone: TZ, now: NOW, held: [], count: 62 }).slice(30) })
    await act(async () => retry.click())
    expect(more).toHaveBeenCalledTimes(2)
    expect(el.textContent).toContain('December 2026')
    expect(btn('Try again')).toBeUndefined()
  })
})
