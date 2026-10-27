import { describe, expect, it } from 'vitest'
import {
  EMPTY_CONFLICT_DISCLOSURES,
  NOTE_MAX,
  disclosureBlocks,
  disclosureLines,
  disclosureProgress,
  isConflictDisclosureRecord,
  mayRecordFor,
  parseNote,
  withDisclosure,
  type Disclosure,
} from './model'
import { readConflictDisclosures, signConflictDisclosures, withConflictDisclosures } from './store'

const id = (n: number) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const BID = id(1)
const A = id(10)
const B = id(11)
const d = (member: string, status: Disclosure['status'] = 'no_conflict', note = ''): Disclosure => ({
  decisionKind: 'bid_award',
  decisionId: BID,
  memberId: member,
  status,
  note,
  recordedAt: '2027-01-05T10:00:00.000Z',
  recordedBy: member,
})

describe('progress and the block', () => {
  it('lists who is missing and blocks only when required', () => {
    const r = withDisclosure(EMPTY_CONFLICT_DISCLOSURES, d(A))
    const p = disclosureProgress(r, 'bid_award', BID, [A, B])
    expect(p.missing).toEqual([B])
    expect(disclosureBlocks('required', p)).toBe(true)
    expect(disclosureBlocks('recommended', p)).toBe(false)
    expect(disclosureBlocks('best_practice', p)).toBe(false)
  })
  it('complete once everyone has answered; a conflict counts as disclosed', () => {
    const r = withDisclosure(withDisclosure(EMPTY_CONFLICT_DISCLOSURES, d(A)), d(B, 'conflict_recused', 'Cousin owns it'))
    const p = disclosureProgress(r, 'bid_award', BID, [A, B])
    expect(p.complete).toBe(true)
    expect(disclosureBlocks('required', p)).toBe(false)
  })
  it('another decision or kind does not count; re-recording replaces', () => {
    let r = withDisclosure(EMPTY_CONFLICT_DISCLOSURES, d(A))
    expect(disclosureProgress(r, 'contract_approval', BID, [A]).complete).toBe(false)
    expect(disclosureProgress(r, 'bid_award', id(2), [A]).complete).toBe(false)
    r = withDisclosure(r, d(A, 'conflict_recused', 'x'))
    expect(r.disclosures).toHaveLength(1)
    expect(r.disclosures[0]?.status).toBe('conflict_recused')
  })
  it('no board members: nothing to wait for', () => {
    expect(disclosureBlocks('required', disclosureProgress(EMPTY_CONFLICT_DISCLOSURES, 'bid_award', BID, []))).toBe(false)
  })
})

describe('input rules', () => {
  it('notes are one paragraph within the cap', () => {
    expect(parseNote('  a\n b  ')).toBe('a b')
    expect(parseNote(undefined)).toBe('')
    expect(parseNote('x'.repeat(NOTE_MAX + 1))).toBe(false)
    expect(parseNote(5)).toBe(false)
  })
  it('a board member records their own; an admin anyone on the board; nobody off the board', () => {
    expect(mayRecordFor('board', A, A, [A, B])).toBe(true)
    expect(mayRecordFor('board', A, B, [A, B])).toBe(false)
    expect(mayRecordFor('admin', id(99), B, [A, B])).toBe(true)
    expect(mayRecordFor('admin', id(99), id(98), [A, B])).toBe(false)
  })
  it('minutes lines name the member, status and note', () => {
    const lines = disclosureLines([d(A), d(B, 'conflict_recused', 'Owns the firm')], new Map([[A, 'Ann'], [B, 'Bo']]))
    expect(lines).toEqual(['Ann: no conflict', 'Bo: conflict: recused (Owns the firm)'])
  })
  it('rejects malformed records', () => {
    expect(isConflictDisclosureRecord({ disclosures: [{ ...d(A), status: 'maybe' }] })).toBe(false)
    expect(isConflictDisclosureRecord({ disclosures: [d(A)] })).toBe(true)
  })
})

describe('signed storage', () => {
  const stamp = { updatedAt: '2027-01-05T10:00:00.000Z', updatedBy: A }
  const record = withDisclosure(EMPTY_CONFLICT_DISCLOSURES, d(A))
  const stored = signConflictDisclosures('assoc-1', record, stamp, 's3')
  const settings = withConflictDisclosures({ other: 1 }, stored)

  it('reads back, keeps other keys', () => {
    expect(readConflictDisclosures('assoc-1', settings, 's3').state).toBe('saved')
    expect(settings.other).toBe(1)
  })
  it('a forged edit, another association, or no secret reads unverified', () => {
    const forged = { ...settings, conflict_disclosures: { ...stored, record: withDisclosure(record, d(B)) } }
    expect(readConflictDisclosures('assoc-1', forged, 's3').state).toBe('unverified')
    expect(readConflictDisclosures('assoc-2', settings, 's3').state).toBe('unverified')
    expect(readConflictDisclosures('assoc-1', settings, null).state).toBe('unverified')
    expect(readConflictDisclosures('assoc-1', {}, 's3').state).toBe('none')
  })
})
