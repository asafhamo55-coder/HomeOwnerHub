import { describe, expect, it, vi } from 'vitest'

vi.mock('@homeowner-portal/db', () => ({ createAdminClient: vi.fn() }))

import {
  ACTION_LABELS,
  ACTIVITY_EXPORT_ACTION,
  actionArea,
  actionDetail,
  actionLabel,
  entityHref,
} from './labels'
import {
  activityCsvRow,
  activityView,
  actorName,
  applyActivityFilters,
  buildActorDirectory,
  localStamp,
  parseActivityFilters,
  type AuditQuery,
} from './queries'

const ORG = 'org-1'
const UUID = '11111111-1111-4111-8111-111111111111'
const BOARD = '22222222-2222-4222-8222-222222222222'
const RESIDENT = '33333333-3333-4333-8333-333333333333'

function recorder() {
  const ops: Array<[string, ...unknown[]]> = []
  const b: Record<string, unknown> = {}
  for (const op of ['select', 'eq', 'gte', 'lt', 'or', 'not', 'order', 'range']) {
    b[op] = (...args: unknown[]) => {
      ops.push([op, ...args])
      return b
    }
  }
  return { q: b as unknown as AuditQuery, ops }
}

describe('activity labels', () => {
  it('labels known actions in plain language and shows unknown ones raw', () => {
    expect(actionLabel('statutory_roster_export')).toBe('Exported the owner roster')
    expect(actionLabel('something.new')).toBe('something.new')
    expect(actionArea('something.new')).toBe('other')
  })

  it('labels the AI usage ledger by prefix', () => {
    expect(actionArea('ai.usage.meeting_summary')).toBe('ai')
    expect(actionLabel('ai.usage.meeting_summary')).toBe('Used an AI feature (meeting summary)')
  })

  it('labels its own export', () => {
    expect(ACTION_LABELS[ACTIVITY_EXPORT_ACTION]?.area).toBe('records')
  })

  it('links only entities with a page, and only real ids', () => {
    expect(entityHref('hoa_violation', UUID)).toBe(`/violations/${UUID}`)
    expect(entityHref('vendor', 'not-a-uuid')).toBeNull()
    expect(entityHref('org', UUID)).toBeNull()
    expect(entityHref(null, UUID)).toBeNull()
  })

  it('reads metadata only through the per-action allowlist — never free text', () => {
    // vendor.rejected keeps the board's typed reason; it must not surface.
    expect(actionDetail('vendor.rejected', { reason: 'Owner Jane Doe complained' })).toBeNull()
    // eviction reminders keep a tenant name and address in metadata.
    expect(actionDetail('eviction_filing_eligible', { tenant_name: 'Jane', property_address: '1 Main' })).toBeNull()
    // The override keeps a summary; only the enum status is read.
    expect(
      actionDetail('vendor.compliance.manual_override', { new_status: 'red', summary: 'call Bob at 555-1234' }),
    ).toBe('Set to not compliant')
    expect(actionDetail('statutory_roster_export', { kind: 'voters', format: 'csv', counts: { owners: 3 } })).toBe(
      'Voter list · CSV',
    )
    expect(actionDetail('statutory_roster_export', { kind: '<script>' })).toBeNull()
    expect(actionDetail(ACTIVITY_EXPORT_ACTION, { rows: 12 })).toBe('12 rows')
    expect(actionDetail('properties_import', null)).toBeNull()
    // BL-144: counts only.
    expect(actionLabel('bank_import.committed')).toBe('Imported a bank statement')
    expect(actionDetail('bank_import.committed', { inserted: 12, duplicates: 3, format: 'csv' })).toBe('12 transactions added · 3 already in')
    expect(actionDetail('bank_import.committed', { inserted: 1, duplicates: 0 })).toBe('1 transaction added')
    expect(actionDetail('bank_import.committed', { inserted: 'x' })).toBeNull()
    // BL-140: a known reason code only; anything else shows nothing.
    expect(actionLabel('violation.hearing_cancelled_cured')).toBe('Cancelled a fine hearing after a cure')
    expect(actionDetail('violation.hearing_cancelled_cured', { reason: 'cured_before_hearing', hearing_id: 'h1' })).toBe('Fixed before the hearing')
    expect(actionDetail('violation.hearing_cancelled_cured', { reason: '<b>free text</b>' })).toBeNull()
  })
})

describe('activity filters', () => {
  it('drops bad values and names them', () => {
    const { filters, invalid } = parseActivityFilters({ person: 'x', area: 'nope', from: '2026-02-30', to: '2026-10-01' })
    expect(filters).toEqual({ person: null, area: null, from: null, to: '2026-10-01' })
    expect(invalid.sort()).toEqual(['area', 'from', 'person'])
  })

  it('refuses a start after the end', () => {
    const { filters, invalid } = parseActivityFilters({ from: '2026-10-05', to: '2026-10-01' })
    expect(filters.to).toBeNull()
    expect(invalid).toEqual(['to'])
  })

  it('pins the org and leaves the AI ledger out by default', () => {
    const { q, ops } = recorder()
    applyActivityFilters(q, ORG, { person: null, area: null, from: null, to: null }, 'America/New_York')
    expect(ops[0]).toEqual(['eq', 'org_id', ORG])
    expect(ops).toContainEqual(['not', 'action', 'in', '("inbox_draft_metrics")'])
    expect(ops).toContainEqual(['not', 'action', 'like', 'ai.usage.%'])
  })

  it('filters by person, area and the association’s days', () => {
    const { q, ops } = recorder()
    applyActivityFilters(
      q,
      ORG,
      { person: BOARD, area: 'records', from: '2026-10-01', to: '2026-10-02' },
      'America/New_York',
    )
    expect(ops).toContainEqual(['eq', 'user_id', BOARD])
    const or = ops.find((o) => o[0] === 'or')?.[1] as string
    expect(or).toContain('"statutory_roster_export"')
    expect(or).toContain(`"${ACTIVITY_EXPORT_ACTION}"`)
    // Midnight in New York (EDT, UTC-4) through the end of the 2nd.
    expect(ops).toContainEqual(['gte', 'created_at', '2026-10-01T04:00:00.000Z'])
    expect(ops).toContainEqual(['lt', 'created_at', '2026-10-03T04:00:00.000Z'])
    expect(ops.some((o) => o[0] === 'not')).toBe(false)
  })

  it('shows the AI ledger only when asked', () => {
    const { q, ops } = recorder()
    applyActivityFilters(q, ORG, { person: null, area: 'ai', from: null, to: null }, 'UTC')
    const or = ops.find((o) => o[0] === 'or')?.[1] as string
    expect(or).toContain('action.like.ai.usage.*')
  })
})

describe('actors', () => {
  const dir = buildActorDirectory([
    { user_id: BOARD, role: 'board', profile: { full_name: 'Pat Board' } },
    { user_id: 'admin-2', role: 'admin', profile: { full_name: '  ' } },
    { user_id: RESIDENT, role: 'resident', profile: { full_name: 'Rita Resident' } },
  ])

  it('names board members only', () => {
    expect(actorName(BOARD, dir)).toBe('Pat Board')
    expect(actorName('admin-2', dir)).toBe('Board admin')
    expect(actorName(RESIDENT, dir)).toBe('A resident')
    expect(actorName('gone', dir)).toBe('Former member')
    expect(actorName(null, dir)).toBe('System')
    expect(JSON.stringify([...dir.board.values()])).not.toContain('Rita')
  })

  it('builds a CSV row with no metadata JSON and no resident name', () => {
    const row = activityCsvRow(
      activityView(
        {
          id: 'a1',
          user_id: RESIDENT,
          action: 'vendor.rejected',
          entity_type: 'vendor',
          entity_id: UUID,
          metadata: { reason: 'secret reason' },
          created_at: '2026-10-20T18:05:00Z',
        },
        dir,
      ),
      'America/New_York',
    )
    expect(row).toEqual([
      '2026-10-20 14:05',
      'A resident',
      'Rejected a vendor',
      'Vendors',
      '',
      'Vendor',
      `/vendors/${UUID}`,
    ])
    expect(row.join('|')).not.toMatch(/secret|Rita|\{/)
  })

  it('formats a missing time as empty', () => {
    expect(localStamp(null, 'UTC')).toBe('')
  })
})
