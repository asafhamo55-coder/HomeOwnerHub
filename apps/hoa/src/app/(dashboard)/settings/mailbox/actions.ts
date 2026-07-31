'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ScopeSchema } from './scopeSchema'

export interface MailboxActionState {
  error?: string
  ok?: boolean
}

export async function updateScope(
  _prev: MailboxActionState,
  formData: FormData,
): Promise<MailboxActionState> {
  const org = await getCurrentOrg()
  if (!org) return { error: 'No organization in session.' }

  const parsed = ScopeSchema.safeParse({
    accountId: formData.get('accountId'),
    scopeMode: formData.get('scopeMode'),
    scopeValue: formData.get('scopeValue') ?? undefined,
  })
  // Fail closed. ScopeSchema (./scopeSchema.ts) enforces two things
  // together, both required before this is ever persisted: (1) address
  // and label modes are meaningless without a value — buildScopeQuery
  // (@homeowner-portal/mailbox) treats an EMPTY value for those modes as
  // "no restricting clause", which would fetch everything, so a missing
  // value is rejected here rather than silently becoming unrestricted;
  // and (2) the value's SHAPE must match the selected mode (a single
  // email address for 'address', a `[A-Za-z0-9_-]+` token for 'label') —
  // this is what stops a stale value from a previous mode selection (or a
  // hand-crafted submission) from being saved with a mode it doesn't
  // match, which would otherwise only surface later as a thrown error
  // inside a sync. Trimming happens inside the schema so a
  // whitespace-only value can't slip past either check.
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid scope selection.'
    return { error: message }
  }

  const { accountId, scopeMode, scopeValue } = parsed.data

  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from('mailbox_accounts')
    .update({ scope_mode: scopeMode, scope_value: scopeValue ?? null })
    .eq('id', accountId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/settings/mailbox')
  revalidatePath('/onboarding/setup')
  return { ok: true }
}

export async function disconnectMailbox(
  _prev: MailboxActionState,
  formData: FormData,
): Promise<MailboxActionState> {
  const org = await getCurrentOrg()
  if (!org) return { error: 'No organization in session.' }

  const accountId = z.string().uuid().safeParse(formData.get('accountId'))
  if (!accountId.success) return { error: 'Invalid account.' }

  const supabase = await getSupabaseServerClient()

  // Soft disconnect. Ingested mail and its threads stay in place — the
  // HOA's correspondence record must not vanish because someone unlinked
  // Gmail. The unique index on mailbox_accounts is partial (WHERE
  // disconnected_at IS NULL), so this correctly frees the address up for
  // a future reconnect without deleting anything.
  const { error } = await supabase
    .from('mailbox_accounts')
    .update({ disconnected_at: new Date().toISOString() })
    .eq('id', accountId.data)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/settings/mailbox')
  return { ok: true }
}
