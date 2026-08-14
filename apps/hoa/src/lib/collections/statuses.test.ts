import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COLLECTION_EVENT_TYPES,
  COLLECTION_STATUSES,
  collectionEventLabel,
  collectionStatusLabel,
  collectionStatusTone,
  isTerminal,
  statusImpliedBy,
  type CollectionEventType,
  type CollectionStatus,
} from './statuses'

/**
 * The drift this file exists to prevent, stated concretely:
 *
 * apps/hoa/src/lib/violation-statuses.ts declares `fined` and `dismissed`.
 * Neither is in hoa_violations_status_check, and no migration widens it,
 * so selecting either in the UI fails at the database. Nothing in the test
 * suite catches it, because nothing compares the TS list to the SQL.
 *
 * These tests read the actual migration and compare. If someone adds a
 * status to one side only, this fails.
 */
const MIGRATION = readFileSync(
  join(process.cwd(), 'migrations', '0047_collections.sql'),
  'utf8',
)

/** Pull the quoted values out of a named CHECK ... IN (...) block. */
function checkValues(constraintName: string): string[] {
  const start = MIGRATION.indexOf(`CONSTRAINT ${constraintName} CHECK`)
  if (start === -1) throw new Error(`constraint ${constraintName} not found in 0047`)
  const open = MIGRATION.indexOf('(', MIGRATION.indexOf('IN', start))
  let depth = 0
  let end = open
  for (let i = open; i < MIGRATION.length; i++) {
    if (MIGRATION[i] === '(') depth++
    else if (MIGRATION[i] === ')') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const body = MIGRATION.slice(open + 1, end)
  return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
}

describe('status list matches the database CHECK constraint', () => {
  it('COLLECTION_STATUSES is exactly collection_cases_status_check', () => {
    expect([...COLLECTION_STATUSES].sort()).toEqual(checkValues('collection_cases_status_check'))
  })

  it('COLLECTION_EVENT_TYPES is exactly collection_events_event_type_check', () => {
    expect([...COLLECTION_EVENT_TYPES].sort()).toEqual(
      checkValues('collection_events_event_type_check'),
    )
  })

  it('the migration really does constrain both columns', () => {
    // Guards the guard: if the CHECK were dropped, checkValues would throw
    // and the two tests above would fail loudly rather than pass vacuously.
    expect(() => checkValues('collection_cases_status_check')).not.toThrow()
    expect(() => checkValues('collection_events_event_type_check')).not.toThrow()
  })
})

describe('labels', () => {
  it('gives every status a label that is not the raw value', () => {
    for (const s of COLLECTION_STATUSES) {
      const label = collectionStatusLabel(s)
      expect(label.length).toBeGreaterThan(0)
      expect(label).not.toBe(s)
    }
  })

  it('gives every event type a label that is not the raw value', () => {
    for (const k of COLLECTION_EVENT_TYPES) {
      const label = collectionEventLabel(k)
      expect(label.length).toBeGreaterThan(0)
      expect(label).not.toBe(k)
    }
  })
})

describe('tone', () => {
  it('treats everything from the lien warning onward as destructive', () => {
    for (const s of [
      'lien_warning',
      'lien_letter',
      'board_authorized_suit',
      'attorney_presuit',
      'suit_filed',
    ] as const) {
      expect(collectionStatusTone(s)).toBe('destructive')
    }
  })

  it('does not shout about a closed case', () => {
    expect(collectionStatusTone('resolved')).toBe('neutral')
    expect(collectionStatusTone('written_off')).toBe('neutral')
  })

  it('escalates monitoring -> collection_letter', () => {
    expect(collectionStatusTone('monitoring')).toBe('neutral')
    expect(collectionStatusTone('collection_letter')).toBe('warning')
  })
})

describe('isTerminal', () => {
  it('is true for exactly the two closed states', () => {
    const terminal = COLLECTION_STATUSES.filter((s) => isTerminal(s))
    expect(terminal).toEqual(['resolved', 'written_off'])
  })
})

describe('statusImpliedBy', () => {
  it('maps a lien letter to the lien_letter stage', () => {
    expect(statusImpliedBy('lien_letter_sent')).toBe('lien_letter')
  })

  it('maps attorney handover and demand letter to attorney_presuit', () => {
    expect(statusImpliedBy('turned_over_to_attorney')).toBe('attorney_presuit')
    expect(statusImpliedBy('demand_letter_sent')).toBe('attorney_presuit')
  })

  it('implies nothing for a note or a payment', () => {
    // Collections does not always run forward — an account can be pulled
    // back from the attorney after a payment plan — so these must not
    // silently advance the stage.
    expect(statusImpliedBy('note')).toBeNull()
    expect(statusImpliedBy('payment_received')).toBeNull()
    expect(statusImpliedBy('payment_plan_agreed')).toBeNull()
  })

  it('only ever implies a real status', () => {
    for (const k of COLLECTION_EVENT_TYPES) {
      const implied = statusImpliedBy(k)
      if (implied !== null) {
        expect(COLLECTION_STATUSES).toContain(implied)
      }
    }
  })

  it('is exhaustive over every event type', () => {
    // No `default` in the switch, so an unhandled type is a compile error;
    // this catches the runtime shape too.
    for (const k of COLLECTION_EVENT_TYPES) {
      expect(() => statusImpliedBy(k as CollectionEventType)).not.toThrow()
    }
  })
})

describe('the ladder is ordered', () => {
  it('puts the terminal states last', () => {
    const firstTerminal = COLLECTION_STATUSES.findIndex((s) => isTerminal(s as CollectionStatus))
    const afterFirstTerminal = COLLECTION_STATUSES.slice(firstTerminal)
    expect(afterFirstTerminal.every((s) => isTerminal(s as CollectionStatus))).toBe(true)
  })

  it('starts at monitoring', () => {
    expect(COLLECTION_STATUSES[0]).toBe('monitoring')
  })
})
