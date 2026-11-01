import { describe, expect, it } from 'vitest'
import { INBOX_SHORTCUTS } from '@/lib/inbox/keys'
import * as shortcuts from './global'
import { globalKeyStep } from './global'

const ev = (key: string, over: Record<string, unknown> = {}) => ({
  key, metaKey: false, ctrlKey: false, altKey: false, defaultPrevented: false,
  targetTag: 'BODY', targetEditable: false, pathname: '/tickets', ...over,
})

describe('global shortcuts', () => {
  it('opens help on ? but not while typing', () => {
    expect(globalKeyStep(ev('?')).type).toBe('help')
    expect(globalKeyStep(ev('?', { targetTag: 'INPUT' })).type).toBe('none')
    expect(globalKeyStep(ev('?', { targetTag: 'TEXTAREA' })).type).toBe('none')
    expect(globalKeyStep(ev('?', { targetEditable: true })).type).toBe('none')
  })
  it('has no g-then-letter navigation chords', () => {
    expect(shortcuts).not.toHaveProperty('GO_SHORTCUTS')
    for (const key of ['g', 'd', 'i', 'a', 'x']) expect(globalKeyStep(ev(key)).type).toBe('none')
  })
  it('defers to the inbox on inbox routes', () => {
    expect(globalKeyStep(ev('?', { pathname: '/inbox' })).type).toBe('none')
    expect(globalKeyStep(ev('a', { pathname: '/inbox/abc' })).type).toBe('none')
  })
  it('the inbox constant lists the keys the inbox binds', () => {
    expect(INBOX_SHORTCUTS.map((s) => s.key)).toEqual(['j', 'k', 'a', 'e', 'c', '?'])
  })
})
