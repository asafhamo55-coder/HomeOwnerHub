import { describe, expect, it } from 'vitest'
import { HelpClientEvent, helpLogLine, latencyBucket, lengthBucket, safeRouteTemplate, scoreBucket } from './help-events'

// Spec §11: no question text, search text, path id, name or email can
// appear in any help log line. The schema is the allowlist; these pin it.

const ALLOWED_KEYS: Record<string, string[]> = {
  'help.drawer_open': ['event', 'matchedCount', 'routeTemplate'],
  'help.search': ['event', 'queryLengthBucket', 'resultCount'],
  'help.article_view': ['articleId', 'event', 'source'],
  'help.take_me_there': ['articleId', 'event', 'source'],
  'help.feedback': ['articleId', 'askKind', 'event', 'helpful'],
  'help.show_me': ['articleId', 'event', 'found'],
}

describe('trackHelp field allowlist', () => {
  it('each client event has exactly its allowlisted fields, none of them free text', () => {
    for (const option of HelpClientEvent.options) {
      const keys = Object.keys(option.shape).sort()
      const name = (option.shape.event as unknown as { value: string }).value
      expect(keys, name).toEqual(ALLOWED_KEYS[name])
    }
    expect(HelpClientEvent.options).toHaveLength(Object.keys(ALLOWED_KEYS).length)
  })

  it('strips unknown keys and the log line carries the server role', () => {
    const e = HelpClientEvent.parse({ event: 'help.search', resultCount: 2, queryLengthBucket: '1-10', query: 'jane@example.test' })
    expect(JSON.parse(helpLogLine(e, 'board'))).toEqual({ type: 'help_event', event: 'help.search', resultCount: 2, queryLengthBucket: '1-10', role: 'board' })
  })

  it('only known route templates pass; a concrete path never does', () => {
    expect(safeRouteTemplate('/violations/[id]')).toBe('/violations/[id]')
    expect(safeRouteTemplate('/violations/2f1a')).toBeNull()
    expect(safeRouteTemplate(undefined)).toBeNull()
  })

  it('buckets', () => {
    expect([lengthBucket(3), lengthBucket(11), lengthBucket(80), lengthBucket(81)]).toEqual(['1-10', '11-30', '31-80', '81+'])
    expect([scoreBucket(0), scoreBucket(0.2), scoreBucket(0.6), scoreBucket(1)]).toEqual(['0', '0-0.25', '0.5-0.75', '0.75-1'])
    expect([latencyBucket(10), latencyBucket(1500), latencyBucket(7999), latencyBucket(9000)]).toEqual(['<1s', '1-3s', '3-8s', '8s+'])
  })
})
