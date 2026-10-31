import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queuedSupabase, type QueuedResp } from './test-utils/fake-supabase-queue'

const h = vi.hoisted(() => ({ db: null as unknown, assoc: null as unknown }))

vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => h.db }))
vi.mock('@/lib/primary-association', () => ({ getPrimaryAssociationResult: async () => h.assoc }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: async () => ({ id: 'org' }) }))
vi.mock('@/lib/api/ai-action-quota', () => ({ chargeAiActionQuota: vi.fn() }))
vi.mock('@/lib/auth', () => ({}))
vi.mock('@/lib/accounting/guard', () => ({ BOARD_ONLY_DENIED: 'x', requireBoardOrAdminForAction: vi.fn() }))
vi.mock('@/lib/conflict-disclosure/load', () => ({ conflictGate: vi.fn() }))
vi.mock('@/lib/conflict-disclosure/board', () => ({ fetchVotingBoard: vi.fn() }))
vi.mock('@/lib/storage-remove', () => ({ removeStorageObjects: vi.fn() }))
vi.mock('@homeowner-portal/workflows', () => ({ vendorOnboarder: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError: vi.fn() }))

import { getVendor } from './vendors'

const bad: QueuedResp = { data: null, error: { code: '42501', message: 'denied' } }
const vendorRow: QueuedResp = { data: { id: 'v1', legal_name: 'Acme', status: 'active' }, error: null }
const docs: QueuedResp = { data: [{ id: 'd1', doc_type: 'coi' }], error: null }
const comp: QueuedResp = { data: { coi_status: 'red' }, error: null }

function setup(r: Record<string, QueuedResp[]>, assoc: unknown = { ok: true, data: { id: 'a1' }, count: null }) {
  h.db = queuedSupabase(r).db
  h.assoc = assoc
}

describe('getVendor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('success is unchanged', async () => {
    setup({ vendors: [vendorRow], vendor_documents: [docs], vendor_compliance: [comp] })
    const r = await getVendor('v1')
    expect(r).toMatchObject({ ok: true, documentsFailed: false, complianceFailed: false })
    if (r.ok) {
      expect(r.vendor.documents).toHaveLength(1)
      expect(r.vendor.compliance?.coi_status).toBe('red')
    }
  })

  it('a real miss is not_found', async () => {
    setup({ vendors: [{ data: null, error: null }] })
    expect(await getVendor('v1')).toEqual({ ok: false, reason: 'not_found' })
  })

  it('a failed vendor read is error, not not_found', async () => {
    setup({ vendors: [bad] })
    expect(await getVendor('v1')).toEqual({ ok: false, reason: 'error' })
  })

  it('a failed compliance read is flagged, never null-as-clear', async () => {
    setup({ vendors: [vendorRow], vendor_documents: [docs], vendor_compliance: [bad] })
    expect(await getVendor('v1')).toMatchObject({ ok: true, complianceFailed: true, documentsFailed: false })
  })

  it('a failed documents read is flagged', async () => {
    setup({ vendors: [vendorRow], vendor_documents: [bad], vendor_compliance: [comp] })
    expect(await getVendor('v1')).toMatchObject({ ok: true, documentsFailed: true, complianceFailed: false })
  })

  it('a failed association read counts as a failed insurance read', async () => {
    setup({ vendors: [vendorRow], vendor_documents: [docs] }, { ok: false })
    expect(await getVendor('v1')).toMatchObject({ ok: true, complianceFailed: true })
  })

  it('no association is a legitimate empty compliance', async () => {
    setup({ vendors: [vendorRow], vendor_documents: [docs] }, { ok: true, data: null, count: null })
    expect(await getVendor('v1')).toMatchObject({ ok: true, complianceFailed: false })
  })
})
