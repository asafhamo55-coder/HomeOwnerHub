import { describe, it, expect } from 'vitest'
import {
  MAX_ATTACHMENT_BYTES,
  attachmentNameProblem,
  remainingBudget,
  formatBytes,
  checkAttachmentFits,
} from './attachments'

describe('remainingBudget', () => {
  it('is the full cap when nothing is attached', () => {
    expect(remainingBudget([])).toBe(MAX_ATTACHMENT_BYTES)
  })

  it('subtracts every attached file', () => {
    expect(remainingBudget([{ sizeBytes: 1000 }, { sizeBytes: 2000 }])).toBe(
      MAX_ATTACHMENT_BYTES - 3000,
    )
  })

  it('never reports a negative budget', () => {
    expect(remainingBudget([{ sizeBytes: MAX_ATTACHMENT_BYTES * 2 }])).toBe(0)
  })
})

describe('checkAttachmentFits', () => {
  it('accepts a file that fits exactly', () => {
    expect(checkAttachmentFits([], MAX_ATTACHMENT_BYTES)).toEqual({ ok: true })
  })

  it('refuses one byte over and names both the limit and the overage', () => {
    const result = checkAttachmentFits([], MAX_ATTACHMENT_BYTES + 1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('15 MB')
  })

  it('accounts for what is already attached', () => {
    const half = MAX_ATTACHMENT_BYTES / 2
    expect(checkAttachmentFits([{ sizeBytes: half }], half).ok).toBe(true)
    expect(checkAttachmentFits([{ sizeBytes: half }], half + 1).ok).toBe(false)
  })

  it('refuses a zero-byte file — an empty attachment is always a mistake', () => {
    expect(checkAttachmentFits([], 0).ok).toBe(false)
  })
})

describe('attachmentNameProblem', () => {
  it.each([
    ['a double quote', '2025 "Approved" Budget.pdf', /double quote/i],
    ['a CR', 'a.pdf\rBcc: attacker@evil.com', /line break/i],
    ['an LF', 'a.pdf\nBcc: attacker@evil.com', /line break/i],
    ['only whitespace', '   ', /no name/i],
    ['an empty string', '', /no name/i],
  ])('refuses %s and says why', (_label, name, expected) => {
    expect(attachmentNameProblem(name)).toMatch(expected)
  })

  it.each([
    'ccrs.pdf',
    "Board's 2025 budget (final).pdf",
    'Grünanlage.pdf',
    'photo 1.jpg',
  ])('accepts %s', (name) => {
    expect(attachmentNameProblem(name)).toBeNull()
  })

  // Every name this refuses, the MIME layer would also refuse — it is a
  // strictly earlier gate, not a different rule.
  it('refuses nothing that buildMimeMessage would have accepted', () => {
    for (const name of ['a"b', 'a\rb', 'a\nb', ' ', '']) {
      expect(attachmentNameProblem(name)).not.toBeNull()
    }
  })
})

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [15 * 1024 * 1024, '15.0 MB'],
  ])('formats %i as %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected)
  })
})
