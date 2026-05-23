'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Database } from '@homeowner-portal/db/types'
import { loadAccountingRefs, postJournalEntry } from '@homeowner-portal/db'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'

type InvoiceInsert = Database['public']['Tables']['invoices']['Insert']
type PaymentInsert = Database['public']['Tables']['payments']['Insert']

export type InvoiceActionResult =
  | { ok: true; invoiceId: string }
  | { ok: false; error: string }

// ─── enterBill ───────────────────────────────────────────────────────

const EnterBillSchema = z.object({
  vendorId: z.string().uuid(),
  invoiceNumber: z.string().min(1).max(120),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'invoiceDate must be YYYY-MM-DD'),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD')
    .optional(),
  amount: z.number().positive().max(1_000_000),
  expenseAccountId: z.string().uuid(),
  memo: z.string().max(500).optional(),
})

/**
 * Record a vendor bill. Inserts the invoice row, then posts the JE:
 *   Dr Expense (caller-chosen 5xxx account) / Cr AP   in OPERATING fund.
 *
 * Status flips invoice.status → 'approved' on success (we skip the
 * explicit 'received → coded → approved' workflow for v1; the bill is
 * either entered or it isn't). Bill-pay is a separate action.
 */
export async function enterBill(input: {
  vendorId: string
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string
  amount: number
  expenseAccountId: string
  memo?: string
}): Promise<InvoiceActionResult> {
  const parsed = EnterBillSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const value = parsed.data

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  const { data: assocRow } = await supabase
    .from('associations')
    .select('organization_id')
    .eq('id', assoc.id)
    .single()
  if (!assocRow) return { ok: false, error: 'Association not found.' }

  // Open fiscal period — vendor bills always land in the currently-open
  // period regardless of invoice_date, by convention.
  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('association_id', assoc.id)
    .eq('status', 'open')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!period) {
    return { ok: false, error: 'No open fiscal period — run pnpm seed:accounting first.' }
  }

  const refs = await loadAccountingRefs(supabase, assoc.id)
  if (!refs) {
    return { ok: false, error: 'Accounting not set up — run pnpm seed:accounting.' }
  }

  // Confirm the chosen expense account is a real 5xxx in this assoc.
  // Belt-and-suspenders against a tampered form payload — the JE
  // composer would fail on the FK anyway, but a clear error is nicer.
  const { data: expenseAcct } = await supabase
    .from('chart_of_accounts')
    .select('id, account_type')
    .eq('id', value.expenseAccountId)
    .eq('association_id', assoc.id)
    .single()
  if (!expenseAcct || expenseAcct.account_type !== 'expense') {
    return { ok: false, error: 'Selected account is not an expense account.' }
  }

  // Confirm the vendor belongs to this org. Vendors are org-scoped, not
  // per-association, so this enforces tenant isolation rather than
  // association isolation. (RLS already blocks cross-org reads, but a
  // typed check up here gives a clear error.)
  const { data: vendor } = await supabase
    .from('vendors')
    .select('id, organization_id')
    .eq('id', value.vendorId)
    .single()
  if (!vendor || vendor.organization_id !== assocRow.organization_id) {
    return { ok: false, error: 'Vendor not found in this organization.' }
  }

  const invoicePayload: InvoiceInsert = {
    organization_id: assocRow.organization_id,
    association_id: assoc.id,
    vendor_id: value.vendorId,
    invoice_number: value.invoiceNumber,
    invoice_date: value.invoiceDate,
    due_date: value.dueDate ?? null,
    amount: value.amount,
    status: 'received',
  }
  const { data: invoice, error: iErr } = await supabase
    .from('invoices')
    .insert(invoicePayload)
    .select('id')
    .single()
  if (iErr || !invoice) {
    return { ok: false, error: `invoice insert: ${iErr?.message}` }
  }

  const je = await postJournalEntry(supabase, {
    organizationId: assocRow.organization_id,
    associationId: assoc.id,
    fiscalPeriodId: period.id,
    entryDate: value.invoiceDate,
    memo:
      value.memo ?? `Bill: ${value.invoiceNumber} (invoice ${invoice.id.slice(0, 8)})`,
    source: 'ap_invoice',
    sourceId: invoice.id,
    lines: [
      {
        accountId: value.expenseAccountId,
        fundId: refs.fundOperating,
        debit: value.amount,
        credit: 0,
      },
      {
        accountId: refs.acctAP,
        fundId: refs.fundOperating,
        debit: 0,
        credit: value.amount,
      },
    ],
  })

  if (!je.ok) {
    // Roll back the invoice so we don't leave it dangling.
    await supabase.from('invoices').delete().eq('id', invoice.id)
    return { ok: false, error: `JE failed: ${je.error}` }
  }

  await supabase
    .from('invoices')
    .update({ status: 'approved' })
    .eq('id', invoice.id)

  revalidatePath('/accounting/invoices')
  revalidatePath('/accounting')
  revalidatePath('/accounting/ledger')
  return { ok: true, invoiceId: invoice.id }
}

// ─── deleteInvoice ──────────────────────────────────────────────────

export async function deleteInvoice(
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()
  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', invoiceId)
    .eq('association_id', assoc.id)
    .single()
  if (!invoice) return { ok: false, error: 'Invoice not found.' }

  if (invoice.status === 'paid') {
    return { ok: false, error: 'Cannot delete a paid invoice. Reverse the payment first.' }
  }

  const { error } = await supabase
    .from('invoices')
    .delete()
    .eq('id', invoiceId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/accounting/invoices')
  revalidatePath('/accounting')
  revalidatePath('/accounting/ledger')
  return { ok: true }
}

// ─── markInvoicePaid ─────────────────────────────────────────────────

const MarkInvoicePaidSchema = z.object({
  invoiceId: z.string().uuid(),
  paymentMethod: z
    .enum(['ach', 'card', 'check', 'cash', 'other'])
    .default('check'),
  externalRef: z.string().max(120).optional(),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/**
 * Record payment against an approved invoice. Inserts the payments row,
 * posts the JE:
 *   Dr AP / Cr Cash—Operating   in OPERATING fund.
 *
 * Links payments.journal_entry_id back, flips invoice.status='paid'.
 */
export async function markInvoicePaid(input: {
  invoiceId: string
  paymentMethod?: 'ach' | 'card' | 'check' | 'cash' | 'other'
  externalRef?: string
  paidAt?: string
}): Promise<InvoiceActionResult> {
  const parsed = MarkInvoicePaidSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'invalid input' }
  }
  const value = parsed.data

  const assoc = await getPrimaryAssociation()
  if (!assoc) return { ok: false, error: 'No HOA association configured.' }

  const supabase = await getSupabaseServerClient()

  const { data: invoice, error: iErr } = await supabase
    .from('invoices')
    .select('id, organization_id, association_id, amount, status, invoice_date')
    .eq('id', value.invoiceId)
    .eq('association_id', assoc.id)
    .single()
  if (iErr || !invoice) return { ok: false, error: iErr?.message ?? 'invoice not found' }

  if (invoice.status === 'paid') {
    return { ok: false, error: 'invoice already paid' }
  }
  if (invoice.status === 'cancelled' || invoice.status === 'disputed') {
    return { ok: false, error: `invoice is ${invoice.status}` }
  }

  const refs = await loadAccountingRefs(supabase, assoc.id)
  if (!refs) return { ok: false, error: 'Accounting not set up — run pnpm seed:accounting.' }

  const { data: period } = await supabase
    .from('fiscal_periods')
    .select('id')
    .eq('association_id', assoc.id)
    .eq('status', 'open')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!period) return { ok: false, error: 'No open fiscal period.' }

  const paidAt = (value.paidAt ?? new Date().toISOString().slice(0, 10)) + 'T12:00:00Z'

  // payments has a CHECK (assessment_id XOR invoice_id). amount can be
  // signed; for AP outflow we want positive on the invoice/payment side
  // (the JE direction encodes the cash flow). The schema's check is
  // `amount <> 0`, so positive is fine.
  const paymentPayload: PaymentInsert = {
    organization_id: invoice.organization_id,
    invoice_id: invoice.id,
    amount: Number(invoice.amount),
    payment_method: value.paymentMethod,
    external_ref: value.externalRef ?? null,
    paid_at: paidAt,
  }
  const { data: payment, error: pErr } = await supabase
    .from('payments')
    .insert(paymentPayload)
    .select('id')
    .single()
  if (pErr || !payment) return { ok: false, error: `payment insert: ${pErr?.message}` }

  const je = await postJournalEntry(supabase, {
    organizationId: invoice.organization_id,
    associationId: assoc.id,
    fiscalPeriodId: period.id,
    entryDate: paidAt.slice(0, 10),
    memo: `Bill payment: invoice ${invoice.id.slice(0, 8)}`,
    source: 'ap_invoice',
    sourceId: payment.id,
    lines: [
      {
        accountId: refs.acctAP,
        fundId: refs.fundOperating,
        debit: Number(invoice.amount),
        credit: 0,
      },
      {
        accountId: refs.acctCashOperating,
        fundId: refs.fundOperating,
        debit: 0,
        credit: Number(invoice.amount),
      },
    ],
  })

  if (!je.ok) {
    await supabase.from('payments').delete().eq('id', payment.id)
    return { ok: false, error: `JE failed: ${je.error}` }
  }

  await Promise.all([
    supabase
      .from('payments')
      .update({ journal_entry_id: je.journalEntryId })
      .eq('id', payment.id),
    supabase
      .from('invoices')
      .update({ status: 'paid' })
      .eq('id', invoice.id),
  ])

  revalidatePath('/accounting/invoices')
  revalidatePath(`/accounting/invoices/${invoice.id}`)
  revalidatePath('/accounting/ledger')
  revalidatePath('/accounting')
  return { ok: true, invoiceId: invoice.id }
}
