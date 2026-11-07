import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 30_000 })

/**
 * Org-scope ratchet (management-company Phase 0).
 *
 * A user can now belong to hundreds of orgs. A read of an org-scoped table
 * that carries no explicit org filter is answered by row-level security
 * alone, and RLS lets a user see every org they belong to: a "latest row",
 * a `.limit(1)`, a `.maybeSingle()` by id, a count, a list. With one org
 * that is invisible; with two it shows the wrong community's data under the
 * active community's name.
 *
 * This test scans every non-test source file under apps/hoa/src, finds
 * `.from('<table>').select(...)` chains on the main org-scoped tables below,
 * and requires an `.eq` / `.in` / `.match` / `.or` / `.filter` that names the
 * table's org column. Reads that do not are listed in BASELINE; the list can
 * only SHRINK:
 *
 *   - a new unscoped read fails the test (add `.eq('org_id', org.id)`), and
 *   - a baseline entry that is now scoped ALSO fails, telling you to lower
 *     or delete it, so the fix cannot quietly regress.
 *
 * KNOWN BLIND SPOTS (a green run does not prove more than this):
 *   - only chains whose SECOND call is `.select(...)` are read; `.insert()`,
 *     `.update()`, `.delete()`, `.upsert()` and `.rpc()` are not checked, nor
 *     a read that starts with something else before select;
 *   - a filter is recognised by TEXT: any `.eq/.in/.match/.or/.filter`
 *     argument containing the column name counts, even `.eq('x', org_id_var)`
 *     or an `.or('a.eq.1,org_id.is.null')` that does not actually restrict;
 *   - embeds are not followed: `select('*, units(*)')` reads the embedded
 *     table under the parent's filter, and a `.from('x')` for a table outside
 *     SCOPE_COLUMNS is never looked at;
 *   - `.from(variable)` and `.from(cond ? 'a' : 'b')` are skipped (only string
 *     literals, with or without `as never`), as are clients passed in and
 *     reads built across several statements (builder in a variable, or a
 *     helper that adds the filter);
 *   - an `association_id` filter is accepted as scope; it is only as good as
 *     the id that was passed in.
 *
 * Text/AST scanning is crude by design. It sees one expression chain: a
 * filter added to a builder held in a variable, or inside a helper the
 * chain is passed to, is invisible, so such a read shows up here as
 * unscoped even when it is fine (those are marked in BASELINE). Reads that
 * only target a record by `id` are NOT exempt: an id read still returns
 * another org's row when the person is a member of both.
 */

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * table → the columns that scope a read to ONE org: the table's own org
 * column, plus `association_id` where the table has one (an association
 * belongs to exactly one org, and board code reads it from the active org's
 * association). Generated from packages/db/src/database.types.ts; the first
 * entry is the org column itself.
 */
const SCOPE_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  hoa_properties: ['org_id'],
  hoa_violations: ['org_id'],
  hoa_documents: ['org_id'],
  hoa_document_versions: ['org_id'],
  hoa_meeting_minutes: ['org_id'],
  meeting_action_items: ['org_id'],
  wizard_drafts: ['org_id'],
  tickets: ['organization_id', 'association_id'],
  arc_requests: ['organization_id', 'association_id'],
  vendors: ['organization_id'],
  lease_waiting_list: ['organization_id', 'association_id'],
  approval_requests: ['organization_id'],
  communications: ['organization_id', 'association_id'],
  polls: ['organization_id', 'association_id'],
  ballots: ['organization_id', 'association_id'],
  bids: ['organization_id'],
  rfps: ['organization_id', 'association_id'],
  collection_cases: ['organization_id', 'association_id'],
  inbox_drafts: ['organization_id'],
  inbox_messages: ['organization_id'],
  resident_violation_reports: ['organization_id', 'association_id'],
  board_threads: ['organization_id', 'association_id'],
  hoa_recurring_events: ['organization_id', 'association_id'],
  communication_templates: ['organization_id', 'association_id'],
  unapplied_credits: ['organization_id', 'association_id'],
  public_site_items: ['organization_id'],
  professional_invites: ['organization_id'],
  online_payments: ['organization_id', 'association_id'],
  units: ['organization_id', 'association_id'],
  assessments: ['organization_id', 'association_id'],
  fiscal_periods: ['organization_id', 'association_id'],
  bank_accounts: ['organization_id', 'association_id'],
  bank_transactions: ['organization_id'],
  budgets: ['organization_id', 'association_id'],
  chart_of_accounts: ['organization_id', 'association_id'],
  funds: ['organization_id', 'association_id'],
  journal_entries: ['organization_id', 'association_id'],
  invoices: ['organization_id', 'association_id'],
  payments: ['organization_id'],
  bank_reconciliations: ['organization_id'],
  recurring_journal_entries: ['organization_id', 'association_id'],
  vendor_onboarding_invitations: ['organization_id'],
  submission_attachments: ['organization_id'],
  online_payment_methods: ['organization_id', 'association_id'],
  autopay_enrollments: ['organization_id', 'association_id'],
}

const FILTER_METHODS = new Set(['eq', 'in', 'match', 'or', 'filter'])

export interface UnscopedRead {
  file: string
  line: number
  table: string
}

/** Every unscoped read of a main org-scoped table in one source text. */
export function findUnscopedReads(file: string, source: string): UnscopedRead[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  const out: UnscopedRead[] = []

  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'from'
    ) {
      const raw = node.arguments[0]
      const arg = raw && ts.isAsExpression(raw) ? raw.expression : raw
      const table = arg && ts.isStringLiteralLike(arg) ? arg.text : null
      const columns = table ? SCOPE_COLUMNS[table] : undefined
      if (table && columns) {
        // Climb to the outermost call of this chain.
        let top: ts.Node = node
        while (
          top.parent &&
          ((ts.isPropertyAccessExpression(top.parent) && top.parent.expression === top) ||
            (ts.isCallExpression(top.parent) && top.parent.expression === top) ||
            ts.isNonNullExpression(top.parent))
        ) {
          top = top.parent
        }
        // Walk back down it, collecting calls in source order.
        const calls: ts.CallExpression[] = []
        let c: ts.Node | undefined = top
        while (c) {
          if (ts.isCallExpression(c)) {
            calls.push(c)
            c = c.expression
          } else if (ts.isPropertyAccessExpression(c) || ts.isNonNullExpression(c)) {
            c = c.expression
          } else break
        }
        calls.reverse()
        const name = (call: ts.CallExpression) =>
          ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : ''
        // calls[0] is .from(); only reads (.select first) are checked.
        if (calls[1] && name(calls[1]) === 'select') {
          const scoped = calls.some(
            (call) => FILTER_METHODS.has(name(call)) && call.arguments.some((a) => columns.some((column) => a.getText(sf).includes(column))),
          )
          if (!scoped) {
            out.push({ file, line: sf.getLineAndCharacterOfPosition(top.getStart(sf)).line + 1, table })
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

const scanned = walk(here).map((f) => path.relative(here, f).split(path.sep).join('/'))

/**
 * Remaining unscoped reads, "file|table" → how many. Each has a reason:
 *  - cross-org by design (platform admin);
 *  - reached only through a record this same request already loaded under
 *    an org filter (children by parent id);
 *  - a filter applied to a builder in a variable or helper the scan cannot
 *    follow;
 *  - not yet audited / unsure (listed for review, NOT approved).
 */
const BASELINE: Readonly<Record<string, number>> = {
  // ── NOT YET AUDITED: board-side or shared reads keyed by an id or association; review backlog, fix rather than extend
  'app/(dashboard)/accounting/bank/[accountId]/reconcile/page.tsx|bank_reconciliations': 1,
  'app/(dashboard)/communications/[id]/page.tsx|units': 1,
  'lib/accounting/last-reconciled.ts|bank_reconciliations': 1,
  'lib/accounting/opening-balances/executor.ts|chart_of_accounts': 1,
  'lib/accounting/opening-balances/executor.ts|fiscal_periods': 1,
  'lib/accounting/opening-balances/executor.ts|funds': 1,
  'lib/accounting/opening-balances/executor.ts|units': 1,
  'lib/accounting/queries.ts|bank_transactions': 1,
  'lib/accounting/queries.ts|fiscal_periods': 2,
  'lib/accounting/year-end/load.ts|bank_reconciliations': 1,
  'lib/accounting/year-end/load.ts|invoices': 1,
  'lib/assessments.ts|payments': 1,
  'lib/bank-import/actions.ts|bank_transactions': 1,
  'lib/bank-rec.ts|assessments': 1,
  'lib/bank-rec.ts|bank_transactions': 4,
  'lib/bank-reconciliation.ts|bank_accounts': 1,
  'lib/bank-reconciliation.ts|bank_reconciliations': 2,
  'lib/bill-scan/load.ts|invoices': 1,
  'lib/inbox/saved-replies-actions.ts|inbox_messages': 1,
  'lib/payment-plans.ts|units': 1,
  'lib/professionals/executor.ts|chart_of_accounts': 1,
  'lib/professionals/executor.ts|fiscal_periods': 2,
  'lib/professionals/executor.ts|funds': 1,
  'lib/professionals/invites.ts|professional_invites': 1,
  'lib/professionals/load.ts|approval_requests': 1,
  'lib/tickets-filter.ts|units': 1,
  // ── children read by the id of a parent this request already loaded under an org filter
  'app/(dashboard)/meetings/page.tsx|meeting_action_items': 1,
  'lib/board-packet/queries.ts|meeting_action_items': 1,
  'lib/collections/letters/executor.ts|collection_cases': 1,
  'lib/collections/queries.ts|collection_cases': 3,
  'lib/communications/audience.ts|hoa_violations': 2,
  'lib/communications/audience.ts|units': 1,
  'lib/communications/send.ts|communication_templates': 1,
  'lib/community-board/queries.ts|board_threads': 1,
  'lib/dashboard/queries.ts|hoa_properties': 1,
  'lib/documents.ts|hoa_document_versions': 5,
  'lib/inbox/queries.ts|inbox_messages': 4,
  'lib/inbox/queries.ts|payments': 1,
  'lib/leases.ts|hoa_properties': 2,
  'lib/leases.ts|lease_waiting_list': 1,
  'lib/meeting-action-items.ts|meeting_action_items': 2,
  'lib/properties/lot.ts|hoa_properties': 1,
  'lib/properties/lot.ts|units': 1,
  'lib/properties/property-360.ts|arc_requests': 1,
  'lib/properties/property-360.ts|assessments': 2,
  'lib/properties/property-360.ts|collection_cases': 1,
  'lib/properties/property-360.ts|payments': 1,
  'lib/properties/property-360.ts|unapplied_credits': 1,
  'lib/properties/resolve.ts|units': 1,
  'lib/rfp-invitations.ts|bids': 2,
  // ── public token / webhook / cron / system stores: no signed-in org, the org comes from the record itself
  'app/api/cron/recurring-events/route.ts|hoa_recurring_events': 1,
  'app/api/vendor-onboard/[token]/submit/route.ts|vendor_onboarding_invitations': 2,
  'app/api/vendor-onboard/[token]/submit/route.ts|vendors': 1,
  'app/api/webhooks/plaid/route.ts|bank_accounts': 1,
  'lib/communications/scheduled-dispatch.ts|communications': 1,
  'lib/inbox/draft/metrics-store.ts|inbox_drafts': 1,
  'lib/inbox/ingest.ts|inbox_messages': 1,
  'lib/monthly-report/actions.ts|communications': 1,
  'lib/monthly-report/load.ts|payments': 1,
  'lib/monthly-report/status.ts|communications': 1,
  'lib/online-payments/attempt-store.ts|online_payments': 2,
  'lib/online-payments/attempt-store.ts|units': 1,
  'lib/online-payments/autopay-failures.ts|autopay_enrollments': 1,
  'lib/online-payments/autopay-failures.ts|online_payments': 2,
  'lib/online-payments/payouts-store.ts|bank_transactions': 2,
  'lib/online-payments/payouts-store.ts|funds': 1,
  'lib/online-payments/payouts-store.ts|online_payments': 1,
  'lib/online-payments/refund-action.ts|online_payments': 1,
  'lib/online-payments/reversals-deps.ts|online_payments': 2,
  'lib/online-payments/saved-method-webhooks.ts|online_payment_methods': 1,
  'lib/payments/apply-credit-actions.ts|unapplied_credits': 1,
  'lib/polls/email/store.ts|communications': 2,
  'lib/polls/email/store.ts|polls': 1,
  'lib/resident-notify/receipt-store.ts|assessments': 1,
  'lib/resident-notify/receipt-store.ts|payments': 1,
  'lib/resident-notify/receipt-store.ts|units': 1,
  'lib/resident-notify/statement-store.ts|communications': 1,
  'lib/vendor-invitations.ts|vendor_onboarding_invitations': 1,
  // ── resident side: a resident reads their own rows (user_id / submitted_by / own unit ids)
  'app/resident/dues/autopay/page.tsx|assessments': 1,
  'app/resident/dues/autopay/page.tsx|autopay_enrollments': 1,
  'app/resident/dues/methods/actions.ts|autopay_enrollments': 1,
  'app/resident/dues/methods/actions.ts|online_payment_methods': 3,
  'app/resident/dues/methods/page.tsx|online_payment_methods': 1,
  'lib/contact-updates/resident-load.ts|tickets': 1,
  'lib/online-payments/autopay-actions.ts|autopay_enrollments': 1,
  'lib/online-payments/board-list.ts|online_payments': 1,
  'lib/online-payments/pay-state.ts|online_payments': 1,
  'lib/public-site/actions.ts|public_site_items': 1,
  'lib/public-site/load.ts|public_site_items': 1,
  'lib/resident-dashboard.ts|assessments': 1,
  'lib/resident-dashboard.ts|hoa_violations': 1,
  'lib/resident-dashboard.ts|payments': 1,
  'lib/resident-documents/query.ts|hoa_document_versions': 1,
  'lib/resident-ledger.ts|assessments': 1,
  'lib/resident-ledger.ts|payments': 1,
  'lib/resident-ledger.ts|unapplied_credits': 1,
  'lib/resident-submissions.ts|arc_requests': 2,
  'lib/resident-submissions.ts|resident_violation_reports': 2,
  'lib/resident-tickets.ts|tickets': 3,
  'lib/resident.ts|units': 1,
  'lib/submission-attachments.ts|submission_attachments': 2,
  // ── filter added to a builder held in a variable (optional orgId the board screens pass), which the scan cannot follow
  'lib/online-voting/store.ts|ballots': 3,
  'lib/polls/store.ts|polls': 2,
  // ── cross-org by design: platform admin tenant counts
  'lib/platform-admin.ts|arc_requests': 1,
  'lib/platform-admin.ts|assessments': 1,
  'lib/platform-admin.ts|hoa_documents': 1,
  'lib/platform-admin.ts|hoa_violations': 1,
  'lib/platform-admin.ts|rfps': 1,
  'lib/platform-admin.ts|units': 2,
  'lib/platform-admin.ts|vendors': 1,
  // ── checked against the active org after the read (row.organization_id !== orgId), equivalent to the filter
  'lib/professionals/signoff.ts|approval_requests': 1,
}

describe('org-scope ratchet: main org-scoped tables are read with an org filter', () => {
  const found = new Map<string, UnscopedRead[]>()
  for (const rel of scanned) {
    for (const hit of findUnscopedReads(rel, readFileSync(path.join(here, rel), 'utf8'))) {
      const key = `${hit.file}|${hit.table}`
      found.set(key, [...(found.get(key) ?? []), hit])
    }
  }

  it('finds the source it is meant to scan', () => {
    expect(scanned.length).toBeGreaterThan(500)
    expect(scanned).toContain('lib/tickets.ts')
    expect(scanned).toContain('lib/board-review.ts')
  })

  it('no new unscoped read (add .eq(<org column>, org.id) — do not extend the baseline)', () => {
    const grown = [...found].filter(([key, hits]) => hits.length > (BASELINE[key] ?? 0))
    expect(
      grown.map(([key, hits]) => `${key} x${hits.length} (allowed ${BASELINE[key] ?? 0}) at lines ${hits.map((h) => h.line).join(', ')}`),
    ).toEqual([])
  })

  it('no stale baseline entry (a fixed read must leave the list)', () => {
    const stale = Object.entries(BASELINE).filter(([key, n]) => (found.get(key)?.length ?? 0) < n)
    expect(stale.map(([key, n]) => `${key}: allows ${n}, found ${found.get(key)?.length ?? 0}`)).toEqual([])
  })

  describe('the detector', () => {
    const t = (src: string) => findUnscopedReads('x.ts', src).length
    it('flags a read with no org filter, including id-only, limit(1) and maybeSingle', () => {
      expect(t(`db.from('tickets').select('id')`)).toBe(1)
      expect(t(`db.from('tickets' as never).select('id').eq('id', i).maybeSingle()`)).toBe(1)
      expect(t(`db.from('hoa_properties').select('id').limit(1)`)).toBe(1)
      expect(t(`db.from('hoa_properties').select('id').eq('org_id', 'x').limit(1)`)).toBe(0)
    })
    it('accepts the table’s own org column, however it is filtered', () => {
      expect(t(`db.from('tickets').select('id').eq('organization_id', o)`)).toBe(0)
      expect(t(`db.from('tickets').select('id').in('organization_id', os)`)).toBe(0)
      expect(t(`db.from('tickets').select('id').match({ organization_id: o })`)).toBe(0)
      expect(t(`db.from('tickets').select('id').eq('org_id', o)`)).toBe(1) // wrong column for this table
    })
    it('ignores writes and tables outside the list', () => {
      expect(t(`db.from('tickets').update({}).eq('id', i)`)).toBe(0)
      expect(t(`db.from('profiles').select('id')`)).toBe(0)
    })
  })
})
