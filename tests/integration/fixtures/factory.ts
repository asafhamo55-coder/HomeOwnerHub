/**
 * Fixture factory for integration tests.
 *
 * THE INVARIANT: service-role seeds and cleans; user clients assert.
 *
 * The service-role JWT maps to a Postgres role with BYPASSRLS, so an
 * isolation assertion made through adminDb() passes whether the policy is
 * correct, wrong, or absent. Only a client holding a real user JWT puts
 * auth.uid() in scope and makes a policy load-bearing. No table in this
 * schema uses FORCE ROW LEVEL SECURITY, so a raw psql superuser
 * connection bypasses policies too.
 *
 * Shaped after scripts/test-inbox-rls.ts, which already does this
 * correctly against production. makeAccounting mirrors
 * scripts/seed-accounting.ts's DEFAULT_COA; the two must stay in step.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../packages/db/src/database.types'
import { LOCAL_ANON_KEY, LOCAL_SERVICE_KEY, LOCAL_SUPABASE_URL } from '../setup/env'

export type Db = SupabaseClient<Database>

export interface OrgFixture {
  orgId: string
  associationId: string
}

export interface AccountingRefs {
  fundIds: { OPERATING: string; RESERVE: string }
  accountIds: Record<string, string>
  fiscalPeriodId: string
}

export interface TestUser {
  id: string
  email: string
  /** RLS-enforcing. Assertions run against THIS, never adminDb(). */
  client: Db
}

const noPersist = { auth: { autoRefreshToken: false, persistSession: false } } as const

export function adminDb(): Db {
  return createClient<Database>(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, noPersist)
}

export async function makeOrg(): Promise<OrgFixture> {
  const db = adminDb()
  const suffix = randomUUID().slice(0, 8)

  const { data: org, error: orgErr } = await db
    .from('orgs')
    .insert({ name: `Test HOA ${suffix}`, hub_type: 'hoa' })
    .select('id')
    .single()
  if (orgErr || !org) throw new Error(`makeOrg: orgs insert failed: ${orgErr?.message}`)

  const { data: assoc, error: assocErr } = await db
    .from('associations')
    .insert({
      organization_id: org.id,
      name: `Test Association ${suffix}`,
      // DEVIATION from brief: `state` and `slug` are NOT NULL with no
      // default in the live schema (confirmed via `\d public.associations`),
      // even though neither appears in the brief's payload, which was
      // written from migration files rather than the live database.
      // `slug` additionally carries a UNIQUE (organization_id, slug)
      // index (migrations/0006_accounting.sql:34) — derive it from the
      // suffix so repeat calls within the same org never collide.
      state: 'FL',
      slug: `TESTASSOC${suffix.toUpperCase()}`,
    })
    .select('id')
    .single()
  if (assocErr || !assoc) throw new Error(`makeOrg: associations insert failed: ${assocErr?.message}`)

  return { orgId: org.id, associationId: assoc.id }
}

/** Mirrors DEFAULT_COA in scripts/seed-accounting.ts (25 rows). */
const DEFAULT_COA: { number: string; name: string; type: string; fund: 'OPERATING' | 'RESERVE' | null }[] = [
  { number: '1010', name: 'Cash — Operating', type: 'asset', fund: 'OPERATING' },
  { number: '1020', name: 'Cash — Reserve', type: 'asset', fund: 'RESERVE' },
  { number: '1100', name: 'Accounts Receivable', type: 'asset', fund: null },
  { number: '1110', name: 'Allowance for Doubtful Accounts', type: 'asset', fund: null },
  { number: '1200', name: 'Prepaid Expenses', type: 'asset', fund: 'OPERATING' },
  { number: '2010', name: 'Accounts Payable', type: 'liability', fund: null },
  { number: '2100', name: 'Prepaid Assessments', type: 'liability', fund: 'OPERATING' },
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

export async function makeAccounting(f: OrgFixture): Promise<AccountingRefs> {
  const db = adminDb()

  const { data: funds, error: fundErr } = await db
    .from('funds')
    .insert([
      { organization_id: f.orgId, association_id: f.associationId, code: 'OPERATING', name: 'Operating Fund', fund_type: 'operating' },
      { organization_id: f.orgId, association_id: f.associationId, code: 'RESERVE', name: 'Reserve Fund', fund_type: 'reserve' },
    ])
    .select('id, code')
  if (fundErr || !funds) throw new Error(`makeAccounting: funds insert failed: ${fundErr?.message}`)

  const fundIds = { OPERATING: '', RESERVE: '' }
  for (const row of funds) fundIds[row.code as 'OPERATING' | 'RESERVE'] = row.id

  const { data: accounts, error: coaErr } = await db
    .from('chart_of_accounts')
    .insert(
      DEFAULT_COA.map((a) => ({
        organization_id: f.orgId,
        association_id: f.associationId,
        account_number: a.number,
        account_name: a.name,
        account_type: a.type,
        fund_id: a.fund ? fundIds[a.fund] : null,
      })),
    )
    .select('id, account_number')
  if (coaErr || !accounts) throw new Error(`makeAccounting: chart_of_accounts insert failed: ${coaErr?.message}`)

  const accountIds: Record<string, string> = {}
  for (const row of accounts) accountIds[row.account_number] = row.id

  const year = new Date().getFullYear()
  const { data: period, error: periodErr } = await db
    .from('fiscal_periods')
    .insert({
      organization_id: f.orgId,
      association_id: f.associationId,
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
      status: 'open',
    })
    .select('id')
    .single()
  if (periodErr || !period) throw new Error(`makeAccounting: fiscal_periods insert failed: ${periodErr?.message}`)

  return { fundIds, accountIds, fiscalPeriodId: period.id }
}

export async function makeUnit(f: OrgFixture): Promise<string> {
  const db = adminDb()
  const suffix = randomUUID().slice(0, 8)
  const { data, error } = await db
    .from('units')
    .insert({
      organization_id: f.orgId,
      association_id: f.associationId,
      address_line1: `${suffix} Test Lane`,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`makeUnit: units insert failed: ${error?.message}`)
  return data.id
}

/**
 * Mints a real, signed-in user. Uses the GoTrue admin API rather than
 * inserting into auth.users directly: GoTrue's schema is versioned
 * (v2.189.0 here) and hand-building encrypted_password / identities
 * yields a user that cannot sign in, for no benefit.
 */
export async function mintUser(
  f: OrgFixture,
  role: 'admin' | 'board' | 'resident' | 'cpa' | 'attorney',
  // BL-168 (0071): a cpa or attorney needs an expiry; a board member may
  // carry an officer title. The columns are not in the generated Database
  // types until gen:types runs after prod has 0071, hence the cast below.
  extra: { accessExpiresAt?: string; generalCounsel?: boolean; officerTitle?: string } = {},
): Promise<TestUser> {
  const db = adminDb()
  // Reserved TLD — can never route to a real inbox.
  const email = `u-${randomUUID()}@example.test`
  const password = randomBytes(24).toString('base64url') // never logged

  const { data: created, error: createErr } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr || !created.user) throw new Error(`mintUser: createUser failed: ${createErr?.message}`)
  const id = created.user.id

  // handle_new_user() (migrations/0001_auth_fixes.sql:43-46) should have
  // created this. Insert defensively: org_members.user_id FKs to
  // profiles(id), and a disabled trigger turns that into a confusing
  // foreign-key error three lines later.
  const { data: profile } = await db.from('profiles').select('id').eq('id', id).maybeSingle()
  if (!profile) {
    const { error } = await db.from('profiles').insert({ id, email })
    if (error) throw new Error(`mintUser: profiles insert failed: ${error.message}`)
  }

  // Post-0012 vocabulary. 0000_schema.sql:221 still shows the legacy
  // CHECK ('owner','admin','member','viewer'); 0012_rbac_roles.sql
  // migrates it to ('admin','board','resident').
  const { error: memberErr } = await db
    .from('org_members')
    .insert({
      org_id: f.orgId,
      user_id: id,
      role,
      ...(extra.accessExpiresAt ? { access_expires_at: extra.accessExpiresAt } : {}),
      ...(extra.generalCounsel ? { general_counsel: true } : {}),
      ...(extra.officerTitle ? { officer_title: extra.officerTitle } : {}),
    } as never)
  if (memberErr) throw new Error(`mintUser: org_members insert failed: ${memberErr.message}`)

  // A FRESH client per user. Sharing one would leak sessions between
  // fixtures and silently make a later assertion run as the wrong user.
  const client = createClient<Database>(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, noPersist)
  const { data: session, error: signInErr } = await client.auth.signInWithPassword({ email, password })
  if (signInErr || !session.session) throw new Error(`mintUser: signIn failed: ${signInErr?.message}`)

  return { id, email, client }
}
