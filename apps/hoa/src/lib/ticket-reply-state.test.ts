import { describe, expect, it } from 'vitest'
import { fakeSupabase } from './test-utils/fake-supabase'
import { deriveReplyStates, loadReplyStates, REPLY_CHIP_LABEL } from './ticket-reply-state'

const row = (ticket_id: string, author_role: string, created_at: string) => ({ ticket_id, author_role, created_at })

describe('deriveReplyStates', () => {
  it('uses the newest message per ticket, whatever the row order', () => {
    const m = deriveReplyStates([
      row('a', 'board', '2026-01-02T00:00:00Z'),
      row('a', 'resident', '2026-01-03T00:00:00Z'),
      row('b', 'resident', '2026-01-01T00:00:00Z'),
      row('b', 'admin', '2026-01-02T00:00:00Z'),
    ])
    expect(m.get('a')).toBe('resident')
    expect(m.get('b')).toBe('board')
  })
  it('gives a ticket with no messages no chip', () => {
    expect(deriveReplyStates([]).get('x')).toBeUndefined()
  })
  it('words the chips', () => {
    expect(REPLY_CHIP_LABEL.resident).toBe('Resident replied')
    expect(REPLY_CHIP_LABEL.board).toBe('Waiting on resident')
  })
})

describe('loadReplyStates', () => {
  it('reads only non-internal messages, scoped to the org', async () => {
    const { client, queries } = fakeSupabase((q) => {
      const from = (q.ops.find((o) => o[0] === 'range')?.[1] as number) ?? 0
      return { data: from === 0 ? [row('a', 'resident', '2026-01-03T00:00:00Z')] : [], error: null }
    })
    const m = await loadReplyStates(client as never, 'org-1', ['a'])
    expect(m?.get('a')).toBe('resident')
    const ops = queries[0].ops
    expect(ops).toContainEqual(['eq', 'internal', false])
    expect(ops).toContainEqual(['eq', 'ticket.organization_id', 'org-1'])
  })
  it('returns null on a failed read so no chips are shown', async () => {
    const { client } = fakeSupabase(() => ({ data: null, error: { code: '42501', message: 'denied' } }))
    expect(await loadReplyStates(client as never, 'org-1', ['a'])).toBeNull()
  })
  it('does not query for no ids', async () => {
    const { client, queries } = fakeSupabase()
    expect((await loadReplyStates(client as never, 'org-1', []))?.size).toBe(0)
    expect(queries).toHaveLength(0)
  })
})
