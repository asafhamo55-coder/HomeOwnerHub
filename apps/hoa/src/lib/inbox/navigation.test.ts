import { describe, expect, it } from 'vitest'
import { inboxQuery, neighbours, nextNeedingReply, parseOwnerFilter } from './navigation'
import { inboxKeyAction, type KeyEventLike } from './keys'

describe('neighbours (j/k)', () => {
  it('returns the rows either side of the current one', () => {
    expect(neighbours(['a', 'b', 'c'], 'b')).toEqual({ prevId: 'a', nextId: 'c' })
    expect(neighbours(['a', 'b', 'c'], 'a')).toEqual({ prevId: null, nextId: 'b' })
    expect(neighbours(['a', 'b', 'c'], 'c')).toEqual({ prevId: 'b', nextId: null })
  })

  it('starts at the top when the current thread is not in the list', () => {
    expect(neighbours(['a', 'b'], 'z')).toEqual({ prevId: null, nextId: 'a' })
  })
})

describe('nextNeedingReply (Next after Approve and close)', () => {
  it('takes the next one down, then wraps to the top, never the current thread', () => {
    expect(nextNeedingReply(['a', 'b', 'c'], 'b')).toBe('c')
    expect(nextNeedingReply(['a', 'b', 'c'], 'c')).toBe('a')
    expect(nextNeedingReply(['b'], 'b')).toBeNull()
    expect(nextNeedingReply([], 'b')).toBeNull()
  })

  it('opens the top of the queue when the current thread is not in it', () => {
    expect(nextNeedingReply(['a', 'b'], 'z')).toBe('a')
  })
})

describe('inboxQuery / parseOwnerFilter', () => {
  it('leaves defaults out', () => {
    expect(inboxQuery({ filter: 'needs_review' })).toBe('?filter=needs_review')
    expect(inboxQuery({ filter: 'all', owner: 'all', page: 1 })).toBe('?filter=all')
    expect(inboxQuery({ filter: 'open', owner: 'mine', page: 3 })).toBe('?filter=open&owner=mine&page=3')
  })

  it('falls back to all for anything unexpected', () => {
    expect(parseOwnerFilter('mine')).toBe('mine')
    expect(parseOwnerFilter('unassigned')).toBe('unassigned')
    expect(parseOwnerFilter('everyone')).toBe('all')
    expect(parseOwnerFilter(undefined)).toBe('all')
  })
})

describe('inboxKeyAction (keyboard shortcuts)', () => {
  const key = (k: string, over: Partial<KeyEventLike> = {}): KeyEventLike => ({
    key: k,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    defaultPrevented: false,
    targetTag: 'BODY',
    targetEditable: false,
    ...over,
  })

  it('maps j, k, a, e, c and ?', () => {
    expect(inboxKeyAction(key('j'))).toBe('next')
    expect(inboxKeyAction(key('k'))).toBe('prev')
    expect(inboxKeyAction(key('a'))).toBe('approve_close')
    expect(inboxKeyAction(key('e'))).toBe('edit')
    expect(inboxKeyAction(key('c'))).toBe('close')
    expect(inboxKeyAction(key('?'))).toBe('help')
    expect(inboxKeyAction(key('x'))).toBeNull()
  })

  it('never fires while typing or with a modifier held', () => {
    for (const tag of ['INPUT', 'TEXTAREA', 'SELECT', 'input']) {
      expect(inboxKeyAction(key('a', { targetTag: tag }))).toBeNull()
    }
    expect(inboxKeyAction(key('a', { targetEditable: true }))).toBeNull()
    expect(inboxKeyAction(key('a', { metaKey: true }))).toBeNull()
    expect(inboxKeyAction(key('c', { ctrlKey: true }))).toBeNull()
    expect(inboxKeyAction(key('j', { altKey: true }))).toBeNull()
    expect(inboxKeyAction(key('j', { defaultPrevented: true }))).toBeNull()
  })
})
