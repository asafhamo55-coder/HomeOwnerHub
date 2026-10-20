import { describe, expect, it, vi } from 'vitest'
import { aiSpendNoticeAction, notifyAiSpendLevel } from './ai-spend-notice'
import { aiSpendBannerCopy, aiSpendNoticeCopy } from './ai-spend'

// BL-108: the board's email at each monthly AI spend level. No real email:
// the sender, the board lookup and the sandbox read are injected.

const NOW = Date.parse('2026-10-18T12:00:00.000Z')

function fakeDb(opts: { prior?: boolean; readError?: unknown; insertError?: unknown } = {}) {
  const inserts: Array<Record<string, unknown>> = []
  const filters: Array<[string, unknown]> = []
  const db = {
    from(table: string) {
      expect(table).toBe('audit_log')
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filters.push([c, v]), q),
        gte: (c: string, v: unknown) => (filters.push([c, v]), q),
        limit: async () =>
          opts.readError ? { data: null, error: opts.readError } : { data: opts.prior ? [{ id: 'n1' }] : [], error: null },
        insert: async (row: Record<string, unknown>) => (inserts.push(row), { error: opts.insertError ?? null }),
      }
      return q
    },
  }
  return { db: db as never, inserts, filters }
}

function deps(db: never, emails = ['a@board.test', 'b@board.test']) {
  const sendEmail = vi.fn(async (_input: { to: string; subject: string; html: string; text: string }, _o: { orgSandbox?: boolean; ref?: string }) => ({ ok: true as const }))
  const boardEmails = vi.fn(async () => emails)
  return {
    db,
    sendEmail,
    boardEmails,
    appUrl: (p: string) => `https://hoa.test${p}`,
    orgSandbox: vi.fn(async () => true),
  }
}

describe('notifyAiSpendLevel', () => {
  it('first crossing this month: claims the level in audit_log, then emails each board member through the guarded sender', async () => {
    const f = fakeDb()
    const d = deps(f.db)
    await expect(notifyAiSpendLevel('org-1', 'notice', NOW, d)).resolves.toBe(2)
    expect(f.inserts).toEqual([{ action: 'ai.spend.notice.notice', org_id: 'org-1', metadata: { month: '2026-10', level: 'notice' } }])
    expect(f.filters).toEqual(
      expect.arrayContaining([
        ['org_id', 'org-1'],
        ['action', 'ai.spend.notice.notice'],
        ['created_at', '2026-10-01T00:00:00.000Z'],
      ]),
    )
    expect(d.boardEmails).toHaveBeenCalledWith('org-1')
    expect(d.sendEmail).toHaveBeenCalledTimes(2)
    const [input, opts] = d.sendEmail.mock.calls[0]!
    expect(input.to).toBe('a@board.test')
    expect(input.subject).toBe('Your community has used 20% of this month’s AI budget')
    expect(input.text).toContain('https://hoa.test/settings/billing')
    // The org's sandbox mode reaches the outbound guard; the ref carries ids only.
    expect(opts).toEqual({ orgSandbox: true, ref: 'ai-spend:org-1:notice' })
  })

  it('already sent this month: nothing claimed, nothing sent', async () => {
    const f = fakeDb({ prior: true })
    const d = deps(f.db)
    await expect(notifyAiSpendLevel('org-1', 'resident_stop', NOW, d)).resolves.toBe(0)
    expect(f.inserts).toHaveLength(0)
    expect(d.sendEmail).not.toHaveBeenCalled()
  })

  it('a failed claim write sends nothing (never an email per AI call)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fakeDb({ insertError: { code: '42501' } })
      const d = deps(f.db)
      await expect(notifyAiSpendLevel('org-1', 'board_stop', NOW, d)).resolves.toBe(0)
      expect(d.sendEmail).not.toHaveBeenCalled()
      expect(JSON.stringify(spy.mock.calls)).toContain('42501')
    } finally {
      spy.mockRestore()
    }
  })

  it('a failed read sends nothing', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fakeDb({ readError: { code: '57014' } })
      const d = deps(f.db)
      await expect(notifyAiSpendLevel('org-1', 'notice', NOW, d)).resolves.toBe(0)
      expect(f.inserts).toHaveLength(0)
      expect(d.sendEmail).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('failed sends are logged as a count, never an address', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const f = fakeDb()
      const d = deps(f.db)
      d.sendEmail.mockImplementation(async () => ({ ok: false, error: 'blocked a@board.test' }) as never)
      await expect(notifyAiSpendLevel('org-1', 'notice', NOW, d)).resolves.toBe(0)
      const logged = JSON.stringify(spy.mock.calls)
      expect(logged).toContain('ai.spend.notice.send')
      expect(logged).not.toContain('board.test')
    } finally {
      spy.mockRestore()
    }
  })

  it('the default recipient lookup is the board role only (never residents)', async () => {
    const src = (await import('node:fs')).readFileSync(new URL('./ai-spend-notice.ts', import.meta.url), 'utf8')
    expect(src).toContain("fetchBoardMembers(orgId, ['board'])")
  })

  it('one action per level', () => {
    expect(aiSpendNoticeAction('notice')).toBe('ai.spend.notice.notice')
    expect(aiSpendNoticeAction('resident_stop')).toBe('ai.spend.notice.resident_stop')
    expect(aiSpendNoticeAction('board_stop')).toBe('ai.spend.notice.board_stop')
  })
})

describe('board copy', () => {
  it('names the resume date (the 1st, UTC) and what is paused', () => {
    expect(aiSpendNoticeCopy('normal', NOW)).toBeNull()
    expect(aiSpendNoticeCopy('resident_stop', NOW)!.title).toBe('Resident AI features are paused until November 1')
    expect(aiSpendNoticeCopy('board_stop', NOW)!.body).toContain('including the Copilot and meeting summaries')
  })

  it('the banner shows only while AI is paused (25% and 30%)', () => {
    expect(aiSpendBannerCopy('normal', NOW)).toBeNull()
    expect(aiSpendBannerCopy('notice', NOW)).toBeNull()
    expect(aiSpendBannerCopy('resident_stop', NOW)).toEqual(aiSpendNoticeCopy('resident_stop', NOW))
    expect(aiSpendBannerCopy('board_stop', NOW)).toEqual(aiSpendNoticeCopy('board_stop', NOW))
  })
})
