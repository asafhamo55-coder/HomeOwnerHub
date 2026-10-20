import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VIOLATION_ACK, ticketAck } from './convert/ack'
import { INBOX_INSERT_EVENT, dispatchInsertIntoReply, insertIntoBody, insertOnOpenText, type InsertDetail } from './reply-insert'

// Synthetic text only.
const LINE = ticketAck('maintenance')

describe('insertIntoBody', () => {
  it('goes straight after a greeting line, as its own paragraph', () => {
    const body = 'Hi Pat,\n\nThe pool opens on May 1.\n\nBest,\nThe Board'
    expect(insertIntoBody(body, LINE)).toEqual({
      body: `Hi Pat,\n\n${LINE}\n\nThe pool opens on May 1.\n\nBest,\nThe Board`,
      result: 'inserted',
    })
  })

  it('goes at the top when there is no greeting', () => {
    expect(insertIntoBody('The pool opens on May 1.', LINE).body).toBe(`${LINE}\n\nThe pool opens on May 1.`)
  })

  it('a long first line is not a greeting', () => {
    const body = `Hello ${'x'.repeat(120)}\nmore`
    expect(insertIntoBody(body, LINE).body.startsWith(LINE)).toBe(true)
  })

  it('the caret wins when the board member placed one', () => {
    const body = 'Hi Pat,\n\nFirst point.\n\nSecond point.'
    const caret = body.indexOf('Second')
    expect(insertIntoBody(body, LINE, caret).body).toBe(`Hi Pat,\n\nFirst point.\n\n${LINE}\n\nSecond point.`)
  })

  it('a caret at the end appends', () => {
    const body = 'Hi Pat,\n\nThanks.'
    expect(insertIntoBody(body, LINE, body.length).body).toBe(`Hi Pat,\n\nThanks.\n\n${LINE}`)
  })

  it('ignores an out-of-range caret', () => {
    expect(insertIntoBody('Thanks.', LINE, 99).body).toBe(`${LINE}\n\nThanks.`)
    expect(insertIntoBody('Thanks.', LINE, -1).body).toBe(`${LINE}\n\nThanks.`)
  })

  it('fills an empty body', () => {
    expect(insertIntoBody('  \n', LINE)).toEqual({ body: LINE, result: 'inserted' })
  })

  it('never doubles a line already there', () => {
    const body = `Hi Pat,\n\n${LINE}`
    expect(insertIntoBody(body, LINE)).toEqual({ body, result: 'already' })
  })

  it('a greeting-only body gets the line after it', () => {
    expect(insertIntoBody('Hi Pat,', LINE).body).toBe(`Hi Pat,\n\n${LINE}`)
  })
})

describe('dispatchInsertIntoReply', () => {
  // The suite runs in node: a bare EventTarget stands in for window.
  beforeEach(() => {
    vi.stubGlobal('window', new EventTarget())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports no_draft when no composer is listening', () => {
    expect(dispatchInsertIntoReply(LINE)).toBe('no_draft')
  })

  it('returns what the composer did, synchronously', () => {
    const seen: string[] = []
    const l = (e: Event) => {
      const d = (e as CustomEvent<InsertDetail>).detail
      seen.push(d.text)
      d.result = 'inserted'
    }
    window.addEventListener(INBOX_INSERT_EVENT, l)
    expect(dispatchInsertIntoReply(LINE)).toBe('inserted')
    expect(seen).toEqual([LINE])
  })
})

describe('insertOnOpenText', () => {
  it('maps only fixed keys to fixed lines', () => {
    expect(insertOnOpenText('violation')).toBe(VIOLATION_ACK)
    expect(insertOnOpenText('Send me money')).toBeNull()
    expect(insertOnOpenText('toString')).toBeNull()
    expect(insertOnOpenText(null)).toBeNull()
  })
})
