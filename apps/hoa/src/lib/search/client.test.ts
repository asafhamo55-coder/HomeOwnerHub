import { describe, expect, it, vi } from 'vitest'
import { fetchRecordSearch, failedNotice } from './client'

const OK_BODY = {
  query: 'kaur',
  groups: [
    {
      type: 'owner',
      label: 'Owners',
      items: [{ id: 'p2', type: 'owner', label: 'Amrit Kaur', hint: '9 Elm St', detail: null, href: '/properties/p2' }],
    },
    {
      type: 'violation',
      label: 'Violations',
      items: [
        { id: 'v1', type: 'violation', label: 'parking', hint: null, detail: 'Open · Oct 3', href: '/violations/v1' },
      ],
    },
  ],
  failed: [],
}

function fetchReturning(status: number, body: unknown) {
  return vi.fn(async (_url: string, _init?: RequestInit) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  )
}

describe('fetchRecordSearch', () => {
  it('requests /api/search with the encoded query and the abort signal', async () => {
    const f = fetchReturning(200, OK_BODY)
    const signal = new AbortController().signal
    await fetchRecordSearch('12 Elm & Co', signal, f)
    expect(f).toHaveBeenCalledWith('/api/search?q=12%20Elm%20%26%20Co', expect.objectContaining({ signal }))
  })

  it('maps groups to palette hits, keyed by type so ids never collide', async () => {
    const res = await fetchRecordSearch('kaur', new AbortController().signal, fetchReturning(200, OK_BODY))
    expect(res.hits).toEqual([
      {
        id: 'owner:p2',
        type: 'owner',
        label: 'Amrit Kaur',
        hint: '9 Elm St',
        detail: undefined,
        href: '/properties/p2',
        group: 'Owners',
      },
      {
        id: 'violation:v1',
        type: 'violation',
        label: 'parking',
        hint: undefined,
        detail: 'Open · Oct 3',
        href: '/violations/v1',
        group: 'Violations',
      },
    ])
    expect(res.notice).toBeUndefined()
  })

  it('says which record types could not be searched', async () => {
    const res = await fetchRecordSearch(
      'kaur',
      new AbortController().signal,
      fetchReturning(200, { ...OK_BODY, failed: ['thread', 'vendor'] }),
    )
    expect(res.notice).toBe('Inbox and Vendors couldn’t be searched, so results may be incomplete.')
  })

  it('throws the envelope message on a failed response (shown, not read as "no results")', async () => {
    const f = fetchReturning(403, { error: { code: 'forbidden', message: 'Only board members and admins can do this.' } })
    await expect(fetchRecordSearch('kaur', new AbortController().signal, f)).rejects.toThrow(
      'Only board members and admins can do this.',
    )
  })

  it('throws a readable fallback on a non-JSON failure', async () => {
    const f = fetchReturning(502, '<html>bad gateway</html>')
    await expect(fetchRecordSearch('kaur', new AbortController().signal, f)).rejects.toThrow('Try again in a moment.')
  })
})

describe('failedNotice', () => {
  it('is undefined when nothing failed', () => {
    expect(failedNotice([])).toBeUndefined()
  })
  it('names a single type', () => {
    expect(failedNotice(['ticket'])).toBe('Tickets couldn’t be searched, so results may be incomplete.')
  })
  it('joins owners and properties without repeating', () => {
    expect(failedNotice(['owner', 'property', 'arc'])).toBe(
      'Owners, Properties and ARC requests couldn’t be searched, so results may be incomplete.',
    )
  })
})
