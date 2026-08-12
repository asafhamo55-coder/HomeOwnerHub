import { describe, it, expect } from 'vitest'
import { buildMergeBag } from './merge-bag'
import type { TemplateQuestion } from './types'

const AMBIENT = { association_name: 'Madison Park', recipient_name: 'Sarah', owner_name: 'Sarah', unit_id: 'u1' }

const QS: TemplateQuestion[] = [
  { id: 'issue_type', label: 'What?', type: 'select', options: ['pet waste'], required: true },
  { id: 'affected_areas', label: 'Where?', type: 'multiselect', options: ['A', 'B', 'C'], required: true },
  { id: 'note', label: 'Note', type: 'text', required: false, fallback: 'no extra note' },
]

describe('buildMergeBag', () => {
  it('passes ambient fields straight through', () => {
    const bag = buildMergeBag(QS, { issue_type: 'pet waste', affected_areas: ['A'] }, AMBIENT)
    expect(bag.association_name).toBe('Madison Park')
    expect(bag.recipient_name).toBe('Sarah')
  })

  it('joins a two-item multiselect with "and"', () => {
    const bag = buildMergeBag(QS, { issue_type: 'x', affected_areas: ['A', 'B'] }, AMBIENT)
    expect(bag.affected_areas).toBe('A and B')
  })

  it('uses an Oxford-style list for three or more', () => {
    const bag = buildMergeBag(QS, { issue_type: 'x', affected_areas: ['A', 'B', 'C'] }, AMBIENT)
    expect(bag.affected_areas).toBe('A, B and C')
  })

  it('returns a single item unadorned', () => {
    const bag = buildMergeBag(QS, { issue_type: 'x', affected_areas: ['A'] }, AMBIENT)
    expect(bag.affected_areas).toBe('A')
  })

  it('throws when a required answer is missing', () => {
    expect(() => buildMergeBag(QS, { affected_areas: ['A'] }, AMBIENT)).toThrow(/issue_type/)
  })

  it('throws when a required multiselect is empty', () => {
    expect(() => buildMergeBag(QS, { issue_type: 'x', affected_areas: [] }, AMBIENT)).toThrow(/affected_areas/)
  })

  it('uses the fallback for an unanswered optional question', () => {
    const bag = buildMergeBag(QS, { issue_type: 'x', affected_areas: ['A'] }, AMBIENT)
    expect(bag.note).toBe('no extra note')
  })

  it('never leaves an optional field undefined — strict render would throw', () => {
    const qs: TemplateQuestion[] = [{ id: 'opt', label: 'O', type: 'text', required: false }]
    const bag = buildMergeBag(qs, {}, AMBIENT)
    expect(bag.opt).toBe('')
    expect('opt' in bag).toBe(true)
  })

  it('rejects an answer for a question the template does not declare', () => {
    expect(() => buildMergeBag(QS, { issue_type: 'x', affected_areas: ['A'], sneaky: 'v' }, AMBIENT))
      .toThrow(/sneaky/)
  })
})
