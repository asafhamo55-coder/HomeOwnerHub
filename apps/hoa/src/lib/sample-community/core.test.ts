import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { memorySupabase, type Row } from '@/lib/test-utils/memory-supabase'

// Every sender the app has. The sample community must never reach any of them.
const senders = vi.hoisted(() => ({
  email: vi.fn(),
  sms: vi.fn(),
  push: vi.fn(),
  guard: vi.fn(),
  inngest: vi.fn(),
}))
vi.mock('@/lib/email', () => ({ sendEmail: senders.email, sendTransactionalEmail: senders.email }))
vi.mock('@/lib/sms', () => ({ sendSms: senders.sms }))
vi.mock('@/lib/push-subscriptions', () => ({ sendPush: senders.push }))
vi.mock('@homeowner-portal/observability/outbound-guard', () => ({
  guardOutbound: senders.guard,
  OUTBOUND_BLOCKED_ERROR: 'blocked',
}))
vi.mock('inngest', () => ({ Inngest: vi.fn(() => ({ send: senders.inngest })) }))

import { fillSampleCommunity, loadSampleState, removeSampleCommunity } from './core'
import { SAMPLE_BANNER_TEXT, SAMPLE_HOME_COUNT, isSampleHome, sampleHomes } from './data'
import { draftStateFromRow } from '@/lib/communications/drafts'

vi.spyOn(console, 'error').mockImplementation(() => {})

const ORG = 'org-1'
const OTHER = 'org-2'
const ASSOC = 'assoc-1'
const USER = 'user-1'
const TODAY = '2026-10-31'
const ctx = { orgId: ORG, userId: USER, today: TODAY }
const db = (m: ReturnType<typeof memorySupabase>) => m.client as never

function seed(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    associations: [{ id: ASSOC, organization_id: ORG, name: 'Test HOA' }],
    fiscal_periods: [
      { id: 'fp-1', organization_id: ORG, association_id: ASSOC, status: 'open', start_date: '2026-01-01', end_date: '2026-12-31' },
    ],
    ...extra,
  }
}

beforeEach(() => {
  for (const s of Object.values(senders)) s.mockClear()
})

describe('sample data content', () => {
  it('has 12 homes on 2 streets, all on the reserved example.com domain', () => {
    const homes = sampleHomes()
    expect(homes).toHaveLength(SAMPLE_HOME_COUNT)
    expect(new Set(homes.map((h) => h.address.split(' ').slice(1).join(' '))).size).toBe(2)
    for (const h of homes) expect(h.ownerEmail.endsWith('@example.com')).toBe(true)
  })

  it('the banner says what the owner asked for', () => {
    expect(SAMPLE_BANNER_TEXT).toBe(
      'You’re looking at sample data. Remove it when you’re ready to add your own homes.',
    )
  })

  it('uses no em dashes in anything a person reads', () => {
    const src = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.ts'), 'utf8')
    const strings = src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    expect(strings.join('\n')).not.toContain('—')
  })

  it('a home is a sample only when both markers match', () => {
    expect(isSampleHome({ notes: 'Sample data: x', owner_email: 'a@example.com' })).toBe(true)
    expect(isSampleHome({ notes: 'Sample data: x', owner_email: 'a@gmail.com' })).toBe(false)
    expect(isSampleHome({ notes: 'Corner lot', owner_email: 'a@example.com' })).toBe(false)
    expect(isSampleHome({ notes: null, owner_email: null })).toBe(false)
  })
})

describe('fillSampleCommunity', () => {
  it('fills the caller org with the full sample set', async () => {
    const m = memorySupabase(seed())
    const r = await fillSampleCommunity(db(m), ctx)
    expect(r).toEqual({ ok: true, homes: 12 })

    expect(m.rows('hoa_properties')).toHaveLength(12)
    expect(m.rows('units')).toHaveLength(12)
    expect(m.rows('ownerships')).toHaveLength(12)
    const assessments = m.rows('assessments')
    expect(assessments).toHaveLength(12)
    expect(assessments.filter((a) => a.status === 'paid').length).toBeGreaterThan(0)
    expect(assessments.filter((a) => a.status === 'open').length).toBeGreaterThan(0)
    expect(assessments.every((a) => (a.due_date as string) < TODAY)).toBe(true)
    const violations = m.rows('hoa_violations')
    expect(violations.map((v) => v.status).sort()).toEqual(['notice_sent', 'open', 'resolved'])
    expect(m.rows('tickets')).toHaveLength(2)
    expect(m.rows('ticket_messages').some((x) => x.author_role === 'resident')).toBe(true)
    expect(m.rows('arc_requests')).toHaveLength(2)
    expect(m.rows('dues_rates')).toHaveLength(1)

    const comms = m.rows('communications')
    expect(comms).toHaveLength(1)
    expect(comms[0]!.status).toBe('draft')
    expect(comms[0]!.sent_at ?? null).toBeNull()
    expect(draftStateFromRow(comms[0]!.audience_definition)).not.toBeNull()

    const meetings = m.rows('hoa_meeting_minutes')
    expect(meetings).toHaveLength(1)
    expect(meetings[0]!.status).toBe('draft')
    expect(String(meetings[0]!.ai_summary)).toContain('Agenda')
    expect((meetings[0]!.meeting_date as string) > TODAY).toBe(true)
  })

  it('writes only to the caller org', async () => {
    const m = memorySupabase(seed())
    await fillSampleCommunity(db(m), ctx)
    const tableOrg: Record<string, string> = {
      hoa_properties: 'org_id',
      units: 'organization_id',
      ownerships: 'organization_id',
      assessments: 'organization_id',
      hoa_violations: 'org_id',
      tickets: 'organization_id',
      arc_requests: 'organization_id',
      communications: 'organization_id',
      hoa_meeting_minutes: 'org_id',
      dues_rates: 'organization_id',
    }
    for (const [table, col] of Object.entries(tableOrg)) {
      const rows = m.rows(table)
      expect(rows.length, table).toBeGreaterThan(0)
      for (const r of rows) expect(r[col], `${table}.${col}`).toBe(ORG)
    }
    // Every write the code made carried the caller's org, none another's.
    const written = m.calls.filter((c) => c.op === 'insert').flatMap((c) => (Array.isArray(c.payload) ? c.payload : [c.payload]) as Row[])
    expect(written.some((r) => Object.values(r).includes(OTHER))).toBe(false)
  })

  it('gives sample residents no auth account and uses only example.com emails', async () => {
    const m = memorySupabase(seed())
    await fillSampleCommunity(db(m), ctx)
    expect(m.calls.some((c) => c.table === 'profiles' || c.table === 'org_members')).toBe(false)
    const emails = [
      ...m.rows('hoa_properties').map((r) => r.owner_email),
      ...m.rows('ownerships').map((r) => r.owner_email),
    ]
    expect(emails.length).toBeGreaterThan(0)
    for (const e of emails) expect(String(e).endsWith('@example.com')).toBe(true)
    expect(m.rows('ownerships').every((o) => o.owner_user_id === undefined || o.owner_user_id === null)).toBe(true)
  })

  it('calls no sender: no email, SMS, push, outbound guard or Inngest event', async () => {
    const m = memorySupabase(seed())
    await fillSampleCommunity(db(m), ctx)
    await removeSampleCommunity(db(m), ORG)
    for (const [name, fn] of Object.entries(senders)) expect(fn, name).not.toHaveBeenCalled()
    // No recipient rows exist for the draft, so nothing could deliver it.
    expect(m.calls.some((c) => c.table === 'communication_recipients')).toBe(false)
  })

  it('refuses once the org has a real home, and writes nothing', async () => {
    const m = memorySupabase(
      seed({ hoa_properties: [{ id: 'real-1', org_id: ORG, address: '9 Real St', notes: null, owner_email: 'jo@gmail.com', deleted_at: null }] }),
    )
    const r = await fillSampleCommunity(db(m), ctx)
    expect(r.ok).toBe(false)
    expect(m.calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('refuses when the org only has a real unit (an imported home)', async () => {
    const m = memorySupabase(seed({ units: [{ id: 'u-real', organization_id: ORG, legacy_hoa_property_id: null }] }))
    const r = await fillSampleCommunity(db(m), ctx)
    expect(r.ok).toBe(false)
  })

  it('refuses a second fill', async () => {
    const m = memorySupabase(seed())
    expect((await fillSampleCommunity(db(m), ctx)).ok).toBe(true)
    const again = await fillSampleCommunity(db(m), ctx)
    expect(again.ok).toBe(false)
    expect(m.rows('hoa_properties')).toHaveLength(12)
  })

  it('a real home in another org does not block the fill', async () => {
    const m = memorySupabase(
      seed({ hoa_properties: [{ id: 'other-1', org_id: OTHER, address: '1 Other St', notes: null, owner_email: null, deleted_at: null }] }),
    )
    expect((await fillSampleCommunity(db(m), ctx)).ok).toBe(true)
  })

  it('asks for the association first when there is none', async () => {
    const m = memorySupabase({})
    const r = await fillSampleCommunity(db(m), ctx)
    expect(r.ok).toBe(false)
    expect(m.calls.some((c) => c.op === 'insert')).toBe(false)
  })

  it('takes back everything if a step fails part-way', async () => {
    const m = memorySupabase(seed(), {
      failOn: (c) => (c.table === 'arc_requests' && c.op === 'insert' ? { code: 'XX000', message: 'boom' } : null),
    })
    const r = await fillSampleCommunity(db(m), ctx)
    expect(r.ok).toBe(false)
    for (const t of ['hoa_properties', 'units', 'ownerships', 'assessments', 'hoa_violations', 'tickets', 'ticket_messages', 'dues_rates']) {
      expect(m.rows(t), t).toHaveLength(0)
    }
  })
})

describe('removeSampleCommunity', () => {
  const real = {
    hoa_properties: [
      // Another org's data that LOOKS like sample data: must survive.
      { id: 'p-other', org_id: OTHER, address: '5 Other Rd', notes: 'Sample data: x', owner_email: 'o@example.com', deleted_at: null },
      // This org's real home, no markers.
      { id: 'p-real', org_id: ORG, address: '7 Real Rd', notes: 'Corner lot', owner_email: 'real@gmail.com', deleted_at: null },
      // Real home that happens to use example.com but has no sample note.
      { id: 'p-real2', org_id: ORG, address: '8 Real Rd', notes: null, owner_email: 'x@example.com', deleted_at: null },
    ],
    units: [
      { id: 'u-real', organization_id: ORG, legacy_hoa_property_id: 'p-real' },
      { id: 'u-other', organization_id: OTHER, legacy_hoa_property_id: 'p-other' },
    ],
    tickets: [
      { id: 't-real', organization_id: ORG, unit_id: 'u-real', subject: 'Gate is stuck' },
      { id: 't-other', organization_id: OTHER, unit_id: 'u-other', subject: 'Sample: look' },
    ],
    assessments: [{ id: 'a-real', organization_id: ORG, unit_id: 'u-real', memo_code: 'MP-1-DUES', status: 'open' }],
    hoa_violations: [{ id: 'v-real', org_id: ORG, property_id: 'p-real', description: 'Fence is down' }],
    arc_requests: [{ id: 'r-real', organization_id: ORG, unit_id: 'u-real', summary: 'New mailbox' }],
    communications: [
      { id: 'c-real', organization_id: ORG, status: 'draft', subject: 'Pool hours', deleted_at: null },
      { id: 'c-sent', organization_id: ORG, status: 'sent', subject: '[Sample] was sent somehow', deleted_at: null },
    ],
    hoa_meeting_minutes: [
      { id: 'mt-real', org_id: ORG, status: 'draft', raw_transcript: null, deleted_at: null },
      { id: 'mt-other', org_id: OTHER, status: 'draft', raw_transcript: 'Sample data: other org', deleted_at: null },
    ],
    dues_rates: [{ id: 'dr-real', organization_id: ORG, notes: 'Board vote, March' }],
  }

  it('deletes every sample row and nothing else', async () => {
    const m = memorySupabase(seed(real))
    // Filling would be refused (real homes exist), so build the sample set in an empty org first.
    const empty = memorySupabase(seed())
    await fillSampleCommunity(db(empty), ctx)
    // Merge: real rows + the sample rows into one fake.
    const merged: Record<string, Row[]> = {}
    for (const t of [
      'hoa_properties', 'units', 'ownerships', 'assessments', 'hoa_violations', 'tickets', 'ticket_messages',
      'arc_requests', 'communications', 'hoa_meeting_minutes', 'dues_rates',
    ]) {
      merged[t] = [...(real as Record<string, Row[]>)[t] ?? [], ...empty.rows(t)]
    }
    const combined = memorySupabase({ ...seed(), ...merged })
    void m

    const before = (t: string) => combined.rows(t).length
    const r = await removeSampleCommunity(db(combined), ORG)
    expect(r).toEqual({ ok: true, removedHomes: 12 })

    // Sample rows are gone.
    expect(before('units')).toBe(2)
    expect(combined.rows('ownerships')).toHaveLength(0)
    expect(combined.rows('ticket_messages')).toHaveLength(0)
    expect(combined.rows('hoa_violations').map((v) => v.id)).toEqual(['v-real'])
    expect(combined.rows('arc_requests').map((v) => v.id)).toEqual(['r-real'])
    expect(combined.rows('assessments').map((v) => v.id)).toEqual(['a-real'])
    expect(combined.rows('tickets').map((v) => v.id).sort()).toEqual(['t-other', 't-real'])
    expect(combined.rows('dues_rates').map((v) => v.id)).toEqual(['dr-real'])
    expect(combined.rows('hoa_properties').map((v) => v.id).sort()).toEqual(['p-other', 'p-real', 'p-real2'])
    expect(combined.rows('units').map((v) => v.id).sort()).toEqual(['u-other', 'u-real'])

    // Draft and meeting are soft-deleted; real and other-org ones are untouched.
    const live = (t: string) => combined.rows(t).filter((x) => x.deleted_at === null).map((x) => x.id).sort()
    expect(live('communications')).toEqual(['c-real', 'c-sent'])
    expect(live('hoa_meeting_minutes')).toEqual(['mt-other', 'mt-real'])
  })

  it('leaves a sample home alone once its markers are edited away (the board adopted it)', async () => {
    const m = memorySupabase(seed())
    await fillSampleCommunity(db(m), ctx)
    const adopted = m.rows('hoa_properties')[0]!
    const live = memorySupabase({
      ...seed(),
      hoa_properties: m.rows('hoa_properties').map((p) => (p.id === adopted.id ? { ...p, notes: 'Our real clubhouse' } : p)),
      units: m.rows('units'),
    })
    const r = await removeSampleCommunity(db(live), ORG)
    expect(r).toEqual({ ok: true, removedHomes: 11 })
    expect(live.rows('hoa_properties').map((p) => p.id)).toEqual([adopted.id])
  })

  it('sample state: reports sample homes and real homes separately', async () => {
    const m = memorySupabase(seed())
    await fillSampleCommunity(db(m), ctx)
    expect(await loadSampleState(db(m), ORG)).toEqual({ sampleHomes: 12, realHomes: 0 })
    await removeSampleCommunity(db(m), ORG)
    expect(await loadSampleState(db(m), ORG)).toEqual({ sampleHomes: 0, realHomes: 0 })
  })

  it('reports a failed delete instead of claiming success', async () => {
    const m = memorySupabase(seed())
    await fillSampleCommunity(db(m), ctx)
    const failing = memorySupabase(
      { ...seed(), hoa_properties: m.rows('hoa_properties'), units: m.rows('units') },
      { failOn: (c) => (c.table === 'units' && c.op === 'delete' ? { code: '23503', message: 'fk' } : null) },
    )
    const r = await removeSampleCommunity(db(failing), ORG)
    expect(r.ok).toBe(false)
  })
})

describe('core source', () => {
  it('imports no sender, so it cannot send', () => {
    const dir = path.dirname(fileURLToPath(import.meta.url))
    for (const f of ['core.ts', 'data.ts', 'actions.ts']) {
      const src = readFileSync(path.join(dir, f), 'utf8')
      const imports = [...src.matchAll(/from\s+'([^']+)'/g)].map((x) => x[1]!)
      for (const i of imports) {
        expect(i, `${f} imports ${i}`).not.toMatch(/email|sms|push|inngest|outbound-guard|resident-notify|deliver|send|notifications|twilio|resend/i)
      }
    }
  })
})
