import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedContext } from '../ui-shots-seed'

/** Demo rows for the resident shots. Idempotent; invented data only. */
export async function seed_resident(_db: SupabaseClient, _ctx: SeedContext): Promise<Record<string, string>> {
  return {}
}
