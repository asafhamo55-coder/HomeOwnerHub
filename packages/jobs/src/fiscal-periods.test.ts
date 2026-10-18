import { describe, expect, it } from 'vitest'
import { todayIn } from './association-time'
import { addMonthsIso, pickCurrentPeriod, planNextFiscalYear, readCurrentOpenPeriod } from './fiscal-periods'

// BL-076: opening next fiscal year must never move "current" before the year
// starts. Every "today" here is an association day ('YYYY-MM-DD'), computed
// from an absolute instant and an explicit zone, so the machine's TZ never
// matters.

const p = (id: string, start: string, end: string, status = 'open') => ({ id, start_date: start, end_date: end, status })
const FY26 = p('fy26', '2026-01-01', '2026-12-31')
const FY27 = p('fy27', '2027-01-01', '2027-12-31')

describe('addMonthsIso', () => {
  it('adds calendar months and clamps to the month end', () => {
    expect(addMonthsIso('2026-01-01', 12)).toBe('2027-01-01')
    expect(addMonthsIso('2026-07-01', 1)).toBe('2026-08-01')
    expect(addMonthsIso('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsIso('2026-11-01', -12)).toBe('2025-11-01')
  })
})

describe('pickCurrentPeriod', () => {
  it('a period that has not started is never current, even when it is the latest', () => {
    expect(pickCurrentPeriod([FY26, FY27], '2026-10-18')?.id).toBe('fy26')
    expect(pickCurrentPeriod([FY27, FY26], '2026-12-31')?.id).toBe('fy26')
  })

  it('the new year becomes current on its start date', () => {
    expect(pickCurrentPeriod([FY26, FY27], '2027-01-01')?.id).toBe('fy27')
  })

  it('no period covers today: the latest one that has started', () => {
    const fy25 = p('fy25', '2025-01-01', '2025-12-31')
    expect(pickCurrentPeriod([fy25, FY27], '2026-03-01')?.id).toBe('fy25')
  })

  it('only future periods: none is current', () => {
    expect(pickCurrentPeriod([FY27], '2026-10-18')).toBeNull()
  })

  it('pinned instants with explicit zones: New Year’s Eve in Honolulu is still 2026', () => {
    // 2027-01-01 05:00 UTC = Jan 1 00:00 EST = Dec 31 19:00 HST.
    const now = new Date('2027-01-01T05:00:00Z')
    expect(pickCurrentPeriod([FY26, FY27], todayIn('America/New_York', now))?.id).toBe('fy27')
    expect(pickCurrentPeriod([FY26, FY27], todayIn('Pacific/Honolulu', now))?.id).toBe('fy26')
    // One hour earlier it is still Dec 31 in New York.
    expect(pickCurrentPeriod([FY26, FY27], todayIn('America/New_York', new Date('2027-01-01T04:00:00Z')))?.id).toBe('fy26')
  })
})

describe('readCurrentOpenPeriod', () => {
  // A tiny query recorder: the helper must filter on start_date <= today.
  function fake(rows: ReturnType<typeof p>[]) {
    const filters: Array<[string, string, unknown]> = []
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => (filters.push(['eq', c, v]), b),
      lte: (c: string, v: unknown) => (filters.push(['lte', c, v]), b),
      order: () => b,
      limit: () => b,
      maybeSingle: async () => {
        const hit = rows
          .filter((r) =>
            filters.every(([m, c, v]) =>
              m === 'eq' ? (r as Record<string, unknown>)[c] === v : String((r as Record<string, unknown>)[c]) <= String(v),
            ),
          )
          .sort((a, z) => z.start_date.localeCompare(a.start_date))
        return { data: hit[0] ?? null, error: null }
      },
    }
    return { client: { from: () => b }, filters }
  }

  it('posts into this year while next year is open but not started', async () => {
    const f = fake([{ ...FY26, association_id: 'a1' } as never, { ...FY27, association_id: 'a1' } as never])
    const res = await readCurrentOpenPeriod(f.client, 'a1', '2026-10-18')
    expect(res.data?.id).toBe('fy26')
    expect(f.filters).toContainEqual(['lte', 'start_date', '2026-10-18'])
    expect(f.filters).toContainEqual(['eq', 'status', 'open'])
  })

  it('posts into next year from its first day', async () => {
    const f = fake([{ ...FY26, association_id: 'a1' } as never, { ...FY27, association_id: 'a1' } as never])
    expect((await readCurrentOpenPeriod(f.client, 'a1', '2027-01-01')).data?.id).toBe('fy27')
  })
})

describe('planNextFiscalYear', () => {
  it('yearly books: next year, same start month', () => {
    const plan = planNextFiscalYear([FY26], '2026-10-18')
    expect(plan).toEqual({
      ok: true,
      months: 12,
      fiscalYear: { start_date: '2027-01-01', end_date: '2027-12-31' },
      toCreate: [{ start_date: '2027-01-01', end_date: '2027-12-31' }],
    })
  })

  it('a July fiscal year stays a July fiscal year', () => {
    const plan = planNextFiscalYear([p('x', '2026-07-01', '2027-06-30')], '2026-10-18')
    expect(plan).toMatchObject({ ok: true, toCreate: [{ start_date: '2027-07-01', end_date: '2028-06-30' }] })
  })

  it('already open: nothing to create (idempotent)', () => {
    const plan = planNextFiscalYear([FY26, FY27], '2026-10-18')
    expect(plan).toMatchObject({ ok: true, toCreate: [], fiscalYear: { start_date: '2027-01-01' } })
  })

  it('on the first day of the new year, "next" is the year after', () => {
    const plan = planNextFiscalYear([FY26, FY27], '2027-01-01')
    expect(plan).toMatchObject({ ok: true, toCreate: [{ start_date: '2028-01-01', end_date: '2028-12-31' }] })
  })

  it('monthly books: the rest of this fiscal year and all twelve months of the next', () => {
    const months = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((m) =>
      p(`m${m}`, `2026-${m}-01`, lastDay(`2026-${m}-01`)),
    )
    const plan = planNextFiscalYear(months, '2026-10-18')
    if (!plan.ok) throw new Error('expected a plan')
    expect(plan.months).toBe(1)
    expect(plan.fiscalYear).toEqual({ start_date: '2027-01-01', end_date: '2027-12-31' })
    expect(plan.toCreate).toHaveLength(14)
    expect(plan.toCreate[0]).toEqual({ start_date: '2026-11-01', end_date: '2026-11-30' })
    expect(plan.toCreate[3]).toEqual({ start_date: '2027-02-01', end_date: '2027-02-28' })
    expect(plan.toCreate[13]).toEqual({ start_date: '2027-12-01', end_date: '2027-12-31' })
  })

  it('no periods, or periods with no monthly/quarterly/yearly pattern, are refused', () => {
    expect(planNextFiscalYear([], '2026-10-18')).toEqual({ ok: false, reason: 'no_periods' })
    expect(planNextFiscalYear([p('odd', '2026-01-01', '2026-02-14')], '2026-10-18')).toEqual({ ok: false, reason: 'irregular' })
  })

  it('a missing current year is filled in on the way to next year', () => {
    const plan = planNextFiscalYear([p('fy25', '2025-01-01', '2025-12-31')], '2026-10-18')
    expect(plan).toMatchObject({
      ok: true,
      toCreate: [
        { start_date: '2026-01-01', end_date: '2026-12-31' },
        { start_date: '2027-01-01', end_date: '2027-12-31' },
      ],
    })
  })

  it('books years behind are refused rather than opening dozens of periods', () => {
    expect(planNextFiscalYear([p('fy18', '2018-01-01', '2018-12-31')], '2026-10-18')).toEqual({ ok: false, reason: 'too_far_behind' })
  })
})

function lastDay(start: string): string {
  const d = new Date(`${addMonthsIso(start, 1)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
