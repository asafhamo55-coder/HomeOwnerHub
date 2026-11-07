import { afterEach, describe, expect, it, vi } from 'vitest'
import { readPhotoPath, serveUploadedPhoto } from './serve'

const ORG = '22222222-2222-4222-8222-222222222222'
const HOME = '11111111-1111-4111-8111-111111111111'

type Seen = { org?: string; queried: number }

function client(opts: { photoPath: string | null; signed?: boolean; seen?: Seen }) {
  const seen = opts.seen ?? { queried: 0 }
  const q: Record<string, unknown> = {}
  q.select = () => q
  q.is = () => q
  q.eq = (col: string, v: string) => {
    if (col === 'org_id') seen.org = v
    return q
  }
  q.maybeSingle = async () => {
    seen.queried++
    return { data: { photo_path: opts.photoPath }, error: null }
  }
  return {
    from: () => q,
    storage: {
      from: () => ({
        createSignedUrl: async () =>
          opts.signed === false
            ? { data: null, error: { name: 'x' } }
            : { data: { signedUrl: 'https://files.example/signed?t=1' }, error: null },
      }),
    },
  } as never
}

afterEach(() => vi.unstubAllGlobals())

describe('serveUploadedPhoto', () => {
  it('does nothing and asks nothing while the flag is off', async () => {
    const seen: Seen = { queried: 0 }
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const res = await serveUploadedPhoto(client({ photoPath: `${ORG}/${HOME}/front.jpg`, seen }), ORG, HOME, false)
    expect(res).toBeNull()
    expect(seen.queried).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('streams the stored photo through a signed link when the flag is on', async () => {
    const seen: Seen = { queried: 0 }
    vi.stubGlobal('fetch', vi.fn(async () => new Response('JPEGBYTES', { status: 200 })))
    const res = await serveUploadedPhoto(client({ photoPath: `${ORG}/${HOME}/front.jpg`, seen }), ORG, HOME, true)
    expect(res?.status).toBe(200)
    expect(res?.headers.get('X-Photo-Source')).toBe('upload')
    expect(res?.headers.get('Content-Type')).toBe('image/jpeg')
    expect(await res?.text()).toBe('JPEGBYTES')
    expect(seen.org).toBe(ORG) // org scoped read
  })

  it('returns null with no stored photo (Street View takes over after a remove)', async () => {
    expect(await serveUploadedPhoto(client({ photoPath: null }), ORG, HOME, true)).toBeNull()
  })

  it('ignores a path that belongs to another org or home', async () => {
    const other = '33333333-3333-4333-8333-333333333333'
    expect(await readPhotoPath(client({ photoPath: `${other}/${HOME}/front.jpg` }), ORG, HOME, true)).toBeNull()
    expect(await readPhotoPath(client({ photoPath: `${ORG}/${other}/front.jpg` }), ORG, HOME, true)).toBeNull()
  })

  it('falls back (null) when signing or the file fetch fails', async () => {
    const path = `${ORG}/${HOME}/front.jpg`
    expect(await serveUploadedPhoto(client({ photoPath: path, signed: false }), ORG, HOME, true)).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })))
    expect(await serveUploadedPhoto(client({ photoPath: path }), ORG, HOME, true)).toBeNull()
  })
})
