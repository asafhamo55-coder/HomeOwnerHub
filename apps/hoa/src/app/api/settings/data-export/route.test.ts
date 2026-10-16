import { beforeEach, describe, expect, it, vi } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'

// ─── Mocks ───────────────────────────────────────────────────────────

let gate: { ok: true; role: 'admin' | 'board'; orgId: string } | { ok: false; error: string } = {
  ok: true,
  role: 'board',
  orgId: 'org-1',
}

vi.mock('@/lib/accounting/guard', () => ({
  BOARD_ONLY_DENIED: 'Only board members and admins can make this change.',
  requireBoardOrAdminForAction: vi.fn(async () => gate),
}))

/** Rows each table returns; anything unlisted is empty. */
let tableRows: Record<string, Array<Record<string, unknown>>> = {}
/** Tables whose query errors. */
let failingTables = new Set<string>()
let auditError: { message: string } | null = null
let user: { id: string } | null = { id: 'user-1' }

const fromCalls: string[] = []
const auditInserts: unknown[] = []
const selects: Record<string, string> = {}
const scopes: Record<string, Array<[string, unknown]>> = {}

function builder(table: string) {
  const b = {
    select(cols: string) {
      selects[table] = cols
      return b
    },
    eq(col: string, val: unknown) {
      ;(scopes[table] ??= []).push([col, val])
      return b
    },
    is() {
      return b
    },
    order() {
      return b
    },
    async range(from: number, to: number) {
      if (failingTables.has(table)) return { data: null, error: { message: 'boom' } }
      const rows = tableRows[table] ?? []
      return { data: rows.slice(from, to + 1), error: null }
    },
    async insert(row: unknown) {
      auditInserts.push(row)
      return { error: auditError }
    },
  }
  return b
}

const getSupabaseServerClient = vi.fn(async () => ({
  auth: { getUser: async () => ({ data: { user } }) },
  from: (table: string) => {
    fromCalls.push(table)
    return builder(table)
  },
}))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient }))

const { GET } = await import('./route')

async function body(res: Response): Promise<Uint8Array> {
  return new Uint8Array(await res.arrayBuffer())
}

beforeEach(() => {
  gate = { ok: true, role: 'board', orgId: 'org-1' }
  tableRows = {}
  failingTables = new Set()
  auditError = null
  user = { id: 'user-1' }
  fromCalls.length = 0
  auditInserts.length = 0
  for (const k of Object.keys(selects)) delete selects[k]
  for (const k of Object.keys(scopes)) delete scopes[k]
  getSupabaseServerClient.mockClear()
})

// ─── Tests ───────────────────────────────────────────────────────────

describe('GET /api/settings/data-export', () => {
  it('refuses a resident with 403 before touching the database', async () => {
    gate = { ok: false, error: 'Only board members and admins can make this change.' }
    const res = await GET()
    expect(res.status).toBe(403)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
    expect(fromCalls).toEqual([])
  })

  it('refuses when there is no signed-in user', async () => {
    user = null
    const res = await GET()
    expect(res.status).toBe(401)
    expect(fromCalls).toEqual([])
  })

  it('fails closed when the audit row cannot be written — no data is read', async () => {
    auditError = { message: 'rls' }
    const res = await GET()
    expect(res.status).toBe(500)
    expect(fromCalls).toEqual(['audit_log'])
  })

  it('writes exactly one audit row as the caller, then streams a zip of every CSV', async () => {
    tableRows = {
      units: [{ id: 'u1', unit_number: '4B', address_line1: '1 Main St' }],
      payments: [{ id: 'p1', amount: -25, payment_method: '=cmd' }],
    }
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toMatch(/^attachment; filename="association-data-\d{4}-\d{2}-\d{2}\.zip"$/)
    expect(res.headers.get('cache-control')).toBe('no-store')

    const files = unzipSync(await body(res))
    const names = Object.keys(files)
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
      'README.txt',
    ]) {
      expect(names).toContain(f)
    }

    // UTF-8 BOM so Excel reads accents (TextDecoder strips it on decode).
    expect(Array.from(files['units.csv']!.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf])
    const units = strFromU8(files['units.csv']!)
    expect(units.replace(/^﻿/, '').startsWith('id,unit_number,')).toBe(true)
    expect(units).toContain('u1,')
    const payments = strFromU8(files['payments.csv']!)
    expect(payments).toContain('-25')
    expect(payments).toContain("'=cmd")

    const readme = strFromU8(files['README.txt']!)
    expect(readme).toMatch(/units\.csv\s+1 row/)
    expect(readme).toMatch(/payments\.csv\s+1 row/)

    expect(auditInserts).toEqual([
      expect.objectContaining({ action: 'data_export', org_id: 'org-1', user_id: 'user-1' }),
    ])
  })

  it('selects only allowlisted columns, never *, and scopes every table to the org', async () => {
    const res = await GET()
    await body(res)
    const tables = Object.keys(selects)
    expect(tables.length).toBeGreaterThanOrEqual(12)
    for (const t of tables) {
      expect(selects[t], t).not.toContain('*')
      expect(scopes[t], t).toEqual([[expect.stringMatching(/^(org_id|organization_id)$/), 'org-1']])
    }
  })

  it('pages past 1000 rows instead of truncating', async () => {
    tableRows = {
      tickets: Array.from({ length: 2345 }, (_, i) => ({ id: `t${i}`, subject: 's' })),
    }
    const files = unzipSync(await body(await GET()))
    const lines = strFromU8(files['tickets.csv']!).trimEnd().split('\r\n')
    expect(lines.length).toBe(1 + 2345)
  })

  it('aborts the download instead of shipping a silently partial archive', async () => {
    failingTables = new Set(['payments'])
    const res = await GET()
    expect(res.status).toBe(200) // headers already sent; the stream itself errors
    await expect(res.arrayBuffer()).rejects.toThrow()
  })
})
