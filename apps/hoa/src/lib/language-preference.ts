/**
 * A resident's preferred message language (BL-025 follow-up).
 *
 * Stored in resident_communication_preferences.language, one row per user
 * (0018's unique index). The send path reads it (./communications/
 * recipient-language.ts): a bilingual message goes out in just that
 * language; no row or no translation keeps the both-languages default.
 *
 * Writes use the resident's own RLS-bound client. 0063's policies let a
 * member insert/update only rows where user_id = auth.uid() in their own
 * org, so this module cannot touch anyone else's row even if it tried.
 *
 * No Next imports (testable with fakes). Nothing here logs row values.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { normalizeLanguage, type CommLanguage } from './communications/bilingual'

type Client = SupabaseClient<Database>

/** Strict: unknown input is rejected, not coerced. */
export function parseLanguage(input: unknown): CommLanguage | null {
  return normalizeLanguage(input)
}

export type LanguageState =
  | { ok: true; language: CommLanguage | null; otherOrg: boolean }
  | { ok: false }

/** null language = no row yet (they get both languages). */
export async function loadMyLanguage(client: Client, orgId: string, userId: string): Promise<LanguageState> {
  const { data, error } = await client
    .from('resident_communication_preferences')
    .select('organization_id, language')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { ok: false }
  if (!data) return { ok: true, language: null, otherOrg: false }
  if (data.organization_id !== orgId) return { ok: true, language: null, otherOrg: true }
  return { ok: true, language: normalizeLanguage(data.language), otherOrg: false }
}

export type SaveLanguageResult = { ok: true } | { ok: false; error: 'read_failed' | 'write_failed' | 'other_org' }

export async function saveMyLanguage(
  client: Client,
  args: { orgId: string; userId: string; language: CommLanguage; now: Date },
): Promise<SaveLanguageResult> {
  const existing = await client
    .from('resident_communication_preferences')
    .select('id, organization_id')
    .eq('user_id', args.userId)
    .maybeSingle()
  if (existing.error) return { ok: false, error: 'read_failed' }
  const row = existing.data
  if (row && row.organization_id !== args.orgId) return { ok: false, error: 'other_org' }
  const at = args.now.toISOString()
  if (row) {
    const { error } = await client
      .from('resident_communication_preferences')
      .update({ language: args.language, updated_at: at })
      .eq('id', row.id)
      .eq('user_id', args.userId)
    return error ? { ok: false, error: 'write_failed' } : { ok: true }
  }
  const { error } = await client
    .from('resident_communication_preferences')
    .insert({ organization_id: args.orgId, user_id: args.userId, language: args.language, updated_at: at })
  return error ? { ok: false, error: 'write_failed' } : { ok: true }
}
