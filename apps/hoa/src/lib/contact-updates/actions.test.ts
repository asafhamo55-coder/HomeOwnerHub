import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyContact } from './model'

// Synthetic values only.
const h = vi.hoisted(() => ({
  insert: vi.fn(),
  send: vi.fn(async () => ({})),
  load: vi.fn(),
  revalidate: vi.fn(),
}))

vi.mock('next/cache', () => ({ revalidatePath: h.revalidate }))
vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: h.send } }))
vi.mock('@/lib/orgs', () => ({ getCurrentOrg: vi.fn(async () => ({ id: 'org-1' })) }))
vi.mock('@/lib/impersonation', () => ({ IMPERSONATION_READONLY_MSG: 'Read-only while viewing as a resident.' }))
vi.mock('./resident-load', () => ({ loadMyContacts: h.load }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'Pat@Example.test' } } }) },
    from: (table: string) => ({
      insert: (row: unknown) => {
        h.insert(table, row)
        return { select: () => ({ single: async () => ({ data: { id: 'tk-new' }, error: null }) }) }
      },
    }),
  })),
}))

const { requestContactUpdate } = await import('./actions')

const home = (over: Partial<MyContact> = {}): MyContact => ({
  unitId: 'u1',
  propertyId: 'p1',
  label: '12 Oak Street',
  current: { phone: '(555) 123-4567', email: 'pat@example.test', mailing: null },
  editable: ['phone', 'email', 'mailing'],
  emailLocked: false,
  mailingUnknown: false,
  pending: null,
  ...over,
})
const loaded = (homes: MyContact[], impersonating = false) => ({
  ok: true,
  data: {
    actor: { impersonating },
    units: [{ unit_id: 'u1', association_id: 'a1', unit_number: null, address: '12 Oak Street' }],
    homes,
    signInEmail: 'pat@example.test',
  },
})
const form = { unitId: 'u1', phone: '555 222 3333', email: 'pat@example.test', mailing: 'PO Box 9' }

beforeEach(() => {
  h.load.mockResolvedValue(loaded([home()]))
})

describe('requestContactUpdate', () => {
  it('files the change as the resident’s own ticket, with only what changed', async () => {
    const r = await requestContactUpdate(form)
    expect(r).toEqual({ ok: true, ticketId: 'tk-new' })
    expect(h.insert).toHaveBeenCalledTimes(1)
    const [table, row] = h.insert.mock.calls[0]! as [string, Record<string, string>]
    expect(table).toBe('tickets')
    expect(row).toMatchObject({ organization_id: 'org-1', unit_id: 'u1', submitted_by: 'user-1', subject: 'Contact details update', category: 'general', status: 'open' })
    expect(row.description).toContain('Phone: (555) 222-3333')
    expect(row.description).toContain('Mailing address: PO Box 9')
    expect(row.description).not.toContain('Email for notices')
    expect(row.description).toContain('Signed in as: pat@example.test')
    expect(h.send).toHaveBeenCalledWith({ name: 'ticket/created', data: { ticketId: 'tk-new', organizationId: 'org-1' } })
  })

  it('returns field errors and sends nothing when a value is invalid', async () => {
    const r = await requestContactUpdate({ ...form, phone: '12', email: 'nope' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(Object.keys(r.fieldErrors ?? {}).sort()).toEqual(['email', 'phone'])
    expect(h.insert).not.toHaveBeenCalled()
  })

  it('a locked email is never part of the request, even if sent', async () => {
    h.load.mockResolvedValue(loaded([home({ editable: ['phone', 'mailing'], emailLocked: true })]))
    const r = await requestContactUpdate({ ...form, email: 'other@example.test' })
    expect(r.ok).toBe(true)
    const row = h.insert.mock.calls[0]![1] as { description: string }
    expect(row.description).not.toContain('other@example.test')
  })

  it('refuses another home, a second waiting request, no change, and impersonation', async () => {
    expect((await requestContactUpdate({ ...form, unitId: 'u-other' })).ok).toBe(false)

    h.load.mockResolvedValue(loaded([home({ pending: { ticketId: 't0', createdAt: '2026-10-17', request: { signInEmail: 'x@y.co', changes: { phone: null } } } })]))
    expect(await requestContactUpdate(form)).toMatchObject({ ok: false, error: expect.stringMatching(/already have a change waiting/) })

    h.load.mockResolvedValue(loaded([home()]))
    expect(await requestContactUpdate({ unitId: 'u1', phone: '(555) 123-4567', email: 'PAT@example.test', mailing: '' })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Nothing has changed/),
    })

    h.load.mockResolvedValue(loaded([home()], true))
    expect(await requestContactUpdate(form)).toMatchObject({ ok: false, error: expect.stringMatching(/Read-only/) })
    expect(h.insert).not.toHaveBeenCalled()
  })

  it('never logs the values', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    h.send.mockRejectedValueOnce(new Error('down'))
    await requestContactUpdate(form)
    const logged = JSON.stringify(spy.mock.calls)
    expect(logged).not.toContain('222-3333')
    expect(logged).not.toContain('PO Box')
    expect(logged).not.toContain('example.test')
  })
})
