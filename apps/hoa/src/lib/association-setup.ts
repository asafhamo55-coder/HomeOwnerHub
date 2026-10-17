import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { isUsStateCode } from '@/lib/us-states'
import { loadOrFail, type LoadResult } from '@/lib/load-or-fail'

/**
 * In-app association setup (BL-046).
 *
 * Before this, an org with no association hit two dead ends: /dues linked
 * to the onboarding checklist (which cannot create one) and every
 * accounting page said "contact support". The only paths that created an
 * association were the platform-admin tenant form and the
 * `seed-accounting` script.
 *
 * `setUpAssociationCore` does what an HOA admin needs to bill dues and
 * open the books, in one step, idempotently: the association (if the org
 * has none), the Operating and Reserve funds, the standard chart of
 * accounts and an open fiscal period for the current calendar year — the
 * same rows `scripts/seed-accounting.ts` writes. Re-running it only fills
 * in what is missing.
 *
 * It runs on the signed-in user's client, so RLS decides: inserting an
 * association needs an org admin (0063 `associations_insert`); the
 * accounting tables are writable by members (0006 `org_access`).
 */

type Db = SupabaseClient<Database>

export type AssociationType = 'hoa' | 'condo' | 'coop'
const TYPES: readonly AssociationType[] = ['hoa', 'condo', 'coop']

export interface NewAssociation {
  name: string
  /** USPS code of the state whose HOA law governs it. */
  state: string
  type: AssociationType
}

export type NewAssociationField = 'name' | 'state' | 'type'

export type ParseResult =
  | { ok: true; data: NewAssociation }
  | { ok: false; fieldErrors: Partial<Record<NewAssociationField, string>> }

export function parseNewAssociation(raw: {
  name: unknown
  state: unknown
  type: unknown
}): ParseResult {
  const fieldErrors: Partial<Record<NewAssociationField, string>> = {}
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (name.length < 2 || name.length > 200) fieldErrors.name = 'Give the association a name (2 to 200 characters).'
  const state = typeof raw.state === 'string' ? raw.state.trim().toUpperCase() : ''
  if (!isUsStateCode(state)) fieldErrors.state = 'Pick the state the association is in.'
  const type = raw.type == null || raw.type === '' ? 'hoa' : raw.type
  if (!TYPES.includes(type as AssociationType)) fieldErrors.type = 'Pick HOA, condo or co-op.'
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors }
  return { ok: true, data: { name, state, type: type as AssociationType } }
}

/**
 * The Pay-by-Zelle memo prefix (ADR-005): upper-case letters and digits
 * of the name, the same rule 0006 backfilled with. The column is NOT NULL.
 */
export function associationSlug(name: string): string {
  return name.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'HOA'
}

/**
 * The org's primary association (first by name), with "none yet" (`data:
 * null`) kept apart from "could not read" (`ok: false`). The legacy
 * `getPrimaryAssociation()` returns null for both, so a failed read
 * rendered "No association set up yet".
 */
export function readPrimaryAssociation(db: Db, orgId: string): Promise<LoadResult<{ id: string; name: string } | null>> {
  return loadOrFail(
    'association',
    db
      .from('associations')
      .select('id, name')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
      .limit(1)
      .maybeSingle(),
  )
}

/** Where to land after setup: an in-app path, else /dues. */
export function safeSetupReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/dues'
  return /^\/(?![/\\])[^\s]*$/.test(value) ? value : '/dues'
}

// ─── Default books (kept identical to scripts/seed-accounting.ts) ─────

export const DEFAULT_FUNDS = [
  { code: 'OPERATING', name: 'Operating Fund', fund_type: 'operating' },
  { code: 'RESERVE', name: 'Reserve Fund', fund_type: 'reserve' },
] as const

type FundCode = (typeof DEFAULT_FUNDS)[number]['code']

export interface DefaultAccount {
  number: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense'
  fund: FundCode | null
  description?: string
}

export const DEFAULT_CHART_OF_ACCOUNTS: readonly DefaultAccount[] = [
  { number: '1010', name: 'Cash — Operating', type: 'asset', fund: 'OPERATING' },
  { number: '1020', name: 'Cash — Reserve', type: 'asset', fund: 'RESERVE' },
  { number: '1100', name: 'Accounts Receivable', type: 'asset', fund: null, description: 'Homeowner assessments not yet collected.' },
  { number: '1110', name: 'Allowance for Doubtful Accounts', type: 'asset', fund: null },
  { number: '1200', name: 'Prepaid Expenses', type: 'asset', fund: 'OPERATING' },
  { number: '2010', name: 'Accounts Payable', type: 'liability', fund: null, description: 'Vendor invoices received and approved, not yet paid.' },
  { number: '2100', name: 'Prepaid Assessments', type: 'liability', fund: 'OPERATING', description: 'Homeowner payments received before the assessment was billed.' },
  { number: '2200', name: 'Accrued Expenses', type: 'liability', fund: 'OPERATING' },
  { number: '3000', name: 'Fund Balance — Operating', type: 'equity', fund: 'OPERATING' },
  { number: '3010', name: 'Fund Balance — Reserve', type: 'equity', fund: 'RESERVE' },
  { number: '4000', name: 'Assessment Income', type: 'income', fund: 'OPERATING' },
  { number: '4010', name: 'Special Assessment Income', type: 'income', fund: 'OPERATING' },
  { number: '4100', name: 'Late Fee Income', type: 'income', fund: 'OPERATING' },
  { number: '4110', name: 'Fine Income', type: 'income', fund: 'OPERATING' },
  { number: '4200', name: 'Interest Income', type: 'income', fund: 'RESERVE' },
  { number: '4900', name: 'Other Income', type: 'income', fund: 'OPERATING' },
  { number: '5000', name: 'Landscaping', type: 'expense', fund: 'OPERATING' },
  { number: '5010', name: 'Utilities', type: 'expense', fund: 'OPERATING' },
  { number: '5020', name: 'Insurance', type: 'expense', fund: 'OPERATING' },
  { number: '5030', name: 'Management Fees', type: 'expense', fund: 'OPERATING' },
  { number: '5040', name: 'Repairs & Maintenance', type: 'expense', fund: 'OPERATING' },
  { number: '5050', name: 'Professional Fees (Legal/Accounting)', type: 'expense', fund: 'OPERATING' },
  { number: '5060', name: 'Office & Admin', type: 'expense', fund: 'OPERATING' },
  { number: '5100', name: 'Reserve Expenditures', type: 'expense', fund: 'RESERVE' },
  { number: '5900', name: 'Bank Fees', type: 'expense', fund: 'OPERATING' },
]

export type SetUpResult =
  | { ok: true; associationId: string; created: boolean }
  | { ok: false; error: string; associationId?: string }

function logFailure(step: string, error: { code?: string } | null): void {
  // Codes only: no names, addresses or row values in logs.
  console.error('association setup failed', { step, code: error?.code ?? 'unknown' })
}

const BOOKS_FAILED =
  'The association was created, but opening its books failed part-way. Try again — it only adds what is missing.'

export async function setUpAssociationCore(
  db: Db,
  { orgId, input, year }: { orgId: string; input: NewAssociation; year: number },
): Promise<SetUpResult> {
  // 1. The association — reuse the org's first one if it already has one.
  const existing = await db.from('associations').select('id').eq('organization_id', orgId).limit(1).maybeSingle()
  if (existing.error) {
    logFailure('read association', existing.error)
    return { ok: false, error: 'We couldn’t check your association just now. Try again.' }
  }
  let associationId = (existing.data as { id: string } | null)?.id ?? null
  const created = associationId === null
  if (!associationId) {
    const ins = await db
      .from('associations')
      .insert({
        organization_id: orgId,
        name: input.name,
        state: input.state,
        governing_law_state: input.state,
        type: input.type,
        slug: associationSlug(input.name),
      })
      .select('id')
      .single()
    if (ins.error || !ins.data) {
      logFailure('create association', ins.error)
      return {
        ok: false,
        error:
          ins.error?.code === '42501'
            ? 'Only an admin of your HOA can create the association.'
            : 'We couldn’t create the association. Try again.',
      }
    }
    associationId = (ins.data as { id: string }).id
  }

  const failBooks = (step: string, error: { code?: string } | null): SetUpResult => {
    logFailure(step, error)
    return { ok: false, error: BOOKS_FAILED, associationId: associationId! }
  }

  // 2. Funds.
  const fundsRead = await db.from('funds').select('id, code').eq('association_id', associationId)
  if (fundsRead.error) return failBooks('read funds', fundsRead.error)
  const fundId = new Map<string, string>(((fundsRead.data ?? []) as { id: string; code: string }[]).map((f) => [f.code, f.id]))
  const missingFunds = DEFAULT_FUNDS.filter((f) => !fundId.has(f.code))
  if (missingFunds.length > 0) {
    const fundsIns = await db
      .from('funds')
      .insert(missingFunds.map((f) => ({ organization_id: orgId, association_id: associationId!, ...f })))
      .select('id, code')
    if (fundsIns.error) return failBooks('create funds', fundsIns.error)
    for (const f of (fundsIns.data ?? []) as { id: string; code: string }[]) fundId.set(f.code, f.id)
  }

  // 3. Chart of accounts.
  const coaRead = await db.from('chart_of_accounts').select('account_number').eq('association_id', associationId)
  if (coaRead.error) return failBooks('read chart of accounts', coaRead.error)
  const have = new Set(((coaRead.data ?? []) as { account_number: string }[]).map((a) => a.account_number))
  const missingAccounts = DEFAULT_CHART_OF_ACCOUNTS.filter((a) => !have.has(a.number))
  if (missingAccounts.length > 0) {
    const coaIns = await db.from('chart_of_accounts').insert(
      missingAccounts.map((a) => ({
        organization_id: orgId,
        association_id: associationId!,
        account_number: a.number,
        account_name: a.name,
        account_type: a.type,
        fund_id: a.fund ? (fundId.get(a.fund) ?? null) : null,
        description: a.description ?? null,
      })),
    )
    if (coaIns.error) return failBooks('create chart of accounts', coaIns.error)
  }

  // 4. An open fiscal period for this calendar year.
  const start = `${year}-01-01`
  const end = `${year}-12-31`
  const periodRead = await db
    .from('fiscal_periods')
    .select('id')
    .eq('association_id', associationId)
    .eq('start_date', start)
    .eq('end_date', end)
    .maybeSingle()
  if (periodRead.error) return failBooks('read fiscal period', periodRead.error)
  if (!periodRead.data) {
    const periodIns = await db.from('fiscal_periods').insert({
      organization_id: orgId,
      association_id: associationId,
      start_date: start,
      end_date: end,
      status: 'open',
    })
    if (periodIns.error) return failBooks('create fiscal period', periodIns.error)
  }

  return { ok: true, associationId, created }
}
