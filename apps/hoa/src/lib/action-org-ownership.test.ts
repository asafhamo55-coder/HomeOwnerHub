import { beforeEach, describe, expect, it, vi } from 'vitest'

// Security sweep 2026-10-20 (H-1, H-2, M-1). Each action that hands a
// client-supplied id to the service role or a workflow must:
//   1. refuse a resident before any read, quota charge or workflow call;
//   2. refuse another org's id before any service-role call or quota charge;
//   3. let a board member of the right org through, with the gate's org id.

const ORG = 'org-1'
const OTHER_ORG = 'org-2'
const RFP_MINE = '11111111-1111-4111-8111-111111111111'
const RFP_THEIRS = '22222222-2222-4222-8222-222222222222'
const VENDOR_MINE = '33333333-3333-4333-8333-333333333333'
const VENDOR_THEIRS = '44444444-4444-4444-8444-444444444444'
const DOC_THEIRS = '55555555-5555-4555-8555-555555555555'
const EVENT_THEIRS = '66666666-6666-4666-8666-666666666666'
const EVENT_MINE = '77777777-7777-4777-8777-777777777777'

type Row = Record<string, unknown>

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  db: {} as Record<string, Row[]>,
  reads: [] as Array<{ table: string; filters: Record<string, unknown> }>,
  writes: [] as Array<{ table: string; op: string; filters: Record<string, unknown> }>,
  signed: [] as string[],
  removed: [] as string[][],
  quota: vi.fn(async () => ({ ok: true as const, userId: 'user-1' })),
  createAdminClient: vi.fn(() => {
    throw new Error('service role reached')
  }),
  bidExecute: vi.fn(async () => ({ runId: 'run-1', output: { comparisonTable: [] } })),
  vendorExecute: vi.fn(async () => ({
    runId: 'run-2',
    output: { complianceStatus: 'green', deficiencies: [], summary: 'ok' },
  })),
  rfpExecute: vi.fn(async () => ({
    runId: 'run-3',
    output: { title: 'T', scope: 'S', evaluationCriteria: [], insuranceRequirements: {}, lineItems: [] },
  })),
  askStateLaw: vi.fn(async () => ({ answer: 'a', runId: 'run-4' })),
  sendEventAlertEmail: vi.fn(async () => ({ sent: 1, failed: [], held: 0 })),
}))

function builder(table: string) {
  const filters: Record<string, unknown> = {}
  let op = 'select'
  const match = () =>
    (h.db[table] ?? []).filter((r) => Object.entries(filters).every(([k, v]) => r[k] === v))
  const finish = (single: boolean) => {
    if (op === 'select') {
      h.reads.push({ table, filters: { ...filters } })
      const rows = match()
      return { data: single ? (rows[0] ?? null) : rows, error: null, count: rows.length }
    }
    h.writes.push({ table, op, filters: { ...filters } })
    return { data: single ? { id: 'new-row' } : null, error: null }
  }
  const q: Record<string, unknown> = {}
  const chain = () => q
  Object.assign(q, {
    select: chain,
    eq: (c: string, v: unknown) => {
      filters[c] = v
      return q
    },
    is: chain,
    in: chain,
    neq: chain,
    like: chain,
    order: chain,
    limit: chain,
    insert: () => {
      op = 'insert'
      return q
    },
    update: () => {
      op = 'update'
      return q
    },
    delete: () => {
      op = 'delete'
      return q
    },
    maybeSingle: async () => finish(true),
    single: async () => finish(true),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(finish(false)).then(res, rej),
  })
  return q
}

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: (t: string) => builder(t),
    storage: {
      from: () => ({
        createSignedUrl: async (p: string) => {
          h.signed.push(p)
          return { data: { signedUrl: `https://signed/${p}` } }
        },
        remove: async (paths: string[]) => {
          h.removed.push(paths)
          return { data: paths.map((name) => ({ name })), error: null }
        },
      }),
    },
  })),
}))
vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: ORG, name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
  getCurrentUserRoleInOrg: vi.fn(async () => h.role),
  requireBoardOrAdmin: vi.fn(async () => {
    if (h.role !== 'admin' && h.role !== 'board') throw new Error('redirected')
    return { role: h.role, org: { id: ORG, name: 'Test HOA' } }
  }),
}))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: ORG, name: 'Test HOA' })) }))
vi.mock('@/lib/primary-association', () => ({
  getPrimaryAssociationResult: vi.fn(async () => ({ ok: true, data: { id: 'assoc-1', name: 'Test', timeZone: 'America/New_York' }, count: null })),
}))
vi.mock('@/lib/api/ai-action-quota', () => ({ chargeAiActionQuota: h.quota }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: h.createAdminClient }))
vi.mock('@homeowner-portal/workflows', () => ({
  bidComparator: { execute: h.bidExecute },
  vendorOnboarder: { execute: h.vendorExecute },
  rfpComposer: { execute: h.rfpExecute },
  askStateLaw: h.askStateLaw,
}))
vi.mock('@/lib/events-alerts', () => ({ sendEventAlertEmail: h.sendEventAlertEmail }))
vi.mock('@/lib/association-time-current', () => ({ currentScopeZones: vi.fn(async () => () => 'America/New_York') }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), unstable_cache: (fn: unknown) => fn }))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected')
  }),
}))

const { runBidComparison, getBidDocumentSignedUrl } = await import('./bids')
const { runComplianceCheck, deleteVendorDocument, getVendorDocumentSignedUrl, deleteVendor } = await import('./vendors')
const { createRfpDraft, publishRfp, cancelRfp } = await import('./rfps')
const { askStateLawAction } = await import('./state-law')
const { sendTestAlert } = await import('./events')
const { BOARD_ONLY_DENIED } = await import('./accounting/guard')
const { inviteMember } = await import('./members')
const PROPERTY_MINE = '88888888-8888-4888-8888-888888888888'
const PROPERTY_THEIRS = '99999999-9999-4999-8999-999999999999'

const MANUAL = { coi: null, w9: null, license: null }

beforeEach(() => {
  h.role = 'board'
  h.reads = []
  h.writes = []
  h.signed = []
  h.removed = []
  h.db = {
    rfps: [
      { id: RFP_MINE, organization_id: ORG },
      { id: RFP_THEIRS, organization_id: OTHER_ORG },
    ],
    vendors: [
      { id: VENDOR_MINE, organization_id: ORG },
      { id: VENDOR_THEIRS, organization_id: OTHER_ORG },
    ],
    vendor_documents: [
      { id: DOC_THEIRS, organization_id: OTHER_ORG, vendor_id: VENDOR_THEIRS, storage_path: `${OTHER_ORG}/vendors/${VENDOR_THEIRS}/w9/a.pdf` },
    ],
    bids: [{ id: 'bid-x', organization_id: OTHER_ORG, raw_document_path: `${OTHER_ORG}/rfps/${RFP_THEIRS}/bids/v/a.pdf` }],
    rfp_line_items: [{ id: 'li-1', rfp_id: RFP_MINE }],
    associations: [{ id: 'assoc-1', organization_id: ORG, state: 'GA' }],
    hoa_properties: [
      { id: PROPERTY_MINE, org_id: ORG },
      { id: PROPERTY_THEIRS, org_id: OTHER_ORG },
    ],
    hoa_recurring_events: [
      { id: EVENT_THEIRS, organization_id: OTHER_ORG, association_id: 'assoc-2', title: 'x' },
      { id: EVENT_MINE, organization_id: ORG, association_id: 'assoc-1', title: 'y', notify_channels: ['email'] },
    ],
  }
  for (const f of [h.quota, h.createAdminClient, h.bidExecute, h.vendorExecute, h.rfpExecute, h.askStateLaw, h.sendEventAlertEmail]) {
    f.mockClear()
  }
})

function expectNothingPrivileged() {
  expect(h.quota).not.toHaveBeenCalled()
  expect(h.createAdminClient).not.toHaveBeenCalled()
  expect(h.bidExecute).not.toHaveBeenCalled()
  expect(h.vendorExecute).not.toHaveBeenCalled()
  expect(h.rfpExecute).not.toHaveBeenCalled()
  expect(h.askStateLaw).not.toHaveBeenCalled()
}

describe('H-1 runBidComparison', () => {
  it('refuses a resident before any read', async () => {
    h.role = 'resident'
    expect(await runBidComparison(RFP_MINE)).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
    expect(h.reads).toEqual([])
    expectNothingPrivileged()
  })

  it("refuses another org's rfpId before the quota charge or W23", async () => {
    expect(await runBidComparison(RFP_THEIRS)).toEqual({ ok: false, error: 'We could not find that RFP.' })
    expectNothingPrivileged()
  })

  it('refuses a malformed id without a query', async () => {
    expect(await runBidComparison('not-a-uuid')).toEqual({ ok: false, error: 'We could not find that RFP.' })
    expect(h.reads).toEqual([])
    expectNothingPrivileged()
  })

  it('lets the board of the owning org through, with the gate org id', async () => {
    const res = await runBidComparison(RFP_MINE)
    expect(res.ok).toBe(true)
    expect(h.quota).toHaveBeenCalledWith('board_ai', ORG)
    expect(h.bidExecute).toHaveBeenCalledWith({ rfpId: RFP_MINE }, { organizationId: ORG })
  })

  it('returns a fixed string, never the workflow message', async () => {
    h.bidExecute.mockRejectedValueOnce(new Error('rfp_not_found: secret db text 22P02'))
    expect(await runBidComparison(RFP_MINE)).toEqual({ ok: false, error: 'We could not find that RFP.' })
    h.bidExecute.mockRejectedValueOnce(new Error('boom: owner@example.com'))
    expect(await runBidComparison(RFP_MINE)).toEqual({ ok: false, error: 'The bid comparison failed. Try again.' })
  })
})

describe('H-2 runComplianceCheck', () => {
  it('refuses a resident before any read', async () => {
    h.role = 'resident'
    expect(await runComplianceCheck({ vendorId: VENDOR_MINE, manualExtract: MANUAL })).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
    expect(h.reads).toEqual([])
    expectNothingPrivileged()
  })

  it("refuses another org's vendorId before the quota charge or W21", async () => {
    expect(await runComplianceCheck({ vendorId: VENDOR_THEIRS, manualExtract: MANUAL })).toEqual({
      ok: false,
      error: 'We could not find that vendor.',
    })
    expectNothingPrivileged()
  })

  it('lets the board of the owning org through', async () => {
    const res = await runComplianceCheck({ vendorId: VENDOR_MINE, manualExtract: MANUAL })
    expect(res.ok).toBe(true)
    expect(h.quota).toHaveBeenCalledWith('board_ai', ORG)
    expect(h.vendorExecute).toHaveBeenCalledWith(expect.objectContaining({ vendorId: VENDOR_MINE }), { organizationId: ORG })
  })

  it('returns a fixed string, never the workflow message', async () => {
    h.vendorExecute.mockRejectedValueOnce(new Error('vendor_compliance_upsert_failed: duplicate key'))
    expect(await runComplianceCheck({ vendorId: VENDOR_MINE, manualExtract: MANUAL })).toEqual({
      ok: false,
      error: 'The compliance check failed. Try again.',
    })
  })
})

describe('M-1 board AI actions gate before the quota', () => {
  it('createRfpDraft: resident refused before any read or charge', async () => {
    h.role = 'resident'
    const res = await createRfpDraft({ freeTextNeed: 'Repave the clubhouse lot please.', submissionDeadline: '2027-01-01T00:00:00.000Z' })
    expect(res).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
    expect(h.reads).toEqual([])
    expectNothingPrivileged()
  })

  it('createRfpDraft: board succeeds on its own org', async () => {
    const res = await createRfpDraft({ freeTextNeed: 'Repave the clubhouse lot please.', submissionDeadline: '2027-01-01T00:00:00.000Z' })
    expect(res.ok).toBe(true)
    expect(h.quota).toHaveBeenCalledWith('board_ai', ORG)
    expect(h.rfpExecute).toHaveBeenCalledWith(expect.anything(), { organizationId: ORG })
  })

  it('askStateLawAction: resident refused before any read or charge', async () => {
    h.role = 'resident'
    expect(await askStateLawAction('Can we fine for parking?')).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
    expect(h.reads).toEqual([])
    expectNothingPrivileged()
  })

  it('askStateLawAction: board succeeds; a workflow failure is a fixed string', async () => {
    expect((await askStateLawAction('Can we fine for parking?')).ok).toBe(true)
    expect(h.quota).toHaveBeenCalledWith('board_ai', ORG)
    expect(h.askStateLaw).toHaveBeenCalledWith('Can we fine for parking?', 'GA', { organizationId: ORG })
    h.askStateLaw.mockRejectedValueOnce(new Error('relation "x" does not exist'))
    expect(await askStateLawAction('Can we fine for parking?')).toEqual({
      ok: false,
      error: 'The question could not be answered. Try again.',
    })
  })
})

describe('sweep: vendor, RFP and bid actions', () => {
  it("deleteVendorDocument: another org's document is not found and its file is not removed", async () => {
    expect(await deleteVendorDocument(DOC_THEIRS)).toEqual({ ok: false, error: 'Document not found.' })
    expect(h.removed).toEqual([])
    expect(h.writes).toEqual([])
  })

  it('deleteVendorDocument / deleteVendor / publishRfp / cancelRfp: resident refused before any read', async () => {
    h.role = 'resident'
    for (const call of [() => deleteVendorDocument(DOC_THEIRS), () => deleteVendor(VENDOR_MINE), () => publishRfp(RFP_MINE), () => cancelRfp(RFP_MINE)]) {
      expect(await call()).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
    }
    expect(h.reads).toEqual([])
    expect(h.writes).toEqual([])
  })

  it('deleteVendor / cancelRfp scope the write to the caller org', async () => {
    await deleteVendor(VENDOR_THEIRS)
    await cancelRfp(RFP_THEIRS)
    expect(h.writes.map((w) => w.filters.organization_id)).toEqual([ORG, ORG])
  })

  it("publishRfp: another org's RFP is not found and nothing is written", async () => {
    expect(await publishRfp(RFP_THEIRS)).toEqual({ ok: false, error: 'We could not find that RFP.' })
    expect(h.writes).toEqual([])
  })

  it('publishRfp: board publishes its own RFP', async () => {
    expect(await publishRfp(RFP_MINE)).toEqual({ ok: true })
    expect(h.writes).toEqual([
      { table: 'rfps', op: 'update', filters: { id: RFP_MINE, organization_id: ORG, status: 'draft' } },
    ])
  })

  it("signed URLs: another org's path, a resident, or an unknown path get nothing", async () => {
    expect(await getVendorDocumentSignedUrl(`${OTHER_ORG}/vendors/${VENDOR_THEIRS}/w9/a.pdf`)).toBeNull()
    expect(await getBidDocumentSignedUrl(`${OTHER_ORG}/rfps/${RFP_THEIRS}/bids/v/a.pdf`)).toBeNull()
    expect(await getBidDocumentSignedUrl(`${ORG}/rfps/${RFP_MINE}/bids/v/unknown.pdf`)).toBeNull()
    h.role = 'resident'
    expect(await getVendorDocumentSignedUrl(`${ORG}/vendors/x.pdf`)).toBeNull()
    expect(h.signed).toEqual([])
  })

  it('signed URLs: the board gets its own documents', async () => {
    const mine = `${ORG}/rfps/${RFP_MINE}/bids/v/a.pdf`
    h.db.bids!.push({ id: 'bid-1', organization_id: ORG, raw_document_path: mine })
    expect(await getBidDocumentSignedUrl(mine)).toBe(`https://signed/${mine}`)
  })
})

describe('sendTestAlert', () => {
  it('refuses a resident', async () => {
    h.role = 'resident'
    const res = await sendTestAlert(EVENT_MINE)
    expect(res.ok).toBe(false)
    expect(h.sendEventAlertEmail).not.toHaveBeenCalled()
  })

  it("refuses another org's event before the service-role send", async () => {
    expect(await sendTestAlert(EVENT_THEIRS)).toEqual({ ok: false, error: 'Event not found.' })
    expect(h.sendEventAlertEmail).not.toHaveBeenCalled()
  })

  it('board sends a test for its own event', async () => {
    const res = await sendTestAlert(EVENT_MINE)
    expect(res.ok).toBe(true)
    expect(h.sendEventAlertEmail).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG }))
  })
})

describe('inviteMember propertyId', () => {
  it("refuses another org's property before the service role is reached", async () => {
    h.role = 'admin'
    const res = await inviteMember({ email: 'new@example.com', role: 'resident', propertyId: PROPERTY_THEIRS } as never)
    expect(res).toEqual({ ok: false, error: 'We could not find that home.' })
    expect(h.createAdminClient).not.toHaveBeenCalled()
  })

  it('an own-org property passes the check and reaches the invite', async () => {
    h.role = 'admin'
    await expect(
      inviteMember({ email: 'new@example.com', role: 'resident', propertyId: PROPERTY_MINE } as never),
    ).rejects.toThrow('service role reached')
  })
})
