import { beforeEach, describe, expect, it, vi } from 'vitest'

// The resident's language preference: strict validation, the action's
// guards (signed-in user only, no viewing-as, no smuggled user id), and the
// own-row read/insert/update.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'Maple Grove HOA' })) }))
const actor = vi.hoisted(() => ({ impersonating: false }))
vi.mock('@/lib/impersonation', () => ({ getResidentActor: vi.fn(async () => actor) }))

const db = vi.hoisted(() => ({
  existing: null as null | { id: string; organization_id: string; language?: string },
  readError: false,
  writeError: false,
  calls: [] as Array<{ op: string; payload?: Record<string, unknown>; filters: Record<string, unknown> }>,
  user: { id: 'user-me' } as null | { id: string },
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: () => {
      const call: { op: string; payload?: Record<string, unknown>; filters: Record<string, unknown> } = { op: 'select', filters: {} }
      const chain = {
        select: () => chain,
        insert: (p: Record<string, unknown>) => ((call.op = 'insert'), (call.payload = p), db.calls.push(call), Promise.resolve({ error: db.writeError ? { code: 'x' } : null })),
        update: (p: Record<string, unknown>) => ((call.op = 'update'), (call.payload = p), chain),
        eq: (c: string, v: unknown) => {
          call.filters[c] = v
          return chain
        },
        maybeSingle: () => Promise.resolve({ data: db.readError ? null : db.existing, error: db.readError ? { code: 'x' } : null }),
        then: (r: (v: unknown) => unknown) => {
          db.calls.push(call)
          return Promise.resolve({ error: db.writeError ? { code: 'x' } : null }).then(r)
        },
      }
      return chain
    },
  }),
}))

const { parseLanguage, loadMyLanguage } = await import('./language-preference')
const { setMyLanguage } = await import('./language-preference-actions')

beforeEach(() => {
  actor.impersonating = false
  db.existing = null
  db.readError = false
  db.writeError = false
  db.calls = []
  db.user = { id: 'user-me' }
})

describe('parseLanguage', () => {
  it('accepts only the supported codes', () => {
    expect(parseLanguage('en')).toBe('en')
    expect(parseLanguage('es')).toBe('es')
    for (const bad of ['fr', 'EN', '', ' es', null, undefined, 1, {}, ['es']]) expect(parseLanguage(bad)).toBeNull()
  })
})

describe('setMyLanguage', () => {
  it('rejects an unsupported value without touching the database', async () => {
    expect(await setMyLanguage('fr')).toEqual({ ok: false, error: 'Choose English or Español.' })
    expect(db.calls).toEqual([])
  })

  it('refuses while viewing as a resident', async () => {
    actor.impersonating = true
    const res = await setMyLanguage('es')
    expect(res.ok).toBe(false)
    expect(db.calls).toEqual([])
  })

  it('refuses when not signed in', async () => {
    db.user = null
    expect(await setMyLanguage('es')).toEqual({ ok: false, error: 'Not signed in.' })
  })

  it('inserts the signed-in user’s own row when none exists, leaving texts off', async () => {
    expect(await setMyLanguage('es')).toEqual({ ok: true })
    const insert = db.calls.find((c) => c.op === 'insert')!
    expect(insert.payload).toMatchObject({ organization_id: 'org-1', user_id: 'user-me', language: 'es' })
    expect(insert.payload).not.toHaveProperty('sms_opt_in')
  })

  it('updates only the existing own row, changing only the language', async () => {
    db.existing = { id: 'row-1', organization_id: 'org-1' }
    expect(await setMyLanguage('en')).toEqual({ ok: true })
    const update = db.calls.find((c) => c.op === 'update')!
    expect(update.filters).toMatchObject({ id: 'row-1', user_id: 'user-me' })
    expect(Object.keys(update.payload!).sort()).toEqual(['language', 'updated_at'])
  })

  it('does not move a row kept for another community', async () => {
    db.existing = { id: 'row-1', organization_id: 'org-other' }
    const res = await setMyLanguage('es')
    expect(res.ok).toBe(false)
    expect(db.calls.find((c) => c.op !== 'select')).toBeUndefined()
  })

  it('reports read and write failures as a friendly retry', async () => {
    db.readError = true
    expect(await setMyLanguage('es')).toEqual({ ok: false, error: 'Couldn’t save your language. Try again.' })
    db.readError = false
    db.writeError = true
    expect(await setMyLanguage('es')).toEqual({ ok: false, error: 'Couldn’t save your language. Try again.' })
  })
})

describe('loadMyLanguage', () => {
  const client = () => (import('@/lib/supabase/server').then((m) => m.getSupabaseServerClient())) as Promise<never>

  it('no row means nothing chosen', async () => {
    expect(await loadMyLanguage(await client(), 'org-1', 'user-me')).toEqual({ ok: true, language: null, otherOrg: false })
  })

  it('returns the saved language, ignoring unsupported stored codes', async () => {
    db.existing = { id: 'r', organization_id: 'org-1', language: 'es' }
    expect(await loadMyLanguage(await client(), 'org-1', 'user-me')).toEqual({ ok: true, language: 'es', otherOrg: false })
    db.existing = { id: 'r', organization_id: 'org-1', language: 'fr' }
    expect(await loadMyLanguage(await client(), 'org-1', 'user-me')).toEqual({ ok: true, language: null, otherOrg: false })
  })

  it('flags another community’s row and a failed read', async () => {
    db.existing = { id: 'r', organization_id: 'org-x', language: 'es' }
    expect(await loadMyLanguage(await client(), 'org-1', 'user-me')).toEqual({ ok: true, language: null, otherOrg: true })
    db.readError = true
    expect(await loadMyLanguage(await client(), 'org-1', 'user-me')).toEqual({ ok: false })
  })
})
