'use server'

// Server action for the CSV-based bulk import of properties + residents.
//
// Lives in the platform-admin tree → already gated by the layout, but
// requirePlatformAdmin() is called again here for defense-in-depth, BEFORE
// any client is built. Service-role writes happen through
// createAdminClient() which uses the Vercel-provided
// SUPABASE_SERVICE_ROLE_KEY at runtime (no env vars on the operator's
// laptop). The import itself (both sides of every lot) lives in
// lib/properties/import.ts.

import { createAdminClient } from '@homeowner-portal/db'
import { requirePlatformAdmin } from '@/lib/platform-admin'
import { runUnitsImport, type ImportInput, type ImportResult } from '@/lib/properties/import'

export type { ImportInput, ImportResult } from '@/lib/properties/import'

export async function runImport(input: ImportInput): Promise<ImportResult> {
  await requirePlatformAdmin()
  return runUnitsImport(createAdminClient(), input)
}

// ─── Org + association loaders for the form dropdowns ────────────────

export interface OrgOption {
  id: string
  name: string
}
export interface AssociationOption {
  id: string
  name: string
  organization_id: string
  state: string | null
}

export async function loadImportFormOptions(): Promise<{
  orgs: OrgOption[]
  associations: AssociationOption[]
}> {
  await requirePlatformAdmin()
  const db = createAdminClient()

  const [{ data: orgs }, { data: assocs }] = await Promise.all([
    db.from('orgs' as never)
      .select('id, name')
      .order('name')
      .returns<OrgOption[]>(),
    db.from('associations' as never)
      .select('id, name, organization_id, state')
      .order('name')
      .returns<AssociationOption[]>(),
  ])

  return {
    orgs: orgs ?? [],
    associations: assocs ?? [],
  }
}
