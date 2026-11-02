import { describe, expect, it } from 'vitest'
import { countAutopayFailure, resetAutopayFailures } from './autopay-failures'

interface State {
  attempt: { id: string; organization_id: string; autopay_enrollment_id: string | null; status: string } | null
  enrollment: { id: string; status: string; consecutive_failures: number } | null
  audits: Array<{ action: string; metadata: Record<string, unknown> }>
  /** Simulates a concurrent writer: the compare-and-set finds the count already moved. */
  raceOnUpdate?: boolean
}

function fakeDb(s: State) {
  return {
    from(table: string) {
      let mode: 'select' | 'update' | 'insert' = 'select'
      let patch: Record<string, unknown> = {}
      let inserted: Record<string, unknown> | null = null
      const filters: Array<[string, unknown]> = []
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = (c: string, v: unknown) => (filters.push([c, v]), q)
      q.gt = () => q
      q.limit = () => q
      q.contains = (_c: string, v: Record<string, unknown>) => (filters.push(['contains', v]), q)
      q.update = (p: Record<string, unknown>) => ((mode = 'update'), (patch = p), q)
      q.insert = (row: Record<string, unknown>) => ((mode = 'insert'), (inserted = row), q)
      q.maybeSingle = async () => {
        if (table === 'online_payments') return { data: s.attempt, error: null }
        if (table === 'autopay_enrollments') return { data: s.enrollment, error: null }
        return { data: null, error: null }
      }
      q.then = (ok: (v: unknown) => unknown) => {
        let res: { data: unknown; error: null } = { data: null, error: null }
        if (mode === 'select' && table === 'audit_log') {
          const want = filters.find((f) => f[0] === 'contains')?.[1] as { attempt_id?: string } | undefined
          res = { data: s.audits.filter((a) => a.action === 'autopay.failure_counted' && a.metadata.attempt_id === want?.attempt_id), error: null }
        } else if (mode === 'update' && table === 'autopay_enrollments') {
          const expected = filters.find((f) => f[0] === 'consecutive_failures')?.[1]
          if (patch.consecutive_failures === 0) {
            s.enrollment!.consecutive_failures = 0
            res = { data: [{ id: s.enrollment!.id }], error: null }
          } else if (s.raceOnUpdate || expected !== s.enrollment!.consecutive_failures) {
            res = { data: [], error: null }
          } else {
            Object.assign(s.enrollment!, { consecutive_failures: patch.consecutive_failures, ...(patch.status ? { status: patch.status } : {}) })
            res = { data: [{ id: s.enrollment!.id }], error: null }
          }
        } else if (mode === 'insert' && table === 'audit_log') {
          s.audits.push({ action: inserted!.action as string, metadata: inserted!.metadata as Record<string, unknown> })
        }
        return Promise.resolve(res).then(ok)
      }
      return q
    },
  }
}

const base = (): State => ({
  attempt: { id: 'att-1', organization_id: 'org-1', autopay_enrollment_id: 'enr-1', status: 'failed' },
  enrollment: { id: 'enr-1', status: 'active', consecutive_failures: 0 },
  audits: [],
})

describe('countAutopayFailure (a bank debit that comes back after the run)', () => {
  it('adds one to the streak', async () => {
    const s = base()
    expect(await countAutopayFailure(fakeDb(s), 'pi_1')).toBe('counted')
    expect(s.enrollment).toMatchObject({ consecutive_failures: 1, status: 'active' })
  })

  it('pauses autopay on the second failure in a row', async () => {
    const s = base()
    s.enrollment!.consecutive_failures = 1
    expect(await countAutopayFailure(fakeDb(s), 'pi_1')).toBe('paused')
    expect(s.enrollment).toMatchObject({ consecutive_failures: 2, status: 'paused' })
    expect(s.audits.map((a) => a.action)).toEqual(['autopay.failure_counted', 'autopay.paused'])
  })

  it('counts an attempt once: a redelivery, or the daily run having counted it, adds nothing', async () => {
    const s = base()
    await countAutopayFailure(fakeDb(s), 'pi_1')
    expect(await countAutopayFailure(fakeDb(s), 'pi_1')).toBe('already_counted')
    expect(s.enrollment!.consecutive_failures).toBe(1)

    const daily = base()
    daily.audits.push({ action: 'autopay.failure_counted', metadata: { attempt_id: 'att-1' } })
    expect(await countAutopayFailure(fakeDb(daily), 'pi_1')).toBe('already_counted')
    expect(daily.enrollment!.consecutive_failures).toBe(0)
  })

  it('ignores payments that are not autopay or did not end as failed', async () => {
    const manual = base()
    manual.attempt!.autopay_enrollment_id = null
    expect(await countAutopayFailure(fakeDb(manual), 'pi_1')).toBe('not_autopay')
    const stale = base()
    stale.attempt!.status = 'succeeded'
    expect(await countAutopayFailure(fakeDb(stale), 'pi_1')).toBe('not_failed')
    const unknown = base()
    unknown.attempt = null
    expect(await countAutopayFailure(fakeDb(unknown), 'pi_1')).toBe('not_autopay')
  })

  it('throws, so Stripe redelivers, when a concurrent change beat the compare-and-set', async () => {
    const s = base()
    s.raceOnUpdate = true
    await expect(countAutopayFailure(fakeDb(s), 'pi_1')).rejects.toThrow(/retry/)
    expect(s.audits).toHaveLength(0)
  })

  it('does not re-pause a canceled or already paused enrollment', async () => {
    const s = base()
    s.enrollment = { id: 'enr-1', status: 'paused', consecutive_failures: 2 }
    expect(await countAutopayFailure(fakeDb(s), 'pi_1')).toBe('counted')
    expect(s.audits.map((a) => a.action)).toEqual(['autopay.failure_counted'])
  })
})

describe('resetAutopayFailures', () => {
  it('ends the streak when the payment finally posts', async () => {
    const s = base()
    s.enrollment!.consecutive_failures = 1
    await resetAutopayFailures(fakeDb(s), 'att-1')
    expect(s.enrollment!.consecutive_failures).toBe(0)
  })

  it('does nothing for a payment that was not autopay', async () => {
    const s = base()
    s.attempt!.autopay_enrollment_id = null
    s.enrollment!.consecutive_failures = 1
    await resetAutopayFailures(fakeDb(s), 'att-1')
    expect(s.enrollment!.consecutive_failures).toBe(1)
  })
})
