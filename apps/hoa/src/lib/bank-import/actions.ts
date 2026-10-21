'use server'

// BL-144: a bank account that isn't linked through Plaid, and statements
// imported into it from a CSV or OFX/QFX file.
//
// No migration: bank_accounts.plaid_item_id / plaid_account_id and
// bank_transactions.plaid_transaction_id are nullable (0006), and 0061 lets
// board/admin insert both through their own client. A manual account is a
// bank_accounts row with no Plaid ids; an imported transaction is a
// bank_transactions row with no plaid_transaction_id and no match, so it
// lands in the existing matching queue (/accounting/bank/queue) like an
// unmatched Plaid row. plaid-sync only walks accounts of a Plaid item, so
// it never touches these.
//
// Board/admin only: every action checks the role first (a server action is
// a public endpoint), then RLS is the second wall. Imports only go into a
// manual account of the caller's association, so a statement can't be
// layered on top of a live Plaid feed.
//
// The upload is previewed first. Commit re-reads the SAME file (its SHA-256
// must equal the previewed one) and re-plans against the database, so the
// client never supplies parsed rows and a second click or a re-upload
// inserts nothing twice.
//
// Logs and audit rows carry ids and counts only: never a description,
// amount list or file name.

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { readAll } from '@/lib/supabase/read-all'
import { getPrimaryAssociation } from '@/lib/vendors'
import { dateSpan, planImport, type ExistingTxn } from './dedupe'
import { decodeStatement, MAX_FILE_BYTES, parseStatement, type ParseIssue, type StatementFormat } from './parse'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[0-9a-f]{64}$/
const INSERT_CHUNK = 500
/** New rows shown in the preview; counts stay exact. */
const PREVIEW_ROWS = 50

type ServerClient = Awaited<ReturnType<typeof getSupabaseServerClient>>

export type ManualAccountResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: Record<string, string> }

export interface ImportPreviewRow {
  line: number
  postedDate: string
  amountCents: number
  description: string
}

export type ImportPreviewResult =
  | {
      ok: true
      fileHash: string
      format: StatementFormat
      layout: string
      counts: { readable: number; new: number; duplicates: number; problems: number }
      newTotalCents: { in: number; out: number }
      span: { from: string; to: string } | null
      sample: ImportPreviewRow[]
      problems: ParseIssue[]
    }
  | { ok: false; error: string }

export type ImportCommitResult =
  | { ok: true; inserted: number; duplicates: number; problems: number }
  | { ok: false; error: string; inserted?: number }

async function audit(
  supabase: ServerClient,
  orgId: string,
  action: string,
  bankAccountId: string,
  metadata: Record<string, string | number | null>,
) {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { error } = await supabase.from('audit_log').insert({
      org_id: orgId,
      user_id: user?.id ?? null,
      action,
      entity_type: 'bank_account',
      entity_id: bankAccountId,
      metadata,
    })
    if (error) console.error('[bank-import] audit failed', { bankAccountId, code: error.code ?? null })
  } catch {
    console.error('[bank-import] audit failed', { bankAccountId, code: 'thrown' })
  }
}

// ─── manual account ────────────────────────────────────────────────────

export async function createManualBankAccount(input: {
  accountName: string
  bankName?: string
  last4?: string
  fundId: string
}): Promise<ManualAccountResult> {
  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return gate

  const accountName = typeof input?.accountName === 'string' ? input.accountName.replace(/\s+/g, ' ').trim() : ''
  const bankName = typeof input?.bankName === 'string' ? input.bankName.replace(/\s+/g, ' ').trim() : ''
  const last4 = typeof input?.last4 === 'string' ? input.last4.trim() : ''
  const fundId = typeof input?.fundId === 'string' ? input.fundId : ''
  const fieldErrors: Record<string, string> = {}
  if (!accountName) fieldErrors.accountName = 'Give the account a name, like “Operating checking”.'
  else if (accountName.length > 80) fieldErrors.accountName = 'Keep the name under 80 characters.'
  if (bankName.length > 80) fieldErrors.bankName = 'Keep the bank name under 80 characters.'
  if (last4 && !/^\d{4}$/.test(last4)) fieldErrors.last4 = 'Enter exactly the last 4 digits, or leave it blank.'
  if (!UUID.test(fundId)) fieldErrors.fundId = 'Pick the fund this account belongs to.'
  if (Object.keys(fieldErrors).length > 0) return { ok: false, error: 'Some fields need attention.', fieldErrors }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  const supabase = await getSupabaseServerClient()

  const { data: fund, error: fundErr } = await supabase
    .from('funds')
    .select('id')
    .eq('id', fundId)
    .eq('association_id', assoc.id)
    .maybeSingle()
  if (fundErr) {
    console.error('[bank-import] fund read failed', { fundId, code: fundErr.code ?? null })
    return { ok: false, error: 'Couldn’t check the fund. Try again.' }
  }
  if (!fund) return { ok: false, error: 'Some fields need attention.', fieldErrors: { fundId: 'That fund isn’t part of your association.' } }

  const { data, error } = await supabase
    .from('bank_accounts')
    .insert({
      organization_id: gate.orgId,
      association_id: assoc.id,
      fund_id: fundId,
      plaid_item_id: null,
      plaid_account_id: null,
      account_name: accountName,
      bank_name: bankName || null,
      last4: last4 || null,
      is_active: true,
    })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[bank-import] create account failed', { associationId: assoc.id, code: error?.code ?? 'no_row' })
    if (error?.code === '42501') return { ok: false, error: 'Only board members and admins can change accounting records.' }
    return { ok: false, error: 'Couldn’t add the account. Try again.' }
  }

  await audit(supabase, gate.orgId, 'bank_account.manual_created', data.id, {
    association_id: assoc.id,
    fund_id: fundId,
    actor_role: gate.role,
  })
  revalidatePath('/accounting/bank')
  return { ok: true, id: data.id }
}

// ─── import: shared steps ──────────────────────────────────────────────

interface Loaded {
  orgId: string
  role: string
  associationId: string
  supabase: ServerClient
  bankAccountId: string
  bytes: Uint8Array
  fileHash: string
}

/** Gate, then the account (manual, active, this association), then the file bytes. */
async function loadUpload(form: FormData): Promise<{ ok: true; v: Loaded } | { ok: false; error: string }> {
  const gate = await requireBoardOrAdminForAction()
  if (!gate.ok) return gate
  if (!(form instanceof FormData)) return { ok: false, error: 'Choose a statement file to import.' }

  const bankAccountId = form.get('bankAccountId')
  if (typeof bankAccountId !== 'string' || !UUID.test(bankAccountId)) return { ok: false, error: 'That bank account isn’t valid.' }
  const file = form.get('file')
  if (!file || typeof file === 'string' || typeof (file as Blob).arrayBuffer !== 'function') {
    return { ok: false, error: 'Choose a statement file to import.' }
  }
  const blob = file as Blob
  // Refuse by declared size before reading a byte.
  if (blob.size > MAX_FILE_BYTES) {
    return { ok: false, error: `The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Export a shorter date range and import it in parts.` }
  }

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }
  const supabase = await getSupabaseServerClient()
  const { data: account, error } = await supabase
    .from('bank_accounts')
    .select('id, association_id, plaid_item_id, is_active')
    .eq('id', bankAccountId)
    .eq('association_id', assoc.id)
    .maybeSingle()
  if (error) {
    console.error('[bank-import] account read failed', { bankAccountId, code: error.code ?? null })
    return { ok: false, error: 'Couldn’t load the bank account. Try again.' }
  }
  if (!account) return { ok: false, error: 'Bank account not found in this association.' }
  if (account.plaid_item_id) {
    return { ok: false, error: 'This account is linked through Plaid, so its transactions arrive on their own. Import statements into a manual account.' }
  }
  if (!account.is_active) return { ok: false, error: 'This account is inactive.' }

  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes.byteLength > MAX_FILE_BYTES) {
    return { ok: false, error: `The file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB. Export a shorter date range and import it in parts.` }
  }
  const fileHash = createHash('sha256').update(bytes).digest('hex')
  return { ok: true, v: { orgId: gate.orgId, role: gate.role, associationId: assoc.id, supabase, bankAccountId, bytes, fileHash } }
}

/** Parse, then plan against the stored rows in the file's date span. */
async function planUpload(v: Loaded) {
  const decoded = decodeStatement(v.bytes)
  if (!decoded.ok) return decoded
  const parsed = parseStatement(decoded.text)
  if (!parsed.ok) return parsed

  const span = dateSpan(parsed.rows)
  let existing: ExistingTxn[] = []
  if (span) {
    try {
      existing = await readAll<ExistingTxn>(
        (from, to) =>
          v.supabase
            .from('bank_transactions')
            .select('id, posted_date, amount, memo, merchant')
            .eq('bank_account_id', v.bankAccountId)
            .gte('posted_date', span.from)
            .lte('posted_date', span.to)
            .order('id', { ascending: true })
            .range(from, to),
        (e) => new Error(`bank_transactions read failed (${e.code ?? 'no code'})`),
      )
    } catch {
      console.error('[bank-import] existing read failed', { bankAccountId: v.bankAccountId })
      return { ok: false as const, error: 'Couldn’t check for transactions already imported, so nothing was changed. Try again.' }
    }
  }
  return { ok: true as const, parsed, span, plan: planImport(parsed.rows, existing) }
}

// ─── import: preview (dry run) ─────────────────────────────────────────

/** Dry run: reads the file and the stored rows, writes nothing. */
export async function previewBankImport(form: FormData): Promise<ImportPreviewResult> {
  const loaded = await loadUpload(form)
  if (!loaded.ok) return loaded
  const v = loaded.v
  const planned = await planUpload(v)
  if (!planned.ok) return { ok: false, error: planned.error }
  const { parsed, plan, span } = planned

  let inCents = 0
  let outCents = 0
  for (const r of plan.toInsert) {
    if (r.amountCents > 0) inCents += r.amountCents
    else outCents += r.amountCents
  }
  return {
    ok: true,
    fileHash: v.fileHash,
    format: parsed.format,
    layout: parsed.layout,
    counts: {
      readable: parsed.rows.length,
      new: plan.toInsert.length,
      duplicates: plan.duplicates.length,
      problems: parsed.issueCount,
    },
    newTotalCents: { in: inCents, out: outCents },
    span,
    sample: plan.toInsert.slice(0, PREVIEW_ROWS),
    problems: parsed.issues,
  }
}

// ─── import: commit ────────────────────────────────────────────────────

export async function commitBankImport(form: FormData): Promise<ImportCommitResult> {
  const loaded = await loadUpload(form)
  if (!loaded.ok) return loaded
  const v = loaded.v
  const previewed = form.get('fileHash')
  if (typeof previewed !== 'string' || !SHA256.test(previewed) || previewed !== v.fileHash) {
    return { ok: false, error: 'The file changed since the preview. Preview it again, then import.' }
  }

  const planned = await planUpload(v)
  if (!planned.ok) return { ok: false, error: planned.error }
  const { parsed, plan } = planned

  let inserted = 0
  let failedCode: string | null = null
  for (let i = 0; i < plan.toInsert.length; i += INSERT_CHUNK) {
    const batch = plan.toInsert.slice(i, i + INSERT_CHUNK).map((r) => ({
      organization_id: v.orgId,
      bank_account_id: v.bankAccountId,
      // bank_transactions.amount is numeric dollars; cents → dollars here only.
      amount: r.amountCents / 100,
      posted_date: r.postedDate,
      memo: r.description || null,
      merchant: null,
      plaid_transaction_id: null,
    }))
    const { error } = await v.supabase.from('bank_transactions').insert(batch)
    if (error) {
      failedCode = error.code ?? 'unknown'
      break
    }
    inserted += batch.length
  }

  const metadata = {
    association_id: v.associationId,
    format: parsed.format,
    file_bytes: v.bytes.byteLength,
    rows_readable: parsed.rows.length,
    inserted,
    duplicates: plan.duplicates.length,
    problems: parsed.issueCount,
    actor_role: v.role,
    error_code: failedCode,
  }
  if (inserted > 0 || failedCode === null) {
    await audit(v.supabase, v.orgId, 'bank_import.committed', v.bankAccountId, metadata)
  }
  if (inserted > 0) {
    // For a manual account, last_synced_at is "last statement imported".
    const { error } = await v.supabase
      .from('bank_accounts')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', v.bankAccountId)
    if (error) console.error('[bank-import] stamp failed', { bankAccountId: v.bankAccountId, code: error.code ?? null })
    revalidatePath('/')
    revalidatePath('/accounting/bank')
    revalidatePath('/accounting/bank/queue')
  }

  if (failedCode !== null) {
    console.error('[bank-import] insert failed', { bankAccountId: v.bankAccountId, inserted, code: failedCode })
    return {
      ok: false,
      inserted,
      error:
        inserted > 0
          ? `Imported ${inserted} transactions, then the rest failed. Import the same file again: rows already in are skipped.`
          : failedCode === '42501'
            ? 'Only board members and admins can change accounting records.'
            : 'Couldn’t import the transactions. Nothing was saved. Try again.',
    }
  }
  return { ok: true, inserted, duplicates: plan.duplicates.length, problems: parsed.issueCount }
}
