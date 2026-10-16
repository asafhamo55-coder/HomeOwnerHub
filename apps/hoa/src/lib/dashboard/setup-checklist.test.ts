import { describe, expect, it } from 'vitest'
import {
  SETUP_CHECKLIST_KEYS,
  buildSetupChecklist,
  isChecklistDismissible,
  loadSetupChecklist,
  stepStateFrom,
  type SetupFacts,
} from './setup-checklist'

const ALL_DONE: SetupFacts = {
  mailbox: [1],
  properties: [3, 0],
  residents: [0, 2],
  governingDocs: [1],
  dues: [12],
  board: [2],
}

const NOTHING: SetupFacts = {
  mailbox: [0],
  properties: [0, 0],
  residents: [0, 0],
  governingDocs: [0],
  dues: [0],
  board: [1],
}

describe('stepStateFrom', () => {
  it('is done when any source has a positive count', () => {
    expect(stepStateFrom([0, 4])).toBe('done')
    // A positive count from one source is real evidence even when another
    // source failed — the step really is done.
    expect(stepStateFrom([null, 4])).toBe('done')
  })

  it('is unknown — never done, never todo — when nothing is positive and a source failed', () => {
    expect(stepStateFrom([null])).toBe('unknown')
    expect(stepStateFrom([0, null])).toBe('unknown')
  })

  it('is todo only when every source answered and none is positive', () => {
    expect(stepStateFrom([0])).toBe('todo')
    expect(stepStateFrom([0, 0])).toBe('todo')
  })

  it('honours a threshold (the board step needs someone besides the founder)', () => {
    expect(stepStateFrom([1], 2)).toBe('todo')
    expect(stepStateFrom([2], 2)).toBe('done')
  })
})

describe('buildSetupChecklist', () => {
  it('has the six steps in order, each with a deep link', () => {
    const c = buildSetupChecklist(NOTHING)
    expect(c.steps.map((s) => s.key)).toEqual([...SETUP_CHECKLIST_KEYS])
    expect(c.steps).toHaveLength(6)
    for (const step of c.steps) {
      expect(step.href.startsWith('/')).toBe(true)
      expect(step.cta.length).toBeGreaterThan(0)
    }
  })

  it('counts progress from done steps only', () => {
    const c = buildSetupChecklist({ ...NOTHING, mailbox: [1], dues: [5] })
    expect(c.doneCount).toBe(2)
    expect(c.total).toBe(6)
    expect(c.percent).toBe(33)
    expect(c.complete).toBe(false)
  })

  it('a single founder is not "board invited"', () => {
    const c = buildSetupChecklist(NOTHING)
    expect(c.steps.find((s) => s.key === 'board')!.state).toBe('todo')
  })

  it('is complete when every step is done', () => {
    const c = buildSetupChecklist(ALL_DONE)
    expect(c.doneCount).toBe(6)
    expect(c.percent).toBe(100)
    expect(c.complete).toBe(true)
    expect(c.unknownCount).toBe(0)
  })

  it('a failed read shows "Couldn\'t check", is not counted as done, and blocks completion', () => {
    const c = buildSetupChecklist({ ...ALL_DONE, governingDocs: [null] })
    const docs = c.steps.find((s) => s.key === 'governing_docs')!
    expect(docs.state).toBe('unknown')
    expect(c.doneCount).toBe(5)
    expect(c.unknownCount).toBe(1)
    expect(c.complete).toBe(false)
  })

  it('every source failing reads as six unknowns, not six todos', () => {
    const failed: SetupFacts = {
      mailbox: [null],
      properties: [null, null],
      residents: [null, null],
      governingDocs: [null],
      dues: [null],
      board: [null],
    }
    const c = buildSetupChecklist(failed)
    expect(c.steps.every((s) => s.state === 'unknown')).toBe(true)
    expect(c.doneCount).toBe(0)
  })
})

describe('isChecklistDismissible', () => {
  it('only a complete checklist can be dismissed', () => {
    expect(isChecklistDismissible(buildSetupChecklist(ALL_DONE))).toBe(true)
    expect(isChecklistDismissible(buildSetupChecklist(NOTHING))).toBe(false)
    expect(isChecklistDismissible(buildSetupChecklist({ ...ALL_DONE, dues: [null] }))).toBe(false)
  })
})

// ─── Loader ────────────────────────────────────────────────────────────

interface TableResult {
  count?: number
  error?: { code: string; message: string }
  throws?: boolean
}

/** Table-keyed stand-in for the PostgREST builder (head:true counts). */
function fakeDb(results: Record<string, TableResult>) {
  const seen: Array<{ table: string; filters: string[] }> = []
  return {
    from(table: string) {
      const filters: string[] = []
      seen.push({ table, filters })
      const result = results[table] ?? { count: 0 }
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push(`eq:${col}=${String(val)}`)
          return chain
        },
        is: (col: string, val: unknown) => {
          filters.push(`is:${col}=${String(val)}`)
          return chain
        },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          if (result.throws) return Promise.reject(new Error('network down')).then(resolve, reject)
          return Promise.resolve(
            result.error
              ? { count: null, data: null, error: result.error }
              : { count: result.count ?? 0, data: null, error: null },
          ).then(resolve, reject)
        },
      }
      return chain
    },
    _seen: seen,
  }
}

const ORG = 'org-1'
const timeout = { error: { code: '57014', message: 'statement timeout' } }

describe('loadSetupChecklist', () => {
  it('derives every step from data', async () => {
    const db = fakeDb({
      mailbox_accounts: { count: 1 },
      hoa_properties: { count: 40 },
      units: { count: 0 },
      property_residents: { count: 0 },
      ownerships: { count: 12 },
      governing_documents: { count: 2 },
      assessments: { count: 80 },
      org_members: { count: 3 },
    })
    const c = await loadSetupChecklist(db as never, ORG)
    expect(c.complete).toBe(true)
  })

  it('scopes every read to the org and skips deleted / disconnected rows', async () => {
    const db = fakeDb({})
    await loadSetupChecklist(db as never, ORG)
    const byTable = Object.fromEntries(db._seen.map((s) => [s.table, s.filters]))
    for (const [table, filters] of Object.entries(byTable)) {
      expect(
        filters.some((f) => f === `eq:organization_id=${ORG}` || f === `eq:org_id=${ORG}`),
        `${table} is org-scoped`,
      ).toBe(true)
    }
    expect(byTable.mailbox_accounts).toContain('is:disconnected_at=null')
    expect(byTable.hoa_properties).toContain('is:deleted_at=null')
    expect(byTable.property_residents).toContain('is:moved_out_at=null')
    expect(byTable.governing_documents).toContain('is:superseded_at=null')
    expect(byTable.assessments).toContain('is:deleted_at=null')
  })

  it('a soft PostgREST error makes that step unknown, not todo', async () => {
    const db = fakeDb({ governing_documents: timeout })
    const c = await loadSetupChecklist(db as never, ORG)
    expect(c.steps.find((s) => s.key === 'governing_docs')!.state).toBe('unknown')
    expect(c.steps.find((s) => s.key === 'dues')!.state).toBe('todo')
  })

  it('a thrown read makes that step unknown and does not take the others down', async () => {
    const db = fakeDb({ assessments: { throws: true }, mailbox_accounts: { count: 1 } })
    const c = await loadSetupChecklist(db as never, ORG)
    expect(c.steps.find((s) => s.key === 'dues')!.state).toBe('unknown')
    expect(c.steps.find((s) => s.key === 'mailbox')!.state).toBe('done')
  })
})
