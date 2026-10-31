import { describe, it, expect, vi } from 'vitest'
import { reportJobFailures } from './failure-reporting'
import { runHoaLateFees, type LateFeeRunResult } from './hoa-late-fees'
import { runPmLateFees } from './pm-late-fees'
import { runRecurringJes } from './recurring-jes'

vi.mock('@homeowner-portal/db', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  postJournalEntry: vi.fn(),
}))

const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() }

describe('reportJobFailures', () => {
  it('sends one report-only capture with counts and ids, and swallows capture errors', () => {
    const capture = vi.fn()
    reportJobFailures('job-x', { failed: 2 }, ['a', 'b'], capture)
    expect(capture).toHaveBeenCalledTimes(1)
    const [msg, ctx] = capture.mock.calls[0]
    expect(msg).toBe('job-x: 2 item(s) failed')
    expect(ctx.extra).toEqual({ counts: { failed: 2 }, ids: ['a', 'b'], idCount: 2 })
    expect(() =>
      reportJobFailures('job-x', {}, ['a'], () => {
        throw new Error('sentry down')
      }),
    ).not.toThrow()
  })
})

const ran = (over: Partial<LateFeeRunResult> = {}): LateFeeRunResult => ({
  status: 'ran',
  evaluated: 2,
  charged: 1,
  skipped: 1,
  capped: 0,
  failed: 0,
  totalCents: 500,
  stayed: 0,
  ...over,
})

function hoaDb(ids: string[]) {
  return {
    from: () => ({
      select: async () => ({
        data: ids.map((id) => ({ id, organization_id: 'o', orgs: { hub_type: 'hoa' } })),
        error: null,
      }),
    }),
  }
}

async function hoa(results: Record<string, LateFeeRunResult>) {
  const report = vi.fn()
  const out = await runHoaLateFees(
    hoaDb(Object.keys(results)) as never,
    { run: async (_id, fn) => fn() },
    logger,
    new Date('2026-10-15T05:00:00Z'),
    report,
    (async (_db: unknown, assoc: { id: string }) => results[assoc.id]) as never,
  )
  return { out, report }
}

describe('hoa-late-fees reporting', () => {
  it('does not report when nothing failed (policy outcomes are not failures)', async () => {
    const { out, report } = await hoa({ a1: ran(), a2: ran({ status: 'off', evaluated: 0, charged: 0, skipped: 0 }) })
    expect(report).not.toHaveBeenCalled()
    expect(out).toEqual({ associations: 2, evaluated: 2, charged: 1, skipped: 1, capped: 0, notCharged: 1 })
  })

  it('reports once with ids for read_failed and failed charges, return value unchanged', async () => {
    const { out, report } = await hoa({
      a1: ran(),
      a2: ran({ status: 'read_failed', evaluated: 0, charged: 0, skipped: 0 }),
      a3: ran({ failed: 2 }),
    })
    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0][0]).toBe('hoa-late-fees')
    expect(report.mock.calls[0][2]).toEqual(['a2', 'a3'])
    expect(report.mock.calls[0][1]).toMatchObject({ readFailed: 1, failedCharges: 2, failedAssociations: 2 })
    expect(out).toEqual({ associations: 3, evaluated: 4, charged: 2, skipped: 2, capped: 0, notCharged: 1 })
  })
})

describe('recurring-jes reporting', () => {
  const rule = (id: string) => ({
    id,
    organization_id: 'o',
    association_id: 'a',
    template_je_id: 't',
    cadence: 'monthly',
    next_run_date: '2026-10-15',
    is_active: true,
    today: '2026-10-15',
  })
  const run = async (results: Record<string, unknown>) => {
    const report = vi.fn()
    const step = {
      run: async (id: string) => (id === 'load-rules' ? Object.keys(results).map(rule) : results[id.replace('rule-', '')]),
    }
    const out = await runRecurringJes({} as never, step, logger, new Date(), report)
    return { out, report }
  }

  it('does not report when no rule failed', async () => {
    const { out, report } = await run({ r1: { posted: 1, skipped: 0, failed: 0 }, r2: { posted: 0, skipped: 1, failed: 0 } })
    expect(report).not.toHaveBeenCalled()
    expect(out).toEqual({ rules: 2, posted: 1, skipped: 1, failed: 0 })
  })

  it('reports once with the failed rule ids; return value unchanged and nothing thrown', async () => {
    const { out, report } = await run({
      r1: { posted: 1, skipped: 0, failed: 0 },
      r2: { posted: 0, skipped: 0, failed: 1 },
      r3: { posted: 0, skipped: 0, failed: 1 },
    })
    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0][0]).toBe('recurring-jes')
    expect(report.mock.calls[0][2]).toEqual(['r2', 'r3'])
    expect(out).toEqual({ rules: 3, posted: 1, skipped: 0, failed: 2 })
  })
})

describe('pm-late-fees reporting', () => {
  function pmDb(opts: { rowsError?: boolean; updateError?: boolean }) {
    const updates: unknown[] = []
    const db = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => (table === 'orgs' ? Promise.resolve({ data: [{ id: 'org-1' }, { id: 'org-2' }], error: null }) : chain),
          neq: () => chain,
          lt: () => chain,
          is: async () =>
            opts.rowsError
              ? { data: null, error: { message: 'x' } }
              : { data: [{ id: 'l1', amount_due: 1000, late_fee_rate: 5 }], error: null },
          update: (v: unknown) => {
            updates.push(v)
            return { eq: () => ({ eq: async () => ({ error: opts.updateError ? { message: 'x' } : null }) }) }
          },
        }
        return chain
      },
    }
    return { db, updates }
  }
  const step = { run: async (_id: string, fn: () => Promise<unknown>) => fn() }

  it('does not report on a clean run and keeps its return value', async () => {
    const report = vi.fn()
    const { db, updates } = pmDb({})
    const out = await runPmLateFees(db as never, step, logger, report)
    expect(report).not.toHaveBeenCalled()
    expect(out).toEqual({ processed: 2, evaluated: 2, updated: 2 })
    expect(updates).toEqual([
      { late_fee: 50, status: 'late' },
      { late_fee: 50, status: 'late' },
    ])
  })

  it('reports once with org ids when reads fail; return value unchanged', async () => {
    const report = vi.fn()
    const out = await runPmLateFees(pmDb({ rowsError: true }).db as never, step, logger, report)
    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0][2]).toEqual(['org-1', 'org-2'])
    expect(out).toEqual({ processed: 2, evaluated: 0, updated: 0 })
  })

  it('reports when an update fails', async () => {
    const report = vi.fn()
    const out = await runPmLateFees(pmDb({ updateError: true }).db as never, step, logger, report)
    expect(report).toHaveBeenCalledTimes(1)
    expect(report.mock.calls[0][1]).toMatchObject({ failedUpdates: 2 })
    expect(out).toEqual({ processed: 2, evaluated: 2, updated: 0 })
  })
})
