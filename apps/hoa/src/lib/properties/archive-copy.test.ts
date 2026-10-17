import { describe, expect, it } from 'vitest'
import { archiveDescription } from './archive-copy'

describe('archiveDescription', () => {
  it('says what archiving does when nothing is open', () => {
    const d = archiveDescription({ address: '128 Demo Court', balance: 0, openViolations: 0 })
    expect(d.warning).toBeNull()
    expect(d.body).toContain('128 Demo Court')
    expect(d.body).toContain('stay on file')
  })

  it('warns about an open balance and open violations, named and counted', () => {
    const d = archiveDescription({ address: '128 Demo Court', balance: 325, openViolations: 2 })
    expect(d.warning).toBe('This home still has a $325.00 open balance and 2 open violations.')
  })

  it('singular violation, no balance', () => {
    expect(archiveDescription({ address: 'x', balance: 0, openViolations: 1 }).warning).toBe(
      'This home still has 1 open violation.',
    )
  })

  it('unknown stats (failed read) warn that nothing could be checked', () => {
    expect(archiveDescription({ address: 'x', balance: null, openViolations: null }).warning).toMatch(/couldn’t check/i)
  })
})
