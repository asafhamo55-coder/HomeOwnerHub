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
 * Text/AST scanning is crude by design. It sees one expression chain: a
 * filter added to a builder held in a variable, or inside a helper the
 * chain is passed to, is invisible, so such a read shows up here as
 * unscoped even when it is fine (those are marked in BASELINE). Reads that
 * only target a record by `id` are NOT exempt: an id read still returns
 * another org's row when the person is a member of both.
 */

const here = path.dirname(fileURLToPath(import.meta.url))

/** table → the column that holds its org. */
const ORG_COLUMN: Readonly<Record<string, 'org_id' | 'organization_id'>> = {
  hoa_properties: 'org_id',
  hoa_violations: 'org_id',
  hoa_documents: 'org_id',
  hoa_document_versions: 'org_id',
  hoa_meeting_minutes: 'org_id',
  meeting_action_items: 'org_id',
  wizard_drafts: 'org_id',
  tickets: 'organization_id',
  arc_requests: 'organization_id',
  vendors: 'organization_id',
  lease_waiting_list: 'organization_id',
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
      const column = table ? ORG_COLUMN[table] : undefined
      if (table && column) {
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
            (call) => FILTER_METHODS.has(name(call)) && call.arguments.some((a) => a.getText(sf).includes(column)),
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
  // ── children read by the id of a parent this request already loaded under an org filter
  'app/(dashboard)/meetings/page.tsx|meeting_action_items': 1,
  'lib/board-packet/queries.ts|meeting_action_items': 1,
  'lib/meeting-action-items.ts|meeting_action_items': 2,
  'lib/documents.ts|hoa_document_versions': 5,
  'lib/resident-documents/query.ts|hoa_document_versions': 1,
  'lib/communications/audience.ts|hoa_violations': 2, // by property ids from the org's own property list
  'lib/dashboard/queries.ts|hoa_properties': 1, // by ids from an org-scoped read
  'lib/leases.ts|hoa_properties': 2, // by ids from an org-scoped read
  'lib/online-voting/store.ts|hoa_properties': 1, // by ids from the ballot's own scope
  'lib/properties/lot.ts|hoa_properties': 1, // by ids from an org-scoped read
  'lib/properties/property-360.ts|arc_requests': 1, // by the home's unit ids, which were read under orgId
  // ── scoped by association_id instead (one association belongs to one org)
  'lib/communications/send.ts|lease_waiting_list': 1,
  'lib/dashboard/queries.ts|lease_waiting_list': 1,
  'lib/leases.ts|lease_waiting_list': 2,
  // ── resident side: a resident reads their own rows (submitted_by / own ids)
  'lib/contact-updates/resident-load.ts|tickets': 1,
  'lib/resident-dashboard.ts|hoa_violations': 1,
  'lib/resident-submissions.ts|arc_requests': 2,
  'lib/resident-tickets.ts|tickets': 3,
  // ── cross-org by design: platform admin tenant counts
  'lib/platform-admin.ts|vendors': 1,
  'lib/platform-admin.ts|hoa_violations': 1,
  'lib/platform-admin.ts|arc_requests': 1,
  'lib/platform-admin.ts|hoa_documents': 1,
  // ── public token routes, no signed-in org
  'app/api/vendor-onboard/[token]/submit/route.ts|vendors': 1,
  // ── UNSURE, left for review: resolves a home's org FROM the row, so it cannot be filtered by it
  'lib/property-scope.ts|hoa_properties': 1,
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
