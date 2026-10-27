import { describe, expect, it } from 'vitest'
import { isOrgStoragePath, isSubmissionAttachmentPath } from './storage-path'

describe('isOrgStoragePath', () => {
  it('accepts a path inside the org prefix', () => {
    expect(isOrgStoragePath('org-1/violations/a.jpg', 'org-1')).toBe(true)
  })

  it.each([
    'org-2/violations/a.jpg',
    'org-1',
    'org-1/',
    'org-10/x.jpg',
    'org-1/../org-2/x.jpg',
    'org-1//x',
    '',
  ])('refuses %s', (p) => {
    expect(isOrgStoragePath(p, 'org-1')).toBe(false)
  })

  it('refuses a non-string', () => {
    expect(isOrgStoragePath(null, 'org-1')).toBe(false)
  })
})

describe('isSubmissionAttachmentPath', () => {
  it('accepts the exact org/type/parent prefix', () => {
    expect(isSubmissionAttachmentPath('org-1/submissions/ticket/p-1/f.png', 'org-1', 'ticket', 'p-1')).toBe(true)
  })

  it.each([
    'org-2/submissions/ticket/p-1/f.png',
    'org-1/submissions/arc/p-1/f.png',
    'org-1/submissions/ticket/p-2/f.png',
    'org-1/submissions/ticket/p-1/',
    'org-1/submissions/ticket/p-1/../p-2/f.png',
  ])('refuses %s', (p) => {
    expect(isSubmissionAttachmentPath(p, 'org-1', 'ticket', 'p-1')).toBe(false)
  })
})
