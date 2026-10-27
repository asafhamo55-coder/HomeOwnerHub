import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-025 per-resident language: the preference read, the payload/SMS
// choices it drives, and delivery wiring. Mocked senders; no real email/SMS.

const h = vi.hoisted(() => ({
  sms: [] as Array<{ to: string; body: string }>,
  emails: [] as Array<{ to: string; html: string }>,
  prefQueries: [] as string[][],
  prefRows: [] as Array<{ user_id: string; language: string; updated_at: string }>,
  prefError: false,
}))

vi.mock('@homeowner-portal/observability/outbound-guard', () => ({ fetchOrgSandbox: async () => false }))
vi.mock('@/lib/email', () => ({
  sendEmailBatch: async (payloads: Array<{ to: string; html: string }>) => {
    h.emails.push(...payloads)
    return payloads.map((_, i) => ({ ok: true, messageId: `m-${i}` }))
  },
}))
vi.mock('@/lib/sms', async (orig) => ({
  ...(await orig<typeof import('@/lib/sms')>()),
  sendSms: async (input: { to: string; body: string }) => {
    h.sms.push(input)
    return { ok: true, messageSid: 'sid' }
  },
}))
vi.mock('@/lib/sms-allowance', () => ({ smsAllowanceGate: async () => null }))

const { deliverToRecipients } = await import('./deliver')
const { loadLanguagePreferences } = await import('./recipient-language')
const { composeBilingualHtml } = await import('./bilingual')
const { renderSmsText } = await import('./sms-render')
const { buildEmailPayloads } = await import('./email-payloads')
const { SMS_MAX_CHARS } = await import('./sms-body')

function db() {
  return {
    from: (table: string) => {
      if (table === 'resident_communication_preferences') {
        const chain = {
          select: () => chain,
          in: (_c: string, ids: string[]) => {
            h.prefQueries.push(ids)
            return chain
          },
          order: () =>
            Promise.resolve(
              h.prefError
                ? { data: null, error: { code: 'x' } }
                : { data: h.prefRows.filter((r) => h.prefQueries.at(-1)!.includes(r.user_id)), error: null },
            ),
        }
        return chain
      }
      const chain = {
        update: () => chain,
        eq: () => chain,
        then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r),
      }
      return chain
    },
  }
}

const EN = '<p>The pool opens Saturday.</p>'
const ES = '<p>La piscina abre el sábado.</p>'
const BILINGUAL = composeBilingualHtml({ englishHtml: EN, spanishSubject: 'Piscina', spanishHtml: ES })
const link = 'https://www.homeownerledger.com/communications/abc'

beforeEach(() => {
  h.sms = []
  h.emails = []
  h.prefQueries = []
  h.prefRows = []
  h.prefError = false
})

describe('loadLanguagePreferences', () => {
  it('reads every user in one query (de-duplicated, nulls dropped)', async () => {
    h.prefRows = [
      { user_id: 'u1', language: 'es', updated_at: '2026-01-01' },
      { user_id: 'u2', language: 'en', updated_at: '2026-01-01' },
    ]
    const map = await loadLanguagePreferences(db() as never, ['u1', 'u2', 'u1', null, undefined])
    expect(h.prefQueries).toEqual([['u1', 'u2']])
    expect(map.get('u1')).toBe('es')
    expect(map.get('u2')).toBe('en')
  })

  it('chunks big audiences instead of one huge URL', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `u${i}`)
    await loadLanguagePreferences(db() as never, ids)
    expect(h.prefQueries.map((q) => q.length)).toEqual([100, 100, 50])
  })

  it('ignores unsupported codes and prefers the newest row', async () => {
    h.prefRows = [
      { user_id: 'u1', language: 'es', updated_at: '2026-01-01' },
      { user_id: 'u1', language: 'en', updated_at: '2026-02-01' },
      { user_id: 'u2', language: 'fr', updated_at: '2026-01-01' },
    ]
    const map = await loadLanguagePreferences(db() as never, ['u1', 'u2'])
    expect(map.get('u1')).toBe('en')
    expect(map.has('u2')).toBe(false)
  })

  it('a failed read falls back to nothing chosen', async () => {
    h.prefError = true
    expect((await loadLanguagePreferences(db() as never, ['u1'])).size).toBe(0)
  })

  it('makes no query without user ids', async () => {
    await loadLanguagePreferences(db() as never, [null])
    expect(h.prefQueries).toEqual([])
  })
})

describe('email payload language', () => {
  const rec = (id: string, language?: 'en' | 'es' | null) => ({
    id,
    email: `${id}@x.test`,
    recipient_name: null,
    unit_id: null,
    language,
  })
  it('sends the chosen language, or both when none is chosen', () => {
    const { payloads } = buildEmailPayloads({
      recipients: [rec('a', 'en'), rec('b', 'es'), rec('c', null), rec('d')],
      subject: 'Pool',
      bodyHtml: BILINGUAL,
      associationName: 'Maple',
    })
    const [en, es, none, absent] = payloads.map((p) => p.html ?? '')
    expect(en).toContain('The pool')
    expect(en).not.toContain('La piscina')
    expect(es.indexOf('La piscina')).toBeLessThan(es.indexOf('The pool'))
    expect(none).toBe(BILINGUAL)
    expect(absent).toBe(BILINGUAL)
  })

  it('a body with no translation is unchanged for any preference', () => {
    const { payloads } = buildEmailPayloads({
      recipients: [rec('a', 'es')],
      subject: 'Pool',
      bodyHtml: EN,
      associationName: 'Maple',
    })
    expect(payloads[0].html).toBe(EN)
  })
})

describe('renderSmsText language', () => {
  it('es sends Spanish only; en sends English only', () => {
    const es = renderSmsText({ subject: 'Pool', html: BILINGUAL, portalLink: link, language: 'es' })
    expect(es.body).toBe('Piscina: La piscina abre el sábado.')
    const en = renderSmsText({ subject: 'Pool', html: BILINGUAL, portalLink: link, language: 'en' })
    expect(en.body).toBe('Pool: The pool opens Saturday.')
    expect(en.englishOnly).toBe(false)
  })

  it('no preference keeps the both-languages default; no translation ignores it', () => {
    const both = renderSmsText({ subject: 'Pool', html: BILINGUAL, portalLink: link, language: null })
    expect(both.body).toContain('Piscina')
    expect(both.body).toContain('The pool')
    const plain = renderSmsText({ subject: 'Pool', html: EN, text: 'The pool opens Saturday.', portalLink: link, language: 'es' })
    expect(plain.body).toBe('Pool: The pool opens Saturday.')
  })

  it('a long Spanish text stays within the SMS limit and links to the portal', () => {
    const longEs = composeBilingualHtml({
      englishHtml: EN,
      spanishSubject: 'Piscina',
      spanishHtml: `<p>${'La piscina abre el sábado. '.repeat(40)}</p>`,
    })
    const r = renderSmsText({ subject: 'Pool', html: longEs, portalLink: link, language: 'es' })
    expect(r.body.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
    expect(r.body.endsWith(link)).toBe(true)
    expect(r.shortened).toBe(true)
  })
})

describe('deliverToRecipients language', () => {
  const base = {
    communicationId: 'comm-1',
    organizationId: 'org-1',
    associationName: 'Maple',
    associationType: 'hoa',
    subject: 'Pool',
    extraFields: {},
  }
  const sms = (id: string, userId: string | null) => ({
    id,
    channel: 'sms',
    email: null,
    phone: '+14045550100',
    recipient_name: null,
    unit_id: null,
    user_id: userId,
  })

  it('texts each resident in their language with one batched preference read', async () => {
    h.prefRows = [{ user_id: 'u-es', language: 'es', updated_at: '2026-01-01' }]
    await deliverToRecipients(db() as never, {
      ...base,
      bodyHtml: BILINGUAL,
      recipients: [sms('s1', 'u-es'), sms('s2', 'u-none'), sms('s3', null)],
    })
    expect(h.prefQueries).toHaveLength(1)
    const bodies = h.sms.map((m) => m.body)
    expect(bodies).toContain('Piscina: La piscina abre el sábado.')
    expect(bodies.filter((b) => b.includes('Piscina') && b.includes('The pool'))).toHaveLength(2)
  })

  it('does not read preferences for a single-language body', async () => {
    await deliverToRecipients(db() as never, { ...base, bodyHtml: EN, recipients: [sms('s1', 'u1')] })
    expect(h.prefQueries).toEqual([])
  })

  it('a failed preference read still sends, with both languages', async () => {
    h.prefError = true
    const counts = await deliverToRecipients(db() as never, {
      ...base,
      bodyHtml: BILINGUAL,
      recipients: [sms('s1', 'u1')],
    })
    expect(counts.sentCount).toBe(1)
    expect(h.sms[0].body).toContain('The pool')
    expect(h.sms[0].body).toContain('Piscina')
  })

  it('emails carry the resident language', async () => {
    h.prefRows = [{ user_id: 'u-en', language: 'en', updated_at: '2026-01-01' }]
    await deliverToRecipients(db() as never, {
      ...base,
      bodyHtml: BILINGUAL,
      recipients: [{ id: 'e1', channel: 'email', email: 'e1@x.test', phone: null, recipient_name: null, unit_id: null, user_id: 'u-en' }],
    })
    expect(h.emails[0].html).toContain('The pool')
    expect(h.emails[0].html).not.toContain('La piscina')
  })
})
