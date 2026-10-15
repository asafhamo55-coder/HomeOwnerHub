import { describe, expect, it } from 'vitest'
import { assertLoopbackOrDie } from './env'

describe('assertLoopbackOrDie', () => {
  it('accepts loopback hosts', () => {
    expect(() => assertLoopbackOrDie('http://127.0.0.1:54321')).not.toThrow()
    expect(() => assertLoopbackOrDie('http://localhost:54321')).not.toThrow()
  })

  it('rejects the production project', () => {
    expect(() => assertLoopbackOrDie('https://xwdjsxfskvreguyvryhc.supabase.co')).toThrow(/loopback/i)
  })

  it('rejects any non-loopback host', () => {
    expect(() => assertLoopbackOrDie('https://example.com')).toThrow(/loopback/i)
  })

  // A hostname that merely CONTAINS "localhost" is not loopback.
  it('rejects hosts that only look like loopback', () => {
    expect(() => assertLoopbackOrDie('https://localhost.evil.com')).toThrow(/loopback/i)
    expect(() => assertLoopbackOrDie('https://127.0.0.1.evil.com')).toThrow(/loopback/i)
  })

  it('rejects an empty or malformed url', () => {
    expect(() => assertLoopbackOrDie('')).toThrow()
    expect(() => assertLoopbackOrDie('not-a-url')).toThrow()
  })
})
