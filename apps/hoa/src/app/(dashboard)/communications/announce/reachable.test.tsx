import { describe, it, expect, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children),
}))
vi.mock('@/lib/announcements/actions', () => ({ sendAnnouncement: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ responseErrorMessage: vi.fn() }))

const { ReachableNote } = await import('./AnnouncementFlow')
const { resolveAudience, countReachableHomes, hasReachableContact } = await import('@/lib/communications/audience')

type Row = Record<string, unknown>

/** A tiny fake client: every query resolves to the fixture rows of its table. */
function fakeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'in', 'is', 'not', 'lt', 'order', 'limit']) q[m] = () => q
    q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(ok)
    return q
  }
  return { from } as never
}

const UNITS = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }, { id: 'u4' }].map((u) => ({
  ...u,
  address_line1: `${u.id} Oak St`,
  unit_number: null,
}))

const FIXTURE = {
  units: UNITS,
  // u1 owner with email, u2 owner with phone only, u3 owner with nothing.
  ownerships: [
    { unit_id: 'u1', owner_name: 'A', owner_email: 'a@example.test', owner_phone: null, owner_user_id: null },
    { unit_id: 'u2', owner_name: 'B', owner_email: null, owner_phone: '555-0100', owner_user_id: null },
    { unit_id: 'u3', owner_name: 'C', owner_email: null, owner_phone: null, owner_user_id: null },
  ],
  // u4 has no owner; its tenant is reachable.
  tenancies: [{ unit_id: 'u4', tenant_name: 'D', tenant_email: 'd@example.test', tenant_phone: null, tenant_user_id: null, status: 'active' }],
  associations: [{ time_zone: 'America/New_York' }],
}

describe('countReachableHomes', () => {
  it('matches resolveAudience on a fixture', async () => {
    const db = fakeDb(FIXTURE)
    const resolved = await resolveAudience(db, 'assoc-1', { kind: 'everyone' })
    const counted = await countReachableHomes(db, 'assoc-1')
    expect(counted.total).toBe(resolved.recipients.length)
    expect(counted.reachable).toBe(resolved.recipients.filter((r) => hasReachableContact(r)).length)
    expect(counted).toEqual({ reachable: 3, total: 4 })
  })

  it('is zero when no home has a contact', async () => {
    const db = fakeDb({ ...FIXTURE, ownerships: [], tenancies: [] })
    expect(await countReachableHomes(db, 'assoc-1')).toEqual({ reachable: 0, total: 4 })
  })
})

describe('ReachableNote', () => {
  it('says how many homes can be reached', () => {
    const out = renderToStaticMarkup(<ReachableNote reachable={3} total={4} />)
    expect(out).toContain('3 of 4 homes can be reached by email or text.')
  })

  it('warns at zero and links to the import and the properties list', () => {
    const out = renderToStaticMarkup(<ReachableNote reachable={0} total={49} />)
    expect(out).toContain('No home has an email or phone on file')
    expect(out).toContain('href="/properties/import"')
    expect(out).toContain('href="/properties"')
  })

  it('shows nothing when the count failed or there are no homes', () => {
    expect(renderToStaticMarkup(<ReachableNote reachable={null} total={4} />)).toBe('')
    expect(renderToStaticMarkup(<ReachableNote reachable={0} total={0} />)).toBe('')
  })
})
