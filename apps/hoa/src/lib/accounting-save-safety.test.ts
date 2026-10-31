import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Round 26: a failed budget save must never leave the budget empty or
// doubled, an approved reconciliation is locked, and board accounting
// actions never hand a database message back to the screen.

type Op = { table: string; verb: string }
type Res = { data?: unknown; error?: { code?: string; message?: string } | null }

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; verb: string }>,
  script: ((): unknown => ({ data: null, error: null })) as (op: { table: string; verb: string }) => unknown,
  report: vi.fn(),
}))

function makeClient() {
  return {
    from(table: string) {
      let verb = 'select'
      const chain: unknown = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === 'then') {
              return (resolve: (v: unknown) => void) => {
                const op = { table, verb }
                h.ops.push(op)
                resolve(h.script(op))
              }
            }
            return () => {
              if (prop === 'insert' || prop === 'update' || prop === 'delete') verb = prop
              if (prop === 'single' || prop === 'maybeSingle') {
                const op = { table, verb }
                h.ops.push(op)
                return Promise.resolve(h.script(op))
              }
              return chain
            }
          },
        },
      )
      return chain
    },
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
  }
}

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/accounting/guard', () => ({
  requireBoardOrAdminForAction: async () => ({ ok: true, role: 'board', orgId: 'org-1' }),
}))
vi.mock('@/lib/vendors', () => ({ getPrimaryAssociation: async () => ({ id: 'assoc-1' }) }))
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServerClient: async () => makeClient() }))
vi.mock('@homeowner-portal/observability/report', () => ({ reportError: h.report }))

import { saveBudgetLineItems } from '@/lib/budgets'
import { reconcileBankAccount } from '@/lib/bank-reconciliation'

const BUDGET = '11111111-1111-4111-8111-111111111111'
const ACCT = '22222222-2222-4222-8222-222222222222'
const BANK = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  h.ops.length = 0
  h.report.mockClear()
})

function budgetScript(opts: { insertErr?: boolean; deleteErr?: boolean }) {
  let deletes = 0
  h.script = (op: Op): Res => {
    if (op.table === 'budgets') return { data: { id: BUDGET, status: 'draft', association_id: 'assoc-1' }, error: null }
    if (op.verb === 'select') return { data: [{ id: 'old-1' }, { id: 'old-2' }], error: null }
    if (op.verb === 'insert') {
      return opts.insertErr
        ? { data: null, error: { code: '23503', message: 'secret db detail' } }
        : { data: [{ id: 'new-1' }], error: null }
    }
    if (op.verb === 'delete') {
      deletes += 1
      if (opts.deleteErr && deletes === 1) return { error: { code: '57014', message: 'secret db detail' } }
      return { error: null }
    }
    return { data: null, error: null }
  }
}

const INPUT = { budgetId: BUDGET, lineItems: [{ accountId: ACCT, amount: 100 }] }

describe('saveBudgetLineItems', () => {
  it('keeps the old lines when the insert fails', async () => {
    budgetScript({ insertErr: true })
    const r = await saveBudgetLineItems(INPUT)
    expect(r.ok).toBe(false)
    expect(JSON.stringify(r)).not.toContain('secret')
    expect(h.ops.some((o) => o.table === 'budget_line_items' && o.verb === 'delete')).toBe(false)
    expect(h.report).toHaveBeenCalledTimes(1)
  })

  it('removes the just-inserted rows when deleting the old ones fails', async () => {
    budgetScript({ deleteErr: true })
    const r = await saveBudgetLineItems(INPUT)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).not.toContain('secret')
      expect(r.error).toMatch(/earlier lines are unchanged/)
    }
    const deletes = h.ops.filter((o) => o.table === 'budget_line_items' && o.verb === 'delete')
    expect(deletes).toHaveLength(2) // the failed old-delete, then the rollback of the new row
  })

  it('inserts first, then deletes the old ids, on success', async () => {
    budgetScript({})
    const r = await saveBudgetLineItems(INPUT)
    expect(r.ok).toBe(true)
    const verbs = h.ops.filter((o) => o.table === 'budget_line_items').map((o) => o.verb)
    expect(verbs.indexOf('insert')).toBeLessThan(verbs.indexOf('delete'))
  })
})

describe('reconcileBankAccount', () => {
  function reconScript(existing: unknown) {
    h.script = (op: Op): Res => {
      if (op.table === 'bank_accounts') {
        return { data: { id: BANK, organization_id: 'org-1', association_id: 'assoc-1', fund_id: 'f1' }, error: null }
      }
      if (op.table === 'chart_of_accounts') return { data: { id: 'cash' }, error: null }
      if (op.table === 'journal_entries') return { data: [], error: null }
      if (op.table === 'bank_reconciliations') return { data: existing, error: null }
      return { data: null, error: null }
    }
  }

  it('refuses to overwrite an approved statement date', async () => {
    reconScript({ id: 'r1', approved_at: '2026-10-01T00:00:00Z' })
    const r = await reconcileBankAccount({ bankAccountId: BANK, statementDate: '2026-09-30', statementBalance: 5 })
    expect(r).toEqual({ ok: false, error: 'That statement date is already approved. Use a different date.' })
    expect(h.ops.some((o) => o.table === 'bank_reconciliations' && o.verb === 'update')).toBe(false)
  })

  it('still updates an unapproved row', async () => {
    reconScript({ id: 'r1', approved_at: null })
    const r = await reconcileBankAccount({ bankAccountId: BANK, statementDate: '2026-09-30', statementBalance: 5 })
    expect(r.ok).toBe(true)
  })
})

describe('board accounting copy ratchet', () => {
  it('never returns a database error message to the caller', () => {
    const files = ['bank-reconciliation.ts', 'budgets.ts', 'invoices.ts', 'periods.ts']
    const offenders: string[] = []
    for (const f of files) {
      readFileSync(join(__dirname, f), 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/\b\w*(error|err)\??\.message\b/i.test(line)) offenders.push(`${f}:${i + 1}`)
        })
    }
    expect(offenders).toEqual([])
  })
})
