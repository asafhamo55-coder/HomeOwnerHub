import { describe, expect, it } from 'vitest'
import { fakeSupabase, hasEq } from '@/lib/test-utils/fake-supabase'
import { supabaseResidentNotifyStore } from './store'

const ORG = 'org-1'

describe('supabaseResidentNotifyStore', () => {
  it('claim: inserts the communication with the deterministic id; 23505 means already handled', async () => {
    let n = 0
    const { client, queries } = fakeSupabase((q) =>
      q.table === 'communications' ? { data: null, error: n++ === 0 ? null : { code: '23505', message: 'dup' } } : undefined,
    )
    const store = supabaseResidentNotifyStore(client)
    const claim = {
      id: 'c-1',
      organizationId: ORG,
      associationId: 'a-1',
      category: 'arc' as const,
      subject: 's',
      html: 'h',
      text: 't',
      channels: ['email' as const],
      residentUserId: 'u-1',
      audienceSummary: 'ARC decision: 1 resident',
      relatedResource: { type: 'resident_notice', id: 'arc-1' },
    }
    expect(await store.claim(claim)).toEqual({ ok: true })
    expect(await store.claim(claim)).toEqual({ ok: false, reason: 'exists' })
    const insert = queries[0].ops.find(([m]) => m === 'insert')![1] as Record<string, unknown>
    expect(insert).toMatchObject({ id: 'c-1', organization_id: ORG, category: 'arc', status: 'sending', source: 'workflow' })
    // No address or name copied into the audience definition.
    expect(JSON.stringify(insert.audience_definition)).not.toContain('@')
  })

  it('claim: any other error throws (code only)', async () => {
    const { client } = fakeSupabase(() => ({ data: null, error: { code: '42501', message: 'row dana@example.test' } }))
    await expect(
      supabaseResidentNotifyStore(client).claim({
        id: 'c',
        organizationId: ORG,
        associationId: 'a',
        category: 'custom',
        subject: '',
        html: '',
        text: '',
        channels: ['email'],
        residentUserId: 'u',
        audienceSummary: '',
        relatedResource: {},
      }),
    ).rejects.toThrow(/42501/)
  })

  it('preferences: no row means email on, SMS off; a row is honoured', async () => {
    const none = fakeSupabase(() => ({ data: null, error: null }))
    expect(await supabaseResidentNotifyStore(none.client).loadPreferences(ORG, 'u-1')).toEqual({ email: true, sms: false })
    expect(hasEq(none.queries[0], 'user_id', 'u-1')).toBe(true)
    expect(hasEq(none.queries[0], 'organization_id', ORG)).toBe(true)

    const row = fakeSupabase(() => ({ data: { email_opt_in: false, sms_opt_in: true }, error: null }))
    expect(await supabaseResidentNotifyStore(row.client).loadPreferences(ORG, 'u-1')).toEqual({ email: false, sms: true })
  })

  it('preferences: a failed read throws rather than defaulting to "send"', async () => {
    const { client } = fakeSupabase(() => ({ data: null, error: { code: 'XX' } }))
    await expect(supabaseResidentNotifyStore(client).loadPreferences(ORG, 'u')).rejects.toThrow()
  })

  it('loadContext (ARC): the application, its association and the resident', async () => {
    const { client } = fakeSupabase((q) => {
      if (q.table === 'arc_requests')
        return {
          data: {
            id: 'arc-1',
            organization_id: ORG,
            association_id: 'a-1',
            unit_id: 'unit-1',
            submitted_by: 'u-1',
            summary: 'Repaint door',
            submitter: { full_name: 'Dana', email: 'dana@example.test' },
          },
          error: null,
        }
      if (q.table === 'associations')
        return { data: [{ id: 'a-1', name: 'Maple', type: 'hoa', organization_id: ORG, compliance_settings: { x: 1 } }], error: null }
      return undefined
    })
    const ctx = await supabaseResidentNotifyStore(client).loadContext({ kind: 'arc_decision', arcId: 'arc-1', decision: 'approved', letter: null })
    expect(ctx).toEqual({
      association: { id: 'a-1', name: 'Maple', type: 'hoa', organizationId: ORG, complianceSettings: { x: 1 } },
      resident: { userId: 'u-1', unitId: 'unit-1', name: 'Dana', email: 'dana@example.test', phone: null },
      title: 'Repaint door',
    })
  })

  it('loadContext (ticket) with no association on the row falls back to the org’s first association', async () => {
    const { client, queries } = fakeSupabase((q) => {
      if (q.table === 'tickets')
        return {
          data: { id: 't-1', organization_id: ORG, association_id: null, unit_id: null, submitted_by: 'u-1', subject: 'Gate', submitter: null },
          error: null,
        }
      if (q.table === 'associations')
        return { data: [{ id: 'a-9', name: 'Maple', type: null, organization_id: ORG, compliance_settings: null }], error: null }
      return undefined
    })
    const ctx = await supabaseResidentNotifyStore(client).loadContext({ kind: 'ticket_reply', ticketId: 't-1', messageId: 'm', reply: 'r' })
    expect(ctx?.association.id).toBe('a-9')
    expect(ctx?.title).toBe('Gate')
    expect(ctx?.resident.email).toBeNull()
    expect(hasEq(queries.find((q) => q.table === 'associations')!, 'organization_id', ORG)).toBe(true)
  })

  it('loadContext: a missing row is null; a failed read throws', async () => {
    const gone = fakeSupabase(() => ({ data: null, error: null }))
    expect(await supabaseResidentNotifyStore(gone.client).loadContext({ kind: 'ticket_reply', ticketId: 't', messageId: 'm', reply: 'r' })).toBeNull()
    const bad = fakeSupabase(() => ({ data: null, error: { code: 'XX' } }))
    await expect(
      supabaseResidentNotifyStore(bad.client).loadContext({ kind: 'ticket_reply', ticketId: 't', messageId: 'm', reply: 'r' }),
    ).rejects.toThrow()
  })

  it('loadPhone: the current ownership first, then an active tenancy', async () => {
    const owner = fakeSupabase((q) => (q.table === 'ownerships' ? { data: [{ owner_phone: '+1 404 555 1234' }], error: null } : undefined))
    expect(await supabaseResidentNotifyStore(owner.client).loadPhone('u-1', 'unit-1')).toBe('+1 404 555 1234')
    expect(hasEq(owner.queries[0], 'owner_user_id', 'u-1')).toBe(true)

    const tenant = fakeSupabase((q) =>
      q.table === 'ownerships' ? { data: [], error: null } : q.table === 'tenancies' ? { data: [{ tenant_phone: '555' }], error: null } : undefined,
    )
    expect(await supabaseResidentNotifyStore(tenant.client).loadPhone('u-1', null)).toBe('555')

    const neither = fakeSupabase(() => ({ data: [], error: null }))
    expect(await supabaseResidentNotifyStore(neither.client).loadPhone('u-1', null)).toBeNull()
  })
})
