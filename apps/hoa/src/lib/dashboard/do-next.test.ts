import { describe, expect, it } from 'vitest'
import { FAILED, NA, ok, pickDoNext, type DoNextInput } from './do-next'

const quiet: DoNextInput = {
  complianceOverdue: ok(0),
  approvals: ok(0),
  residentReplies: ok(0),
  violationsOverdue: ok(0),
  homesBehind: ok(0),
  setup: ok(null),
}
const pick = (over: Partial<DoNextInput>) => pickDoNext({ ...quiet, ...over })

describe('pickDoNext', () => {
  it('says all caught up only when every read answered and nothing is waiting', () => {
    expect(pickDoNext(quiet).kind).toBe('caught_up')
  })

  it('follows the priority order', () => {
    let cur: DoNextInput = {
      complianceOverdue: ok(1),
      approvals: ok(3),
      residentReplies: ok(2),
      violationsOverdue: ok(4),
      homesBehind: ok(5),
      setup: ok({ title: 'Add homes', href: '/properties', cta: 'Add homes' }),
    }
    const keys: Array<[keyof DoNextInput, string]> = [
      ['complianceOverdue', 'compliance'],
      ['approvals', 'approvals'],
      ['residentReplies', 'replies'],
      ['violationsOverdue', 'violations'],
      ['homesBehind', 'dues'],
      ['setup', 'setup'],
    ]
    for (const [k, want] of keys) {
      const r = pickDoNext(cur)
      expect(r.kind === 'item' && r.key).toBe(want)
      cur = { ...cur, [k]: k === 'setup' ? ok(null) : ok(0) }
    }
    expect(pickDoNext(cur).kind).toBe('caught_up')
  })

  it('names the count and the action', () => {
    expect(pick({ approvals: ok(3) })).toMatchObject({
      kind: 'item',
      message: '3 requests are waiting for your approval.',
      cta: 'Review them',
      href: '#approvals',
    })
    expect(pick({ approvals: ok(1) })).toMatchObject({ message: '1 request is waiting for your approval.' })
    expect(pick({ homesBehind: ok(1) })).toMatchObject({ message: '1 home is behind on dues.' })
  })

  it('skips a failed source and still shows a real item from another', () => {
    expect(pick({ approvals: FAILED, residentReplies: ok(2) })).toMatchObject({ kind: 'item', key: 'replies' })
  })

  it('never says caught up when a read failed and nothing else is urgent', () => {
    for (const k of ['complianceOverdue', 'approvals', 'residentReplies', 'violationsOverdue', 'homesBehind', 'setup'] as const) {
      const r = pick({ [k]: FAILED })
      expect(r.kind).toBe('unsure')
      expect(r.message).toBe('We couldn’t check everything. Try again.')
    }
  })

  it('treats not-applicable sources as quiet, not as failures', () => {
    expect(pick({ setup: NA }).kind).toBe('caught_up')
  })

  it('shows the next setup step last', () => {
    const r = pick({ setup: ok({ title: 'Add your homes', href: '/properties', cta: 'Add homes' }) })
    expect(r).toMatchObject({ kind: 'item', key: 'setup', message: 'Next setup step: Add your homes.', href: '/properties' })
  })

  it('uses no em dashes', () => {
    expect(JSON.stringify(pick({ complianceOverdue: ok(2) }))).not.toContain('—')
  })
})
