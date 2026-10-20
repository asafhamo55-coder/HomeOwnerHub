import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Migration 0065 part 3 is "verbatim from docs/specs/2026-10-20-sms-consent.sql
// part 2" (runbook D2 / H2): the owner may apply either, in either order, so
// the two copies of the SMS consent guard must stay byte-identical. Pure file
// read, no database.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')

function smsGuardBlock(sql: string): string {
  const start = sql.indexOf('create or replace function public.resident_sms_opt_in_self_only()')
  const endMarker = 'for each row execute function public.resident_sms_opt_in_self_only();'
  const end = sql.indexOf(endMarker, start)
  if (start < 0 || end < 0) throw new Error('SMS consent guard block not found')
  return sql.slice(start, end + endMarker.length)
}

describe('SMS consent guard: migration 0065 = spec part 2', () => {
  const migration = smsGuardBlock(read('migrations/0065_m2_prep.sql'))
  const spec = smsGuardBlock(read('docs/specs/2026-10-20-sms-consent.sql'))

  it('the two copies are byte-identical', () => {
    expect(migration).toBe(spec)
  })

  it('fires on user_id changes too (L-1: moving an opted-in row)', () => {
    expect(migration).toContain('before insert or update of sms_opt_in, user_id on public.resident_communication_preferences')
    expect(migration).toContain('new.user_id is distinct from old.user_id')
  })
})
