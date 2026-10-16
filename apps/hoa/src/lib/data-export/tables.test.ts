import { describe, expect, it } from 'vitest'
import { EXPORT_TABLES, NEVER_EXPORTED_TABLES } from './tables'

// BL-011 acceptance: "A test asserts the column allowlist excludes secrets."
// The export is PII in bulk; these checks are the line it may not cross.

const SECRET_COLUMN = /token|secret|key|password|hash/i

describe('data export allowlist', () => {
  it('never selects a column that looks like a secret', () => {
    const offenders = EXPORT_TABLES.flatMap((t) =>
      t.columns.filter((c) => SECRET_COLUMN.test(c)).map((c) => `${t.table}.${c}`),
    )
    expect(offenders).toEqual([])
  })

  it('never selects * or a computed/embedded column', () => {
    for (const t of EXPORT_TABLES) {
      expect(t.columns.length, t.table).toBeGreaterThan(0)
      for (const c of t.columns) expect(c, `${t.table}.${c}`).toMatch(/^[a-z_][a-z0-9_]*$/)
    }
  })

  it('does not export Plaid, push, mailbox-secret or other credential tables', () => {
    const exported = new Set<string>(EXPORT_TABLES.map((t) => t.table))
    for (const t of [
      'plaid_items',
      'push_subscriptions',
      'mailbox_account_secrets',
      'mailbox_accounts',
      'payment_methods',
      'audit_log',
      ...NEVER_EXPORTED_TABLES,
    ]) {
      expect(exported.has(t), t).toBe(false)
    }
    for (const t of exported) expect(t, t).not.toMatch(/plaid|push|secret|token/i)
  })

  it('does not export settings blobs that carry signed values (associations.compliance_settings)', () => {
    const cols = EXPORT_TABLES.flatMap((t) => t.columns as readonly string[])
    expect(cols).not.toContain('compliance_settings')
  })

  it('covers every domain in the BL-011 spec, one uniquely named CSV each', () => {
    const files = EXPORT_TABLES.map((t) => t.file)
    expect(new Set(files).size).toBe(files.length)
    for (const f of [
      'units.csv',
      'owners.csv',
      'residents.csv',
      'assessments.csv',
      'payments.csv',
      'journal_entries.csv',
      'violations.csv',
      'arc_requests.csv',
      'tickets.csv',
      'documents.csv',
      'vendors.csv',
      'meetings.csv',
    ]) {
      expect(files).toContain(f)
    }
    for (const f of files) expect(f).toMatch(/^[a-z_]+\.csv$/)
  })

  it('scopes every table to the org and orders by id for stable paging', () => {
    for (const t of EXPORT_TABLES) {
      expect(['org_id', 'organization_id'], t.table).toContain(t.orgColumn)
      expect(t.columns as readonly string[], t.table).toContain('id')
    }
  })
})
