import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-102 A7: previewForSample sends nothing; sendTestToMe emails only the
// signed-in board member, through the guarded sendEmailBatch. Synthetic data.

const h = vi.hoisted(() => ({
  gate: { ok: true } as { ok: boolean; error?: string },
  user: { id: 'user-1', email: 'board@example.test' } as { id: string; email: string | null } | null,
  recipients: [] as Array<Record<string, unknown>>,
  batch: [] as unknown[][],
  sandbox: false,
}))

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'denied',
  requireBoardOrAdminForAction: async () => h.gate,
}))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1', name: 'Lakeside HOA' }) }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => {
    const b: Record<string, unknown> = {}
    for (const op of ['from', 'select', 'eq']) b[op] = () => b
    b.single = async () => ({ data: { name: 'Lakeside HOA', type: 'hoa', organization_id: 'org-1' }, error: null })
    b.maybeSingle = async () => ({ data: { full_name: 'Bo Board' }, error: null })
    b.auth = { getUser: async () => ({ data: { user: h.user } }) }
    return b
  },
}))
vi.mock('@homeowner-portal/observability/outbound-guard', () => ({
  fetchOrgSandbox: async () => h.sandbox,
}))
vi.mock('@/lib/email', () => ({
  sendEmailBatch: async (payloads: unknown[], opts: unknown) => {
    h.batch.push([payloads, opts])
    return payloads.map(() => ({ ok: true, messageId: 'm1' }))
  },
}))
vi.mock('./audience', () => ({
  resolveAudience: async () => ({ summary: 'x', recipients: h.recipients }),
}))

const { previewForSample, sendTestToMe } = await import('./preview-actions')

const MESSAGE = {
  subject: 'Pool closing {{ close_date }}',
  bodyHtml: '<p>Hi {{ recipient_name }}, the pool closes {{ close_date }}.</p>',
}

beforeEach(() => {
  h.gate = { ok: true }
  h.user = { id: 'user-1', email: 'board@example.test' }
  h.recipients = [
    { unitId: 'u1', email: null, phone: '+15555550100', recipientName: 'Tex Only', userId: null, unitAddress: null, unitNumber: null },
    { unitId: 'u2', email: 'res@example.test', phone: null, recipientName: 'Rae Resident', userId: null, unitAddress: null, unitNumber: null },
  ]
  h.batch = []
  h.sandbox = false
})

describe('previewForSample', () => {
  it('is board-only', async () => {
    h.gate = { ok: false, error: 'denied' }
    expect(await previewForSample({ audience: { kind: 'everyone' }, ...MESSAGE })).toEqual({ ok: false, error: 'denied' })
  })

  it('renders for the first recipient with an email and sends nothing', async () => {
    const r = await previewForSample({ audience: { kind: 'everyone' }, ...MESSAGE, extraFields: { close_date: 'Sept 30' } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.sampleName).toBe('Rae Resident')
    expect(r.synthetic).toBe(false)
    expect(r.email.subject).toBe('Pool closing Sept 30')
    expect(r.email.html).toContain('Hi Rae Resident')
    expect(r.blanks).toEqual([])
    expect(h.batch).toEqual([])
  })

  it('uses a sample resident when nobody matches, and flags blanks', async () => {
    h.recipients = []
    const r = await previewForSample({ audience: { kind: 'everyone' }, ...MESSAGE })
    expect(r.ok && r.synthetic).toBe(true)
    expect(r.ok && r.blanks).toEqual(['close date'])
  })

  it('refuses an audience kind the composer never sends', async () => {
    const r = await previewForSample({ audience: { kind: 'precomputed' as never }, ...MESSAGE })
    expect(r.ok).toBe(false)
  })
})

describe('sendTestToMe', () => {
  it('emails only the signed-in board member, through the guarded batch', async () => {
    h.sandbox = true
    const r = await sendTestToMe({ ...MESSAGE, extraFields: { close_date: 'Sept 30' } })
    expect(r).toEqual({ ok: true, sentTo: 'board@example.test' })
    expect(h.batch).toHaveLength(1)
    const [payloads, opts] = h.batch[0] as [Array<Record<string, unknown>>, Record<string, unknown>]
    expect(payloads).toHaveLength(1)
    expect(payloads[0].to).toBe('board@example.test')
    expect(payloads[0].subject).toBe('[Test] Pool closing Sept 30')
    expect(payloads[0].html).toContain('Hi Bo Board')
    // No recipient row exists, so no reply-threading id.
    expect(payloads[0]).not.toHaveProperty('recipientRef')
    expect(opts).toMatchObject({ orgSandbox: true })
  })

  it('never takes an address from the browser', async () => {
    await sendTestToMe({ ...MESSAGE, to: 'someone-else@example.test' } as never)
    expect((h.batch[0][0] as Array<{ to: string }>)[0].to).toBe('board@example.test')
  })

  it('is board-only and needs an email on the account', async () => {
    h.gate = { ok: false, error: 'denied' }
    expect(await sendTestToMe(MESSAGE)).toEqual({ ok: false, error: 'denied' })
    h.gate = { ok: true }
    h.user = { id: 'user-1', email: null }
    expect((await sendTestToMe(MESSAGE)).ok).toBe(false)
    expect(h.batch).toEqual([])
  })
})
