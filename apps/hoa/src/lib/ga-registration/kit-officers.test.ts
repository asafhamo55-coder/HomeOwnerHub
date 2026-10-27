import { describe, expect, it, vi } from 'vitest'
import { kitOfficers, loadOfficerTitles, type KitBoardMember } from './kit-officers'

const ORG = 'org-1'
const board: KitBoardMember[] = [
  { userId: 'u-sec', name: 'Sam Secretary', role: 'board' },
  { userId: 'u-tre', name: 'Tina Treasurer', role: 'board' },
  { userId: 'u-adm', name: 'Alex Admin', role: 'admin' },
  { userId: 'u-none', name: 'Bo NoTitle', role: 'board' },
]

function fakeDb(rows: Array<{ user_id: string; officer_title: string | null }> | null, error: { code?: string } | null = null) {
  const calls: Array<[string, ...unknown[]]> = []
  const q: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in']) {
    q[m] = (...args: unknown[]) => {
      calls.push([m, ...args])
      return q
    }
  }
  q.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error })
  const from = vi.fn((table: string) => {
    calls.push(['from', table])
    return q
  })
  return { db: { from }, from, calls }
}

describe('GA kit officer titles (BL-168 follow-up)', () => {
  it('flag off: no query at all, every title is left to write in by hand', async () => {
    const { db, from } = fakeDb([])
    const titles = await loadOfficerTitles(db, ORG, board.map((m) => m.userId), false)
    expect(titles).toBeNull()
    expect(from).not.toHaveBeenCalled()
    expect(kitOfficers(board, titles).map((o) => o.title)).toEqual([null, null, null, null])
  })

  it('flag on: reads org_members for this org only and shows each board member’s title', async () => {
    const { db, calls } = fakeDb([
      { user_id: 'u-sec', officer_title: 'secretary' },
      { user_id: 'u-tre', officer_title: 'treasurer' },
      { user_id: 'u-none', officer_title: null },
    ])
    const titles = await loadOfficerTitles(db, ORG, board.map((m) => m.userId), true)
    expect(calls).toContainEqual(['from', 'org_members'])
    expect(calls).toContainEqual(['eq', 'org_id', ORG])
    expect(calls).toContainEqual(['eq', 'role', 'board'])
    const officers = kitOfficers(board, titles)
    expect(officers.map((o) => [o.name, o.title])).toEqual([
      ['Alex Admin', null],
      ['Bo NoTitle', null],
      ['Sam Secretary', 'Secretary'],
      ['Tina Treasurer', 'Treasurer'],
    ])
  })

  it('an admin never gets a title, and an unknown title string is ignored', () => {
    const titles = new Map<string, string | null>([
      ['u-adm', 'president'],
      ['u-sec', 'grand wizard'],
    ])
    const byName = Object.fromEntries(kitOfficers(board, titles).map((o) => [o.name, o.title]))
    expect(byName['Alex Admin']).toBeNull()
    expect(byName['Sam Secretary']).toBeNull()
  })

  it('a failed read is null (by hand), logs the code only, and never reads as "no titles exist"', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { db } = fakeDb(null, { code: '42501' })
    const titles = await loadOfficerTitles(db, ORG, ['u-sec'], true)
    expect(titles).toBeNull()
    expect(err).toHaveBeenCalledWith('[ga-registration] officer titles read failed', { orgId: ORG, code: '42501' })
    err.mockRestore()
  })
})
