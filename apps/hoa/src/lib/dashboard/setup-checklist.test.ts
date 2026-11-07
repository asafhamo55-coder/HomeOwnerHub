import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withCommunityLocation } from '@/lib/association-location'
import { GUIDE_ARTICLES } from '@/generated/guide'
import { signZelleSettings, withZelleSettings } from '@/lib/pay-by-zelle'
import {
  OPTIONAL_SETUP_KEYS,
  SETUP_CHECKLIST_KEYS,
  allOf,
  buildSetupChecklist,
  isChecklistDismissible,
  loadSetupChecklist,
  ownersInvitedState,
  stepStateFrom,
  type SetupFacts,
} from './setup-checklist'

const mocks = vi.hoisted(() => ({ loadOwnersWithoutAccount: vi.fn() }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/owner-invites', () => ({ loadOwnersWithoutAccount: mocks.loadOwnersWithoutAccount }))

const ALL_DONE: SetupFacts = {
  association: [1],
  books: [1],
  properties: [3, 0],
  residents: [0, 2],
  board: [2],
  ownersToInvite: 0,
  location: [1],
  dues: [12],
  payments: [1],
  governingDocs: [1],
  bank: [1],
  mailbox: [1],
}

const NOTHING: SetupFacts = {
  association: [0],
  books: [0],
  properties: [0, 0],
  residents: [0, 0],
  board: [1], ownersToInvite: 3, location: [0],
  dues: [0],
  payments: [0],
  governingDocs: [0],
  bank: [0],
  mailbox: [0],
}

const stateOf = (facts: SetupFacts, key: string) => buildSetupChecklist(facts).steps.find((s) => s.key === key)!.state

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

describe('allOf', () => {
  it('is done only when every part is, todo as soon as one part is known missing', () => {
    expect(allOf('done', 'done')).toBe('done')
    expect(allOf('done', 'todo')).toBe('todo')
    expect(allOf('unknown', 'todo')).toBe('todo')
    expect(allOf('done', 'unknown')).toBe('unknown')
  })
})

describe('buildSetupChecklist', () => {
  it('has every step in order, each with a deep link', () => {
    const c = buildSetupChecklist(NOTHING)
    expect(c.steps.map((s) => s.key)).toEqual([...SETUP_CHECKLIST_KEYS])
    expect(c.steps.map((s) => s.key)).toEqual([
      'association',
      'properties',
      'residents',
      'board',
      'invite_owners',
      'dues',
      'payments',
      'governing_docs',
      'bank',
      'mailbox',
    ])
    for (const step of c.steps) {
      expect(step.href.startsWith('/')).toBe(true)
      expect(step.cta.length).toBeGreaterThan(0)
    }
  })

  it('every step names the guide article its "How?" link opens (BL-070), and completion stays derived', () => {
    const ids = new Set(GUIDE_ARTICLES.map((a) => a.id))
    for (const step of buildSetupChecklist(NOTHING).steps) expect(ids.has(step.guide), `${step.key}: ${step.guide}`).toBe(true)
    expect(buildSetupChecklist(ALL_DONE).complete).toBe(true)
    expect(buildSetupChecklist(NOTHING).doneCount).toBe(0)
  })

  it('links the steps that were missing (BL-127) to the page that does them', () => {
    const byKey = Object.fromEntries(buildSetupChecklist(NOTHING).steps.map((s) => [s.key, s]))
    expect(byKey.association!.href).toBe('/accounting/periods')
    expect(byKey.association!.secondary).toEqual({
      href: '/settings/association',
      label: 'Confirm your state, type, city and ZIP',
    })
    expect(byKey.payments!.href).toBe('/settings/payments')
    expect(byKey.bank!.href).toBe('/accounting/bank')
  })

  it('counts progress from done steps only', () => {
    const c = buildSetupChecklist({ ...NOTHING, mailbox: [1], dues: [5] })
    expect(c.doneCount).toBe(2)
    expect(c.total).toBe(10)
    expect(c.percent).toBe(20)
    expect(c.requiredDone).toBe(1)
    expect(c.requiredTotal).toBe(8)
    expect(c.complete).toBe(false)
  })

  it('"Invite the board" needs a second board member or admin — a lone founder is not "board invited"', () => {
    expect(stateOf(NOTHING, 'board')).toBe('todo')
    // The loader counts board roles only, so a resident invite never reaches 2.
    expect(stateOf({ ...NOTHING, board: [2] }, 'board')).toBe('done')
  })

  it('"Association and books" needs both the association and open books', () => {
    expect(stateOf({ ...NOTHING, association: [1], books: [0] }, 'association')).toBe('todo')
    expect(stateOf({ ...NOTHING, association: [0], books: [null] }, 'association')).toBe('todo')
    expect(stateOf({ ...NOTHING, association: [1], books: [null], location: [1] }, 'association')).toBe('unknown')
    expect(stateOf({ ...NOTHING, association: [1], books: [1], location: [1] }, 'association')).toBe('done')
  })

  it('is complete when every required step is done; optional bank and mailbox don’t block it', () => {
    expect([...OPTIONAL_SETUP_KEYS].sort()).toEqual(['bank', 'mailbox'])
    const c = buildSetupChecklist({ ...ALL_DONE, bank: [0], mailbox: [0] })
    expect(c.complete).toBe(true)
    expect(c.doneCount).toBe(8)
    expect(c.steps.filter((s) => s.optional).map((s) => s.key)).toEqual(['bank', 'mailbox'])
  })

  it('is complete with everything done', () => {
    const c = buildSetupChecklist(ALL_DONE)
    expect(c.doneCount).toBe(10)
    expect(c.percent).toBe(100)
    expect(c.complete).toBe(true)
    expect(c.unknownCount).toBe(0)
  })

  it('a failed read shows "Couldn\'t check", is not counted as done, and blocks completion', () => {
    const c = buildSetupChecklist({ ...ALL_DONE, governingDocs: [null] })
    const docs = c.steps.find((s) => s.key === 'governing_docs')!
    expect(docs.state).toBe('unknown')
    expect(c.doneCount).toBe(9)
    expect(c.unknownCount).toBe(1)
    expect(c.complete).toBe(false)
  })

  it('every source failing reads as unknowns, not todos', () => {
    const failed = Object.fromEntries(
      Object.entries(NOTHING).map(([k, v]) => [k, Array.isArray(v) ? v.map(() => null) : null]),
    ) as unknown as SetupFacts
    const c = buildSetupChecklist(failed)
    expect(c.steps.every((s) => s.state === 'unknown')).toBe(true)
    expect(c.doneCount).toBe(0)
  })
})

describe('"Invite your owners" step', () => {
  const step = (facts: SetupFacts) => buildSetupChecklist(facts).steps.find((s) => s.key === 'invite_owners')!

  it('comes right after "Invite the board"', () => {
    const keys = buildSetupChecklist(NOTHING).steps.map((s) => s.key)
    expect(keys.indexOf('invite_owners')).toBe(keys.indexOf('board') + 1)
  })

  it('is done only when no owner with an email is still waiting for an invitation', () => {
    expect(ownersInvitedState(0)).toBe('done')
    expect(ownersInvitedState(1)).toBe('todo')
    expect(ownersInvitedState(40)).toBe('todo')
    expect(stateOf({ ...NOTHING, ownersToInvite: 0 }, 'invite_owners')).toBe('done')
    expect(stateOf({ ...NOTHING, ownersToInvite: 7 }, 'invite_owners')).toBe('todo')
  })

  it('a failed read is "couldn’t check", never done', () => {
    expect(ownersInvitedState(null)).toBe('unknown')
    expect(stateOf({ ...ALL_DONE, ownersToInvite: null }, 'invite_owners')).toBe('unknown')
    expect(buildSetupChecklist({ ...ALL_DONE, ownersToInvite: null }).complete).toBe(false)
  })

  it('is a required step that blocks completion until it is done', () => {
    expect(step(NOTHING).optional).toBe(false)
    expect(buildSetupChecklist({ ...ALL_DONE, ownersToInvite: 2 }).complete).toBe(false)
  })

  it('links to the invite flow, offers the printable notice, and opens the right guide article', () => {
    const s = step(NOTHING)
    expect(s.href).toBe('/settings/members#invite-owners')
    expect(s.secondary).toEqual({ href: '/people/join-notice', label: 'Print the “How to join” notice' })
    expect(s.guide).toBe('members-invite-owners')
    expect(s.description).toContain('How to join')
    expect(s.description).toContain('no email')
  })

  it('uses plain words: no em dashes in the visible text', () => {
    const s = step(NOTHING)
    for (const t of [s.title, s.description, s.cta, s.secondary!.label]) expect(t).not.toContain('\u2014')
  })
})

describe('"Association and books" also needs the community city and ZIP', () => {
  it('is todo while the city and ZIP are missing, done once saved', () => {
    expect(stateOf({ ...ALL_DONE, location: [0] }, 'association')).toBe('todo')
    expect(stateOf({ ...ALL_DONE, location: [1] }, 'association')).toBe('done')
    expect(stateOf({ ...ALL_DONE, location: [null] }, 'association')).toBe('unknown')
  })

  it('says in one plain sentence why the city and ZIP are asked for', () => {
    const s = buildSetupChecklist(NOTHING).steps.find((x) => x.key === 'association')!
    expect(s.description).toContain('house photos show for street-only addresses')
    expect(s.description).not.toContain('\u2014')
    expect(s.secondary!.label).not.toContain('\u2014')
  })
})

describe('isChecklistDismissible', () => {
  it('only a checklist with every required step done can be dismissed', () => {
    expect(isChecklistDismissible(buildSetupChecklist(ALL_DONE))).toBe(true)
    expect(isChecklistDismissible(buildSetupChecklist({ ...ALL_DONE, mailbox: [0], bank: [0] }))).toBe(true)
    expect(isChecklistDismissible(buildSetupChecklist(NOTHING))).toBe(false)
    expect(isChecklistDismissible(buildSetupChecklist({ ...ALL_DONE, dues: [null] }))).toBe(false)
    expect(isChecklistDismissible(buildSetupChecklist({ ...ALL_DONE, payments: [0] }))).toBe(false)
  })
})

// ─── Loader ────────────────────────────────────────────────────────────

interface TableResult {
  count?: number
  data?: unknown
  error?: { code: string; message: string }
  throws?: boolean
}

/** Table-keyed stand-in for the PostgREST builder (head:true counts and one maybeSingle read). */
function fakeDb(results: Record<string, TableResult>) {
  const seen: Array<{ table: string; filters: string[] }> = []
  return {
    from(table: string) {
      const filters: string[] = []
      seen.push({ table, filters })
      const result = results[table] ?? { count: 0 }
      const chain: Record<string, unknown> = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: () => chain,
        eq: (col: string, val: unknown) => {
          filters.push(`eq:${col}=${String(val)}`)
          return chain
        },
        is: (col: string, val: unknown) => {
          filters.push(`is:${col}=${String(val)}`)
          return chain
        },
        in: (col: string, val: unknown[]) => {
          filters.push(`in:${col}=${val.join(',')}`)
          return chain
        },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          if (result.throws) return Promise.reject(new Error('network down')).then(resolve, reject)
          return Promise.resolve(
            result.error
              ? { count: null, data: null, error: result.error }
              : { count: result.count ?? 0, data: result.data ?? null, error: null },
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
const SECRET = 'test-secret'

describe('loadSetupChecklist', () => {
  beforeEach(() => {
    mocks.loadOwnersWithoutAccount.mockReset()
    mocks.loadOwnersWithoutAccount.mockResolvedValue([])
    vi.stubEnv('PAY_SETTINGS_SECRET', SECRET)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const signedAssociation = {
    id: 'assoc-1',
    compliance_settings: withZelleSettings(
      withCommunityLocation({}, { city: 'Alpharetta', zip: '30005' }),
      signZelleSettings('assoc-1', { recipient: 'pay@example.test', recipientName: null, instructions: null }, SECRET),
    ),
  }

  it('derives every step from data', async () => {
    const db = fakeDb({
      associations: { count: 1, data: signedAssociation },
      fiscal_periods: { count: 1 },
      mailbox_accounts: { count: 0 },
      hoa_properties: { count: 40 },
      units: { count: 0 },
      property_residents: { count: 0 },
      ownerships: { count: 12 },
      governing_documents: { count: 2 },
      assessments: { count: 80 },
      org_members: { count: 3 },
      bank_accounts: { count: 0 },
    })
    const c = await loadSetupChecklist(db as never, ORG)
    expect(c.steps.find((s) => s.key === 'payments')!.state).toBe('done')
    // Optional bank and mailbox are not done, and the checklist is still complete.
    expect(c.complete).toBe(true)
  })

  it('payments are not done until residents can see verified Zelle details', async () => {
    const unsigned = { id: 'assoc-1', compliance_settings: { pay_by_zelle: { recipient: 'x@example.test' } } }
    for (const data of [null, unsigned, { id: 'assoc-1', compliance_settings: {} }]) {
      const c = await loadSetupChecklist(fakeDb({ associations: { count: 1, data } }) as never, ORG)
      expect(c.steps.find((s) => s.key === 'payments')!.state).toBe('todo')
    }
    const failed = await loadSetupChecklist(fakeDb({ associations: timeout }) as never, ORG)
    expect(failed.steps.find((s) => s.key === 'payments')!.state).toBe('unknown')
  })

  it('"Invite your owners" counts the owners the People page calls not invited yet', async () => {
    mocks.loadOwnersWithoutAccount.mockResolvedValue([
      { email: 'a@example.test', name: null, unitIds: ['u1'] },
      { email: 'b@example.test', name: null, unitIds: ['u2'] },
    ])
    const todo = await loadSetupChecklist(fakeDb({}) as never, ORG)
    expect(todo.steps.find((s) => s.key === 'invite_owners')!.state).toBe('todo')
    expect(mocks.loadOwnersWithoutAccount).toHaveBeenCalledWith(expect.anything(), ORG)

    mocks.loadOwnersWithoutAccount.mockResolvedValue([])
    const done = await loadSetupChecklist(fakeDb({}) as never, ORG)
    expect(done.steps.find((s) => s.key === 'invite_owners')!.state).toBe('done')
  })

  it('"Invite your owners" is unknown, not done, when the owner read fails or throws', async () => {
    mocks.loadOwnersWithoutAccount.mockResolvedValue(null)
    const failed = await loadSetupChecklist(fakeDb({}) as never, ORG)
    expect(failed.steps.find((s) => s.key === 'invite_owners')!.state).toBe('unknown')
    mocks.loadOwnersWithoutAccount.mockRejectedValue(new Error('boom'))
    const threw = await loadSetupChecklist(fakeDb({}) as never, ORG)
    expect(threw.steps.find((s) => s.key === 'invite_owners')!.state).toBe('unknown')
  })

  it('"Association and books" needs the saved city and ZIP, read from the same association row', async () => {
    const base = { associations: { count: 1, data: signedAssociation }, fiscal_periods: { count: 1 } }
    const ok = await loadSetupChecklist(fakeDb(base) as never, ORG)
    expect(ok.steps.find((s) => s.key === 'association')!.state).toBe('done')
    for (const loc of [{ city: '', zip: '' }, { city: 'Alpharetta', zip: '' }, { city: '', zip: '30005' }]) {
      const data = { id: 'assoc-1', compliance_settings: withCommunityLocation({}, loc) }
      const c = await loadSetupChecklist(fakeDb({ ...base, associations: { count: 1, data } }) as never, ORG)
      expect(c.steps.find((s) => s.key === 'association')!.state).toBe('todo')
    }
    const bad = await loadSetupChecklist(fakeDb({ ...base, associations: timeout }) as never, ORG)
    expect(bad.steps.find((s) => s.key === 'association')!.state).toBe('unknown')
  })

  it('counts only board roles for "Invite the board" (a resident invite doesn’t tick it)', async () => {
    const db = fakeDb({})
    await loadSetupChecklist(db as never, ORG)
    const members = db._seen.find((s) => s.table === 'org_members')!
    expect(members.filters).toContain('in:role=admin,board')
  })

  it('scopes every read to the org and skips deleted / disconnected / closed rows', async () => {
    const db = fakeDb({})
    await loadSetupChecklist(db as never, ORG)
    for (const { table, filters } of db._seen) {
      expect(
        filters.some((f) => f === `eq:organization_id=${ORG}` || f === `eq:org_id=${ORG}`),
        `${table} is org-scoped`,
      ).toBe(true)
    }
    const byTable = Object.fromEntries(db._seen.map((s) => [s.table, s.filters]))
    expect(byTable.mailbox_accounts).toContain('is:disconnected_at=null')
    expect(byTable.hoa_properties).toContain('is:deleted_at=null')
    expect(byTable.property_residents).toContain('is:moved_out_at=null')
    expect(byTable.governing_documents).toContain('is:superseded_at=null')
    expect(byTable.assessments).toContain('is:deleted_at=null')
    expect(byTable.fiscal_periods).toContain('eq:status=open')
    expect(byTable.bank_accounts).toContain('eq:is_active=true')
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
