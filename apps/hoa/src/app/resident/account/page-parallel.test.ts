import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'

;(globalThis as { React?: typeof React }).React = React

// BL-099 static pass: /resident/account read the profile name, then the
// email consent, then the text-message state, one after another, and made
// its own getUser call on top of the layout's. Now the three reads go out
// together and the user comes from the request-memoized getSignedInUser.

const h = vi.hoisted(() => {
  const state = {
    started: [] as string[],
    held: new Set<string>(),
    release: () => {},
    gate: Promise.resolve(),
    authGetUser: 0,
  }
  const reset = () => {
    state.started = []
    state.held = new Set()
    state.authGetUser = 0
    state.gate = new Promise<void>((r) => {
      state.release = r
    })
  }
  reset()
  const track =
    <T>(name: string, value: () => T) =>
    async (): Promise<Awaited<T>> => {
      state.started.push(name)
      if (state.held.has(name)) await state.gate
      return (await value()) as Awaited<T>
    }
  return { state, reset, track }
})

vi.mock('@homeowner-portal/db/m1', () => ({ M1_APPLIED: true }))
vi.mock('@homeowner-portal/db', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/orgs', () => ({
  getSignedInUser: h.track('getSignedInUser', () => ({ id: 'user-1', email: 'me@x.test' })),
  getCurrentOrg: h.track('getCurrentOrg', () => ({ id: 'org-1', name: 'HOA' })),
}))
vi.mock('@/lib/impersonation', () => ({
  getResidentActor: h.track('getResidentActor', () => ({
    id: 'user-1',
    email: 'me@x.test',
    impersonating: false,
    orgId: null,
    client: {},
  })),
}))
vi.mock('@/lib/resident', () => ({ getResidentUnits: h.track('getResidentUnits', () => []) }))
vi.mock('@/lib/contact-updates/resident-load', () => ({
  loadMyContacts: h.track('loadMyContacts', () => ({ ok: false })),
}))
vi.mock('@/lib/email-consent', () => ({
  loadEmailConsent: h.track('loadEmailConsent', () => ({ ok: true, available: true, consent: new Map() })),
}))
vi.mock('@/lib/sms-consent', () => ({
  loadTextMessagesState: h.track('loadTextMessagesState', () => 'failed'),
}))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.maybeSingle = h.track('profiles', () => ({ data: { full_name: 'Dana Reyes' }, error: null }))
    return {
      from: () => q,
      auth: {
        getUser: async () => {
          h.state.authGetUser += 1
          return { data: { user: { id: 'user-1' } } }
        },
      },
    }
  }),
}))

const { default: ResidentAccountPage } = await import('./page')

async function settle() {
  for (let i = 0; i < 500; i++) await Promise.resolve()
}

beforeEach(() => h.reset())

describe('/resident/account loads in parallel (BL-099)', () => {
  it('reads the email consent and text state while the profile read is in flight', async () => {
    h.state.held.add('profiles')
    const page = ResidentAccountPage()
    await settle()
    expect(h.state.started).toEqual(
      expect.arrayContaining(['profiles', 'loadEmailConsent', 'loadTextMessagesState']),
    )
    h.state.release()
    expect(await page).toBeTruthy()
  })

  it('takes the user from the memoized getSignedInUser, not a second getUser', async () => {
    await ResidentAccountPage()
    expect(h.state.started).toContain('getSignedInUser')
    expect(h.state.authGetUser).toBe(0)
  })
})
