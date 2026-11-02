import { describe, expect, it } from 'vitest'
import { violationLetterBlocks, violationMailBlock } from './violation-letter'

const ok = { status: 'notice_sent', approved_letter: 'Dear owner,\n\nPlease fix the fence.', approved_at: '2026-11-01T00:00:00Z' }

describe('violationMailBlock', () => {
  it('allows an approved notice on an open violation', () => {
    expect(violationMailBlock(ok)).toBeNull()
  })
  it('refuses a missing or blank letter, or one never approved', () => {
    expect(violationMailBlock({ ...ok, approved_letter: null })).toMatch(/approved/)
    expect(violationMailBlock({ ...ok, approved_letter: '   ' })).toMatch(/approved/)
    expect(violationMailBlock({ ...ok, approved_at: null })).toMatch(/approved/)
  })
  it('refuses a closed or deleted violation', () => {
    for (const status of ['resolved', 'dismissed', 'waived', 'cured']) expect(violationMailBlock({ ...ok, status })).toMatch(/closed/)
    expect(violationMailBlock({ ...ok, deleted_at: '2026-11-01T00:00:00Z' })).toMatch(/deleted/)
  })
})

describe('violationLetterBlocks', () => {
  it('keeps the approved text, one block per paragraph', () => {
    const blocks = violationLetterBlocks('Dear owner,\r\n\r\nPlease fix the fence.\n\n\nThanks.')
    expect(blocks.filter((b) => b.kind === 'text').map((b) => (b as { text: string }).text)).toEqual(['Dear owner,', 'Please fix the fence.', 'Thanks.'])
  })
  it('is empty for an empty letter', () => {
    expect(violationLetterBlocks('  \n ')).toEqual([])
  })
})
