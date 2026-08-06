import { describe, expect, it } from 'vitest'
import { applyMatch, applyVendorMatch, decideMatch, extractAddressCandidates } from './match'
import type { MatchOutcome, MatchSignals } from './match'
import type { PropertyMatch } from '../properties/resolve'

function emptySignals(over: Partial<MatchSignals> = {}): MatchSignals {
  return {
    threadUnitId: null,
    aliasUnitId: null,
    aliasResidentId: null,
    emailMatches: [],
    addressUnitIds: [],
    nameMatches: [],
    ...over,
  }
}

function propertyMatch(unitId: string, residentId: string | null): PropertyMatch {
  return {
    ref: {
      unitId,
      legacyPropertyId: `legacy-${unitId}`,
      associationId: 'assoc-1',
      address: `${unitId} Oak Ln`,
      unitNumber: null,
    },
    residentId,
    residentName: 'Jenna Rivera',
    source: 'property_resident',
  }
}

describe('decideMatch — signal precedence', () => {
  it('1. thread continuity wins over everything else', () => {
    const outcome = decideMatch(
      emptySignals({
        threadUnitId: 'unit-thread',
        aliasUnitId: 'unit-alias',
        emailMatches: [propertyMatch('unit-email', 'res-1')],
      }),
    )
    expect(outcome.unitId).toBe('unit-thread')
    expect(outcome.rule).toBe('thread_continuity')
    expect(outcome.confidence).toBe('high')
    expect(outcome.status).toBe('open')
  })

  it('2. a remembered sender alias beats an email lookup', () => {
    const outcome = decideMatch(
      emptySignals({
        aliasUnitId: 'unit-alias',
        aliasResidentId: 'res-alias',
        emailMatches: [propertyMatch('unit-email', 'res-1')],
      }),
    )
    expect(outcome.unitId).toBe('unit-alias')
    expect(outcome.residentId).toBe('res-alias')
    expect(outcome.rule).toBe('sender_alias')
    expect(outcome.confidence).toBe('high')
  })

  it('3. exactly one email match is high confidence and auto-attaches', () => {
    const outcome = decideMatch(
      emptySignals({ emailMatches: [propertyMatch('unit-1', 'res-1')] }),
    )
    expect(outcome.unitId).toBe('unit-1')
    expect(outcome.residentId).toBe('res-1')
    expect(outcome.rule).toBe('resident_email')
    expect(outcome.confidence).toBe('high')
    expect(outcome.status).toBe('open')
  })

  it('4. multiple email matches are medium and do NOT auto-attach', () => {
    // An owner of three units. Guessing would misfile mail and feed the
    // wrong property context to Phase B's drafting agent.
    const outcome = decideMatch(
      emptySignals({
        emailMatches: [propertyMatch('unit-1', 'res-1'), propertyMatch('unit-2', 'res-2')],
      }),
    )
    expect(outcome.unitId).toBeNull()
    expect(outcome.rule).toBe('resident_email_ambiguous')
    expect(outcome.confidence).toBe('medium')
    expect(outcome.status).toBe('needs_review')
    expect(outcome.reason.candidate_unit_ids).toEqual(['unit-1', 'unit-2'])
  })

  it('5. exactly one address in the body is medium and does NOT auto-attach', () => {
    const outcome = decideMatch(emptySignals({ addressUnitIds: ['unit-9'] }))
    expect(outcome.unitId).toBeNull()
    expect(outcome.rule).toBe('address_in_body')
    expect(outcome.confidence).toBe('medium')
    expect(outcome.status).toBe('needs_review')
    expect(outcome.reason.candidate_unit_ids).toEqual(['unit-9'])
  })

  it('5b. multiple addresses in the body yield no match', () => {
    const outcome = decideMatch(emptySignals({ addressUnitIds: ['unit-9', 'unit-10'] }))
    expect(outcome.rule).toBe('none')
    expect(outcome.confidence).toBe('none')
  })

  it('6. exactly one sender-name match is low confidence', () => {
    const outcome = decideMatch(
      emptySignals({
        nameMatches: [{ unitId: 'unit-3', residentId: 'res-3', residentName: 'Dana Okafor' }],
      }),
    )
    expect(outcome.unitId).toBeNull()
    expect(outcome.rule).toBe('sender_name')
    expect(outcome.confidence).toBe('low')
    expect(outcome.status).toBe('needs_review')
  })

  it('6b. ambiguous names yield no match', () => {
    const outcome = decideMatch(
      emptySignals({
        nameMatches: [
          { unitId: 'u1', residentId: 'r1', residentName: 'J Smith' },
          { unitId: 'u2', residentId: 'r2', residentName: 'J Smith' },
        ],
      }),
    )
    expect(outcome.rule).toBe('none')
  })

  it('no signals → triage', () => {
    const outcome = decideMatch(emptySignals())
    expect(outcome.unitId).toBeNull()
    expect(outcome.residentId).toBeNull()
    expect(outcome.confidence).toBe('none')
    expect(outcome.rule).toBe('none')
    expect(outcome.status).toBe('needs_review')
  })

  it('every outcome carries an auditable reason', () => {
    const outcome = decideMatch(
      emptySignals({ emailMatches: [propertyMatch('unit-1', 'res-1')] }),
    )
    // match_reason must explain itself in the UI — "matched via X on Y".
    expect(outcome.reason.rule).toBe('resident_email')
    expect(outcome.reason.matched_on).toBe('property_resident')
  })

  it('only high confidence ever auto-attaches', () => {
    const highs = [
      decideMatch(emptySignals({ threadUnitId: 'u' })),
      decideMatch(emptySignals({ aliasUnitId: 'u' })),
      decideMatch(emptySignals({ emailMatches: [propertyMatch('u', null)] })),
    ]
    for (const outcome of highs) {
      expect(outcome.confidence).toBe('high')
      expect(outcome.unitId).not.toBeNull()
      expect(outcome.status).toBe('open')
    }

    const lowers = [
      decideMatch(emptySignals({ addressUnitIds: ['u'] })),
      decideMatch(
        emptySignals({
          nameMatches: [{ unitId: 'u', residentId: null, residentName: 'X' }],
        }),
      ),
    ]
    for (const outcome of lowers) {
      expect(outcome.unitId).toBeNull()
      expect(outcome.status).toBe('needs_review')
    }
  })
})

describe('extractAddressCandidates', () => {
  it('finds a street address in prose', () => {
    expect(extractAddressCandidates('I live at 214 Oak Lane and the gate broke.')).toContain(
      '214 Oak Lane',
    )
  })

  it('finds an address with a street-type abbreviation', () => {
    expect(extractAddressCandidates('Re: 31 Birch Ct fence')).toContain('31 Birch Ct')
  })

  it('finds a multi-word street name', () => {
    expect(extractAddressCandidates('at 88 North Maple Drive today')).toContain(
      '88 North Maple Drive',
    )
  })

  it('finds several distinct addresses', () => {
    const found = extractAddressCandidates('Both 214 Oak Ln and 31 Birch Ct are affected.')
    expect(found).toHaveLength(2)
  })

  it('ignores numbers that are not addresses', () => {
    expect(extractAddressCandidates('Invoice 4417 for $340 due on 15 July')).toEqual([])
  })

  it('handles null and empty input', () => {
    expect(extractAddressCandidates(null)).toEqual([])
    expect(extractAddressCandidates('')).toEqual([])
  })

  it('deduplicates repeats', () => {
    expect(
      extractAddressCandidates('214 Oak Ln — again, 214 Oak Ln is the problem'),
    ).toHaveLength(1)
  })
})

/**
 * applyMatch's guard against clobbering a manual filing.
 *
 * This is the one regression in this module that would be SILENT: the
 * write still succeeds, the sync job still logs a clean run, and the only
 * evidence is a thread quietly reverting from the property a manager
 * chose back to whatever the matcher guessed (possibly nothing). So the
 * guard is asserted structurally — the predicates must be ON the UPDATE
 * statement, because a read-then-decide version passes every behavioural
 * test written against a single-threaded mock while still losing the race
 * against a concurrent manual assignment in production.
 */
type ApplyMatchDb = Parameters<typeof applyMatch>[0]

interface RecordedWrite {
  table: string
  values: Record<string, unknown>
  filters: Array<{ op: 'eq' | 'neq'; column: string; value: unknown }>
}

function recordingDb(result: { error: unknown } = { error: null }) {
  const writes: RecordedWrite[] = []
  const reads: string[] = []

  const db = {
    from(table: string) {
      return {
        select(columns: string) {
          reads.push(`${table}:${columns}`)
          throw new Error(
            `applyMatch issued an unexpected SELECT on "${table}" — the guard ` +
              'must be predicates on the UPDATE, not a read-then-decide.',
          )
        },
        update(values: Record<string, unknown>) {
          const write: RecordedWrite = { table, values, filters: [] }
          writes.push(write)
          const builder = {
            eq(column: string, value: unknown) {
              write.filters.push({ op: 'eq', column, value })
              return builder
            },
            neq(column: string, value: unknown) {
              write.filters.push({ op: 'neq', column, value })
              return builder
            },
            then<T>(onFulfilled: (value: { error: unknown }) => T) {
              return Promise.resolve(result).then(onFulfilled)
            },
          }
          return builder
        },
      }
    },
  }

  return { db: db as unknown as ApplyMatchDb, writes, reads }
}

const OUTCOME: MatchOutcome = {
  unitId: 'unit-1',
  residentId: 'res-1',
  confidence: 'high',
  rule: 'resident_email',
  reason: { rule: 'resident_email', matched_on: 'resident_email' },
  status: 'open',
}

describe('applyMatch — the guard is atomic, not read-then-decide', () => {
  it('never reads the thread first — one statement, no TOCTOU window', async () => {
    const { db, writes, reads } = recordingDb()
    await applyMatch(db, 'org-1', 'thread-1', OUTCOME)
    expect(reads).toEqual([])
    expect(writes).toHaveLength(1)
  })

  it('refuses a manual filing inside the UPDATE itself', async () => {
    const { db, writes } = recordingDb()
    await applyMatch(db, 'org-1', 'thread-1', OUTCOME)
    expect(writes[0]?.filters).toContainEqual({
      op: 'neq',
      column: 'match_source',
      value: 'manual',
    })
  })

  it('refuses a closed thread inside the UPDATE itself', async () => {
    const { db, writes } = recordingDb()
    await applyMatch(db, 'org-1', 'thread-1', OUTCOME)
    expect(writes[0]?.filters).toContainEqual({
      op: 'neq',
      column: 'status',
      value: 'closed',
    })
  })

  it('stays org-scoped and thread-scoped on the write', async () => {
    const { db, writes } = recordingDb()
    await applyMatch(db, 'org-1', 'thread-1', OUTCOME)
    expect(writes[0]?.filters).toContainEqual({
      op: 'eq',
      column: 'organization_id',
      value: 'org-1',
    })
    expect(writes[0]?.filters).toContainEqual({ op: 'eq', column: 'id', value: 'thread-1' })
    expect(writes[0]?.table).toBe('inbox_threads')
  })

  it('writes the outcome and stamps match_source back to auto', async () => {
    const { db, writes } = recordingDb()
    await applyMatch(db, 'org-1', 'thread-1', OUTCOME)
    expect(writes[0]?.values).toMatchObject({
      unit_id: 'unit-1',
      resident_id: 'res-1',
      match_confidence: 'high',
      match_source: 'auto',
      status: 'open',
    })
  })

  it('a guarded no-op resolves quietly — zero rows matched is not an error', async () => {
    // PostgREST reports a zero-row UPDATE as success with `error: null`.
    // Refusing to overwrite a manual filing is the intended outcome, so it
    // must not throw and must not be logged as a failure.
    const { db } = recordingDb({ error: null })
    await expect(applyMatch(db, 'org-1', 'thread-1', OUTCOME)).resolves.toBeUndefined()
  })

  it('a real write failure still throws rather than being swallowed', async () => {
    const failure = { message: 'connection reset', code: '08006' }
    const { db } = recordingDb({ error: failure })
    await expect(applyMatch(db, 'org-1', 'thread-1', OUTCOME)).rejects.toBe(failure)
  })
})

/**
 * applyVendorMatch — the "never overwrite a human's filing" guard.
 *
 * Asserted STRUCTURALLY, for the same reason the applyMatch suite above
 * does it that way: a read-then-decide version passes every behavioural
 * test written against a single-threaded mock while still losing the race
 * against a concurrent manual assignment in production. So the test is
 * that the predicate is ON the UPDATE, not that some branch was taken.
 */
describe('applyVendorMatch', () => {
  interface Recorded {
    table: string
    values: Record<string, unknown>
    eq: Array<[string, unknown]>
    is: Array<[string, unknown]>
  }

  function vendorDb(opts: { fromEmail: string | null; vendorId: string | null }) {
    const writes: Recorded[] = []

    const db = {
      from(table: string) {
        const eq: Array<[string, unknown]> = []
        const is: Array<[string, unknown]> = []
        let values: Record<string, unknown> = {}
        let isWrite = false

        const chain: Record<string, unknown> = {
          select: () => chain,
          update: (v: Record<string, unknown>) => {
            isWrite = true
            values = v
            return chain
          },
          eq: (column: string, value: unknown) => {
            eq.push([column, value])
            return chain
          },
          is: (column: string, value: unknown) => {
            is.push([column, value])
            if (isWrite) writes.push({ table, values, eq, is })
            return Promise.resolve({ error: null })
          },
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => {
            if (table === 'inbox_messages') {
              return { data: { from_email: opts.fromEmail }, error: null }
            }
            return { data: opts.vendorId ? { id: opts.vendorId } : null, error: null }
          },
        }
        return chain
      },
    } as unknown as Parameters<typeof applyVendorMatch>[0]

    return { db, writes }
  }

  it('guards the write with is(vendor_id, null) rather than reading first', async () => {
    const { db, writes } = vendorDb({ fromEmail: 'jose@abclandscaping.com', vendorId: 'vendor-1' })

    await applyVendorMatch(db, 'org-1', 'thread-1')

    expect(writes).toHaveLength(1)
    expect(writes[0].values).toEqual({ vendor_id: 'vendor-1' })
    expect(writes[0].is).toContainEqual(['vendor_id', null])
    expect(writes[0].eq).toContainEqual(['organization_id', 'org-1'])
    expect(writes[0].eq).toContainEqual(['id', 'thread-1'])
  })

  it('writes nothing when no vendor uses the sender address', async () => {
    const { db, writes } = vendorDb({ fromEmail: 'resident@gmail.com', vendorId: null })

    await applyVendorMatch(db, 'org-1', 'thread-1')

    expect(writes).toHaveLength(0)
  })

  it('writes nothing when the thread has no inbound sender', async () => {
    const { db, writes } = vendorDb({ fromEmail: null, vendorId: 'vendor-1' })

    await applyVendorMatch(db, 'org-1', 'thread-1')

    expect(writes).toHaveLength(0)
  })
})
