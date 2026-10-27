import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOARD_ONLY_DENIED } from '@/lib/accounting/guard'
import { NUDGE_SETTINGS_KEY, readDismissedKeys } from './dismiss'

// The send path under test is sendCommunication, mocked: it is where consent,
// opt-outs and the outbound guard live (communications/send.test.ts covers
// them). What this file proves is that sendAnnouncement hands ALL delivery to
// it, only on an explicit confirmed send, and builds the payload the board
// reviewed.

const UNIT_A = '11111111-1111-4111-8111-111111111111'
const UNIT_B = '22222222-2222-4222-8222-222222222222'
const OUTSIDER = '33333333-3333-4333-8333-333333333333'

const h = vi.hoisted(() => ({
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  sms: true,
  sendCommunication: vi.fn(),
  sendSms: vi.fn(),
  sendEmailBatch: vi.fn(),
  settings: {} as Record<string, unknown>,
  updates: [] as Array<Record<string, unknown>>,
  updateError: false,
}))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/vendors', () => ({
  getPrimaryAssociation: vi.fn(async () => ({ id: 'assoc-1', name: 'Lakeside HOA' })),
}))
vi.mock('@/lib/pay-by-zelle', () => ({ paySettingsSecret: () => 'test-secret' }))
vi.mock('@/lib/sms', () => ({ smsConfigured: () => h.sms, sendSms: h.sendSms }))
vi.mock('@/lib/email', () => ({ sendEmailBatch: h.sendEmailBatch }))
vi.mock('@/lib/communications/send', () => ({ sendCommunication: h.sendCommunication }))
vi.mock('@/lib/communications/streets', () => ({
  loadStreetOptions: vi.fn(async () => [
    { key: 'elm st', label: 'Elm St', unitIds: [UNIT_A, UNIT_B], ownerCount: 2, homes: [] },
  ]),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { compliance_settings: h.settings }, error: null }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: () => ({
          select: async () => {
            if (h.updateError) return { data: null, error: { code: '42501' } }
            h.updates.push(patch)
            h.settings = patch.compliance_settings as Record<string, unknown>
            return { data: [{ id: 'assoc-1' }], error: null }
          },
        }),
      }),
    }),
  })),
}))

import { dismissAnnouncementNudge, sendAnnouncement, type SendAnnouncementInput } from './actions'

const OK = {
  ok: true as const,
  communicationId: 'comm-1',
  recipientCount: 40,
  sentCount: 40,
  failedCount: 0,
  skippedCount: 0,
  heldCount: 0,
}

const BASE: SendAnnouncementInput = {
  occasionId: 'halloween-party',
  subject: 'Halloween party, Oct 31',
  bodyText: 'Hello neighbors! Join us for our Halloween party.\n\nWarmly,\nLakeside HOA Board',
  audience: { mode: 'all' },
  includeText: false,
  confirmed: true,
}

beforeEach(() => {
  h.role = 'board'
  h.sms = true
  h.settings = { pay_by_zelle: { sig: 'keep-me' } }
  h.updates = []
  h.updateError = false
  h.sendCommunication.mockReset().mockResolvedValue(OK)
  h.sendSms.mockReset()
  h.sendEmailBatch.mockReset()
})

describe('sendAnnouncement', () => {
  it('refuses a resident before building anything', async () => {
    h.role = 'resident'
    expect(await sendAnnouncement(BASE)).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
    expect(h.sendCommunication).not.toHaveBeenCalled()
  })

  it('never sends without the explicit confirmed flag', async () => {
    const { confirmed: _c, ...unconfirmed } = BASE
    const res = await sendAnnouncement(unconfirmed as never)
    expect(res.ok).toBe(false)
    expect(await sendAnnouncement({ ...BASE, confirmed: false } as never)).toMatchObject({ ok: false })
    expect(h.sendCommunication).not.toHaveBeenCalled()
  })

  it('hands delivery to sendCommunication only: never texts or emails by itself', async () => {
    const res = await sendAnnouncement({ ...BASE, includeText: true })
    expect(res).toEqual(OK)
    expect(h.sendCommunication).toHaveBeenCalledTimes(1)
    expect(h.sendSms).not.toHaveBeenCalled()
    expect(h.sendEmailBatch).not.toHaveBeenCalled()
  })

  it('sends email and portal to everyone, in the right category, with HTML and a plain-text part', async () => {
    await sendAnnouncement(BASE)
    const sent = h.sendCommunication.mock.calls[0]![0]
    expect(sent.category).toBe('community')
    expect(sent.channels).toEqual(['email', 'portal'])
    expect(sent.audience).toEqual({ kind: 'everyone' })
    expect(sent.subject).toBe('Halloween party, Oct 31')
    expect(sent.bodyHtml).toContain('<p>Hello neighbors! Join us for our Halloween party.</p>')
    expect(sent.bodyText).toContain('Hello neighbors! Join us for our Halloween party.')
    expect(sent.scheduledFor).toBeUndefined()
    expect(sent.spanish).toBeUndefined()
  })

  it('adds the text channel only when asked and texting is set up', async () => {
    await sendAnnouncement({ ...BASE, includeText: true })
    expect(h.sendCommunication.mock.calls[0]![0].channels).toEqual(['email', 'portal', 'sms'])
    h.sms = false
    await sendAnnouncement({ ...BASE, includeText: true })
    expect(h.sendCommunication.mock.calls[1]![0].channels).toEqual(['email', 'portal'])
  })

  it('files severe weather as an emergency', async () => {
    await sendAnnouncement({ ...BASE, occasionId: 'severe-weather' })
    expect(h.sendCommunication.mock.calls[0]![0].category).toBe('emergency')
    await sendAnnouncement({ ...BASE, occasionId: 'custom' })
    expect(h.sendCommunication.mock.calls[1]![0].category).toBe('announcement')
  })

  it('builds a street audience from the server roster, never from the browser', async () => {
    await sendAnnouncement({
      ...BASE,
      audience: { mode: 'street', streetKey: 'elm st', ownersOnly: true, excludeUnitIds: [UNIT_B, OUTSIDER] },
    })
    expect(h.sendCommunication.mock.calls[0]![0].audience).toEqual({
      kind: 'specific_units',
      unitIds: [UNIT_A, UNIT_B],
      street: 'Elm St',
      ownersOnly: true,
      excludeUnitIds: [UNIT_B],
    })
    const missing = await sendAnnouncement({ ...BASE, audience: { mode: 'street', streetKey: 'nowhere' } })
    expect(missing).toMatchObject({ ok: false })
    expect(h.sendCommunication).toHaveBeenCalledTimes(1)
  })

  it('schedules for a valid instant and refuses a bad one', async () => {
    const at = new Date(Date.now() + 86_400_000).toISOString()
    await sendAnnouncement({ ...BASE, scheduledFor: at })
    expect(h.sendCommunication.mock.calls[0]![0].scheduledFor).toBe(at)
    expect(await sendAnnouncement({ ...BASE, scheduledFor: 'tomorrow-ish' })).toMatchObject({ ok: false })
    expect(h.sendCommunication).toHaveBeenCalledTimes(1)
  })

  it('passes the reviewed Spanish version along, and strips merge-field braces', async () => {
    await sendAnnouncement({
      ...BASE,
      bodyText: 'Hello {{ owner_phone }} neighbors, party time.',
      spanish: { subject: 'Fiesta', bodyText: '¡Hola vecinos! Los esperamos.', reviewed: true },
    })
    const sent = h.sendCommunication.mock.calls[0]![0]
    expect(sent.bodyHtml).not.toContain('{{')
    expect(sent.spanish).toEqual({ subject: 'Fiesta', bodyHtml: '<p>¡Hola vecinos! Los esperamos.</p>', reviewed: true })
  })

  it('returns the send path’s own refusal untouched (consent, guard, zero recipients)', async () => {
    h.sendCommunication.mockResolvedValue({ ok: false, error: 'Audience resolved to zero recipients (All homes).' })
    expect(await sendAnnouncement(BASE)).toEqual({ ok: false, error: 'Audience resolved to zero recipients (All homes).' })
  })

  it('rejects an empty subject or a body that is too short', async () => {
    expect(await sendAnnouncement({ ...BASE, subject: '   ' })).toMatchObject({ ok: false })
    expect(await sendAnnouncement({ ...BASE, bodyText: 'Hi' })).toMatchObject({ ok: false })
    expect(h.sendCommunication).not.toHaveBeenCalled()
  })
})

describe('dismissAnnouncementNudge', () => {
  it('refuses a resident and writes nothing', async () => {
    h.role = 'resident'
    expect(await dismissAnnouncementNudge('halloween-party:2026')).toEqual({ ok: false, error: BOARD_ONLY_DENIED })
    expect(h.updates).toHaveLength(0)
  })

  it('refuses a key that is not an occasion', async () => {
    expect(await dismissAnnouncementNudge('yard-sale:2026')).toMatchObject({ ok: false })
    expect(await dismissAnnouncementNudge('../etc:2026')).toMatchObject({ ok: false })
    expect(h.updates).toHaveLength(0)
  })

  it('stores a signed dismissal and keeps the other settings', async () => {
    expect(await dismissAnnouncementNudge('halloween-party:2026')).toEqual({ ok: true })
    const saved = h.updates[0]!.compliance_settings as Record<string, unknown>
    expect(saved.pay_by_zelle).toEqual({ sig: 'keep-me' })
    expect(saved[NUDGE_SETTINGS_KEY]).toBeDefined()
    expect([...readDismissedKeys('assoc-1', saved, 'test-secret')]).toEqual(['halloween-party:2026'])
  })

  it('logs a code only when the save fails', async () => {
    h.updateError = true
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await dismissAnnouncementNudge('halloween-party:2026')
    expect(res).toMatchObject({ ok: false })
    expect(JSON.stringify(spy.mock.calls)).toContain('42501')
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Halloween')
    spy.mockRestore()
  })
})
