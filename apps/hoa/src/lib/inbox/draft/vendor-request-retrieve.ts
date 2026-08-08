/**
 * Assembles W34's input from a resident thread.
 *
 * Deliberately NOT folded into `retrieve.ts`. That module is 20KB of W32's
 * grounding machinery — document fragments, statute chunks, embeddings, voice
 * examples, citation refIds — and a vendor work order needs none of it. Going
 * through it would mean retrieving-by-not-retrieving down every branch.
 *
 * Each source degrades independently. Only the messages are fatal: without
 * the conversation there is nothing to draft. Everything else pushes a label
 * onto `degraded`, which the prompt renders under UNAVAILABLE so the model is
 * told a source is missing rather than left to treat absent as empty. An
 * unnamed missing unit becomes a vendor dispatched to an unnamed building.
 *
 * Never log an email address, subject, body, file name, or storage path.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PhotoFinding } from '@homeowner-portal/workflows'
import { getThreadDetail } from '@/lib/inbox/queries'
import { readPdfTexts } from '@/lib/inbox/attachment-pdf'
import {
  selectParsableAttachments,
  joinAttachmentText,
  type CandidateAttachment,
} from '@/lib/inbox/vendor/attachment-text'

/** Same bucket the attachment download route and W33 read from. */
const ATTACHMENT_BUCKET = 'hoa-documents'

export type VendorRequestDegradedSource = 'property' | 'vendor' | 'attachments'

export interface VendorRequestRetrieval {
  threadSubject: string | null
  messages: Array<{ direction: 'inbound' | 'outbound'; from: string; text: string }>
  property: { addressLine1: string; unitNumber: string | null } | null
  vendor: { legalName: string; dba: string | null; trades: string[] } | null
  attachmentText: string | null
  /**
   * Always `[]` this phase — no vision producer exists (spec D9). Carried so
   * that adding one later is a new producer feeding an existing field.
   */
  photoFindings: PhotoFinding[]
  degraded: VendorRequestDegradedSource[]
  /**
   * The vendor already filed against the source thread, stamped onto the
   * draft so "what did we send this vendor" is answerable without parsing
   * recipient addresses back into vendor records.
   */
  vendorId: string | null
  /** The mailbox the resident wrote to; the request sends from the same one. */
  mailboxAccountId: string | null
  /** Stored inbound attachments, for copying onto the draft. */
  attachments: Array<{ id: string; fileName: string; sizeBytes: number }>
}

// Deliberately loose: this module reads four tables through the caller's
// already-org-scoped client and does not need the generated schema generic.
type Db = SupabaseClient<never>

export async function retrieveForVendorRequest(
  db: Db,
  orgId: string,
  threadId: string,
): Promise<VendorRequestRetrieval | null> {
  // Org-scoped inside getThreadDetail. Throws on a failed thread/message
  // read, which is correct — a truncated conversation would draft a work
  // order missing the half of the story that mattered.
  const thread = await getThreadDetail(db as never, orgId, threadId)
  if (!thread) return null

  const degraded: VendorRequestDegradedSource[] = []

  // strippedText, not bodyText: quoted history is already cut, and W34
  // summarizes rather than forwards, so the history costs tokens and invites
  // the model to restate a month-old exchange as if it were current.
  const messages = thread.messages
    .map((message) => ({
      direction: message.direction,
      from: message.fromEmail ?? '',
      text: message.strippedText ?? message.bodyText ?? '',
    }))
    .filter((message) => message.text.trim().length > 0)

  const [property, vendor, attachmentRows] = await Promise.all([
    thread.unitId ? loadProperty(db, orgId, thread.unitId) : null,
    thread.vendorId ? loadVendor(db, orgId, thread.vendorId) : null,
    loadAttachments(db, orgId, thread.messages.map((m) => m.id)),
  ])

  // A thread with no unit matched is the ordinary case for a brand-new
  // sender, not a failure — but the model must still be told, because the
  // address is the one field a vendor cannot do without.
  if (!property) degraded.push('property')
  if (!vendor) degraded.push('vendor')

  let attachmentText: string | null = null
  if (attachmentRows === null) {
    degraded.push('attachments')
  } else {
    const parsable = selectParsableAttachments(attachmentRows)
    attachmentText = joinAttachmentText(await readPdfTexts(db, ATTACHMENT_BUCKET, parsable))
  }

  return {
    threadSubject: thread.subject,
    messages,
    property,
    vendor,
    attachmentText,
    photoFindings: [],
    degraded,
    vendorId: thread.vendorId,
    mailboxAccountId: await loadMailboxAccountId(db, orgId, threadId),
    attachments: (attachmentRows ?? [])
      .filter((row) => row.fetch_status === 'stored' && row.storage_path)
      .map((row) => ({
        id: row.id,
        fileName: row.file_name,
        sizeBytes: row.size_bytes ?? 0,
      })),
  }
}

async function loadProperty(
  db: Db,
  orgId: string,
  unitId: string,
): Promise<{ addressLine1: string; unitNumber: string | null } | null> {
  const { data, error } = await db
    .from('units')
    .select('address_line1, unit_number')
    .eq('organization_id', orgId)
    .eq('id', unitId)
    .maybeSingle<{ address_line1: string | null; unit_number: string | null }>()

  if (error) {
    console.error(`retrieveForVendorRequest: units read failed: ${error.code} ${error.message}`)
    return null
  }
  if (!data?.address_line1) return null

  return { addressLine1: data.address_line1, unitNumber: data.unit_number }
}

async function loadVendor(
  db: Db,
  orgId: string,
  vendorId: string,
): Promise<{ legalName: string; dba: string | null; trades: string[] } | null> {
  const { data, error } = await db
    .from('vendors')
    .select('legal_name, dba, trades')
    .eq('organization_id', orgId)
    .eq('id', vendorId)
    .maybeSingle<{ legal_name: string; dba: string | null; trades: string[] | null }>()

  if (error) {
    console.error(`retrieveForVendorRequest: vendors read failed: ${error.code} ${error.message}`)
    return null
  }
  if (!data) return null

  return { legalName: data.legal_name, dba: data.dba, trades: data.trades ?? [] }
}

/**
 * Returns null — distinct from `[]` — when the read itself failed, so the
 * caller can tell "this thread has no attachments" from "we could not find
 * out". Only the second belongs in `degraded`.
 */
async function loadAttachments(
  db: Db,
  orgId: string,
  messageIds: string[],
): Promise<CandidateAttachment[] | null> {
  if (messageIds.length === 0) return []

  const { data, error } = await db
    .from('inbox_attachments')
    .select('id, file_name, content_type, size_bytes, storage_path, fetch_status')
    .eq('organization_id', orgId)
    .in('message_id', messageIds)
    .returns<CandidateAttachment[]>()

  if (error) {
    console.error(
      `retrieveForVendorRequest: inbox_attachments read failed: ${error.code} ${error.message}`,
    )
    return null
  }

  return data ?? []
}

/**
 * The mailbox the resident wrote to.
 *
 * Read from the SOURCE thread rather than defaulting to the org's first
 * account: a two-mailbox association would otherwise send a work order from
 * an address the vendor has never corresponded with, and any reply would land
 * in the wrong inbox.
 */
async function loadMailboxAccountId(
  db: Db,
  orgId: string,
  threadId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from('inbox_threads')
    .select('mailbox_account_id')
    .eq('organization_id', orgId)
    .eq('id', threadId)
    .maybeSingle<{ mailbox_account_id: string | null }>()

  if (error) {
    console.error(
      `retrieveForVendorRequest: inbox_threads read failed: ${error.code} ${error.message}`,
    )
    return null
  }

  return data?.mailbox_account_id ?? null
}
