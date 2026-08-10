import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ReminderPacket } from './types'
import type { SendCommunicationInput, SendCommunicationResult } from '@/lib/communications/send'

const {
  mockGetOrg, mockGetRole, mockGetAssoc, mockBuild, mockLastReminded, mockSend, mockRevalidate,
} = vi.hoisted(() => ({
  mockGetOrg: vi.fn(async () => ({ id: 'org-1', name: 'Madison Park' })),
  mockGetRole: vi.fn(async () => 'admin' as string | null),
  mockGetAssoc: vi.fn(async () => ({ id: 'assoc-1', name: 'Madison Park' })),
  mockBuild: vi.fn(),
  mockLastReminded: vi.fn(async () => new Map<string, string>()),
  // The mock's parameter and return types are declared explicitly rather
  // than left to inference — vi.fn(async () => …) infers a zero-argument
  // signature, which would make `mockSend.mock.calls[0][0]` type as
  // `never` below, and an inferred return type would reject the
  // `{ ok: false, error }` shape used later via mockResolvedValue.
  mockSend: vi.fn(
    async (_input: SendCommunicationInput): Promise<SendCommunicationResult> => ({
      ok: true, communicationId: 'comm-1', recipientCount: 1,
      sentCount: 1, failedCount: 0, skippedCount: 0,
    }),
  ),
  mockRevalidate: vi.fn(),
}))

vi.mock('@/lib/orgs', () => ({ getCurrentOrg: mockGetOrg }))
vi.mock('@/lib/auth', () => ({ getCurrentUserRoleInOrg: mockGetRole }))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: mockGetAssoc }))
vi.mock('./packets', () => ({ buildReminderPackets: mockBuild }))
vi.mock('./queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./queries')>()),
  getLastRemindedByEmail: mockLastReminded,
}))
vi.mock('@/lib/communications/send', () => ({ sendCommunication: mockSend }))
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidate }))

import { previewDuesReminders, sendDuesReminders } from './actions'

const PACKET: ReminderPacket = {
  email: 'dana@example.com',
  ownerName: 'Dana',
  userId: 'user-1',
  properties: [
    {
      unitId: 'unit-a',
      label: '14 Oak St',
      subtotal: 310,
      charges: [{
        id: 'a1', assessmentType: 'regular', dueDate: '2026-07-01',
        amount: 310, paid: 0, balance: 310, pastDue: true, daysLate: 39,
      }],
    },
  ],
  totalDue: 310,
  pastDueTotal: 310,
  oldestDaysLate: 39,
  chargeCount: 1,
}

const CURRENT: ReminderPacket = {
  ...PACKET,
  email: 'sam@example.com',
  ownerName: 'Sam',
  pastDueTotal: 0,
  properties: [{
    ...PACKET.properties[0],
    charges: [{ ...PACKET.properties[0].charges[0], pastDue: false, daysLate: 0 }],
  }],
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetOrg.mockResolvedValue({ id: 'org-1', name: 'Madison Park' })
  mockGetRole.mockResolvedValue('admin')
  mockGetAssoc.mockResolvedValue({ id: 'assoc-1', name: 'Madison Park' })
  mockBuild.mockResolvedValue({ packets: [PACKET, CURRENT], skipped: [] })
  mockLastReminded.mockResolvedValue(new Map())
  mockSend.mockResolvedValue({
    ok: true, communicationId: 'comm-1', recipientCount: 1,
    sentCount: 1, failedCount: 0, skippedCount: 0,
  })
  process.env.RESEND_API_KEY = 'test-key'
  process.env.EMAIL_FROM = 'HOA <hoa@test.com>'
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.test'
})

describe('previewDuesReminders authorization', () => {
  it('refuses a caller whose role is resident', async () => {
    mockGetRole.mockResolvedValue('resident')

    const result = await previewDuesReminders()

    expect(result).toEqual({
      ok: false,
      error: "You don't have permission to perform this action.",
    })
  })

  it('refuses before building any packets', async () => {
    mockGetRole.mockResolvedValue('resident')

    await previewDuesReminders()

    expect(mockBuild).not.toHaveBeenCalled()
  })
})

describe('previewDuesReminders', () => {
  it('includes only past-due owners when no explicit emails are given', async () => {
    const result = await previewDuesReminders()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.packets.map((p) => p.email)).toEqual(['dana@example.com'])
  })

  it('includes a named owner even when nothing of theirs is past due', async () => {
    const result = await previewDuesReminders({ emails: ['sam@example.com'] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.packets.map((p) => p.email)).toEqual(['sam@example.com'])
  })

  it('renders a real preview body for the first recipient', async () => {
    const result = await previewDuesReminders()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.previewHtml).toContain('Dana')
    expect(result.previewHtml).toContain('$310.00')
    expect(result.previewHtml).toContain('39 days late')
  })

  it('reports email delivery as unconfigured when the API key is absent', async () => {
    delete process.env.RESEND_API_KEY

    const result = await previewDuesReminders()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.emailConfigured).toBe(false)
  })

  it('flags owners reminded inside the recent window', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString()
    mockLastReminded.mockResolvedValue(new Map([['dana@example.com', twoDaysAgo]]))

    const result = await previewDuesReminders()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.packets[0].recentlyReminded).toBe(true)
    expect(result.recentlyRemindedCount).toBe(1)
  })

  it('leaves no merge placeholder unsubstituted — the preview is what gets sent', async () => {
    const result = await previewDuesReminders()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.previewHtml).toContain('Madison Park')
    expect(result.previewHtml).not.toMatch(/\{\{[a-z_]+\}\}/)
  })

  it('escapes the association name in the preview body', async () => {
    mockGetAssoc.mockResolvedValue({ id: 'assoc-1', name: '<b>Madison</b>' })

    const result = await previewDuesReminders()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.previewHtml).toContain('&lt;b&gt;Madison&lt;/b&gt;')
    expect(result.previewHtml).not.toContain('<b>Madison</b>')
  })

  it('renders the note, so the one hand-written part of the email is reviewable', async () => {
    const result = await previewDuesReminders({ note: 'Pool assessment included.' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.previewHtml).toContain('Pool assessment included.')
  })

  it('previews the note with merge syntax already neutralised, matching the send', async () => {
    const result = await previewDuesReminders({ note: 'your {{balance}} is due' })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.previewHtml).toContain('your {balance} is due')
  })

  it('selects nobody for an explicitly empty email list', async () => {
    // Not reachable from the UI, but a server action is directly
    // invocable: falling through to "everyone past due" would turn an
    // empty selection into a bulk mailout.
    const result = await previewDuesReminders({ emails: [] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.packets).toEqual([])
  })

  it('escapes an owner name containing markup in the preview body', async () => {
    mockBuild.mockResolvedValue({
      packets: [{ ...PACKET, ownerName: '<b>Dana</b>' }, CURRENT],
      skipped: [],
    })

    const result = await previewDuesReminders()

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.previewHtml).toContain('&lt;b&gt;Dana&lt;/b&gt;')
    expect(result.previewHtml).not.toContain('<b>Dana</b>')
  })
})

describe('sendDuesReminders', () => {
  it('refuses to send when email delivery is not configured', async () => {
    delete process.env.RESEND_API_KEY

    const result = await sendDuesReminders({ emails: ['dana@example.com'] })

    expect(result).toEqual({
      ok: false,
      error: 'Email delivery is not configured, so nothing would be sent.',
    })
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('refuses when no recipient matches the requested emails', async () => {
    const result = await sendDuesReminders({ emails: ['nobody@example.com'] })

    expect(result.ok).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sends one precomputed campaign carrying per-recipient merge fields', async () => {
    await sendDuesReminders({ emails: ['dana@example.com'] })

    expect(mockSend).toHaveBeenCalledTimes(1)
    const input = mockSend.mock.calls[0][0]
    expect(input.category).toBe('dues')
    expect(input.channels).toEqual(['email'])
    expect(input.audience.kind).toBe('precomputed')
    expect(input.audience.recipients).toHaveLength(1)
    expect(input.audience.recipients![0].email).toBe('dana@example.com')
    expect(input.relatedResource).toEqual({ type: 'dues_reminder', id: 'assoc-1' })
    expect(input.extraMergeFields!['dana@example.com'].dues_table).toContain('$310.00')
    expect(input.extraMergeFields!['dana@example.com'].amount_summary).toBe(
      '$310.00 due, $310.00 past due',
    )
  })

  it('carries every unit the owner is responsible for on the recipient', async () => {
    await sendDuesReminders({ emails: ['dana@example.com'] })

    const input = mockSend.mock.calls[0][0]
    expect(input.audience.recipients![0].unitIds).toEqual(['unit-a'])
    expect(input.audience.recipients![0].unitId).toBe('unit-a')
  })

  it('bakes an escaped manager note into the shared body', async () => {
    await sendDuesReminders({ emails: ['dana@example.com'], note: '<b>Pool</b> fee' })

    const input = mockSend.mock.calls[0][0]
    expect(input.bodyHtml).toContain('&lt;b&gt;Pool&lt;/b&gt; fee')
    expect(input.bodyHtml).not.toContain('<b>Pool</b>')
  })

  it('reports the counts the pipeline returned', async () => {
    mockSend.mockResolvedValue({
      ok: true, communicationId: 'comm-9', recipientCount: 2,
      sentCount: 2, failedCount: 0, skippedCount: 0,
    })

    const result = await sendDuesReminders({ emails: ['dana@example.com'] })

    expect(result).toEqual({ ok: true, communicationId: 'comm-9', sentCount: 2, failedCount: 0 })
  })

  it('surfaces a pipeline failure instead of claiming success', async () => {
    mockSend.mockResolvedValue({ ok: false, error: 'Resend rejected the sender' })

    const result = await sendDuesReminders({ emails: ['dana@example.com'] })

    expect(result).toEqual({ ok: false, error: 'Resend rejected the sender' })
  })

  it('escapes an owner name in the HTML merge field and provides it unescaped for text', async () => {
    mockBuild.mockResolvedValue({
      packets: [{ ...PACKET, ownerName: '<b>Dana</b>' }, CURRENT],
      skipped: [],
    })

    await sendDuesReminders({ emails: ['dana@example.com'] })

    const input = mockSend.mock.calls[0][0]
    expect(input.extraMergeFields!['dana@example.com'].owner_name).toBe('&lt;b&gt;Dana&lt;/b&gt;')
    expect(input.extraMergeFields!['dana@example.com'].owner_name_text).toBe('<b>Dana</b>')
  })

  it('escapes the association name for HTML and provides it unescaped for text', async () => {
    // renderTemplate injects merge values raw, so the association name gets
    // the same two-field treatment as the owner name: escaped for the HTML
    // body, raw for the plain-text body and the subject line. Supplying
    // both here overrides the pipeline's base bag for this campaign only.
    mockGetAssoc.mockResolvedValue({ id: 'assoc-1', name: 'Oak & <b>Vine</b>' })

    await sendDuesReminders({ emails: ['dana@example.com'] })

    const fields = mockSend.mock.calls[0][0].extraMergeFields!['dana@example.com']
    expect(fields.association_name).toBe('Oak &amp; &lt;b&gt;Vine&lt;/b&gt;')
    expect(fields.association_name_text).toBe('Oak & <b>Vine</b>')
  })

  it('sends to nobody when handed an explicitly empty email list', async () => {
    const result = await sendDuesReminders({ emails: [] })

    expect(result.ok).toBe(false)
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('neutralises merge syntax in the note so a manager cannot lose their own words', async () => {
    // The note is baked into bodyHtml, which the pipeline then runs
    // through renderTemplate — {{balance}} is not a field it knows, so it
    // would be replaced with nothing.
    await sendDuesReminders({ emails: ['dana@example.com'], note: 'your {{balance}} is due' })

    const input = mockSend.mock.calls[0][0]
    expect(input.bodyHtml).toContain('your {balance} is due')
    expect(input.bodyText).toContain('your {balance} is due')
    expect(input.bodyHtml).not.toContain('{{balance}}')
  })
})
