import { describe, expect, it } from 'vitest'
import {
  MANAGED_BY_KEY,
  MAX_MANAGED_BY_LENGTH,
  cleanManagedBy,
  readManagedBy,
  saveManagedBySchema,
  withManagedBy,
} from './managed-by'

const A1 = '11111111-1111-4111-8111-111111111111'
const parse = (managedBy: string) => saveManagedBySchema.safeParse({ associationId: A1, managedBy })

describe('cleanManagedBy', () => {
  it('trims and collapses whitespace and line breaks', () => {
    expect(cleanManagedBy('  Managed by  Homeside,\n(404) 555-0100\r\n ')).toBe('Managed by Homeside, (404) 555-0100')
  })
  it('strips tags and angle brackets', () => {
    expect(cleanManagedBy('Homeside <script>alert(1)</script> <b>PM</b> 5 > 3')).toBe('Homeside alert(1) PM 5 3')
  })
  it('returns empty for non-strings and blanks', () => {
    expect(cleanManagedBy(null)).toBe('')
    expect(cleanManagedBy(42)).toBe('')
    expect(cleanManagedBy('  \n ')).toBe('')
  })
})

describe('saveManagedBySchema', () => {
  it('accepts a normal line and trims it', () => {
    const r = parse('  Managed by Homeside Property Management, (404) 555-0100  ')
    expect(r.success && r.data.managedBy).toBe('Managed by Homeside Property Management, (404) 555-0100')
  })
  it('accepts exactly 120 characters and rejects 121', () => {
    expect(parse('a'.repeat(MAX_MANAGED_BY_LENGTH)).success).toBe(true)
    const r = parse('a'.repeat(MAX_MANAGED_BY_LENGTH + 1))
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['managedBy'])
  })
  it('treats empty as no line', () => {
    const r = parse('   ')
    expect(r.success && r.data.managedBy).toBe('')
  })
  it('removes markup before counting', () => {
    const r = parse('<b>Homeside</b>')
    expect(r.success && r.data.managedBy).toBe('Homeside')
  })
})

describe('storage helpers', () => {
  it('writes the line next to the other keys and removes it when empty', () => {
    const base = { board_contacts: [1], other: true }
    const set = withManagedBy(base, 'Managed by Homeside')
    expect(set).toEqual({ ...base, [MANAGED_BY_KEY]: 'Managed by Homeside' })
    expect(withManagedBy(set, '')).toEqual(base)
    expect(withManagedBy(null, 'x')).toEqual({ [MANAGED_BY_KEY]: 'x' })
  })
  it('reads tolerantly', () => {
    expect(readManagedBy(null)).toBe('')
    expect(readManagedBy({ [MANAGED_BY_KEY]: 7 })).toBe('')
    expect(readManagedBy({ [MANAGED_BY_KEY]: '<i>Homeside</i>\n555' })).toBe('Homeside 555')
    expect(readManagedBy({ [MANAGED_BY_KEY]: 'a'.repeat(500) })).toHaveLength(MAX_MANAGED_BY_LENGTH)
  })
})
