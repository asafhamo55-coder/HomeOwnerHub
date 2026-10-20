import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { memorySupabase } from '@/lib/test-utils/memory-supabase'
import { LETTER_AUDIT_ENTITY, LETTER_PRINTED } from './audit'
import { LETTER_ACTION } from './proposal'

const UNIT = '11111111-1111-4111-8111-111111111111'
const PROPERTY = '22222222-2222-4222-8222-222222222222'
const CASE = '33333333-3333-4333-8333-333333333333'
const ORG = '44444444-4444-4444-8444-444444444444'

vi.mock('@/lib/properties/estoppel/load', () => ({
  loadEstoppelInput: vi.fn(async () => ({
    today: '2026-10-19',
    timeZone: 'America/New_York',
    input: { propertyId: PROPERTY, unitId: UNIT, collectionCase: { id: CASE, status: 'lien_warning', attorneyFirm: null } },
  })),
}))
vi.mock('../queries', () => ({ listEventsForCase: vi.fn(async () => []) }))

import { loadLetterContext } from './load'

const reqId = (i: number) => `55555555-5555-4555-8555-${String(i).padStart(12, '0')}`
const payload = {
  version: 1,
  kind: 'fl_late_notice',
  jurisdiction: 'FL',
  caseId: CASE,
  propertyId: PROPERTY,
  unitId: UNIT,
  draftedOn: '2026-09-01',
  values: {},
  chargeIds: ['a'],
  ledgerCents: 100,
  enteredCents: 0,
  totalCents: 100,
}

describe('loadLetterContext', () => {
  it('finds an approved, unprinted letter however many letters came after it', async () => {
    // 25 letters on the case: the oldest is approved and never printed;
    // the 24 newer ones were rejected. A newest-20 read would hide it.
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: reqId(i),
      organization_id: ORG,
      action_type: LETTER_ACTION,
      // memory-supabase matches a filter column by its literal name.
      'payload->>caseId': CASE,
      status: i === 0 ? 'posted' : 'rejected',
      proposed_at: `2026-09-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
      decision_reason: null,
      error: null,
      payload,
    }))
    const { client } = memorySupabase({ approval_requests: rows, audit_log: [] })
    const ctx = await loadLetterContext(client as unknown as SupabaseClient, ORG, PROPERTY as never)
    expect(ctx!.requests).toHaveLength(25)
    expect(ctx!.requests[0]!.id).toBe(reqId(24)) // newest first
    const approved = ctx!.requests.find((r) => r.status === 'posted' && r.printedAt === null)
    expect(approved?.id).toBe(reqId(0))
  })

  it('reads the print log for every letter, so a printed one is never offered again', async () => {
    const rows = Array.from({ length: 150 }, (_, i) => ({
      id: reqId(i),
      organization_id: ORG,
      action_type: LETTER_ACTION,
      'payload->>caseId': CASE,
      status: 'posted',
      proposed_at: new Date(Date.parse('2026-01-01T00:00:00Z') + i * 3_600_000).toISOString(),
      decision_reason: null,
      error: null,
      payload,
    }))
    const audit = rows.map((r) => ({ org_id: ORG, action: LETTER_PRINTED, entity_type: LETTER_AUDIT_ENTITY, entity_id: r.id, created_at: '2026-10-01T00:00:00Z' }))
    const { client } = memorySupabase({ approval_requests: rows, audit_log: audit })
    const ctx = await loadLetterContext(client as unknown as SupabaseClient, ORG, PROPERTY as never)
    expect(ctx!.requests).toHaveLength(150)
    expect(ctx!.requests.every((r) => r.printedAt !== null)).toBe(true)
  })
})
