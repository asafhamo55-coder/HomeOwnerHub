import { describe, expect, it, vi } from 'vitest'
import { bindPrecheckRun } from './precheck-binding'

const RUN = '55555555-5555-4555-8555-555555555555'
const ORG = 'org-1'
const USER = 'user-1'

interface RunRow {
  id: string
  organization_id: string
  workflow_id: string
  'input->>mode': string
}
interface UsageRow {
  id: string
  action: string
  org_id: string
  user_id: string
  entity_type: string | null
  entity_id: string | null
}

function fakeDb(tables: { ai_runs?: RunRow[]; audit_log?: UsageRow[] }, opts: { error?: { code: string; message: string } } = {}) {
  const queried: Array<{ table: string; filters: Array<[string, unknown]> }> = []
  const db = {
    from(table: 'ai_runs' | 'audit_log') {
      const filters: Array<[string, unknown]> = []
      queried.push({ table, filters })
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push([c, v]), q),
        limit: () => q,
        maybeSingle: async () => {
          if (opts.error) return { data: null, error: opts.error }
          const rows = (tables[table] ?? []) as unknown as Array<Record<string, unknown>>
          const hit = rows.find((r) => filters.every(([c, v]) => r[c] === v))
          return { data: hit ? { id: hit.id } : null, error: null }
        },
      }
      return q
    },
  }
  return { db: db as never, queried }
}

const precheckRun: RunRow = { id: RUN, organization_id: ORG, workflow_id: 'W37', 'input->>mode': 'precheck' }
const ownUsage: UsageRow = {
  id: 'u1',
  action: 'ai.usage.arc_precheck',
  org_id: ORG,
  user_id: USER,
  entity_type: 'ai_run',
  entity_id: RUN,
}

function quiet() {
  return vi.spyOn(console, 'warn').mockImplementation(() => {})
}

describe('bindPrecheckRun (BL-078)', () => {
  it('links the resident’s own W37 pre-check in their org', async () => {
    const { db, queried } = fakeDb({ ai_runs: [precheckRun], audit_log: [ownUsage] })
    expect(await bindPrecheckRun(db, { runId: RUN, orgId: ORG, userId: USER })).toEqual({ runId: RUN, reason: 'ok' })
    expect(queried[0]!.filters).toEqual(
      expect.arrayContaining([['id', RUN], ['organization_id', ORG], ['workflow_id', 'W37'], ['input->>mode', 'precheck']]),
    )
    expect(queried[1]!.filters).toEqual(
      expect.arrayContaining([['user_id', USER], ['org_id', ORG], ['entity_type', 'ai_run'], ['entity_id', RUN]]),
    )
  })

  it('no run id: nothing to check, nothing logged', async () => {
    const spy = quiet()
    const { db, queried } = fakeDb({})
    expect(await bindPrecheckRun(db, { runId: null, orgId: ORG, userId: USER })).toEqual({ runId: null, reason: 'none' })
    expect(queried).toHaveLength(0)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it.each([
    ['another org’s run', { ...precheckRun, organization_id: 'org-2' }],
    ['a board review run (W37 review mode)', { ...precheckRun, 'input->>mode': 'review' }],
    ['another workflow’s run', { ...precheckRun, workflow_id: 'W1' }],
  ])('drops %s silently', async (_label, run) => {
    const spy = quiet()
    const { db } = fakeDb({ ai_runs: [run], audit_log: [ownUsage] })
    expect(await bindPrecheckRun(db, { runId: RUN, orgId: ORG, userId: USER })).toEqual({ runId: null, reason: 'run_not_found' })
    spy.mockRestore()
  })

  it('drops another resident’s pre-check in the same org', async () => {
    const spy = quiet()
    const { db } = fakeDb({ ai_runs: [precheckRun], audit_log: [{ ...ownUsage, user_id: 'user-2' }] })
    expect(await bindPrecheckRun(db, { runId: RUN, orgId: ORG, userId: USER })).toEqual({ runId: null, reason: 'not_owner' })
    expect(JSON.stringify(spy.mock.calls)).toContain('not_owner')
    spy.mockRestore()
  })

  it('drops a run with no usage row linked to it (e.g. a run id typed in by hand)', async () => {
    const spy = quiet()
    const { db } = fakeDb({ ai_runs: [precheckRun], audit_log: [{ ...ownUsage, entity_id: null, entity_type: null }] })
    expect((await bindPrecheckRun(db, { runId: RUN, orgId: ORG, userId: USER })).runId).toBeNull()
    spy.mockRestore()
  })

  it('a read failure drops the link and logs the code only', async () => {
    const spy = quiet()
    const { db } = fakeDb({}, { error: { code: '57014', message: 'timeout near "Six foot vinyl fence"' } })
    expect(await bindPrecheckRun(db, { runId: RUN, orgId: ORG, userId: USER })).toEqual({ runId: null, reason: 'read_failed' })
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).toContain('57014')
    expect(logged).not.toContain('Six foot')
    expect(logged).not.toContain(RUN)
    spy.mockRestore()
  })
})
