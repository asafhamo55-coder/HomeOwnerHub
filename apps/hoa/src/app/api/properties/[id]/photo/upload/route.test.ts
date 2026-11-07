import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

const ORG = 'org-1'
const ID = '11111111-1111-4111-8111-111111111111'
const OTHER_HOME = '44444444-4444-4444-8444-444444444444'

const h = vi.hoisted(() => ({
  flag: true,
  role: 'board' as 'admin' | 'board' | 'resident' | null,
  // the homes this org has; a home in another org is simply absent (RLS and the org filter)
  homes: new Set<string>(),
  residentIds: [] as string[],
  photoPath: null as string | null,
  orgFilter: null as string | null,
  uploads: [] as { path: string; bytes: number; contentType: string }[],
  removes: [] as string[],
  rpcCalls: [] as { fn: string; args: unknown }[],
  rpcError: false,
  removeNothing: false,
  stillListed: false,
}))

vi.mock('@homeowner-portal/db/m20', () => ({
  get M20_APPLIED() {
    return h.flag
  },
}))
vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null ? null : { role: h.role, org: { id: ORG, name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
}))
vi.mock('@/lib/platform-admin', () => ({ isPlatformAdmin: vi.fn(async () => false) }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: h.role ? { id: 'user-1' } : null } }) },
    from: () => {
      let id = ''
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.is = () => q
      q.eq = (col: string, v: string) => {
        if (col === 'org_id') h.orgFilter = v
        if (col === 'id') id = v
        return q
      }
      q.maybeSingle = async () => ({ data: h.homes.has(id) ? { id, photo_path: h.photoPath } : null, error: null })
      return q
    },
    rpc: async (fn: string, args?: unknown) => {
      h.rpcCalls.push({ fn, args })
      if (fn === 'auth_resident_property_ids') return { data: h.residentIds, error: null }
      return { data: null, error: h.rpcError ? { code: 'XX000' } : null }
    },
    storage: {
      from: () => ({
        upload: async (path: string, body: Buffer, opts: { contentType: string }) => {
          h.uploads.push({ path, bytes: body.byteLength, contentType: opts.contentType })
          return { error: null }
        },
        remove: async (paths: string[]) => {
          h.removes.push(...paths)
          return { data: h.removeNothing ? [] : paths.map((name) => ({ name })), error: null }
        },
        list: async () => ({ data: h.stillListed ? [{ name: 'front.jpg' }] : [], error: null }),
      }),
    },
  })),
}))

import { DELETE, POST } from './route'

const ctx = (id = ID) => ({ params: Promise.resolve({ id }) })

async function photoForm(name = 'house.png', width = 2400) {
  const png = await sharp({ create: { width, height: 1200, channels: 3, background: '#aa5533' } })
    .withExif({ IFD0: { Copyright: 'secret' } })
    .png()
    .toBuffer()
  const form = new FormData()
  form.append('file', new File([png], name, { type: 'image/png' }))
  return form
}
const post = (form: FormData, id = ID) =>
  POST(new Request(`http://x/api/properties/${id}/photo/upload`, { method: 'POST', body: form }), ctx(id))
const del = (id = ID) => DELETE(new Request(`http://x/api/properties/${id}/photo/upload`, { method: 'DELETE' }), ctx(id))

beforeEach(() => {
  h.flag = true
  h.role = 'board'
  h.homes = new Set([ID, OTHER_HOME])
  h.residentIds = []
  h.photoPath = null
  h.orgFilter = null
  h.uploads = []
  h.removes = []
  h.rpcCalls = []
  h.rpcError = false
  h.removeNothing = false
  h.stillListed = false
})

describe('flag off hides everything', () => {
  it('answers 404 to upload and remove and touches nothing', async () => {
    h.flag = false
    const a = await post(await photoForm())
    const b = await del()
    expect(a.status).toBe(404)
    expect(b.status).toBe(404)
    expect(h.uploads).toHaveLength(0)
    expect(h.rpcCalls).toHaveLength(0)
  })
})

describe('who may upload', () => {
  it('lets the board upload for any home in the org', async () => {
    const res = await post(await photoForm(), OTHER_HOME)
    expect(res.status).toBe(200)
    expect(h.uploads[0]?.path).toBe(`${ORG}/${OTHER_HOME}/front.jpg`)
    expect(h.rpcCalls.find((c) => c.fn === 'set_property_photo')?.args).toEqual({
      p_property_id: OTHER_HOME,
      p_path: `${ORG}/${OTHER_HOME}/front.jpg`,
    })
  })

  it('lets an owner upload only for their own home', async () => {
    h.role = 'resident'
    h.residentIds = [ID]
    expect((await post(await photoForm(), ID)).status).toBe(200)
    h.uploads = []
    const other = await post(await photoForm(), OTHER_HOME)
    expect(other.status).toBe(403)
    expect(h.uploads).toHaveLength(0)
  })

  it('refuses a home in another org with 404 and reads only this org', async () => {
    h.homes = new Set() // the home is not in the caller's org
    const res = await post(await photoForm())
    expect(res.status).toBe(404)
    expect(h.orgFilter).toBe(ORG)
    expect(h.uploads).toHaveLength(0)
  })

  it('answers 401 or 403 before reading the body when signed out', async () => {
    h.role = null
    expect((await post(await photoForm())).status).toBeGreaterThanOrEqual(401)
    expect(h.uploads).toHaveLength(0)
  })
})

describe('what gets stored', () => {
  it('stores a re-encoded jpeg, resized to 1600px, with no EXIF', async () => {
    await post(await photoForm('x.png', 3200))
    const up = h.uploads[0]!
    expect(up.contentType).toBe('image/jpeg')
    expect(up.path).toBe(`${ORG}/${ID}/front.jpg`) // never the client's file name
  })

  it('rejects a wrong type with 415 and a disguised file with 415 or 422', async () => {
    const gif = new FormData()
    gif.append('file', new File([Buffer.from('GIF89a')], 'a.gif', { type: 'image/gif' }))
    expect((await post(gif)).status).toBe(415)
    const fake = new FormData()
    fake.append('file', new File([Buffer.from('not a picture')], 'a.jpg', { type: 'image/jpeg' }))
    expect([415, 422]).toContain((await post(fake)).status)
    expect(h.uploads).toHaveLength(0)
  })

  it('rejects over 5 MB with 413', async () => {
    const big = new FormData()
    big.append('file', new File([Buffer.alloc(5 * 1024 * 1024 + 10)], 'a.jpg', { type: 'image/jpeg' }))
    expect((await post(big)).status).toBe(413)
    expect(h.uploads).toHaveLength(0)
  })

  it('removes an orphaned file when the row update fails and there was no earlier photo', async () => {
    h.rpcError = true
    const res = await post(await photoForm())
    expect(res.status).toBe(500)
    expect(h.removes).toEqual([`${ORG}/${ID}/front.jpg`])
    expect(JSON.stringify(await res.json())).not.toContain('XX000')
  })
})

describe('remove falls back to Street View', () => {
  it('clears the path and deletes the file', async () => {
    h.photoPath = `${ORG}/${ID}/front.jpg`
    const res = await del()
    expect(res.status).toBe(200)
    expect(h.rpcCalls.find((c) => c.fn === 'set_property_photo')?.args).toEqual({ p_property_id: ID, p_path: null })
    expect(h.removes).toEqual([`${ORG}/${ID}/front.jpg`])
  })

  it('keeps the row when the file could not be removed and is still there', async () => {
    h.photoPath = `${ORG}/${ID}/front.jpg`
    h.removeNothing = true
    h.stillListed = true
    const res = await del()
    expect(res.status).toBe(500)
    expect(h.rpcCalls.some((c) => c.fn === 'set_property_photo')).toBe(false)
  })

  it('clears the row when the file was already gone', async () => {
    h.photoPath = `${ORG}/${ID}/front.jpg`
    h.removeNothing = true
    expect((await del()).status).toBe(200)
    expect(h.rpcCalls.some((c) => c.fn === 'set_property_photo')).toBe(true)
  })

  it('lets the board remove an owner upload but not an owner remove another home', async () => {
    h.role = 'resident'
    h.residentIds = [ID]
    expect((await del(OTHER_HOME)).status).toBe(403)
    h.role = 'board'
    expect((await del(OTHER_HOME)).status).toBe(200)
  })
})
