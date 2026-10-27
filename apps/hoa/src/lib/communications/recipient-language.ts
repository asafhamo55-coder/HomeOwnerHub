/**
 * Residents' preferred message language, read once per send.
 *
 * One chunked `in` read of resident_communication_preferences for the
 * recipients that have a user id, and only when the body is bilingual (a
 * single-language body has nothing to choose). A failed read returns an
 * empty map: the fallback is the BL-025 default of both languages, which is
 * always safe, so a read failure must not stop a send.
 *
 * Only 'es' narrows a message. The column defaults to 'en', so a stored 'en'
 * may be that default rather than a choice; it is treated as no choice, and
 * the resident gets both languages. (English-only needs a migration that
 * tells a choice from the default.)
 *
 * A user can hold several rows (one per unit); the most recently updated
 * one wins.
 *
 * Not a 'use server' file: nothing here is callable from a browser.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { normalizeLanguage } from './bilingual'

const CHUNK = 100

export async function loadLanguagePreferences(
  db: SupabaseClient<Database>,
  userIds: readonly (string | null | undefined)[],
): Promise<Map<string, 'es'>> {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))]
  const out = new Map<string, 'es'>()
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await db
      .from('resident_communication_preferences')
      .select('user_id, language, updated_at')
      .in('user_id', ids.slice(i, i + CHUNK))
      .order('updated_at', { ascending: true })
    if (error) return new Map()
    // Ascending, so a later (newer) row overwrites an earlier one.
    for (const row of data ?? []) {
      if (!row.user_id) continue
      // Newest row wins, so a later 'en' (default) clears an earlier 'es'.
      if (normalizeLanguage(row.language) === 'es') out.set(row.user_id, 'es')
      else out.delete(row.user_id)
    }
  }
  return out
}
