import { describe, expect, it } from 'vitest'
import { guidanceFor, welcomeTitle, WELCOME_STEP_COUNT } from './guidance-cards'

describe('guidanceFor', () => {
  it('org creator and admins (role admin) keep the setup checklist, and only that until it is dismissed', () => {
    expect(guidanceFor('admin', false)).toEqual({ setupChecklist: true, firstWeek: 'none' })
    expect(guidanceFor('admin', true)).toEqual({ setupChecklist: true, firstWeek: 'full' })
  })
  it('an invited board member sees exactly one welcome card and no setup checklist', () => {
    expect(guidanceFor('board', false)).toEqual({ setupChecklist: false, firstWeek: 'welcome' })
    expect(guidanceFor('board', true)).toEqual({ setupChecklist: false, firstWeek: 'welcome' })
  })
  it('other roles see no guidance cards', () => {
    expect(guidanceFor('resident', false)).toEqual({ setupChecklist: false, firstWeek: 'none' })
    expect(guidanceFor(null, false)).toEqual({ setupChecklist: false, firstWeek: 'none' })
  })
  it('titles the welcome card with the HOA name and shows 3 steps', () => {
    expect(welcomeTitle('Oak Hollow HOA')).toBe('Welcome to Oak Hollow HOA. Here’s what to do first')
    expect(WELCOME_STEP_COUNT).toBe(3)
  })
})
