import { describe, expect, it } from 'vitest'
import {
  RESIDENT_ASSISTANT_KEY,
  readResidentAssistantSettings,
  residentAssistantOn,
  signResidentAssistantSettings,
  withResidentAssistantSettings,
} from './settings'
import { dedupeHandoffs, handoffHref } from './handoff'

const SECRET = 'test-secret'
const A = 'assoc-1'
const stamp = { updatedAt: '2026-10-19T00:00:00.000Z', updatedBy: 'board-1' }

describe('resident assistant setting (signed, default ON)', () => {
  it('missing → ON', () => {
    expect(readResidentAssistantSettings(A, {}, SECRET)).toEqual({ state: 'not_configured' })
    expect(residentAssistantOn(A, null, SECRET)).toBe(true)
    expect(residentAssistantOn(A, { pay_by_zelle: {} }, null)).toBe(true)
  })

  it('a signed OFF and a signed ON are honoured', () => {
    const off = withResidentAssistantSettings({}, signResidentAssistantSettings(A, false, stamp, SECRET))
    const on = withResidentAssistantSettings({}, signResidentAssistantSettings(A, true, stamp, SECRET))
    expect(residentAssistantOn(A, off, SECRET)).toBe(false)
    expect(residentAssistantOn(A, on, SECRET)).toBe(true)
  })

  it('a forged value reads OFF (a board’s OFF can’t be undone by a resident write)', () => {
    const signed = signResidentAssistantSettings(A, false, stamp, SECRET)
    const forged = withResidentAssistantSettings({}, { ...signed, enabled: true })
    expect(readResidentAssistantSettings(A, forged, SECRET)).toEqual({ state: 'unverified' })
    expect(residentAssistantOn(A, forged, SECRET)).toBe(false)
    // Signed for another association does not carry over.
    const other = withResidentAssistantSettings({}, signResidentAssistantSettings('assoc-2', true, stamp, SECRET))
    expect(residentAssistantOn(A, other, SECRET)).toBe(false)
    // Present but unverifiable without the secret.
    expect(residentAssistantOn(A, withResidentAssistantSettings({}, signed), null)).toBe(false)
  })

  it('a write keeps every other compliance_settings key', () => {
    const next = withResidentAssistantSettings({ pay_by_zelle: { x: 1 }, resident_notifications: { y: 2 } }, signResidentAssistantSettings(A, true, stamp, SECRET))
    expect(Object.keys(next).sort()).toEqual(['pay_by_zelle', RESIDENT_ASSISTANT_KEY, 'resident_notifications'].sort())
  })
})

describe('hand-off links', () => {
  it('Ask the board opens a prefilled support request; ARC opens the ARC form', () => {
    expect(handoffHref({ action: 'ask_board', subject: 'Hot tub', description: 'Can I add one?' })).toBe(
      '/resident/tickets/new?subject=Hot+tub&description=Can+I+add+one%3F',
    )
    expect(handoffHref({ action: 'start_arc', subject: 'Paint door', description: 'Blue' })).toBe('/resident/arc/new?summary=Paint+door&scope=Blue')
  })

  it('dedupes to one per action in a fixed order', () => {
    expect(
      dedupeHandoffs([
        { action: 'start_arc', subject: 'a', description: '' },
        { action: 'ask_board', subject: 'b', description: '' },
        { action: 'ask_board', subject: 'c', description: '' },
      ]).map((h) => h.subject),
    ).toEqual(['c', 'a'])
  })
})
