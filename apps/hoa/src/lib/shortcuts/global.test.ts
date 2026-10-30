import { describe, expect, it } from 'vitest'
import { INBOX_SHORTCUTS } from '@/lib/inbox/keys'
import { globalKeyStep } from './global'

const ev = (key: string, over: Record<string, unknown> = {}) => ({
  key, metaKey: false, ctrlKey: false, altKey: false, defaultPrevented: false,
  targetTag: 'BODY', targetEditable: false, pathname: '/tickets', ...over,
})

describe('global shortcuts', () => {
  it('opens help on ? but not while typing', () => {
    expect(globalKeyStep(ev('?'), false).type).toBe('help')
    expect(globalKeyStep(ev('?', { targetTag: 'INPUT' }), false).type).toBe('none')
    expect(globalKeyStep(ev('?', { targetTag: 'TEXTAREA' }), false).type).toBe('none')
    expect(globalKeyStep(ev('?', { targetEditable: true }), false).type).toBe('none')
  })
  it('g then d, i, a navigates; other second keys cancel', () => {
    expect(globalKeyStep(ev('g'), false).type).toBe('pending')
    expect(globalKeyStep(ev('d'), true)).toMatchObject({ type: 'go', href: '/' })
    expect(globalKeyStep(ev('i'), true)).toMatchObject({ type: 'go', href: '/inbox' })
    expect(globalKeyStep(ev('a'), true)).toMatchObject({ type: 'go', href: '/approvals' })
    expect(globalKeyStep(ev('x'), true).type).toBe('none')
    expect(globalKeyStep(ev('a'), false).type).toBe('none')
  })
  it('defers to the inbox on inbox routes', () => {
    expect(globalKeyStep(ev('?', { pathname: '/inbox' }), false).type).toBe('none')
    expect(globalKeyStep(ev('a', { pathname: '/inbox/abc' }), true).type).toBe('none')
  })
  it('the inbox constant lists the keys the inbox binds', () => {
    expect(INBOX_SHORTCUTS.map((s) => s.key)).toEqual(['j', 'k', 'a', 'e', 'c', '?'])
  })
})
