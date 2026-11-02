/**
 * BL-032: reads and writes of public.mailed_letters (migration 0079, dark
 * behind M14_APPLIED). Reads use the caller's cookie-bound client so RLS
 * applies (board and admin of the organization only). Writes use the service
 * role, because the table grants no write to `authenticated`. Rows hold ids,
 * cents and tracking only: no name, address or letter text.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { M14_APPLIED } from '@homeowner-portal/db/m14'
import type { MailedLetterRow } from './send'
import type { MailedLetterView } from './status'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = { from: (t: string) => any }
type Row = {
  approval_request_id: string
  mail_method: MailedLetterView['mailService']
  status: MailedLetterView['status']
  tracking_number: string | null
  expected_delivery_on: string | null
  mailed_on: string | null
  delivered_on: string | null
  confirmed_cents: number
  color: boolean
  pages: number
}

const COLUMNS = 'approval_request_id, mail_method, status, tracking_number, expected_delivery_on, mailed_on, delivered_on, confirmed_cents, color, pages'
const CHUNK = 100

const toView = (r: Row): MailedLetterView => ({
  approvalRequestId: r.approval_request_id,
  mailService: r.mail_method,
  status: r.status,
  trackingNumber: r.tracking_number,
  expectedDeliveryOn: r.expected_delivery_on,
  mailedOn: r.mailed_on,
  deliveredOn: r.delivered_on,
  confirmedCents: r.confirmed_cents,
  color: r.color,
  pages: r.pages,
})

/** The mailed rows for these approval requests, keyed by request id. Empty before M14. Throws on a failed read. */
export async function loadMailedLetters(supabase: SupabaseClient, orgId: string, requestIds: string[]): Promise<Map<string, MailedLetterView>> {
  const out = new Map<string, MailedLetterView>()
  if (!M14_APPLIED || requestIds.length === 0) return out
  const db = supabase as unknown as Loose
  for (let i = 0; i < requestIds.length; i += CHUNK) {
    const { data, error } = (await db
      .from('mailed_letters')
      .select(COLUMNS)
      .eq('organization_id', orgId)
      .in('approval_request_id', requestIds.slice(i, i + CHUNK))) as { data: Row[] | null; error: { code?: string } | null }
    if (error) throw new Error(`mailed letters: read failed (${error.code ?? 'no code'})`)
    for (const r of data ?? []) out.set(r.approval_request_id, toView(r))
  }
  return out
}

export async function mailedLetterExists(admin: SupabaseClient, orgId: string, approvalRequestId: string): Promise<boolean> {
  const { data, error } = (await (admin as unknown as Loose)
    .from('mailed_letters')
    .select('id')
    .eq('organization_id', orgId)
    .eq('approval_request_id', approvalRequestId)
    .limit(1)) as { data: Array<{ id: string }> | null; error: { code?: string } | null }
  if (error) throw new Error(`mailed letters: lookup failed (${error.code ?? 'no code'})`)
  return (data?.length ?? 0) > 0
}

export async function insertMailedLetter(admin: SupabaseClient, row: MailedLetterRow): Promise<{ ok: true } | { ok: false }> {
  const { error } = await (admin as unknown as Loose).from('mailed_letters').insert({
    organization_id: row.organizationId,
    association_id: row.associationId,
    approval_request_id: row.approvalRequestId,
    collection_case_id: row.collectionCaseId,
    provider: row.provider,
    provider_letter_id: row.providerLetterId,
    mail_method: row.mailService,
    color: row.color,
    pages: row.pages,
    quoted_cents: row.quotedCents,
    confirmed_cents: row.confirmedCents,
    status: row.status,
    tracking_number: row.trackingNumber,
    expected_delivery_on: row.expectedDeliveryOn,
    confirmed_by: row.confirmedBy,
  })
  return error ? { ok: false } : { ok: true }
}

export interface MailedLetterRecord extends MailedLetterView {
  providerLetterId: string | null
  provider: 'lob' | 'postgrid' | 'fake'
}

export async function loadMailedLetterRecord(admin: SupabaseClient, orgId: string, approvalRequestId: string): Promise<MailedLetterRecord | null> {
  const { data, error } = (await (admin as unknown as Loose)
    .from('mailed_letters')
    .select(`${COLUMNS}, provider, provider_letter_id`)
    .eq('organization_id', orgId)
    .eq('approval_request_id', approvalRequestId)
    .limit(1)) as { data: Array<Row & { provider: MailedLetterRecord['provider']; provider_letter_id: string | null }> | null; error: { code?: string } | null }
  if (error) throw new Error(`mailed letters: lookup failed (${error.code ?? 'no code'})`)
  const r = data?.[0]
  return r ? { ...toView(r), provider: r.provider, providerLetterId: r.provider_letter_id } : null
}

export async function updateMailedLetterTracking(
  admin: SupabaseClient,
  orgId: string,
  approvalRequestId: string,
  u: { status: MailedLetterView['status']; trackingNumber: string | null; mailedOn: string | null; deliveredOn: string | null },
): Promise<boolean> {
  const { error } = await (admin as unknown as Loose)
    .from('mailed_letters')
    .update({ status: u.status, tracking_number: u.trackingNumber, mailed_on: u.mailedOn, delivered_on: u.deliveredOn })
    .eq('organization_id', orgId)
    .eq('approval_request_id', approvalRequestId)
  return !error
}
