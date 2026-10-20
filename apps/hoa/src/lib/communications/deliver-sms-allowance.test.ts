import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-104 §4: the SMS allowance hook in deliverToRecipients. Over the
// allowance a recipient's text is not sent and the row says why; their
// email and portal rows still go. Mocked senders; no real email or SMS.

const h = vi.hoisted(() => ({
  sms: [] as unknown[],
  emails: [] as unknown[],
  updates: [] as Array<{ id: string; patch: Record<string, unknown> }>,
  gate: null as null | { take: () => boolean },
  gateCalls: 0,
}))

vi.mock('@homeowner-portal/observability/outbound-guard', () => ({ fetchOrgSandbox: async () => false }))
vi.mock('@/lib/email', () => ({
  sendEmailBatch: async (payloads: unknown[]) => {
    h.emails.push(...payloads)
    return payloads.map((_, i) => ({ ok: true, messageId: `m-${i}` }))
  },
}))
vi.mock('@/lib/sms', async (orig) => ({
  ...(await orig<typeof import('@/lib/sms')>()),
  sendSms: async (input: unknown) => {
    h.sms.push(input)
    return { ok: true, messageSid: 'sid' }
  },
}))
vi.mock('@/lib/sms-allowance', () => ({
  smsAllowanceGate: async () => {
    h.gateCalls += 1
    return h.gate
  },
}))

const { deliverToRecipients } = await import('./deliver')
const { SMS_ALLOWANCE_REACHED_MESSAGE } = await import('@homeowner-portal/billing')

function db() {
  return {
    from: () => {
      let patch: Record<string, unknown> = {}
      const chain = {
        update: (p: Record<string, unknown>) => ((patch = p), chain),
        eq: (_c: string, id: string) => {
          h.updates.push({ id, patch })
          return chain
        },
        then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r),
      }
      return chain
    },
  }
}

const base = {
  communicationId: 'comm-1',
  organizationId: 'org-1',
  associationName: 'Maple Court',
  associationType: 'hoa',
  subject: 'Pool closed',
  bodyHtml: '<p>The pool is closed Saturday.</p>',
  extraFields: {},
}
const row = (id: string, channel: string) => ({
  id,
  channel,
  email: channel === 'email' ? `${id}@x.test` : null,
  phone: channel === 'sms' ? '+14045550100' : null,
  recipient_name: null,
  unit_id: null,
})

beforeEach(() => {
  h.sms = []
  h.emails = []
  h.updates = []
  h.gate = null
  h.gateCalls = 0
})

describe('deliverToRecipients — SMS allowance', () => {
  it('no allowance (flag off / not a new-plan org): texts go as before', async () => {
    const counts = await deliverToRecipients(db() as never, { ...base, recipients: [row('s1', 'sms'), row('s2', 'sms')] })
    expect(counts.sentCount).toBe(2)
    expect(h.sms).toHaveLength(2)
  })

  it('does not read the allowance for a send with no texts', async () => {
    await deliverToRecipients(db() as never, { ...base, recipients: [row('e1', 'email')] })
    expect(h.gateCalls).toBe(0)
  })

  it('over the allowance: texts held back with the board message; email and portal still go', async () => {
    let left = 1
    h.gate = { take: () => left-- > 0 }
    const counts = await deliverToRecipients(db() as never, {
      ...base,
      recipients: [row('s1', 'sms'), row('s2', 'sms'), row('e1', 'email'), row('p1', 'portal')],
    })
    expect(h.sms).toHaveLength(1)
    expect(h.emails).toHaveLength(1)
    expect(counts).toMatchObject({ sentCount: 3, skippedCount: 1 })
    const blocked = h.updates.find((u) => u.patch.error_message === SMS_ALLOWANCE_REACHED_MESSAGE)
    expect(blocked).toBeDefined()
    expect(blocked!.patch.delivery_status).toBe('failed')
    expect(h.updates.find((u) => u.id === 'p1')!.patch.delivery_status).toBe('sent')
  })
})
