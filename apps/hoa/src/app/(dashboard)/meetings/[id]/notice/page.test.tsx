import { beforeEach, describe, expect, it, vi } from 'vitest'

const ID = '11111111-2222-4333-8444-555555555555'

const h = vi.hoisted(() => ({
  role: 'board' as string | null,
  row: null as unknown,
  rowError: null as unknown,
  assocError: null as unknown,
  assocFail: false,
  state: 'GA' as string | null,
  type: 'hoa' as string | null,
  queried: 0,
  orgFilters: [] as unknown[],
  contacts: [{ label: 'President', name: 'Pat Board', phone: '404-555-0100', email: '' }] as unknown[],
  today: '2026-11-07',
}))

class NotFound extends Error {}
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new NotFound('notFound')
  },
  unstable_rethrow: () => {},
}))
vi.mock('next/link', () => ({
  default: (p: { children?: unknown; href: string; className?: string }) => <a href={p.href} className={p.className}>{p.children as never}</a>,
}))
vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () => (h.role === null ? null : { role: h.role, org: { id: 'org-1', name: 'Peachtree Fixture HOA' } })),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    from: (table: string) => {
      h.queried += 1
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => {
          h.orgFilters.push([table, col, val])
          return chain
        },
        is: () => chain,
        order: () => chain,
        range: async () => ({
          data: h.assocError ? null : [{ state: h.state, type: h.type, compliance_settings: { board_contacts: h.contacts } }],
          error: h.assocError,
        }),
        maybeSingle: async () => ({ data: h.rowError ? null : h.row, error: h.rowError }),
      }
      return chain
    },
  })),
}))
vi.mock('@/lib/association-time', async (orig) => ({
  ...(await orig<typeof import('@/lib/association-time')>()),
  todayIn: () => h.today,
}))
vi.mock('@/lib/primary-association', () => ({
  getPrimaryAssociationResult: vi.fn(async () =>
    h.assocFail ? { ok: false } : { ok: true, data: { id: 'a1', name: 'Peachtree Fixture HOA', timeZone: 'America/New_York' }, count: null },
  ),
}))

import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as { React?: unknown }).React = React
import Page from './page'
import { buildMeetingNoticeDraft, EMAIL_GREETING, EMAIL_REPLY_LINE } from '@/lib/meetings/notice-draft'

const MEETING = { id: ID, meeting_date: '2026-12-10', meeting_type: 'annual', status: 'draft', ai_summary: '1. Budget\n2. Election <of> directors' }
const FULL = { time: '19:00', where: 'Clubhouse <Room 2>' }

async function render(search: Record<string, string> = FULL) {
  const el = await Page({ params: Promise.resolve({ id: ID }), searchParams: Promise.resolve(search) })
  return renderToStaticMarkup(el)
}
const text = (html: string) => html.replace(/<[^>]*>/g, '')

beforeEach(() => {
  h.role = 'board'
  h.row = MEETING
  h.rowError = null
  h.assocError = null
  h.assocFail = false
  h.state = 'GA'
  h.type = 'hoa'
  h.queried = 0
  h.orgFilters = []
  h.contacts = [{ label: 'President', name: 'Pat Board', phone: '404-555-0100', email: '' }]
  h.today = '2026-11-07'
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

const INPUT = {
  associationName: 'Peachtree Fixture HOA',
  meetingType: 'annual',
  meetingDate: '2026-12-10',
  meetingTime: '19:00',
  location: 'Clubhouse <Room 2>',
  agenda: MEETING.ai_summary,
}

describe('meeting notice builder: print matches email minus the email-only lines', () => {
  const email = buildMeetingNoticeDraft(INPUT)
  const paper = buildMeetingNoticeDraft({ ...INPUT, mode: 'print', contactLines: ['President, Pat Board, 404-555-0100'] })

  it('leaves the email output unchanged when mode is email', () => {
    expect(buildMeetingNoticeDraft({ ...INPUT, mode: 'email' })).toEqual(email)
    expect(email.bodyHtml).toContain(EMAIL_GREETING)
    expect(email.bodyHtml).toContain(EMAIL_REPLY_LINE)
  })

  it('shares the subject, the details and the agenda', () => {
    expect(paper.subject).toBe(email.subject)
    const shared = email.bodyHtml.split('\n').filter((l) => l !== EMAIL_GREETING && l !== EMAIL_REPLY_LINE && !l.startsWith('<p>Thank you'))
    expect(shared.length).toBeGreaterThanOrEqual(3)
    for (const line of shared) expect(paper.bodyHtml).toContain(line)
    expect(paper.bodyHtml).toContain('Thursday, December 10, 2026 at 7:00 PM')
    expect(paper.bodyHtml).toContain('Clubhouse &lt;Room 2&gt;')
    expect(paper.bodyHtml).toContain('1. Budget<br>2. Election &lt;of&gt; directors')
  })

  it('drops the email-only lines: merge greeting and the reply line', () => {
    expect(paper.bodyHtml).not.toContain('recipient_name')
    expect(paper.bodyHtml).not.toMatch(/reply/i)
    expect(paper.bodyHtml).toContain('<p>Dear Homeowner,</p>')
    expect(paper.bodyHtml).toContain('contact the board:<br>President, Pat Board, 404-555-0100')
  })

  it('has no brackets, and no unfilled merge fields', () => {
    for (const draft of [paper, buildMeetingNoticeDraft({ ...INPUT, agenda: null, mode: 'print' }), buildMeetingNoticeDraft({ ...INPUT, mode: 'print', contactLines: [] })]) {
      expect(text(draft.bodyHtml)).not.toMatch(/[[\]]/)
      expect(draft.bodyHtml).not.toContain('{{')
    }
  })

  it('leaves the agenda out when there is none, and keeps the closing together', () => {
    const none = buildMeetingNoticeDraft({ ...INPUT, agenda: '  ', mode: 'print' })
    expect(none.bodyHtml).not.toContain('Agenda')
    expect(none.bodyHtml).not.toContain('will be shared')
    expect(none.bodyHtml).toContain('contact the board.')
    expect(paper.bodyHtml).toContain('<div style="break-inside:avoid"><p>Thank you,<br>Peachtree Fixture HOA Board</p></div>')
  })
})

describe('meeting notice print page', () => {
  it('prints the letter with the letterhead, date, place and board contacts', async () => {
    const html = await render()
    const draft = buildMeetingNoticeDraft({ ...INPUT, mode: 'print', contactLines: ['President, Pat Board, 404-555-0100'] })
    expect(html).toContain(draft.bodyHtml)
    expect(html).toContain('src="/brand-site/logo-full.svg"')
    expect(text(html.slice(html.indexOf('</header>')))).not.toMatch(/[[\]]/)
    expect(html).not.toContain('Check before you print')
  })

  it('prints a long agenda in full and wraps it', async () => {
    const long = Array.from({ length: 60 }, (_, i) => `${i + 1}. Item ${i + 1} ${'x'.repeat(120)}`).join('\n')
    h.row = { ...MEETING, ai_summary: long }
    const html = await render()
    expect(html).toContain('60. Item 60 ' + 'x'.repeat(120))
    expect(html).toContain('[overflow-wrap:anywhere]')
    expect(html).toContain('break-inside:avoid')
  })

  it('prints no agenda for a meeting that is not a draft', async () => {
    h.row = { ...MEETING, status: 'approved' }
    const html = await render()
    expect(html).not.toContain('Election')
  })

  describe('refuses when the time or place is missing', () => {
    it.each([
      ['no time', { where: 'Clubhouse' }, 'Add the meeting time first'],
      ['bad time', { time: '25:99', where: 'Clubhouse' }, 'Add the meeting time first'],
      ['no place', { time: '19:00' }, 'Add the meeting place first'],
      ['blank place', { time: '19:00', where: '   ' }, 'Add the meeting place first'],
      ['neither', {}, 'Add the meeting time and place first'],
    ])('%s', async (_n, search, title) => {
      const html = await render(search)
      expect(html).toContain(title)
      expect(html).not.toContain('Dear Homeowner')
      expect(html).not.toContain('aria-label="Meeting notice"')
      expect(html).toContain('min-h-12')
    })
  })

  describe('warnings, hidden in print and above the letter', () => {
    it('past meeting', async () => {
      h.today = '2026-12-20'
      const html = await render()
      expect(html).toContain('The meeting date has passed.')
      expect(html.indexOf('Check before you print')).toBeLessThan(html.indexOf('aria-label="Meeting notice"'))
    })
    it('inside the Georgia 21 days for an annual meeting', async () => {
      h.today = '2026-12-01'
      expect(await render()).toContain('Owners must get at least 21 days')
    })
    it('inside the Georgia 7 days for a special meeting', async () => {
      h.row = { ...MEETING, meeting_type: 'special' }
      h.today = '2026-12-08'
      expect(await render()).toContain('at least 7 days')
    })
    it('enough notice gives no notice warning', async () => {
      h.today = '2026-11-07'
      expect(await render()).not.toContain('Check before you print')
    })
    it('no board contacts', async () => {
      h.contacts = []
      const html = await render()
      expect(html).toContain('No board contacts are set')
      expect(html).toContain('contact the board.')
    })
    it('the header and back link are print:hidden', async () => {
      const html = await render()
      const header = html.indexOf('data-testid="meeting-notice-header"')
      expect(html.slice(html.lastIndexOf('<div', header), header)).toContain('print:hidden')
      expect(html).toContain('<p class="print:hidden">')
      expect(html).toContain('size: letter')
    })
  })

  it('uses 12pt text, 44px targets and no em dashes', async () => {
    const html = await render()
    expect(html).toContain('text-[12pt]')
    expect(html).toContain('min-h-12')
    expect(html).not.toContain('—')
  })

  it('also serves an admin; the change link reopens the form', async () => {
    h.role = 'admin'
    const html = await render()
    expect(html).toContain('Meeting notice')
    const edit = await render({ ...FULL, edit: '1' })
    expect(edit).toContain('Change the time or place')
    expect(edit).toContain('value="19:00"')
    expect(edit).not.toContain('aria-label="Meeting notice"')
  })

  it.each(['resident', 'vendor', null])('is not found for %s, before any query', async (role) => {
    h.role = role
    await expect(render()).rejects.toBeInstanceOf(NotFound)
    expect(h.queried).toBe(0)
  })

  it('is not found for a bad id, and for a meeting outside the org (no row)', async () => {
    await expect(Page({ params: Promise.resolve({ id: 'nope' }), searchParams: Promise.resolve(FULL) })).rejects.toBeInstanceOf(NotFound)
    h.row = null
    await expect(render()).rejects.toBeInstanceOf(NotFound)
  })

  it('scopes every read to the org', async () => {
    await render()
    expect(h.orgFilters).toContainEqual(['hoa_meeting_minutes', 'org_id', 'org-1'])
    expect(h.orgFilters).toContainEqual(['associations', 'organization_id', 'org-1'])
  })

  describe('fails closed', () => {
    const shows = (html: string) => {
      expect(html).toContain('the meeting notice')
      expect(html).not.toContain('Dear Homeowner')
      expect(html).not.toContain('aria-label="Meeting notice"')
    }
    it('meeting read fails', async () => {
      h.rowError = { code: 'XX000', message: 'boom' }
      shows(await render())
    })
    it('association read fails', async () => {
      h.assocError = { code: 'XX000', message: 'boom' }
      shows(await render())
    })
    it('primary association read fails', async () => {
      h.assocFail = true
      shows(await render())
    })
  })
})
