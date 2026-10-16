import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiRouteError } from './errors'
import { checkWrite } from './db'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

function thrown(fn: () => void): ApiRouteError {
  try {
    fn()
  } catch (e) {
    if (e instanceof ApiRouteError) return e
    throw e
  }
  throw new Error('expected a throw')
}

describe('checkWrite', () => {
  it('passes a write with no error', () => {
    expect(() => checkWrite({ error: null }, 'thing.insert')).not.toThrow()
  })

  it('turns a failed write into a generic 500 and logs the code only', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const e = thrown(() =>
      checkWrite({ error: { code: '23502', message: 'null value in column "owner_email" (jane@example.com)' } }, 'thing.insert', { orgId: 'org-1' }),
    )
    expect(e.code).toBe('internal')
    expect(e.publicMessage).not.toMatch(/owner_email|jane/)
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).toContain('thing.insert')
    expect(logged).toContain('23502')
    expect(logged).toContain('org-1')
    expect(logged).not.toContain('jane@example.com')
  })

  it('maps a unique violation to 409 conflict when the caller names a reason', () => {
    const e = thrown(() =>
      checkWrite({ error: { code: '23505', message: 'dup' } }, 'bid.insert', {}, { conflict: { reason: 'already_submitted', message: 'Already submitted.' } }),
    )
    expect(e.code).toBe('conflict')
    expect(e.extra).toEqual({ reason: 'already_submitted' })
    expect(e.publicMessage).toBe('Already submitted.')
  })

  it('keeps an unmapped unique violation a 500', () => {
    expect(thrown(() => checkWrite({ error: { code: '23505' } }, 'x')).code).toBe('internal')
  })
})
