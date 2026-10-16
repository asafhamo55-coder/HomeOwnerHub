/**
 * scripts/ui-shots-seed.ts — demo rows for `pnpm ui:shots` beyond the base
 * user + orgs that scripts/ui-shots.ts creates.
 *
 * LOCAL Supabase only (ui-shots.ts asserts a loopback host before calling
 * this). Invented data only: reserved-TLD emails, "Demo"/"Sample" street
 * names, no real people. Every seeder is idempotent (find-or-create) so
 * repeated runs and other checkouts sharing the same local stack don't pile
 * up rows.
 *
 * Returns `vars` used to fill `:var` segments in shot paths
 * (e.g. `/cases/:evictionCaseId`).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { seed_pm } from './ui-shots-seed/pm'
import { seed_eviction } from './ui-shots-seed/eviction'
import { seed_resident } from './ui-shots-seed/resident'
import { seed_dashboard } from './ui-shots-seed/dashboard'
import { seed_meetings } from './ui-shots-seed/meetings'

export interface SeedContext {
  userId: string
  hoaOrgId: string
  pmOrgId: string
  evictionOrgId: string
}

type Seeder = (db: SupabaseClient, ctx: SeedContext) => Promise<Record<string, string>>

// One file per area under scripts/ui-shots-seed/.
const SEEDERS: Seeder[] = [seed_dashboard, seed_meetings, seed_resident, seed_pm, seed_eviction]

export async function seedExtras(db: SupabaseClient, ctx: SeedContext): Promise<Record<string, string>> {
  const vars: Record<string, string> = {}
  for (const s of SEEDERS) {
    try {
      Object.assign(vars, await s(db, ctx))
    } catch (e) {
      console.log(`seed extra failed: ${(e as Error).message}`)
    }
  }
  return vars
}
