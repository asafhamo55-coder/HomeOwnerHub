'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface MailboxActionState {
  error?: string
  ok?: boolean
}

const ScopeSchema = z.object({
  accountId: z.string().uuid(),
  scopeMode: z.enum(['address', 'label', 'all']),
  scopeValue: z.string().max(320).optional(),
})

export async function updateScope(
  _prev: MailboxActionState,
  formData: FormData,
): Promise<MailboxActionState> {
  const org = await getCurrentOrg()
  if (!org) return { error: 'No organization in session.' }

  const parsed = ScopeSchema.safeParse({
    accountId: formData.get('accountId'),
    scopeMode: formData.get('scopeMode'),
    scopeValue: formData.get('scopeValue') || undefined,
  })
  if (!parsed.success) return { error: 'Invalid scope selection.' }

  const { accountId, scopeMode, scopeValue } = parsed.data

  // Fail closed: address and label modes are meaningless without a value,
  // and a null value would drop every message. buildScopeQuery
  // (@homeowner-portal/mailbox) throws on a malformed non-empty value at
  // sync time, but an EMPTY value for 'address'/'label' isn't malformed
  // to it — it just omits the restricting clause, which would fetch
  // everything. That "empty means unrestricted" trap has to be closed
  // here, before the save, not discovered later in a sync.
  if (scopeMode !== 'all' && !scopeValue) {
    return { error: 'Pick an address or a label for this scope.' }
  }

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
