import { describe, expect, it } from 'vitest'
import {
  AI_ELIGIBLE_DOCUMENT_FILTER,
  DOCUMENT_ACCEPT,
  isAiEligibleDocumentPath,
  isGoverningUploadType,
  RESIDENT_VISIBLE_UPLOAD_TYPES,
  documentFileProblem,
  isDocumentUploadType,
  isResidentVisibleType,
  sanitizeStorageName,
} from './documents-rules'
import { RESIDENT_VISIBLE_TYPES } from './resident-documents/visibility'

describe('documents-rules (shared by Upload and inbox Save to documents)', () => {
  it('accepts the Upload form’s file types under 50 MB', () => {
    expect(documentFileProblem({ fileName: 'Insurance.PDF', sizeBytes: 120_000 })).toBeNull()
    expect(documentFileProblem({ fileName: 'plan.docx', sizeBytes: 1 })).toBeNull()
    expect(DOCUMENT_ACCEPT).toBe('.pdf,.docx,.doc,.txt,.md')
  })

  it('refuses other types, oversize, empty and unknown-size files', () => {
    expect(documentFileProblem({ fileName: 'photo.jpg', sizeBytes: 10 })).toMatch(/PDF, Word/)
    expect(documentFileProblem({ fileName: 'run.exe', sizeBytes: 10 })).toMatch(/PDF, Word/)
    expect(documentFileProblem({ fileName: 'big.pdf', sizeBytes: 50 * 1024 * 1024 + 1 })).toBe('Max file size is 50 MB.')
    expect(documentFileProblem({ fileName: 'a.pdf', sizeBytes: 0 })).toBe('This file is empty.')
    expect(documentFileProblem({ fileName: 'a.pdf', sizeBytes: null })).toMatch(/size/)
  })

  it('type list matches the upload enum', () => {
    expect(isDocumentUploadType('other')).toBe(true)
    expect(isDocumentUploadType('minutes')).toBe(false)
  })

  it('resident-visible types stay in step with the resident portal rule', () => {
    expect([...RESIDENT_VISIBLE_UPLOAD_TYPES].sort()).toEqual([...RESIDENT_VISIBLE_TYPES.hoa].sort())
    expect(isResidentVisibleType('rules')).toBe(true)
    expect(isResidentVisibleType('other')).toBe(false)
  })

  it('sanitizes storage names, keeping the extension', () => {
    expect(sanitizeStorageName('Gate Quote (v2).pdf', 1700000000000)).toBe('1700000000000-gate-quote-v2-.pdf')
  })
})

describe('M-3: AI eligibility of documents filed from the inbox', () => {
  const ORG = '00000000-0000-4000-8000-000000000001'
  it.each([
    [`${ORG}/1700000000-ccr.pdf`, true],
    [null, true],
    [`${ORG}/from-inbox/a-1/ccr.pdf`, false],
    [`${ORG}/from-inbox/a-1/governing/ccr.pdf`, true],
    // Not the exact confirmed shape: refused.
    [`${ORG}/from-inbox/a-1/x/governing/ccr.pdf`, false],
    [`${ORG}/from-inbox/governing/ccr.pdf`, false],
  ])('%s → %s', (path, eligible) => {
    expect(isAiEligibleDocumentPath(path)).toBe(eligible)
  })

  it('the PostgREST filter names both halves of the rule', () => {
    expect(AI_ELIGIBLE_DOCUMENT_FILTER).toBe(
      'storage_path.not.like.*/from-inbox/*,storage_path.like.*/from-inbox/*/governing/*',
    )
  })

  it('governing types are CC&R, bylaws and rules only', () => {
    expect(['ccr', 'bylaws', 'rules', 'other'].filter(isGoverningUploadType)).toEqual(['ccr', 'bylaws', 'rules'])
  })
})
