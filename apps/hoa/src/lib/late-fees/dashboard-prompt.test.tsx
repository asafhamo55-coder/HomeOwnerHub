import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_LATE_FEE_POLICY } from './policy'
import { LATE_FEE_LAWS } from './law'
import { signLateFeePolicy, withLateFeePolicy } from './store'
import { lateFeePrompt, lateFeePromptDismissedCookie, type LateFeePromptInput } from './dashboard-prompt'

;(globalThis as { React?: typeof React }).React = React

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => React.createElement('a', { href, ...rest }, children),
}))
vi.mock('@/components/dashboard/DismissLateFeePromptButton', () => ({
  DismissLateFeePromptButton: () => React.createElement('button', { type: 'button' }, 'Not now'),
}))

const { LateFeePromptCard } = await import('@/components/dashboard/LateFeePromptCard')

const SECRET = 'test-secret'
const ID = 'assoc-1'

function input(over: Partial<LateFeePromptInput> & { assoc?: Partial<NonNullable<LateFeePromptInput['association']>> } = {}): LateFeePromptInput {
  const { assoc, ...rest } = over
  return {
    role: 'board',
    association: { id: ID, state: 'GA', governing_law_state: null, type: 'hoa', compliance_settings: {}, ...assoc },
    secret: SECRET,
    dismissed: false,
    ...rest,
  }
}

describe('lateFeePrompt (BL-147)', () => {
  it('Georgia with no policy shows the prompt, with the GA statute', () => {
    const p = lateFeePrompt(input())
    expect(p?.law).toBe(LATE_FEE_LAWS.GA)
  })

  it('also when compliance_settings is null', () => {
    expect(lateFeePrompt(input({ assoc: { compliance_settings: null } }))).not.toBeNull()
  })

  it('Georgia with a saved policy does not', () => {
    const stored = signLateFeePolicy(
      ID,
      { ...DEFAULT_LATE_FEE_POLICY, enabled: true, mode: 'percent', percentBps: 500, declarationAttested: true, declarationRef: 'Art. 5' },
      { updatedAt: '2026-10-01T00:00:00.000Z', updatedBy: null },
      SECRET,
    )
    expect(lateFeePrompt(input({ assoc: { compliance_settings: withLateFeePolicy({}, stored) } }))).toBeNull()
  })

  it('a non-Georgia association does not', () => {
    for (const state of ['FL', 'CA', 'TX', null]) {
      expect(lateFeePrompt(input({ assoc: { state } }))).toBeNull()
    }
  })

  it('governing_law_state wins over state', () => {
    expect(lateFeePrompt(input({ assoc: { state: 'FL', governing_law_state: 'GA' } }))).not.toBeNull()
    expect(lateFeePrompt(input({ assoc: { state: 'GA', governing_law_state: 'FL' } }))).toBeNull()
  })

  it('residents and missing roles do not see it; board and admin do', () => {
    expect(lateFeePrompt(input({ role: 'resident' }))).toBeNull()
    expect(lateFeePrompt(input({ role: null }))).toBeNull()
    expect(lateFeePrompt(input({ role: 'admin' }))).not.toBeNull()
  })

  it('a dismissed prompt, or no association, shows nothing', () => {
    expect(lateFeePrompt(input({ dismissed: true }))).toBeNull()
    expect(lateFeePrompt(input({ association: null }))).toBeNull()
  })

  it('a tampered policy is not "none": the settings screen warns, not the dashboard', () => {
    const forged = { v: 1, policy: DEFAULT_LATE_FEE_POLICY, updated_at: 'x', updated_by: null, sig: 'ab' }
    expect(lateFeePrompt(input({ assoc: { compliance_settings: { late_fee_policy: forged } } }))).toBeNull()
  })

  it('a Georgia condo is quoted under its own section', () => {
    const p = lateFeePrompt(input({ assoc: { type: 'condo' } }))
    expect(p?.law.citation).toBe('O.C.G.A. § 44-3-109(b)(1)')
  })

  it('the dismiss cookie is per org', () => {
    expect(lateFeePromptDismissedCookie('o1')).not.toBe(lateFeePromptDismissedCookie('o2'))
  })
})

describe('LateFeePromptCard (BL-147)', () => {
  it('links to /settings/late-fees and quotes the statute verbatim', () => {
    const prompt = lateFeePrompt(input())!
    const html = renderToStaticMarkup(<LateFeePromptCard prompt={prompt} />)
    expect(html).toContain('href="/settings/late-fees"')
    expect(html).toContain('O.C.G.A. § 44-3-232(b)(1)')
    for (const q of LATE_FEE_LAWS.GA.quotes) expect(html).toContain(q)
    expect(html).toContain('Not now')
  })
})
