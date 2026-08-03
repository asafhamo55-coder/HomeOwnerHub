import { describe, it, expect, vi, beforeEach } from 'vitest'

// `vi.hoisted` is required: vi.mock factories are hoisted above the module
// body, so a plain `const mock = vi.fn()` referenced inside one throws
// ReferenceError under vitest 2.1.9. Task 2 of this plan hit exactly that.
interface LoggedEvent {
  propertyId: string
  kind: string
  payload?: Record<string, unknown>
  notes?: string | null
}

const { fromMock, logPropertyEventMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  // Typed with its argument, so `mock.calls[0][0]` is inspectable — an
  // untyped `vi.fn(async () => …)` records a zero-length tuple.
  logPropertyEventMock: vi.fn(
    async (_args: {
      propertyId: string
      kind: string
      payload?: Record<string, unknown>
      notes?: string | null
    }) => ({ ok: true as const, id: 'evt-1' }),
  ),
}))

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({
    role: 'board' as const,
    org: { id: 'org-1', name: 'Madison Park', hub_type: 'hoa', plan: 'pro', doors_count: 120 },
  })),
}))

vi.mock('@/lib/property-events', () => ({ logPropertyEvent: logPropertyEventMock }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: fromMock,
  })),
}))

import { updateResidentFromInbox } from './actions'

interface Op {
  table: string
  kind: 'update' | 'upsert' | 'delete'
  filters: Record<string, unknown>
  values?: Record<string, unknown>
}

/**
 * Records every write so a test can assert what did — and did NOT — happen.
 * "The alias is untouched on a name-only edit" is only meaningful if this
 * harness would have recorded a touch.
 */
function harness(opts: {
  resident?: { id: string; property_id: string; email: string | null } | null
  /** Make every inbox_sender_aliases write fail, to exercise the warning. */
  aliasFails?: boolean
}) {
  const ops: Op[] = []
  const residentSelectFilters: Record<string, unknown> = {}
  const resident =
    opts.resident === undefined
      ? { id: 'res-1', property_id: 'legacy-1', email: 'old@example.com' }
      : opts.resident

  fromMock.mockImplementation((table: string) => {
    const filters: Record<string, unknown> = {}
    let kind: 'select' | Op['kind'] = 'select'
    let values: Record<string, unknown> | undefined

    const aliasResult = () => ({
      error: opts.aliasFails ? { code: '23505', message: 'conflict' } : null,
    })

    const readResult = () => {
      if (table === 'inbox_threads') return { data: { unit_id: 'unit-1' }, error: null }
      if (table === 'units') return { data: { legacy_hoa_property_id: 'legacy-1' }, error: null }
      if (table === 'property_residents') return { data: resident, error: null }
      return { data: null, error: null }
    }

    const chain: Record<string, unknown> = {
      select: vi.fn(() => chain),
      update: vi.fn((v: Record<string, unknown>) => {
        kind = 'update'
        values = v
        return chain
      }),
      upsert: vi.fn((v: Record<string, unknown>) => {
        kind = 'upsert'
        values = v
        ops.push({ table, kind: 'upsert', filters, values })
        return Promise.resolve(aliasResult())
      }),
      delete: vi.fn(() => {
        kind = 'delete'
        return chain
      }),
      eq: vi.fn((column: string, value: unknown) => {
        filters[column] = value
        if (table === 'property_residents' && kind === 'select') {
          residentSelectFilters[column] = value
        }
        return chain
      }),
      maybeSingle: vi.fn(async () => readResult()),
      // The action awaits `.update(...).eq(...).eq(...)` and
      // `.delete().eq(...).eq(...)` directly, with no terminal method, so
      // the chain itself must be thenable and must record the write here.
      then: (resolve: (r: unknown) => unknown) => {
        if (kind === 'update' || kind === 'delete') {
          ops.push({ table, kind, filters, values })
        }
        const result =
          table === 'inbox_sender_aliases' ? aliasResult() : { data: null, error: null }
        return Promise.resolve(result).then(resolve)
      },
    }
    return chain
  })

  return { ops, residentSelectFilters }
}

beforeEach(() => {
  fromMock.mockReset()
  logPropertyEventMock.mockClear()
})

describe('updateResidentFromInbox', () => {
  it('refuses a resident belonging to another org, via an org-scoped lookup', async () => {
    // A cross-org residentId resolves to nothing once the query is scoped.
    const { residentSelectFilters } = harness({ resident: null })

    const result = await updateResidentFromInbox('thread-1', 'res-from-other-org', {
      fullName: 'Raja Nagula',
      email: 'a@b.com',
      phone: null,
    })

    expect(result).toEqual({ error: 'Resident not found.' })
    // The refusal must come from an org-scoped query, not a bare id lookup —
    // deleting .eq('organization_id', …) must fail this test.
    expect(residentSelectFilters.organization_id).toBe('org-1')
    expect(residentSelectFilters.id).toBe('res-from-other-org')
  })

  it('refuses a resident belonging to a different property than the thread', async () => {
    harness({ resident: { id: 'res-1', property_id: 'other-legacy', email: 'a@b.com' } })

    const result = await updateResidentFromInbox('thread-1', 'res-1', {
      fullName: 'Raja Nagula',
      email: 'a@b.com',
      phone: null,
    })

    expect(result).toEqual({ error: 'Resident not found.' })
  })

  it('repoints the sender alias when the email changes', async () => {
    const { ops } = harness({})

    await updateResidentFromInbox('thread-1', 'res-1', {
      fullName: 'Raja Nagula',
      email: 'new@example.com',
      phone: null,
    })

    const aliasOps = ops.filter((o) => o.table === 'inbox_sender_aliases')
    expect(aliasOps.some((o) => o.kind === 'delete')).toBe(true)
    expect(aliasOps.some((o) => o.kind === 'upsert')).toBe(true)

    const del = aliasOps.find((o) => o.kind === 'delete')
    expect(del?.filters.email_address).toBe('old@example.com')

    const upsert = aliasOps.find((o) => o.kind === 'upsert')
    expect(upsert?.values?.email_address).toBe('new@example.com')
    expect(upsert?.values?.resident_id).toBe('res-1')
    expect(upsert?.values?.unit_id).toBe('unit-1')
  })

  it('leaves the alias completely untouched when only the name changes', async () => {
    const { ops } = harness({})

    await updateResidentFromInbox('thread-1', 'res-1', {
      fullName: 'Raja N.',
      email: 'old@example.com',
      phone: null,
    })

    expect(ops.filter((o) => o.table === 'inbox_sender_aliases')).toHaveLength(0)
  })

  it('logs an audit event for an email change, carrying both addresses', async () => {
    harness({})

    await updateResidentFromInbox('thread-1', 'res-1', {
      fullName: 'Raja Nagula',
      email: 'new@example.com',
      phone: null,
    })

    expect(logPropertyEventMock).toHaveBeenCalledTimes(1)
    const arg = logPropertyEventMock.mock.calls[0][0] as LoggedEvent
    const payload = arg.payload ?? {}
    expect(arg.kind).toBe('note')
    // The legacy hoa_properties id, NOT the unit id.
    expect(arg.propertyId).toBe('legacy-1')
    expect(payload.from).toBe('old@example.com')
    expect(payload.to).toBe('new@example.com')
    expect(payload.alias_repointed).toBe(true)
  })

  it('logs nothing when only the name or phone changes', async () => {
    harness({})

    await updateResidentFromInbox('thread-1', 'res-1', {
      fullName: 'Raja N.',
      email: 'old@example.com',
      phone: '555-0100',
    })

    expect(logPropertyEventMock).not.toHaveBeenCalled()
  })

  it('still succeeds when the alias repoint fails, and returns a warning', async () => {
    harness({ aliasFails: true })

    const result = await updateResidentFromInbox('thread-1', 'res-1', {
      fullName: 'Raja Nagula',
      email: 'new@example.com',
      phone: null,
    })

    // The resident record is already corrected — the user's primary intent.
    // Rolling that back over a secondary index write would be worse.
    expect(result).toMatchObject({ ok: true })
    expect((result as { warning?: string }).warning).toMatch(/old address/i)
  })
})
