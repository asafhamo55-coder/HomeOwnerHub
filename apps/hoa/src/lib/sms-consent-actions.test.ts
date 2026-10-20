import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-110 actions: the subject is always the signed-in user (no id is
// accepted), viewing-as is refused, and a grant must match the disclosure
// and the numbers the server would show now.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'Maple Grove HOA' })) }))
const actor = vi.hoisted(() => ({ impersonating: false }))
vi.mock('@/lib/impersonation', () => ({ getResidentActor: vi.fn(async () => actor) }))
const ME = 'user-me'
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: ME } } }) } }),
}))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => ({ admin: true }) }))

const phones = vi.hoisted(() => ({ value: { ok: true, phones: ['+14045551234'] } as { ok: boolean; phones?: string[] } }))
const setCalls: unknown[] = []
vi.mock('./sms-consent', async (orig) => {
  const real = await orig<typeof import('./sms-consent')>()
  return {
    ...real,
    loadMyTextPhones: vi.fn(async () => phones.value),
    setSmsOptIn: vi.fn(async (_own: unknown, _audit: unknown, args: unknown) => {
      setCalls.push(args)
      return { ok: true }
    }),
  }
})

const { optInToTexts, optOutOfTexts } = await import('./sms-consent-actions')
const { SMS_DISCLOSURE_VERSION, disclosureHash, phonesFingerprint } = await import('./sms-consent')

const valid = () => ({
  agreed: true,
  disclosureVersion: SMS_DISCLOSURE_VERSION,
  disclosureSha256: disclosureHash('Maple Grove HOA'),
  phonesFingerprint: phonesFingerprint(['+14045551234']),
})

beforeEach(() => {
  actor.impersonating = false
  phones.value = { ok: true, phones: ['+14045551234'] }
  setCalls.length = 0
})

describe('optInToTexts', () => {
  it('records consent for the signed-in user only, with the evidence', async () => {
    expect(await optInToTexts(valid())).toEqual({ ok: true })
    expect(setCalls).toEqual([
      expect.objectContaining({
        orgId: 'org-1',
        userId: ME,
        optIn: true,
        evidence: { disclosureVersion: SMS_DISCLOSURE_VERSION, disclosureSha256: disclosureHash('Maple Grove HOA'), phones: ['+14045551234'] },
      }),
    ])
  })

  it('ignores any user id smuggled into the input', async () => {
    await optInToTexts({ ...valid(), userId: 'someone-else' } as never)
    expect(setCalls).toEqual([expect.objectContaining({ userId: ME })])
  })

  it('refuses without the box ticked', async () => {
    expect(await optInToTexts({ ...valid(), agreed: false })).toMatchObject({ ok: false })
    expect(setCalls).toEqual([])
  })

  it('refuses while a board member views as the resident', async () => {
    actor.impersonating = true
    expect(await optInToTexts(valid())).toEqual({ ok: false, error: expect.stringContaining('only they can change this') })
    expect(setCalls).toEqual([])
  })

  it.each([
    ['old disclosure version', { disclosureVersion: '1999-01-01' }],
    ['different wording', { disclosureSha256: 'deadbeef' }],
    ['numbers changed since the page loaded', { phonesFingerprint: phonesFingerprint(['+17705550000']) }],
  ])('refuses a stale page: %s', async (_what, patch) => {
    expect(await optInToTexts({ ...valid(), ...patch })).toEqual({ ok: false, error: expect.stringContaining('reload') })
    expect(setCalls).toEqual([])
  })

  it('refuses when there is no mobile number on file', async () => {
    phones.value = { ok: true, phones: [] }
    expect(await optInToTexts(valid())).toEqual({ ok: false, error: expect.stringContaining('no mobile number') })
    expect(setCalls).toEqual([])
  })
})

describe('optOutOfTexts', () => {
  it('turns texts off for me, no evidence needed', async () => {
    expect(await optOutOfTexts()).toEqual({ ok: true })
    expect(setCalls).toEqual([expect.objectContaining({ userId: ME, optIn: false })])
  })

  it('refuses while viewing as the resident', async () => {
    actor.impersonating = true
    expect(await optOutOfTexts()).toMatchObject({ ok: false })
    expect(setCalls).toEqual([])
  })
})
