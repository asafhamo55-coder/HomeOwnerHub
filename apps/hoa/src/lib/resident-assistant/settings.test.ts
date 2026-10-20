import { describe, expect, it } from 'vitest'
import {
  RESIDENT_ASSISTANT_KEY,
  readResidentAssistantSettings,
  residentAssistantOn,
  signResidentAssistantSettings,
  withResidentAssistantSettings,
} from './settings'
import { buildHandoff, dedupeHandoffs, handoffHref, handoffTopic } from './handoff'

const SECRET = 'test-secret'
const A = 'assoc-1'
const stamp = { updatedAt: '2026-10-19T00:00:00.000Z', updatedBy: 'board-1' }

describe('resident assistant setting (signed, fail closed)', () => {
  it('missing → OFF (SEC-002: deleting the key must not undo a board’s OFF)', () => {
    expect(readResidentAssistantSettings(A, {}, SECRET)).toEqual({ state: 'not_configured' })
    expect(residentAssistantOn(A, null, SECRET)).toBe(false)
    expect(residentAssistantOn(A, undefined, SECRET)).toBe(false)
    expect(residentAssistantOn(A, {}, SECRET)).toBe(false)
    expect(residentAssistantOn(A, { pay_by_zelle: {} }, null)).toBe(false)
    expect(residentAssistantOn(A, { [RESIDENT_ASSISTANT_KEY]: null }, SECRET)).toBe(false)
    // A board OFF, then the key deleted by a resident-session write: still OFF.
    const off = withResidentAssistantSettings({ pay_by_zelle: {} }, signResidentAssistantSettings(A, false, stamp, SECRET))
    const { [RESIDENT_ASSISTANT_KEY]: _gone, ...deleted } = off
    expect(residentAssistantOn(A, deleted, SECRET)).toBe(false)
  })

  it('invalid shapes → OFF', () => {
    for (const v of [true, 'on', 1, [], { enabled: true }, { enabled: 'true', updated_at: 'x', updated_by: null, sig: 'ab' }]) {
      expect(residentAssistantOn(A, { [RESIDENT_ASSISTANT_KEY]: v }, SECRET)).toBe(false)
    }
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
      '/resident/tickets/new?subject=Hot+tub&description=Can+I+add+one%3F&from=assistant',
    )
    expect(handoffHref({ action: 'start_arc', subject: 'Paint door', description: 'Blue' })).toBe('/resident/arc/new?summary=Paint+door&scope=Blue&from=assistant')
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

describe('hand-off text (SEC-004)', () => {
  it('the topic loses links, URLs, markup and is capped at 60', () => {
    expect(handoffTopic('Fence height')).toBe('Fence height')
    expect(handoffTopic('see [the form](https://evil.example/x) at www.evil.test or evil.example/pay')).toBe('see the form at or')
    expect(handoffTopic('javascript:alert(1) <b>hi</b>')).toBe('b hi /b')
    expect(handoffTopic(42)).toBe('')
    const long = handoffTopic('word '.repeat(40))
    expect(long.length).toBeLessThanOrEqual(60)
    expect(long.endsWith(' ')).toBe(false)
  })

  it('subject and description come from the template and the resident’s own message only', () => {
    expect(buildHandoff('ask_board', 'hot tub', 'Can I add a hot tub?')).toEqual({
      action: 'ask_board',
      subject: 'Question for the board: hot tub',
      description: 'What I asked the resident assistant:\nCan I add a hot tub?',
    })
    expect(buildHandoff('start_arc', '', 'Paint my door blue')).toEqual({
      action: 'start_arc',
      subject: 'Exterior change to my home',
      description: 'What I asked the resident assistant:\nPaint my door blue\n\nDescribe the change, materials and colors:',
    })
    const h = buildHandoff('ask_board', 'x', 'q'.repeat(5000))
    expect(h.description.length).toBeLessThanOrEqual(1500)
  })
})
