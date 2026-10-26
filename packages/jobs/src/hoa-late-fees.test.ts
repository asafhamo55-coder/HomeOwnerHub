import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-147: the nightly late-fee job charges only under a saved, signed,
// attested board policy inside the state rule. Before BL-147 it charged 5%
// on every overdue charge (fines and collection costs included) with no
// grace period and no board choice.

vi.mock('@homeowner-portal/db/m3', () => ({ M3_APPLIED: true }))
vi.mock('./client', () => ({ inngest: { createFunction: () => ({}) } }))
const db = vi.hoisted(() => ({
  loadAccountingRefs: vi.fn(),
  postJournalEntry: vi.fn(),
}))
vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: vi.fn(),
  loadAccountingRefs: db.loadAccountingRefs,
  postJournalEntry: db.postJournalEntry,
}))

const { runLateFeesForAssociation, LATE_FEE_AUDIT_ACTION } = await import('./hoa-late-fees')
const { signLateFeePolicy, withLateFeePolicy, LATE_FEE_POLICY_KEY } = await import('../../../apps/hoa/src/lib/late-fees/store')
const { DEFAULT_LATE_FEE_POLICY } = await import('../../../apps/hoa/src/lib/late-fees/policy')
type Policy = typeof DEFAULT_LATE_FEE_POLICY

type Row = Record<string, unknown>
const SECRET = 'test-secret'
const ASSOC = 'assoc-1'
const TODAY = '2026-10-21'

/** A tiny in-memory PostgREST: the filters the job uses, inserts, deletes. */
function fakeDb(seed: Row[]) {
  const assessments: Row[] = seed.map((r) => ({ deleted_at: null, source: null, payments: [], association_id: ASSOC, ...r }))
  const audit: Row[] = []
  const reads: string[] = []
  let nextId = 1
  return {
    assessments,
    audit,
    reads,
    from(table: string) {
      const preds: ((r: Row) => boolean)[] = []
      let range: [number, number] = [0, Number.MAX_SAFE_INTEGER]
      let inserted: Row | null = null
      let mode: 'select' | 'insert' | 'delete' = 'select'
      const b: Record<string, unknown> = {}
      const chain = (fn?: (...a: unknown[]) => void) => (...a: unknown[]) => {
        fn?.(...a)
        return b
      }
      b.select = chain(() => {
        if (mode === 'select') reads.push(table)
      })
      b.order = chain()
      b.range = chain((f, t) => (range = [f as number, t as number]))
      b.eq = chain((c, v) => preds.push((r) => r[c as string] === v))
      b.neq = chain((c, v) => preds.push((r) => r[c as string] !== v))
      b.lt = chain((c, v) => preds.push((r) => (r[c as string] as string) < (v as string)))
      b.in = chain((c, v) => preds.push((r) => (v as unknown[]).includes(r[c as string])))
      b.is = chain((c, v) => preds.push((r) => (r[c as string] ?? null) === v))
      b.or = chain((expr) => {
        const alts = (expr as string).split(',').map((part) => {
          const [col, op, ...rest] = part.split('.')
          const val = rest.join('.')
          if (op === 'is') return (r: Row) => r[col!] == null
          return (r: Row) => r[col!] != null && r[col!] !== val
        })
        preds.push((r) => alts.some((a) => a(r)))
      })
      b.insert = (row: Row) => {
        mode = 'insert'
        if (table === 'audit_log') {
          audit.push(row)
          return Promise.resolve({ error: null })
        }
        inserted = { ...row, id: `fee-${nextId++}`, deleted_at: null, source: null, payments: [] }
        assessments.push(inserted)
        return b
      }
      b.single = () => Promise.resolve({ data: inserted ? { id: inserted.id } : null, error: null })
      b.delete = () => {
        mode = 'delete'
        return {
          eq: (c: string, v: unknown) => {
            const i = assessments.findIndex((r) => r[c] === v)
            if (i >= 0) assessments.splice(i, 1)
            return Promise.resolve({ error: null })
          },
        }
      }
      b.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: assessments.filter((r) => preds.every((p) => p(r))).slice(range[0], range[1] + 1),
          error: null,
        }).then(resolve)
      return b
    },
  }
}

const base = { status: 'open', unit_id: 'u-1', fiscal_period_id: 'fp-1', amount: 100, assessment_type: 'regular', due_date: '2026-09-01' }

function policy(over: Partial<Policy> = {}): Policy {
  return {
    ...DEFAULT_LATE_FEE_POLICY,
    enabled: true,
    mode: 'percent',
    percentBps: 500,
    graceDays: 0,
    declarationAttested: true,
    declarationRef: 'Declaration, Article VI, Section 3',
    ...over,
  }
}

function assocWith(p: Policy | null, state = 'TX', extra: Record<string, unknown> = {}) {
  const settings: Record<string, unknown> = { other_key: { kept: true }, ...extra }
  return {
    id: ASSOC,
    organization_id: 'org-1',
    state,
    governing_law_state: null,
    compliance_settings: p
      ? withLateFeePolicy(settings, signLateFeePolicy(ASSOC, p, { updatedAt: '2026-10-20T12:00:00.000Z', updatedBy: 'user-1' }, SECRET))
      : settings,
  }
}

const log = { warn: vi.fn(), info: vi.fn() }
const deps = { secret: SECRET, log, skipOpeningBalances: true }

beforeEach(() => {
  vi.clearAllMocks()
  db.loadAccountingRefs.mockResolvedValue({ acctAR: 'ar', acctLateFeeIncome: 'lfi', fundOperating: 'op' })
  db.postJournalEntry.mockResolvedValue({ ok: true, journalEntryId: 'je-1' })
})

const fees = (f: ReturnType<typeof fakeDb>) => f.assessments.filter((r) => r.assessment_type === 'late_fee')

describe('no policy means no late fee (the safe default)', () => {
  it('an association that never saved a policy is charged nothing and nothing is read', async () => {
    const f = fakeDb([{ ...base, id: 'dues-1' }])
    const r = await runLateFeesForAssociation(f as never, assocWith(null), TODAY, deps)
    expect(r.status).toBe('no_policy')
    expect(r.charged).toBe(0)
    expect(fees(f)).toHaveLength(0)
    expect(f.reads).toEqual([])
    expect(db.postJournalEntry).not.toHaveBeenCalled()
    expect(f.audit).toHaveLength(0)
  })

  it('a policy written outside the signed save (bad signature) charges nothing', async () => {
    const f = fakeDb([{ ...base, id: 'dues-1' }])
    const a = assocWith(policy())
    ;(a.compliance_settings as Record<string, { sig: string }>)[LATE_FEE_POLICY_KEY]!.sig = '0'.repeat(64)
    const r = await runLateFeesForAssociation(f as never, a, TODAY, deps)
    expect(r.status).toBe('unverified')
    expect(fees(f)).toHaveLength(0)
  })

  it('a policy hand-edited to 50% (signature no longer matches) charges nothing', async () => {
    const f = fakeDb([{ ...base, id: 'dues-1' }])
    const a = assocWith(policy())
    ;(a.compliance_settings as Record<string, { policy: Policy }>)[LATE_FEE_POLICY_KEY]!.policy.percentBps = 5000
    const r = await runLateFeesForAssociation(f as never, a, TODAY, deps)
    expect(r.status).toBe('unverified')
    expect(fees(f)).toHaveLength(0)
  })

  it('no server secret: nothing verifies, nothing is charged', async () => {
    const f = fakeDb([{ ...base, id: 'dues-1' }])
    const r = await runLateFeesForAssociation(f as never, assocWith(policy()), TODAY, { ...deps, secret: null })
    expect(r.status).toBe('unverified')
    expect(fees(f)).toHaveLength(0)
  })

  it('a saved policy that is off, or not attested, charges nothing', async () => {
    for (const p of [policy({ enabled: false }), policy({ declarationAttested: false })]) {
      const f = fakeDb([{ ...base, id: 'dues-1' }])
      const r = await runLateFeesForAssociation(f as never, assocWith(p), TODAY, deps)
      expect(r.status).toBe('off')
      expect(fees(f)).toHaveLength(0)
    }
  })
})

describe('charging under a board policy', () => {
  it('charges the policy amount once, posts the JE, and writes one audit row with ids and counts only', async () => {
    const f = fakeDb([{ ...base, id: 'dues-1' }])
    const r = await runLateFeesForAssociation(f as never, assocWith(policy()), TODAY, deps)
    expect(r).toMatchObject({ status: 'ran', charged: 1, totalCents: 500 })
    expect(fees(f)).toEqual([expect.objectContaining({ amount: 5, memo_code: 'LATE-dues-1', due_date: TODAY, unit_id: 'u-1' })])
    expect(db.postJournalEntry).toHaveBeenCalledTimes(1)
    expect(f.audit).toEqual([
      {
        action: LATE_FEE_AUDIT_ACTION,
        org_id: 'org-1',
        user_id: null,
        entity_type: 'association',
        entity_id: ASSOC,
        metadata: { charged: 1, evaluated: 1, capped: 0, failed: 0, total_cents: 500, day: TODAY, policy_saved_at: '2026-10-20T12:00:00.000Z' },
      },
    ])
    expect(JSON.stringify(f.audit)).not.toContain('Article')
  })

  it('is idempotent: a second run the same night charges nothing more', async () => {
    const f = fakeDb([{ ...base, id: 'dues-1' }])
    const a = assocWith(policy())
    await runLateFeesForAssociation(f as never, a, TODAY, deps)
    const again = await runLateFeesForAssociation(f as never, a, TODAY, deps)
    expect(again.charged).toBe(0)
    expect(again.skipped).toBe(1)
    expect(fees(f)).toHaveLength(1)
    expect(f.audit).toHaveLength(1)
  })

  it('excludes fines by default, and charges them only when the board includes them', async () => {
    const seed = [
      { ...base, id: 'dues-1' },
      { ...base, id: 'fine-1', assessment_type: 'fine' },
    ]
    const off = fakeDb(seed)
    await runLateFeesForAssociation(off as never, assocWith(policy()), TODAY, deps)
    expect(fees(off).map((r) => r.memo_code)).toEqual(['LATE-dues-1'])

    const on = fakeDb(seed)
    await runLateFeesForAssociation(on as never, assocWith(policy({ excludeFines: false })), TODAY, deps)
    expect(fees(on).map((r) => r.memo_code).sort()).toEqual(['LATE-dues-1', 'LATE-fine-1'])
  })

  it('never charges a late fee on a late fee, a collection cost or a lien fee', async () => {
    const f = fakeDb([
      { ...base, id: 'lf', assessment_type: 'late_fee' },
      { ...base, id: 'legal', assessment_type: 'collection_legal' },
      { ...base, id: 'lien', assessment_type: 'lien_filing' },
    ])
    const r = await runLateFeesForAssociation(f as never, assocWith(policy({ excludeFines: false })), TODAY, deps)
    expect(r.evaluated).toBe(0)
    expect(fees(f).map((x) => x.id)).toEqual(['lf'])
  })

  it('honours the grace period: no fee until the due date plus grace has passed', async () => {
    // 10 days of grace, today 2026-10-21: due 10-11 is exactly at the end of grace (not late yet); 10-10 is late.
    const f = fakeDb([
      { ...base, id: 'in-grace', due_date: '2026-10-11' },
      { ...base, id: 'past-grace', due_date: '2026-10-10' },
      { ...base, id: 'due-today', due_date: TODAY },
    ])
    await runLateFeesForAssociation(f as never, assocWith(policy({ graceDays: 10 })), TODAY, deps)
    expect(fees(f).map((r) => r.memo_code)).toEqual(['LATE-past-grace'])
  })

  it('skips deleted charges and opening balances carried over (BL-136)', async () => {
    const f = fakeDb([
      { ...base, id: 'deleted', deleted_at: '2026-10-01T00:00:00Z' },
      { ...base, id: 'carried', source: 'opening_balance' },
    ])
    const r = await runLateFeesForAssociation(f as never, assocWith(policy()), TODAY, deps)
    expect(r.charged).toBe(0)
  })

  it('takes the percent of the amount still unpaid on a partly paid charge', async () => {
    const f = fakeDb([{ ...base, id: 'part', status: 'partial', amount: 200, payments: [{ amount: 150 }] }])
    await runLateFeesForAssociation(f as never, assocWith(policy({ percentBps: 1000 })), TODAY, deps)
    expect(fees(f)[0]!.amount).toBe(5)
  })

  it('a failed JE rolls the fee back and writes no audit row', async () => {
    db.postJournalEntry.mockResolvedValueOnce({ ok: false, error: 'closed period' })
    const f = fakeDb([{ ...base, id: 'dues-1' }])
    const r = await runLateFeesForAssociation(f as never, assocWith(policy()), TODAY, deps)
    expect(r).toMatchObject({ charged: 0, failed: 1 })
    expect(fees(f)).toHaveLength(0)
    expect(f.audit).toHaveLength(0)
  })
})

describe('state caps are enforced again in the job', () => {
  it('Georgia: a flat fee is cut to the greater of $10 or 10% of the late amount', async () => {
    const f = fakeDb([
      { ...base, id: 'small', amount: 50 },
      { ...base, id: 'big', amount: 400 },
    ])
    const r = await runLateFeesForAssociation(f as never, assocWith(policy({ mode: 'flat', percentBps: null, flatCents: 2500 }), 'GA'), TODAY, deps)
    const byMemo = Object.fromEntries(fees(f).map((x) => [x.memo_code, x.amount]))
    expect(byMemo).toEqual({ 'LATE-small': 10, 'LATE-big': 25 })
    expect(r.capped).toBe(1)
  })

  it('Georgia: a percent above 10% saved before the association moved to GA charges nothing', async () => {
    const f = fakeDb([{ ...base, id: 'dues-1' }])
    const r = await runLateFeesForAssociation(f as never, assocWith(policy({ percentBps: 1500 }), 'GA'), TODAY, deps)
    expect(r.status).toBe('off')
    expect(fees(f)).toHaveLength(0)
  })

  it('California: never late before 15 days, whatever grace was saved elsewhere', async () => {
    const f = fakeDb([
      { ...base, id: 'day-10', due_date: '2026-10-11' },
      { ...base, id: 'day-20', due_date: '2026-10-01' },
    ])
    // Grace 0 cannot be saved for CA; the job raises it to 15 regardless.
    const r = await runLateFeesForAssociation(f as never, assocWith(policy({ graceDays: 0 }), 'CA'), TODAY, deps)
    expect(r.status).toBe('off')
    const ok = fakeDb([
      { ...base, id: 'day-10', due_date: '2026-10-11' },
      { ...base, id: 'day-20', due_date: '2026-10-01' },
    ])
    await runLateFeesForAssociation(ok as never, assocWith(policy({ graceDays: 15 }), 'CA'), TODAY, deps)
    expect(fees(ok).map((x) => x.memo_code)).toEqual(['LATE-day-20'])
  })

  it('Florida: governing_law_state wins over the mailing state', async () => {
    const f = fakeDb([{ ...base, id: 'dues-1', amount: 100 }])
    const a = { ...assocWith(policy({ mode: 'flat', percentBps: null, flatCents: 4000 }), 'GA'), governing_law_state: 'FL' }
    await runLateFeesForAssociation(f as never, a, TODAY, deps)
    // FL: greater of $25 or 5% of $100 = $25.
    expect(fees(f)[0]!.amount).toBe(25)
  })
})

describe('BL-149: Georgia, from Jan 1, 2027, only a registered association is charged', () => {
  const regKit = async (status: 'registered' | 'opted_out' | 'none') => {
    if (status === 'none') return {}
    const { signGaRegistration, withGaRegistration } = await import('../../../apps/hoa/src/lib/ga-registration/store')
    const { EMPTY_GA_REGISTRATION } = await import('../../../apps/hoa/src/lib/ga-registration/model')
    const record = {
      ...EMPTY_GA_REGISTRATION,
      noChange: [],
      decision: status === 'registered' ? ('register' as const) : ('opt_out' as const),
      filings:
        status === 'registered'
          ? [{ id: 'c0000000-0000-4000-8000-000000000001', kind: 'registration' as const, filedOn: '2027-01-04', confirmation: null, coversYear: 2027, reason: null, meetingId: null }]
          : [],
    }
    return withGaRegistration({}, signGaRegistration(ASSOC, record, { updatedAt: '2027-01-04T12:00:00.000Z', updatedBy: 'user-1' }, SECRET))
  }

  it('not registered: nothing is read or charged, and the run says why', async () => {
    const f = fakeDb([{ ...base, id: 'dues-1' }])
    const r = await runLateFeesForAssociation(f as never, assocWith(policy(), 'GA', await regKit('none')), '2027-01-02', deps)
    expect(r.status).toBe('unregistered')
    expect(fees(f)).toHaveLength(0)
    expect(f.reads).toEqual([])
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining('Georgia registration not_registered'))
  })

  it('opted out: nothing is charged', async () => {
    const f = fakeDb([{ ...base, id: 'dues-1' }])
    const r = await runLateFeesForAssociation(f as never, assocWith(policy(), 'GA', await regKit('opted_out')), '2027-01-02', deps)
    expect(r.status).toBe('unregistered')
    expect(fees(f)).toHaveLength(0)
  })

  it('registered in the kit: charged as before', async () => {
    const f = fakeDb([{ ...base, id: 'dues-1' }])
    const r = await runLateFeesForAssociation(f as never, assocWith(policy(), 'GA', await regKit('registered')), '2027-01-05', deps)
    expect(r).toMatchObject({ status: 'ran', charged: 1 })
  })

  it('before Jan 1, 2027 nothing changes, and other states are never gated', async () => {
    const f = fakeDb([{ ...base, id: 'dues-1' }])
    expect((await runLateFeesForAssociation(f as never, assocWith(policy(), 'GA'), '2026-12-31', deps)).status).toBe('ran')
    const g = fakeDb([{ ...base, id: 'dues-1' }])
    expect((await runLateFeesForAssociation(g as never, assocWith(policy(), 'TX'), '2027-01-02', deps)).status).toBe('ran')
  })
})

describe('BL-161: Georgia, from Jan 1, 2027, a unit under a Secretary of State complaint stay is skipped', () => {
  const U1 = 'a0000000-0000-4000-8000-000000000001'
  const U2 = 'a0000000-0000-4000-8000-000000000002'
  const setup = async (complaints: 'running' | 'concluded' | 'forged') => {
    const { signGaRegistration, withGaRegistration } = await import('../../../apps/hoa/src/lib/ga-registration/store')
    const { EMPTY_GA_REGISTRATION } = await import('../../../apps/hoa/src/lib/ga-registration/model')
    const { signGaComplaints, withGaComplaints } = await import('../../../apps/hoa/src/lib/ga-complaints/store')
    const reg = withGaRegistration(
      {},
      signGaRegistration(
        ASSOC,
        {
          ...EMPTY_GA_REGISTRATION,
          noChange: [],
          decision: 'register',
          filings: [{ id: 'c0000000-0000-4000-8000-000000000001', kind: 'registration', filedOn: '2026-12-01', confirmation: null, coversYear: 2027, reason: null, meetingId: null }],
        },
        { updatedAt: '2026-12-01T12:00:00.000Z', updatedBy: 'user-1' },
        SECRET,
      ),
    )
    if (complaints === 'forged') return { ...reg, ga_sos_complaints: { v: 1, record: { units: {} }, updated_at: 'x', updated_by: null, sig: 'bad' } }
    const c = { id: 'd0000000-0000-4000-8000-000000000001', filedOn: '2026-12-10', subject: 'fees' as const, conclusionsOn: complaints === 'concluded' ? '2027-01-03' : null, extended: false }
    return withGaComplaints(reg, signGaComplaints(ASSOC, { units: { [U1]: [c] } }, { updatedAt: '2026-12-10T12:00:00.000Z', updatedBy: 'user-1' }, SECRET))
  }
  const seed = () => [
    { ...base, id: 'dues-u1', unit_id: U1 },
    { ...base, id: 'dues-u2', unit_id: U2 },
  ]

  it('while the stay runs: the stayed unit is charged nothing, the others are', async () => {
    const f = fakeDb(seed())
    const r = await runLateFeesForAssociation(f as never, assocWith(policy(), 'GA', await setup('running')), '2027-01-05', deps)
    expect(r).toMatchObject({ status: 'ran', charged: 1, stayed: 1, skipped: 1 })
    expect(fees(f).map((x) => x.unit_id)).toEqual([U2])
    expect(f.audit[0]!.metadata).toMatchObject({ charged: 1, stayed: 1 })
  })

  it('after the conclusions the unit is charged again', async () => {
    const f = fakeDb(seed())
    const r = await runLateFeesForAssociation(f as never, assocWith(policy(), 'GA', await setup('concluded')), '2027-01-05', deps)
    expect(r).toMatchObject({ status: 'ran', charged: 2, stayed: 0 })
  })

  it('before Jan 1, 2027 the stay changes nothing (warning only, on screen)', async () => {
    const f = fakeDb(seed())
    const r = await runLateFeesForAssociation(f as never, assocWith(policy(), 'GA', await setup('running')), '2026-12-31', deps)
    expect(r).toMatchObject({ status: 'ran', charged: 2, stayed: 0 })
  })

  it('a record that doesn’t verify: nothing is read or charged', async () => {
    const f = fakeDb(seed())
    const r = await runLateFeesForAssociation(f as never, assocWith(policy(), 'GA', await setup('forged')), '2027-01-05', deps)
    expect(r.status).toBe('complaints_unverified')
    expect(fees(f)).toHaveLength(0)
    expect(f.reads).toEqual([])
  })
})
