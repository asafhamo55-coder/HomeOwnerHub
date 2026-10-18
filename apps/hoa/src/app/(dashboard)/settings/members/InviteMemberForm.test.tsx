import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderToStaticMarkup } from 'react-dom/server'

// BL-072: the Role hint always showed the Resident text, whatever was picked.

;(globalThis as { React?: typeof React }).React = React
const h = React.createElement

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/members', () => ({ inviteMember: vi.fn() }))

const { InviteRoleField, INVITE_ROLES, InviteMemberForm } = await import('./InviteMemberForm')

const help = (v: string) => INVITE_ROLES.find((r) => r.value === v)!.help

describe('invite form role hint (BL-072)', () => {
  it.each(['admin', 'board', 'resident'] as const)('shows the %s text when %s is picked', (role) => {
    const html = renderToStaticMarkup(h(InviteRoleField, { roles: INVITE_ROLES, value: role, onValueChange: () => {} }))
    expect(html).toContain(help(role))
    for (const other of INVITE_ROLES.filter((r) => r.value !== role)) expect(html).not.toContain(other.help)
  })

  it('the form starts on Resident and says so', () => {
    const html = renderToStaticMarkup(h(InviteMemberForm, { properties: [], role: 'admin' }))
    expect(html).toContain(help('resident'))
    expect(html).not.toContain(help('admin'))
  })

  it('the form drives the hint from the picked role, not a fixed one', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(path.join(here, 'InviteMemberForm.tsx'), 'utf8')
    expect(src).not.toMatch(/find\(\(r\) => r\.value === 'resident'\)/)
    expect(src).toMatch(/<InviteRoleField[^>]*value=\{memberRole\}[^>]*onValueChange=/)
  })
})
