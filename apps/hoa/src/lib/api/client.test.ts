import { describe, expect, it } from 'vitest'
import { apiErrorMessage } from './client'

describe('apiErrorMessage (client side)', () => {
  it('reads the envelope message', () => {
    expect(apiErrorMessage({ error: { code: 'forbidden', message: 'Board only.' } }, 'fallback')).toBe('Board only.')
  })
  it('falls back instead of showing a bare code or [object Object]', () => {
    expect(apiErrorMessage({ error: 'no_org' }, 'Something went wrong.')).toBe('Something went wrong.')
    expect(apiErrorMessage({ error: { code: 'internal' } }, 'Something went wrong.')).toBe('Something went wrong.')
    expect(apiErrorMessage(null, 'Something went wrong.')).toBe('Something went wrong.')
    expect(apiErrorMessage('<!doctype html>', 'Something went wrong.')).toBe('Something went wrong.')
  })
  it('tolerates a legacy {message} body during migration', () => {
    expect(apiErrorMessage({ error: 'x', message: 'Legacy text.' }, 'f')).toBe('Legacy text.')
  })
})
