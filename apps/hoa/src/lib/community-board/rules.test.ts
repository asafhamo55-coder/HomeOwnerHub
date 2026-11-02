import { describe, expect, it } from 'vitest'
import {
  authorLabel,
  canUseAssociationBoard,
  cleanBoardText,
  isBoardModerator,
  postVisibleTo,
  replyRefusal,
  threadVisibleTo,
} from './rules'

const open = { closed_at: null, hidden_at: null }

describe('community board rules', () => {
  it('only board and admin moderate', () => {
    expect(isBoardModerator('admin')).toBe(true)
    expect(isBoardModerator('board')).toBe(true)
    expect(isBoardModerator('resident')).toBe(false)
  })

  it('a resident uses only the association they live in', () => {
    expect(canUseAssociationBoard('resident', 'a1', ['a1'])).toBe(true)
    expect(canUseAssociationBoard('resident', 'a2', ['a1'])).toBe(false)
    expect(canUseAssociationBoard('resident', 'a1', [])).toBe(false)
    expect(canUseAssociationBoard('board', 'a2', [])).toBe(true)
  })

  it('refuses a resident reply to a closed or hidden thread, not a moderator', () => {
    expect(replyRefusal('resident', open)).toBeNull()
    expect(replyRefusal('resident', { ...open, closed_at: 'x' })).toBe('thread_closed')
    expect(replyRefusal('resident', { ...open, hidden_at: 'x' })).toBe('thread_hidden')
    expect(replyRefusal('board', { ...open, closed_at: 'x' })).toBeNull()
  })

  it('hides hidden posts and threads from residents only', () => {
    expect(postVisibleTo('resident', { hidden_at: 'x' })).toBe(false)
    expect(postVisibleTo('resident', { hidden_at: null })).toBe(true)
    expect(postVisibleTo('board', { hidden_at: 'x' })).toBe(true)
    expect(threadVisibleTo('resident', { ...open, hidden_at: 'x' })).toBe(false)
    expect(threadVisibleTo('admin', { ...open, hidden_at: 'x' })).toBe(true)
  })

  it('shows a first name and last initial, never an email', () => {
    expect(authorLabel('Maria Gonzalez')).toBe('Maria G.')
    expect(authorLabel('  Sam  ')).toBe('Sam')
    expect(authorLabel('Ann Marie Lee')).toBe('Ann L.')
    expect(authorLabel('jo@example.test')).toBe('A neighbor')
    expect(authorLabel(null)).toBe('A neighbor')
    expect(authorLabel('')).toBe('A neighbor')
  })

  it('cleans typed text', () => {
    expect(cleanBoardText('  hi\r\n\r\n\r\n\r\nthere  ')).toBe('hi\n\nthere')
  })
})
