/**
 * Ratchet: every server-side money-write path checks for a closed period.
 *
 * Security audit 2026-11-02: "no closed-period guard on money out". The
 * shared guard is assertPeriodOpen (packages/db/src/accounting/period-guard.ts).
 * postJournalEntry calls it itself, so any file that posts through
 * postJournalEntry( is covered for the entry; a file that writes a money row
 * (journal_entries, ledger_entries, payments, assessments, invoices) or calls
 * a money-posting RPC must either call assertPeriodOpen( or postJournalEntry(,
 * or be listed below WITH a reason.
 *
 * What this can and cannot prove. It is a file-level check on source text: it
 * catches a NEW file (or a new rpc) that writes money with no guard anywhere.
 * It cannot prove the guard runs BEFORE the write, or on every branch of a
 * file that already has one; the per-path tests and review cover that. A write
 * built dynamically (table name in a variable) is invisible to it.
 *
 * Exemptions are shrink-only: one that no longer matches a write fails, so the
 * list never keeps stale headroom.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')

const MONEY_TABLES = ['journal_entries', 'ledger_entries', 'payments', 'assessments', 'invoices']
const MONEY_RPCS = [
  'record_lump_payment',
  'apply_unapplied_credit',
  'record_online_payment_success',
  'reverse_online_payment',
]

const WRITE_RE = new RegExp(
  String.raw`\.from\(\s*['"](?:${MONEY_TABLES.join('|')})['"]\s*\)\s*\.(?:insert|update|upsert|delete)\(`,
)
const RPC_RE = new RegExp(String.raw`\.rpc\(\s*['"](?:${MONEY_RPCS.join('|')})['"]`)
const GUARDED_RE = /\bassertPeriodOpen\(|\bpostJournalEntry\(/

/** Money writes deliberately without the guard. Every entry needs a reason. */
const EXEMPT: Record<string, string> = {
  'apps/hoa/src/lib/sample-community/core.ts':
    'Wipes and rebuilds the demo community only; the sample association has no real books to close.',
  'apps/hoa/src/lib/online-payments/attempt-store.ts':
    'Stripe webhook posting a payment that already happened at the processor. Refusing it would drop real money and make Stripe retry forever; needs a policy decision (post into the open period). See report.',
  'apps/hoa/src/lib/online-payments/reversals-deps.ts':
    'Stripe refund/dispute reversal, dated today by the database function. Same webhook reasoning as attempt-store.',
}

function sourceFiles(): string[] {
  const roots = [path.join(ROOT, 'apps/hoa/src')]
  const pkgs = path.join(ROOT, 'packages')
  for (const p of fs.readdirSync(pkgs)) {
    const src = path.join(pkgs, p, 'src')
    if (fs.existsSync(src)) roots.push(src)
  }
  const out: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.next') continue
      const full = path.join(dir, e.name)
      if (e.isDirectory()) walk(full)
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.startsWith('database.types')) {
        out.push(full)
      }
    }
  }
  roots.forEach(walk)
  return out
}

const codeOf = (file: string) =>
  fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n')
    // Chains break across lines: collapse whitespace so `.from('x')\n  .insert(` matches.
    .replace(/\s+/g, ' ')

describe('closed-period guard ratchet', () => {
  const writers = sourceFiles()
    .map((f) => ({ rel: path.relative(ROOT, f).split(path.sep).join('/'), code: codeOf(f) }))
    .filter((f) => WRITE_RE.test(f.code) || RPC_RE.test(f.code))

  it('finds the money-write files at all (the scan itself works)', () => {
    const rels = writers.map((w) => w.rel)
    expect(rels).toContain('apps/hoa/src/lib/assessments.ts')
    expect(rels).toContain('apps/hoa/src/lib/invoices.ts')
    expect(rels).toContain('packages/jobs/src/hoa-late-fees.ts')
    expect(rels).toContain('apps/hoa/src/lib/payments/lump-payment-actions.ts')
  })

  it('every money-write file calls the guard (or is exempt with a reason)', () => {
    const missing = writers
      .filter((w) => !GUARDED_RE.test(w.code) && !(w.rel in EXEMPT))
      .map((w) => w.rel)
    expect(
      missing,
      `These files write money but never call assertPeriodOpen( or postJournalEntry(: ${missing.join(', ')}. ` +
        'Call assertPeriodOpen from @homeowner-portal/db before the write, or exempt it in this file with a reason.',
    ).toEqual([])
  })

  it('exemptions are not stale', () => {
    const stale = Object.keys(EXEMPT).filter((rel) => {
      const w = writers.find((x) => x.rel === rel)
      return !w || GUARDED_RE.test(w.code)
    })
    expect(stale, `Remove from EXEMPT (no longer an unguarded money write): ${stale.join(', ')}`).toEqual([])
  })

  it('the choke point guards before postJournalEntry writes anything', () => {
    const code = codeOf(path.join(ROOT, 'packages/db/src/accounting/post-journal-entry.ts'))
    const guard = code.indexOf('assertPeriodOpen(')
    const firstWrite = code.search(/\.from\('journal_entries'\)\s*\.insert/)
    expect(guard).toBeGreaterThan(-1)
    expect(firstWrite).toBeGreaterThan(guard)
  })

  it('every exported money action file in the audit list still has an explicit guard', () => {
    // These paths write a money row BEFORE any journal entry, so the
    // postJournalEntry fallback alone would only roll the row back. They must
    // call the guard themselves.
    const mustGuardExplicitly = [
      'apps/hoa/src/lib/assessments.ts',
      'apps/hoa/src/lib/invoices.ts',
      'apps/hoa/src/lib/journal-entries.ts',
      'apps/hoa/src/lib/recurring-entries.ts',
      'apps/hoa/src/lib/payments/lump-payment-actions.ts',
      'apps/hoa/src/lib/payments/apply-credit-actions.ts',
      'apps/hoa/src/lib/accounting/opening-balances/executor.ts',
      'packages/workflows/src/payment-plans/create.ts',
      'packages/jobs/src/hoa-late-fees.ts',
      'packages/jobs/src/recurring-jes.ts',
    ]
    const lacking = mustGuardExplicitly.filter((rel) => !/\bassertPeriodOpen\(/.test(codeOf(path.join(ROOT, rel))))
    expect(lacking).toEqual([])
  })
})
