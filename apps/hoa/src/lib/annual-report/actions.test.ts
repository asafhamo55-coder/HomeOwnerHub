import { beforeEach, describe, expect, it, vi } from 'vitest'

// BL-153 saveAnnualReportNarrative / annualReportNoticeSection: board/admin
// only, the meeting must be the caller's org's, the save keeps every other
// compliance_settings key. Nothing is sent.

const ORG = 'org-1'
const MEETING = 'b0000000-0000-4000-8000-000000000001'
const ASSOC = 'a0000000-0000-4000-8000-000000000001'

const h = vi.hoisted(() => ({
  gate: { ok: true, role: 'board', orgId: 'org-1' } as { ok: true; role: string; orgId: string } | { ok: false; error: string },
  settings: {} as Record<string, unknown>,
  reads: [] as string[],
  updates: 0,
  updateFails: false,
  forMeeting: { ok: false, reason: 'failed' } as unknown,
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => h.gate),
}))
vi.mock('./for-meeting', () => ({ loadReportForMeeting: vi.fn(async () => h.forMeeting) }))
vi.mock('./message', async (orig) => ({
  ...(await orig<typeof import('./message')>()),
  annualReportSectionsHtml: () => ['<p>SECTIONS</p>'],
}))

function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    from(table: string) {
      h.reads.push(table)
      const filters: Record<string, unknown> = {}
      let update = false
      const rows = (): Record<string, unknown>[] => {
        if (table === 'hoa_meeting_minutes') {
          return filters.id === MEETING && filters.org_id === ORG
            ? [{ id: MEETING, org_id: ORG, meeting_date: '2027-01-15', meeting_type: 'annual', status: 'draft' }]
            : []
        }
        if (table === 'associations') {
          return [{ id: ASSOC, name: 'Maple HOA', state: 'GA', governing_law_state: null, compliance_settings: h.settings }]
        }
        return []
      }
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((filters[c] = v), q),
        is: () => q,
        update: (v: Record<string, unknown>) => {
          update = true
          if (!h.updateFails) h.settings = v.compliance_settings as Record<string, unknown>
          return q
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) => {
          if (update) {
            h.updates++
            return Promise.resolve(h.updateFails ? { data: null, error: { code: 'x' } } : { data: [{ id: ASSOC }], error: null }).then(res)
          }
          return Promise.resolve({ data: rows(), error: null }).then(res)
        },
      }
      return q
    },
  }
}
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: vi.fn(async () => fakeClient()) }))

const { saveAnnualReportNarrative, annualReportNoticeSection } = await import('./actions')
const { readNarrative } = await import('./narrative')

beforeEach(() => {
  h.gate = { ok: true, role: 'board', orgId: ORG }
  h.settings = { arc_decision_clock: { days: 30 } }
  h.reads = []
  h.updates = 0
  h.updateFails = false
  h.forMeeting = { ok: false, reason: 'failed' }
})

describe('saveAnnualReportNarrative', () => {
  it('refuses a non-board caller before any read', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can make this change.' }
    expect(await saveAnnualReportNarrative(MEETING, 'hi')).toEqual({ ok: false, error: 'Only board members and admins can make this change.' })
    expect(h.reads).toEqual([])
  })

  it('rejects bad ids and over-long text', async () => {
    expect((await saveAnnualReportNarrative('nope', 'hi')).ok).toBe(false)
    expect((await saveAnnualReportNarrative(MEETING, 'x'.repeat(4001))).ok).toBe(false)
    expect(h.updates).toBe(0)
  })

  it('refuses a meeting outside the org', async () => {
    const r = await saveAnnualReportNarrative('b0000000-0000-4000-8000-000000000099', 'hi')
    expect(r).toEqual({ ok: false, error: 'That meeting isn’t part of your organization.' })
    expect(h.updates).toBe(0)
  })

  it('saves under the meeting and keeps other settings keys', async () => {
    expect(await saveAnnualReportNarrative(MEETING, 'We repaved the lot.')).toEqual({ ok: true })
    expect(readNarrative(h.settings, MEETING)).toBe('We repaved the lot.')
    expect(h.settings.arc_decision_clock).toEqual({ days: 30 })
  })

  it('reports a failed write without leaking the database message', async () => {
    h.updateFails = true
    expect(await saveAnnualReportNarrative(MEETING, 'hi')).toEqual({ ok: false, error: 'Couldn’t save. Try again.' })
  })
})

describe('annualReportNoticeSection', () => {
  it('refuses a non-board caller', async () => {
    h.gate = { ok: false, error: 'Only board members and admins can make this change.' }
    expect((await annualReportNoticeSection(MEETING)).ok).toBe(false)
  })

  it('errors when the report cannot be built, so the send is not made without it', async () => {
    expect(await annualReportNoticeSection(MEETING)).toEqual({ ok: false, error: 'Couldn’t build the annual report. Try again.' })
  })

  it('refuses a meeting that is not the annual meeting', async () => {
    h.forMeeting = { ok: true, report: {}, narrative: '', annual: false }
    expect((await annualReportNoticeSection(MEETING)).ok).toBe(false)
  })

  it('returns the heading and the report sections for the annual meeting', async () => {
    h.forMeeting = { ok: true, report: {}, narrative: 'n', annual: true }
    const r = await annualReportNoticeSection(MEETING)
    expect(r.ok && r.html).toContain('SECTIONS')
    expect(r.ok && r.html).toContain('annual report to owners')
  })
})
