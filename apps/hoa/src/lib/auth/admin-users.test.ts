import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AUTH_USERS_MAX_PAGES,
  AUTH_USERS_PER_PAGE,
  authEmailsByIds,
  findAuthUserByEmail,
  findAuthUserById,
  type AdminUsersClient,
} from './admin-users'

function profiles(row: { id: string; email: string } | null, error: unknown = null) {
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'ilike', 'limit']) b[op] = () => b
  b.maybeSingle = async () => ({ data: row, error })
  return b
}

function fakeClient(opts: {
  profile?: { id: string; email: string } | null
  listUsers?: AdminUsersClient['auth']['admin']['listUsers']
  getUserById?: AdminUsersClient['auth']['admin']['getUserById']
}): AdminUsersClient {
  return {
    from: () => profiles(opts.profile ?? null),
    auth: {
      admin: {
        listUsers: opts.listUsers ?? (async () => ({ data: { users: [] }, error: null })),
        getUserById: opts.getUserById ?? (async () => ({ data: { user: null }, error: null })),
      },
    },
  }
}

const fullPage = (page: number) =>
  Array.from({ length: AUTH_USERS_PER_PAGE }, (_, i) => ({ id: `u-${page}-${i}`, email: `p${page}n${i}@x.test` }))

afterEach(() => vi.restoreAllMocks())

describe('findAuthUserByEmail', () => {
  it('finds a user on page 2+ when profiles has no row', async () => {
    const listUsers = vi.fn(async ({ page }: { page?: number } = {}) => ({
      data: { users: page === 1 ? fullPage(1) : [{ id: 'late', email: 'Late@X.test' }] },
      error: null,
    }))
    const r = await findAuthUserByEmail(fakeClient({ listUsers }), 'late@x.test')
    expect(r).toEqual({ ok: true, found: true, user: { id: 'late', email: 'Late@X.test' } })
    expect(listUsers).toHaveBeenCalledTimes(2)
  })

  it('uses the profiles row without listing users', async () => {
    const listUsers = vi.fn()
    const r = await findAuthUserByEmail(
      fakeClient({ profile: { id: 'p1', email: 'a@x.test' }, listUsers: listUsers as never }),
      'a@x.test',
    )
    expect(r).toMatchObject({ ok: true, found: true, user: { id: 'p1' } })
    expect(listUsers).not.toHaveBeenCalled()
  })

  it('reports not-found after a short page', async () => {
    const r = await findAuthUserByEmail(fakeClient({}), 'nobody@x.test')
    expect(r).toEqual({ ok: true, found: false })
  })

  it('treats a listUsers error as an error, not not-found', async () => {
    const listUsers = async () => ({ data: null, error: { message: 'boom' } })
    expect(await findAuthUserByEmail(fakeClient({ listUsers }), 'a@x.test')).toEqual({ ok: false, error: 'boom' })
    const thrower = async () => {
      throw new Error('network')
    }
    expect(await findAuthUserByEmail(fakeClient({ listUsers: thrower }), 'a@x.test')).toEqual({
      ok: false,
      error: 'network',
    })
  })

  it('stops at the page cap, warns without PII, and does not claim not-found', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const listUsers = vi.fn(async ({ page }: { page?: number } = {}) => ({
      data: { users: fullPage(page ?? 1) },
      error: null,
    }))
    const r = await findAuthUserByEmail(fakeClient({ listUsers }), 'secret@x.test')
    expect(r.ok).toBe(false)
    expect(listUsers).toHaveBeenCalledTimes(AUTH_USERS_MAX_PAGES)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret@x.test')
  })
})

describe('findAuthUserById / authEmailsByIds', () => {
  it('distinguishes found, 404 not-found and error', async () => {
    const getUserById = async (id: string) =>
      id === 'ok'
        ? { data: { user: { id, email: 'a@x.test' } }, error: null }
        : id === 'gone'
          ? { data: null, error: { message: 'not found', status: 404 } }
          : { data: null, error: { message: 'down', status: 500 } }
    const c = fakeClient({ getUserById })
    expect(await findAuthUserById(c, 'ok')).toMatchObject({ ok: true, found: true })
    expect(await findAuthUserById(c, 'gone')).toEqual({ ok: true, found: false })
    expect(await findAuthUserById(c, 'bad')).toEqual({ ok: false, error: 'down' })
  })

  it('collects emails and reports failed ids', async () => {
    const getUserById = async (id: string) =>
      id === 'bad'
        ? { data: null, error: { message: 'down', status: 500 } }
        : { data: { user: { id, email: `${id}@x.test` } }, error: null }
    const r = await authEmailsByIds(fakeClient({ getUserById }), ['a', 'b', 'bad', 'a'])
    expect(r).toEqual({ ok: true, emails: new Map([['a', 'a@x.test'], ['b', 'b@x.test']]), failedIds: ['bad'] })
  })

  it('is an error when every lookup failed', async () => {
    const getUserById = async () => ({ data: null, error: { message: 'down', status: 500 } })
    expect((await authEmailsByIds(fakeClient({ getUserById }), ['a', 'b'])).ok).toBe(false)
  })
})

describe('call sites use the helper', () => {
  const lib = join(__dirname, '..')
  const files: Array<[string, string]> = [
    ['members.ts', 'authEmailsByIds'],
    ['members.ts', 'findAuthUserByEmail'],
    ['communications/audience.ts', 'authEmailsByIds'],
    ['platform-admin.ts', 'findAuthUserByEmail'],
  ]
  it.each(files)('%s calls %s and never an unpaged listUsers()', (file, fn) => {
    const src = readFileSync(join(lib, file), 'utf8')
    expect(src).toContain(`${fn}(`)
    expect(src).not.toMatch(/listUsers\(/)
  })
  it('platform-admin.ts uses the helper at both sites', () => {
    const src = readFileSync(join(lib, 'platform-admin.ts'), 'utf8')
    expect(src.match(/findAuthUserByEmail\(/g)).toHaveLength(2)
  })
})
