import { describe, expect, it } from 'vitest'
import {
  lateFeesState,
  mailboxState,
  paymentsState,
  professionalsState,
  receiptsState,
  remindersState,
  setupProgress,
} from './setup-hub'

const bad = { ok: false } as const

describe('setup hub state mapping', () => {
  it('payments', () => {
    expect(paymentsState({ ok: true, data: { read: { state: 'configured' } } })).toBe('set_up')
    expect(paymentsState({ ok: true, data: { read: { state: 'not_configured' } } })).toBe('not_set_up')
    expect(paymentsState({ ok: true, data: { read: { state: 'unverified' } } })).toBe('needs_attention')
    expect(paymentsState(bad)).toBe('unknown')
  })
  it('late fees', () => {
    expect(lateFeesState({ ok: true, data: { state: 'saved', policy: { enabled: true } } })).toBe('set_up')
    expect(lateFeesState({ ok: true, data: { state: 'saved', policy: { enabled: false } } })).toBe('not_set_up')
    expect(lateFeesState({ ok: true, data: { state: 'none', policy: { enabled: false } } })).toBe('not_set_up')
    expect(lateFeesState({ ok: true, data: { state: 'unverified', policy: { enabled: true } } })).toBe('needs_attention')
    expect(lateFeesState(bad)).toBe('unknown')
  })
  it('reminders', () => {
    expect(remindersState({ ok: true, data: { state: 'configured', settings: { enabled: true } } })).toBe('set_up')
    expect(remindersState({ ok: true, data: { state: 'configured', settings: { enabled: false } } })).toBe('not_set_up')
    expect(remindersState({ ok: true, data: { state: 'unverified', settings: { enabled: true } } })).toBe('needs_attention')
    expect(remindersState(bad)).toBe('unknown')
  })
  it('receipts', () => {
    expect(receiptsState({ ok: true, data: { state: 'configured', on: true } })).toBe('set_up')
    expect(receiptsState({ ok: true, data: { state: 'not_configured', on: false } })).toBe('not_set_up')
    expect(receiptsState({ ok: true, data: { state: 'unverified', on: false } })).toBe('needs_attention')
    expect(receiptsState(bad)).toBe('unknown')
  })
  it('mailbox', () => {
    expect(mailboxState({ ok: true, data: null })).toBe('not_set_up')
    expect(mailboxState({ ok: true, data: { syncStatus: 'ok', backfillStatus: 'done' } })).toBe('set_up')
    expect(mailboxState({ ok: true, data: { syncStatus: 'auth_failed', backfillStatus: 'done' } })).toBe('needs_attention')
    expect(mailboxState({ ok: true, data: { syncStatus: 'ok', backfillStatus: 'failed' } })).toBe('needs_attention')
    expect(mailboxState(bad)).toBe('unknown')
  })
  it('professionals', () => {
    expect(professionalsState({ ok: true, data: [{ title: 'treasurer' }] })).toBe('set_up')
    expect(professionalsState({ ok: true, data: [{ title: 'president' }, { title: null }] })).toBe('not_set_up')
    expect(professionalsState({ ok: true, data: [] })).toBe('not_set_up')
    expect(professionalsState(bad)).toBe('unknown')
  })
})

describe('setupProgress', () => {
  it('counts only set up cards', () => {
    expect(setupProgress(['set_up', 'not_set_up', 'unknown', 'needs_attention', 'set_up', 'set_up'])).toEqual({
      done: 3,
      total: 6,
      label: '3 of 6 set up',
    })
  })
  it('handles none', () => {
    expect(setupProgress([]).label).toBe('0 of 0 set up')
  })
})
