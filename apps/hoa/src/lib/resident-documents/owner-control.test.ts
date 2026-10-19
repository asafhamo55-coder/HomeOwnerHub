import { describe, expect, it } from 'vitest'
import { docDetailColumns, governingListColumns, ownerVisibilityControl } from './owner-control'

describe('ownerVisibilityControl (BL-052)', () => {
  it('flag off: nothing, for every type', () => {
    for (const t of ['ccr', 'other', 'minutes']) expect(ownerVisibilityControl('hoa', t, false)).toBe('none')
    expect(ownerVisibilityControl('governing', 'policy', false, { aiGenerated: true })).toBe('none')
  })

  it('flag on: allowlisted types are always visible', () => {
    expect(ownerVisibilityControl('hoa', 'bylaws', true)).toBe('always')
    expect(ownerVisibilityControl('governing', 'amendment', true)).toBe('always')
  })

  it('flag on: other types get the switch', () => {
    expect(ownerVisibilityControl('hoa', 'other', true)).toBe('switch')
    expect(ownerVisibilityControl('hoa', 'minutes', true)).toBe('switch')
    expect(ownerVisibilityControl('governing', 'minutes', true)).toBe('switch')
  })

  it('flag on: an AI-generated governing draft is never shown', () => {
    expect(ownerVisibilityControl('governing', 'minutes', true, { aiGenerated: true })).toBe('ai')
  })
})

describe('board-side selects', () => {
  it('name visible_to_owners only with the flag on', () => {
    expect(docDetailColumns(false)).not.toContain('visible_to_owners')
    expect(docDetailColumns(true)).toContain('visible_to_owners')
    expect(governingListColumns(false)).not.toContain('visible_to_owners')
    expect(governingListColumns(false)).not.toContain('ai_generated')
    expect(governingListColumns(true)).toContain('visible_to_owners')
  })

  it('flag off keeps today’s exact columns', () => {
    expect(docDetailColumns(false)).toBe('id, name, type, storage_path, file_size, parsed_text, parsed_at, created_at')
    expect(governingListColumns(false)).toBe('id, title, type, effective_date, parsed_at')
  })
})
