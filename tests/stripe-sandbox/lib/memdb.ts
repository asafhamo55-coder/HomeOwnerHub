// In-memory WebhookDb for the BL-103 sandbox suite.
//
// It models exactly what packages/billing/src/webhook.ts touches:
//   - from('orgs' | 'eviction_cases').update(patch).eq(...)  (pre-M1 path)
//   - from(table).select(cols).eq(...).order(...).limit(n), where a column
//     may be a JSON path (`metadata->>sub_id`), and
//     from('audit_log').insert(row)  (customer.subscription.updated and
//     invoice.payment_failed, both paths)
//   - the three stripe_webhook_* functions from migrations/0064_m1_batch.sql
//     (M1 path), ported statement for statement: event-id dedupe ledger,
//     per-subscription rows, and stripe_billing_recompute.
//
// planCheck reproduces orgs_plan_check: 'pre0064' is migration 0000's list
// (no 'monthly' / 'annual'), 'post0064' is 0064's. A violating write fails
// with 23514 and changes nothing, like Postgres.
//
// memdb.test.ts runs the same scenarios as the real-Postgres integration
// test (tests/integration/security/m1-batch.test.ts, section F), so the
// model and the SQL are pinned to the same expected outcomes.

import type { WebhookDb } from '../../../packages/billing/src/webhook'

export interface MemOrg {
  id: string
  plan: string
  stripe_customer_id: string | null
  stripe_sub_id: string | null
  doors_count: number | null
}

export interface MemAuditRow {
  org_id: string | null
  user_id: string | null
  action: string
  entity_type: string | null
  metadata: Record<string, unknown>
  /** Insertion order stands in for created_at (now()). */
  created_at: number
}

export interface MemCase {
  id: string
  org_id: string
  stripe_payment_id: string | null
}

interface SubRow {
  sub_id: string
  org_id: string | null
  customer_id: string | null
  plan: string | null
  started_at: number | null
  deleted_at: number | null
}

interface State {
  orgs: Map<string, MemOrg>
  cases: Map<string, MemCase>
  subs: Map<string, SubRow>
  events: Map<string, { type: string; outcome: string }>
  audit: MemAuditRow[]
}

const PRE_0064_PLANS = ['free', 'starter', 'standard', 'pro', 'enterprise', 'per_case', 'unlimited']
const POST_0064_PLANS = [...PRE_0064_PLANS, 'monthly', 'annual']

class CheckViolation extends Error {
  code = '23514'
}

function clone(s: State): State {
  return {
    orgs: new Map([...s.orgs].map(([k, v]) => [k, { ...v }])),
    cases: new Map([...s.cases].map(([k, v]) => [k, { ...v }])),
    subs: new Map([...s.subs].map(([k, v]) => [k, { ...v }])),
    events: new Map([...s.events].map(([k, v]) => [k, { ...v }])),
    audit: s.audit.map((r) => structuredClone(r)),
  }
}

type SelectResult = { data: Array<Record<string, unknown>> | null; error: { code?: string } | null }

/** A column, or PostgREST's `col->>key` (text, so numbers compare as strings). */
function field(row: Record<string, unknown>, col: string): string | null {
  const m = /^(\w+)->>(\w+)$/.exec(col)
  const v = m ? (row[m[1]!] as Record<string, unknown> | null | undefined)?.[m[2]!] : row[col]
  return v == null ? null : String(v)
}

const minTs = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : Math.min(a, b))

export function createMemDb(opts: { planCheck?: 'pre0064' | 'post0064' } = {}) {
  const allowedPlans = new Set(opts.planCheck === 'pre0064' ? PRE_0064_PLANS : POST_0064_PLANS)
  let state: State = { orgs: new Map(), cases: new Map(), subs: new Map(), events: new Map(), audit: [] }
  let writes = 0
  let failNext: string | null = null

  function setOrg(org: MemOrg, patch: Partial<MemOrg>) {
    const next = { ...org, ...patch }
    if (!allowedPlans.has(next.plan)) throw new CheckViolation('orgs_plan_check')
    Object.assign(org, next)
  }

  function recompute(s: State, orgId: string): string {
    const org = s.orgs.get(orgId)
    if (!org) return 'org_not_found'
    const live = [...s.subs.values()]
      .filter((r) => r.org_id === orgId && r.deleted_at == null && r.started_at != null)
      .sort((a, b) => b.started_at! - a.started_at! || (a.sub_id < b.sub_id ? 1 : a.sub_id > b.sub_id ? -1 : 0))
    const cur = live[0]
    if (cur) {
      setOrg(org, {
        stripe_sub_id: cur.sub_id,
        stripe_customer_id: cur.customer_id ?? org.stripe_customer_id,
        plan: cur.plan ?? org.plan,
      })
      return `current:${cur.sub_id}`
    }
    if (org.stripe_sub_id != null && s.subs.get(org.stripe_sub_id)?.deleted_at != null) {
      setOrg(org, { plan: 'free', stripe_sub_id: null })
      return 'free'
    }
    return 'unchanged'
  }

  const rpcs = {
    stripe_webhook_checkout_subscription(s: State, a: Record<string, unknown>): string {
      const eventId = a.p_event_id as string
      if (s.events.has(eventId)) return 'duplicate'
      const orgId = a.p_org_id as string
      const subId = (a.p_sub_id as string | null) ?? null
      const created = Date.parse(a.p_event_created as string)
      let outcome: string
      if (!s.orgs.has(orgId)) outcome = 'ignored_org_not_found'
      else if (subId == null) outcome = 'ignored_subscription_missing'
      else {
        const prev = s.subs.get(subId)
        const customer = (a.p_customer_id as string | null) ?? null
        const plan = (a.p_plan as string | null) ?? null
        s.subs.set(
          subId,
          prev
            ? {
                ...prev,
                org_id: prev.org_id ?? orgId,
                customer_id: customer ?? prev.customer_id,
                plan: plan ?? prev.plan,
                started_at: minTs(prev.started_at, created),
              }
            : { sub_id: subId, org_id: orgId, customer_id: customer, plan, started_at: created, deleted_at: null },
        )
        const dead = s.subs.get(subId)!.deleted_at != null
        recompute(s, orgId)
        const now = s.orgs.get(orgId)!.stripe_sub_id
        outcome = now === subId ? 'subscription_started' : dead ? 'ignored_subscription_deleted' : 'ignored_not_current_subscription'
      }
      s.events.set(eventId, { type: 'checkout.session.completed', outcome })
      return outcome
    },

    stripe_webhook_checkout_payment(s: State, a: Record<string, unknown>): string {
      const eventId = a.p_event_id as string
      if (s.events.has(eventId)) return 'duplicate'
      const org = s.orgs.get(a.p_org_id as string)
      let outcome: string
      if (!org) outcome = 'ignored_org_not_found'
      else {
        const customer = (a.p_customer_id as string | null) ?? null
        if (customer != null) setOrg(org, { stripe_customer_id: customer })
        outcome = 'one_time_payment'
        const caseId = (a.p_case_id as string | null) ?? null
        const pi = (a.p_payment_intent_id as string | null) ?? null
        if (caseId != null && pi != null) {
          const c = s.cases.get(caseId)
          if (c && c.org_id === org.id) {
            c.stripe_payment_id = pi
            outcome = 'case_payment_recorded'
          } else outcome = 'ignored_case_not_found'
        }
      }
      s.events.set(eventId, { type: 'checkout.session.completed', outcome })
      return outcome
    },

    stripe_webhook_subscription_deleted(s: State, a: Record<string, unknown>): string {
      const eventId = a.p_event_id as string
      if (s.events.has(eventId)) return 'duplicate'
      const subId = a.p_sub_id as string
      const created = Date.parse(a.p_event_created as string)
      let orgId = s.subs.get(subId)?.org_id ?? null
      if (orgId == null) {
        orgId = [...s.orgs.values()].filter((o) => o.stripe_sub_id === subId).map((o) => o.id).sort()[0] ?? null
      }
      const before = orgId ? s.orgs.get(orgId)?.stripe_sub_id ?? null : null
      const prev = s.subs.get(subId)
      s.subs.set(
        subId,
        prev
          ? { ...prev, org_id: prev.org_id ?? orgId, deleted_at: minTs(prev.deleted_at, created) }
          : { sub_id: subId, org_id: orgId, customer_id: null, plan: null, started_at: null, deleted_at: created },
      )
      let after: string | null = null
      if (orgId) {
        recompute(s, orgId)
        after = s.orgs.get(orgId)?.stripe_sub_id ?? null
      }
      const outcome = orgId != null && before === subId && after !== subId ? 'subscription_deleted' : 'ignored_not_current_subscription'
      s.events.set(eventId, { type: 'customer.subscription.deleted', outcome })
      return outcome
    },
  }

  function takeInjectedFailure(): { code: string } | null {
    if (failNext == null) return null
    const code = failNext
    failNext = null
    return { code }
  }

  const db: WebhookDb = {
    from(table) {
      return {
        update(patch) {
          const filters: Array<[string, string]> = []
          const builder = {
            eq(col: string, value: string) {
              filters.push([col, value])
              return builder
            },
            then<T1 = { error: { code?: string } | null }, T2 = never>(
              onfulfilled?: ((v: { error: { code?: string } | null }) => T1 | PromiseLike<T1>) | null,
              onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
            ): PromiseLike<T1 | T2> {
              return Promise.resolve(runUpdate(table, patch, filters)).then(onfulfilled, onrejected)
            },
          }
          return builder
        },
        select() {
          const filters: Array<[string, string]> = []
          let order: { col: string; asc: boolean } | null = null
          let limit = Infinity
          const q = {
            eq(col: string, value: string) {
              filters.push([col, value])
              return q
            },
            order(col: string, o: { ascending: boolean }) {
              order = { col, asc: o.ascending }
              return q
            },
            limit(n: number) {
              limit = n
              return q
            },
            then<T1 = SelectResult, T2 = never>(
              onfulfilled?: ((v: SelectResult) => T1 | PromiseLike<T1>) | null,
              onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
            ): PromiseLike<T1 | T2> {
              return Promise.resolve(runSelect(table, filters, order, limit)).then(onfulfilled, onrejected)
            },
          }
          return q
        },
        insert(row) {
          return Promise.resolve(runInsert(table, row))
        },
      }
    },
    rpc(fn, args) {
      return Promise.resolve(runRpc(fn, args as unknown as Record<string, unknown>))
    },
  }

  function rowsOf(s: State, table: string): Array<Record<string, unknown>> {
    if (table === 'orgs') return [...s.orgs.values()] as unknown as Array<Record<string, unknown>>
    if (table === 'eviction_cases') return [...s.cases.values()] as unknown as Array<Record<string, unknown>>
    return s.audit as unknown as Array<Record<string, unknown>>
  }

  function runSelect(table: string, filters: Array<[string, string]>, order: { col: string; asc: boolean } | null, limit: number): SelectResult {
    const injected = takeInjectedFailure()
    if (injected) return { data: null, error: injected }
    let rows = rowsOf(state, table).filter((r) => filters.every(([c, v]) => field(r, c) === v))
    if (order) {
      const { col, asc } = order
      rows = [...rows].sort((a, b) => {
        const x = field(a, col) ?? ''
        const y = field(b, col) ?? ''
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1)
      })
    }
    return { data: rows.slice(0, limit).map((r) => structuredClone(r)), error: null }
  }

  function runInsert(table: string, row: Record<string, unknown>) {
    const injected = takeInjectedFailure()
    if (injected) return { error: injected }
    // Only audit_log is ever inserted into; anything else is a bug in the handler.
    if (table !== 'audit_log') return { error: { code: '42501' } }
    state.audit.push({
      org_id: (row.org_id as string | null) ?? null,
      user_id: (row.user_id as string | null) ?? null,
      action: row.action as string,
      entity_type: (row.entity_type as string | null) ?? null,
      metadata: structuredClone((row.metadata as Record<string, unknown>) ?? {}),
      created_at: state.audit.length,
    })
    writes++
    return { error: null }
  }

  function runUpdate(table: 'orgs' | 'eviction_cases' | 'audit_log', patch: Record<string, unknown>, filters: Array<[string, string]>) {
    const injected = takeInjectedFailure()
    if (injected) return { error: injected }
    const next = clone(state)
    if (table === 'audit_log') return { error: { code: '42501' } } // append-only
    const rows = rowsOf(next, table)
    let matched = 0
    try {
      for (const row of rows) {
        if (!filters.every(([c, v]) => field(row, c) === v)) continue
        if (table === 'orgs') setOrg(row as unknown as MemOrg, patch as Partial<MemOrg>)
        else Object.assign(row, patch)
        matched++
      }
    } catch (e) {
      // One UPDATE statement is atomic: nothing it touched survives.
      return { error: { code: e instanceof CheckViolation ? e.code : 'XX000' } }
    }
    state = next
    writes += matched
    return { error: null }
  }

  function runRpc(fn: string, args: Record<string, unknown>) {
    const injected = takeInjectedFailure()
    if (injected) return { data: null, error: injected }
    const impl = rpcs[fn as keyof typeof rpcs]
    if (!impl) return { data: null, error: { code: '42883' } }
    // One function call = one transaction: a violation rolls everything back.
    const next = clone(state)
    try {
      const data = impl(next, args)
      if (data !== 'duplicate') writes++
      state = next
      return { data, error: null }
    } catch (e) {
      return { data: null, error: { code: e instanceof CheckViolation ? e.code : 'XX000' } }
    }
  }

  return {
    db,
    addOrg(id: string, init: Partial<Omit<MemOrg, 'id'>> = {}) {
      state.orgs.set(id, { id, plan: 'free', stripe_customer_id: null, stripe_sub_id: null, doors_count: 0, ...init })
    },
    addCase(id: string, orgId: string) {
      state.cases.set(id, { id, org_id: orgId, stripe_payment_id: null })
    },
    org(id: string): MemOrg | undefined {
      const o = state.orgs.get(id)
      return o ? { ...o } : undefined
    },
    billing(id: string) {
      const o = state.orgs.get(id)
      return o ? { plan: o.plan, stripe_sub_id: o.stripe_sub_id } : undefined
    },
    case(id: string): MemCase | undefined {
      const c = state.cases.get(id)
      return c ? { ...c } : undefined
    },
    eventCount: () => state.events.size,
    /** audit_log rows, optionally one action's. */
    audit(action?: string): MemAuditRow[] {
      return state.audit.filter((r) => !action || r.action === action).map((r) => structuredClone(r))
    },
    /** Successful row writes + applied (non-duplicate) function calls. */
    writes: () => writes,
    /** The next db call (select, insert, update or function) fails with this Postgres code. */
    failNextWrite(code: string) {
      failNext = code
    },
  }
}

export type MemDb = ReturnType<typeof createMemDb>
