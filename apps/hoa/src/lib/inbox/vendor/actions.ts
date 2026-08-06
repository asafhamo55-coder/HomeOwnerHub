'use server'

/**
 * Filing an inbox thread under a vendor, and creating that vendor from the
 * email when it doesn't exist yet.
 *
 * Both the thread AND the vendor are verified to belong to the caller's org
 * before any write. That is not defensive noise — it is the exact hazard
 * `linkThreadToResource` (lib/inbox/actions.ts) had to be patched for: a
 * foreign resource id arriving from a form and being stamped with this
 * org's id. A foreign key alone only proves the row exists somewhere, not
 * that it belongs to this tenant.
 *
 * Never log an email address, subject, or body — these carry resident and
 * vendor PII. `PostgrestError.code`/`.message` only, never `.details`.
 */

import { revalidatePath } from 'next/cache'
import { extractVendor, type VendorExtractorOutput } from '@homeowner-portal/workflows'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { QuickCreateVendorSchema, isVendorIncomplete } from './schema'

export interface VendorOption {
  vendorId: string
  legalName: string
  primaryEmail: string | null
  incomplete: boolean
}

interface VendorSearchRow {
  id: string
  legal_name: string
  primary_email: string | null
  ein: string | null
  trades: string[] | null
}

/** Escapes `%` and `_` so a typed wildcard can't widen the search. */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (match) => `\\${match}`)
}

export async function searchVendors(term: string): Promise<VendorOption[]> {
  const { org } = await requireBoardOrAdmin()

  const trimmed = term.trim()
  if (!trimmed) return []

  const supabase = await getSupabaseServerClient()
  const pattern = `%${escapeLikePattern(trimmed)}%`

  const { data, error } = await supabase
    .from('vendors' as never)
    .select('id, legal_name, primary_email, ein, trades')
    .eq('organization_id', org.id)
    .or(`legal_name.ilike.${pattern},dba.ilike.${pattern},primary_email.ilike.${pattern}`)
    .order('legal_name')
    .limit(20)
    .returns<VendorSearchRow[]>()

  if (error) {
    console.error(`searchVendors: ${error.code} ${error.message}`)
    return []
  }

  return (data ?? []).map((vendor) => ({
    vendorId: vendor.id,
    legalName: vendor.legal_name,
    primaryEmail: vendor.primary_email,
    incomplete: isVendorIncomplete({ ein: vendor.ein, trades: vendor.trades }),
  }))
}

export async function assignThreadToVendor(
  threadId: string,
  vendorId: string,
): Promise<{ ok: true } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  // Vendor first, org-scoped. A vendorId belonging to another tenant must
  // never become writable onto this org's thread.
  const { data: vendor, error: vendorError } = await supabase
    .from('vendors' as never)
    .select('id')
    .eq('id', vendorId)
    .eq('organization_id', org.id)
    .maybeSingle<{ id: string }>()

  if (vendorError) {
    console.error(
      `assignThreadToVendor: vendor lookup failed: ${vendorError.code} ${vendorError.message}`,
    )
    return { error: 'Could not file this thread. Try again.' }
  }
  if (!vendor) return { error: 'Vendor not found.' }

  const { data, error } = await supabase
    .from('inbox_threads')
    .update({ vendor_id: vendorId } as never)
    .eq('id', threadId)
    .eq('organization_id', org.id)
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error) {
    console.error(`assignThreadToVendor: update failed: ${error.code} ${error.message}`)
    return { error: 'Could not file this thread. Try again.' }
  }
  if (!data) return { error: 'Thread not found.' }

  revalidatePath(`/inbox/${threadId}`)
  return { ok: true }
}

export async function unassignThreadVendor(
  threadId: string,
): Promise<{ ok: true } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from('inbox_threads')
    .update({ vendor_id: null } as never)
    .eq('id', threadId)
    .eq('organization_id', org.id)
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error) {
    console.error(`unassignThreadVendor: update failed: ${error.code} ${error.message}`)
    return { error: 'Could not unfile this thread. Try again.' }
  }
  if (!data) return { error: 'Thread not found.' }

  revalidatePath(`/inbox/${threadId}`)
  return { ok: true }
}

/**
 * Create a vendor from what an email can actually supply, then file the
 * thread under it.
 *
 * The duplicate check is server-side, not merely a UI affordance: the client
 * cannot be trusted to have run its type-ahead, and a double submit would
 * otherwise create two vendors for one company. It returns the existing id
 * rather than a bare error string so the caller can offer a one-click "file
 * under them instead" instead of a dead end.
 */
export async function quickCreateVendor(
  threadId: string,
  input: unknown,
): Promise<{ ok: true; vendorId: string } | { error: string; duplicateVendorId?: string }> {
  const { org } = await requireBoardOrAdmin()

  const parsed = QuickCreateVendorSchema.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid vendor details.' }
  }
  const vendor = parsed.data

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  // Exact-email duplicate check, org-scoped. The schema lowercases the
  // email, so this is case-insensitive without needing a functional index.
  const { data: existing, error: dupeError } = await supabase
    .from('vendors' as never)
    .select('id')
    .eq('organization_id', org.id)
    .eq('primary_email', vendor.primaryEmail)
    .maybeSingle<{ id: string }>()

  if (dupeError) {
    console.error(
      `quickCreateVendor: duplicate check failed: ${dupeError.code} ${dupeError.message}`,
    )
    return { error: 'Could not create this vendor. Try again.' }
  }
  if (existing) {
    return {
      error: 'A vendor already uses this email address.',
      duplicateVendorId: existing.id,
    }
  }

  const address =
    vendor.address && Object.values(vendor.address).some((value) => value != null && value !== '')
      ? {
          line1: vendor.address.line1 ?? null,
          line2: null,
          city: vendor.address.city ?? null,
          state: vendor.address.state ?? null,
          postal_code: vendor.address.postal_code ?? null,
        }
      : null

  const { data: row, error } = await supabase
    .from('vendors' as never)
    .insert({
      organization_id: org.id,
      legal_name: vendor.legalName,
      dba: vendor.dba ?? null,
      // EIN is deliberately absent, not merely unset: it is never present in
      // a signature block, and an invented one would corrupt 1099 reporting.
      // A human enters it on the vendor page, which is what clears the
      // "setup incomplete" banner.
      ein: null,
      primary_email: vendor.primaryEmail,
      primary_phone: vendor.primaryPhone ?? null,
      // Single extracted trade -> the table's text[] column.
      trades: vendor.trade ? [vendor.trade] : null,
      address,
      notes: vendor.notes ?? null,
      status: 'prospect',
      ai_generated: vendor.aiGenerated,
      created_by: user.id,
    } as never)
    .select('id')
    .maybeSingle<{ id: string }>()

  if (error || !row) {
    console.error(`quickCreateVendor: insert failed: ${error?.code} ${error?.message}`)
    return { error: 'Could not create this vendor.' }
  }

  const assigned = await assignThreadToVendor(threadId, row.id)
  if ('error' in assigned) {
    // The vendor exists and is valid; only the filing failed. Say that
    // precisely rather than implying nothing was created — otherwise the
    // user retries and ends up with a duplicate.
    return {
      error: 'Vendor created, but filing this thread under it failed. Assign it manually.',
    }
  }

  revalidatePath(`/inbox/${threadId}`)
  revalidatePath('/vendors')
  return { ok: true, vendorId: row.id }
}

/**
 * Read the newest inbound message on a thread and pull vendor details from
 * its signature block.
 *
 * Every failure path returns an error rather than throwing, and the modal
 * that calls this stays fully usable on failure with just the sender's
 * address and display name. Extraction is an enhancement, never a gate —
 * a board member must always be able to create the vendor by hand.
 */
export async function extractVendorFromThread(
  threadId: string,
): Promise<{ ok: true; extracted: VendorExtractorOutput } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: message, error } = await supabase
    .from('inbox_messages')
    .select('subject, stripped_text, body_text, from_email, from_name')
    .eq('thread_id', threadId)
    .eq('organization_id', org.id)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error(`extractVendorFromThread: message read failed: ${error.code} ${error.message}`)
    return { error: 'Could not read this thread.' }
  }
  if (!message?.from_email) return { error: 'No inbound message to read.' }

  // `stripped_text` already has the quoted reply chain removed at ingest;
  // fall back to the full body for older rows where it is null.
  const bodyText = message.stripped_text ?? message.body_text ?? ''
  if (!bodyText.trim()) return { error: 'This message has no body to read.' }

  try {
    const extracted = await extractVendor(
      {
        subject: message.subject ?? null,
        bodyText,
        senderEmail: message.from_email,
        senderName: message.from_name ?? null,
      },
      { organizationId: org.id },
    )
    return { ok: true, extracted }
  } catch (err) {
    // Log the error's type only — a model or parse failure can carry email
    // content in its message.
    console.error(
      `extractVendorFromThread: extraction failed: ${err instanceof Error ? err.name : 'UnknownError'}`,
    )
    return { error: 'Could not read the signature block. Fill the form in manually.' }
  }
}
