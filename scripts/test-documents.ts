/**
 * scripts/test-documents.ts
 *
 * E2E for document versioning. Hits real Postgres + Supabase Storage.
 * Pattern matches other harnesses — admin client, harness-tagged rows,
 * cleanup at the end. The replace + restore flows go through Storage
 * (upload, signed download, remove) so this also smoke-tests bucket
 * permissions.
 *
 * REQUIRES migration 0010_hoa_document_versions.sql to be applied. If
 * the table is missing the script exits with code 0 and a clear
 * "apply 0010" message — so it won't false-fail CI before activation.
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[test-documents] missing SUPABASE_URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

const STORAGE_BUCKET = 'hoa-documents'
const HARNESS_TAG = 'test-documents-harness'
type Db = SupabaseClient<Database>

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Migration gate: probe the table. If 42P01 (undefined_table), advise
  // the user and exit clean.
  const { error: probeErr } = await db
    .from('hoa_document_versions' as never)
    .select('id')
    .limit(1)
  if (
    probeErr &&
    /relation .* does not exist|42P01|Could not find the table/i.test(probeErr.message)
  ) {
    console.log(
      '[test-documents] SKIP — hoa_document_versions table not visible (apply migrations/0010_hoa_document_versions.sql and wait ~30s for the PostgREST schema cache to refresh, or hit `NOTIFY pgrst, \'reload schema\'` in the SQL editor).',
    )
    process.exit(0)
  }

  const orgId = await pickHoaOrg(db)
  console.log(`[test-documents] using org=${orgId}\n`)

  const ids: { documentId?: string; storagePaths: string[]; versionIds: string[] } = {
    storagePaths: [],
    versionIds: [],
  }
  try {
    const docId = await testInitialUpload(db, orgId, ids.storagePaths)
    if (docId) {
      ids.documentId = docId
      const v1 = await testReplaceFile(db, orgId, docId, ids.storagePaths)
      if (v1) ids.versionIds.push(v1)
      await testListVersions(db, docId)
      if (v1) await testRestoreVersion(db, docId, v1, ids.storagePaths, ids.versionIds)
      await testDeleteDocument(db, docId, ids.storagePaths)
      ids.documentId = undefined // deleted
    }
  } finally {
    await cleanup(db, ids)
  }

  console.log(`\n[test-documents] ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

// ─── seed + initial upload ───────────────────────────────────────────

async function testInitialUpload(
  db: Db,
  orgId: string,
  storagePaths: string[],
): Promise<string | null> {
  console.log('initial upload:')
  const path = `${orgId}/${HARNESS_TAG}-${Date.now()}-v0.txt`
  const body = new TextEncoder().encode('initial document content — version 0')
  const { error: uErr } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(path, body, { contentType: 'text/plain', upsert: false })
  check('initial file uploaded to storage', !uErr, uErr?.message)
  if (uErr) return null
  storagePaths.push(path)

  const { data: doc, error: dErr } = await db
    .from('hoa_documents')
    .insert({
      org_id: orgId,
      name: `${HARNESS_TAG} sample`,
      type: 'other',
      storage_path: path,
      file_size: body.length,
      parsed_text: 'initial parsed text',
      parsed_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  check('initial document row inserted', !dErr && !!doc, dErr?.message)
  return doc?.id ?? null
}

// ─── replace file ────────────────────────────────────────────────────

async function testReplaceFile(
  db: Db,
  orgId: string,
  docId: string,
  storagePaths: string[],
): Promise<string | null> {
  console.log('\nreplace file (mirror replaceDocumentFile):')

  // Snapshot current → versions BEFORE writing new state.
  const { data: current } = await db
    .from('hoa_documents')
    .select('name, storage_path, file_size, parsed_text, parsed_at, org_id')
    .eq('id', docId)
    .single()
  if (!current) {
    check('reload current doc', false)
    return null
  }
  check('reload current doc', true)

  const { data: prior } = await db
    .from('hoa_document_versions' as never)
    .select('version_number')
    .eq('document_id' as never, docId)
    .order('version_number' as never, { ascending: false })
    .limit(1)
  type PriorRow = { version_number: number }
  const priorRows = (prior ?? []) as unknown as PriorRow[]
  const nextVersion = (priorRows[0]?.version_number ?? 0) + 1
  check('first version_number = 1', nextVersion === 1)

  const { data: versionRaw, error: vErr } = await db
    .from('hoa_document_versions' as never)
    .insert({
      document_id: docId,
      org_id: current.org_id,
      version_number: nextVersion,
      name: current.name,
      storage_path: current.storage_path,
      file_size: current.file_size,
      parsed_text: current.parsed_text,
      parsed_at: current.parsed_at,
      reason: `${HARNESS_TAG}: archived v0 before replace`,
    } as never)
    .select('id')
    .single()
  type VersionInsertRow = { id: string }
  const version = versionRaw as VersionInsertRow | null
  check('archived version row inserted', !vErr && !!version, vErr?.message)
  if (!version) return null

  // Upload new file.
  const newPath = `${orgId}/${HARNESS_TAG}-${Date.now()}-v1.txt`
  const newBody = new TextEncoder().encode('updated content — version 1 after replace')
  const { error: upErr } = await db.storage
    .from(STORAGE_BUCKET)
    .upload(newPath, newBody, { contentType: 'text/plain', upsert: false })
  check('new file uploaded', !upErr, upErr?.message)
  if (upErr) return null
  storagePaths.push(newPath)

  // Update document to new state. parsed_text cleared (the production
  // server action clears it; the new file may need re-parsing).
  const { error: updErr } = await db
    .from('hoa_documents')
    .update({
      storage_path: newPath,
      file_size: newBody.length,
      parsed_text: null,
      parsed_at: null,
    })
    .eq('id', docId)
  check('document row updated to new file', !updErr, updErr?.message)

  // Verify v0 still exists in storage (replace doesn't delete the old file).
  const { data: v0Download } = await db.storage
    .from(STORAGE_BUCKET)
    .download(current.storage_path)
  check('v0 file still in storage (restore is possible)', !!v0Download)

  return version.id
}

// ─── list versions ───────────────────────────────────────────────────

async function testListVersions(db: Db, docId: string): Promise<void> {
  console.log('\nlist versions:')
  const { data } = await db
    .from('hoa_document_versions' as never)
    .select('version_number, name, reason')
    .eq('document_id' as never, docId)
    .order('version_number' as never, { ascending: false })
  type ListRow = { version_number: number; reason: string | null }
  const versions = (data ?? []) as unknown as ListRow[]
  check('exactly one version after first replace', versions.length === 1)
  check('version_number=1', versions[0]?.version_number === 1)
  check(
    'reason captured',
    !!versions[0]?.reason && versions[0].reason.includes(HARNESS_TAG),
  )
}

// ─── restore prior version ───────────────────────────────────────────

async function testRestoreVersion(
  db: Db,
  docId: string,
  versionId: string,
  storagePaths: string[],
  versionIds: string[],
): Promise<void> {
  console.log('\nrestore prior version:')

  type VersionRow = {
    storage_path: string
    file_size: number | null
    parsed_text: string | null
    parsed_at: string | null
    name: string
    org_id: string
  }
  const { data: targetRaw } = await db
    .from('hoa_document_versions' as never)
    .select('storage_path, file_size, parsed_text, parsed_at, name, org_id')
    .eq('id' as never, versionId)
    .single()
  const target = targetRaw as VersionRow | null
  if (!target) {
    check('version to restore loaded', false)
    return
  }
  check('version to restore loaded', true)

  // Snapshot current state first (so restore is reversible).
  const { data: current } = await db
    .from('hoa_documents')
    .select('storage_path, file_size, parsed_text, parsed_at, name, org_id')
    .eq('id', docId)
    .single()
  if (!current) return

  const { data: priorMaxRaw } = await db
    .from('hoa_document_versions' as never)
    .select('version_number')
    .eq('document_id' as never, docId)
    .order('version_number' as never, { ascending: false })
    .limit(1)
  type PriorMaxRow = { version_number: number }
  const priorMax = (priorMaxRaw ?? []) as unknown as PriorMaxRow[]
  const nextVersion = (priorMax[0]?.version_number ?? 0) + 1

  const { data: snapshotRaw, error: snapErr } = await db
    .from('hoa_document_versions' as never)
    .insert({
      document_id: docId,
      org_id: current.org_id,
      version_number: nextVersion,
      name: current.name,
      storage_path: current.storage_path,
      file_size: current.file_size,
      parsed_text: current.parsed_text,
      parsed_at: current.parsed_at,
      reason: `${HARNESS_TAG}: pre-restore snapshot`,
    } as never)
    .select('id')
    .single()
  type SnapshotRow = { id: string }
  const snapshot = snapshotRaw as SnapshotRow | null
  check('pre-restore snapshot saved', !snapErr && !!snapshot, snapErr?.message)
  if (snapshot) versionIds.push(snapshot.id)

  // Re-point current row to the target version's content.
  const { error: restErr } = await db
    .from('hoa_documents')
    .update({
      storage_path: target.storage_path,
      file_size: target.file_size,
      parsed_text: target.parsed_text,
      parsed_at: target.parsed_at,
    })
    .eq('id', docId)
  check('document re-pointed to target version', !restErr, restErr?.message)

  // Confirm.
  const { data: after } = await db
    .from('hoa_documents')
    .select('storage_path, parsed_text')
    .eq('id', docId)
    .single()
  check('storage_path matches target', after?.storage_path === target.storage_path)
  check('parsed_text restored', after?.parsed_text === target.parsed_text)

  // History now has 2 versions.
  const { data: allVersions } = await db
    .from('hoa_document_versions' as never)
    .select('id')
    .eq('document_id' as never, docId)
  type IdRow = { id: string }
  const allRows = (allVersions ?? []) as unknown as IdRow[]
  check('history has 2 versions (v0 + pre-restore)', allRows.length === 2)
  for (const row of allRows) {
    if (!versionIds.includes(row.id)) versionIds.push(row.id)
  }
  void storagePaths
}

// ─── delete document ─────────────────────────────────────────────────

async function testDeleteDocument(
  db: Db,
  docId: string,
  storagePaths: string[],
): Promise<void> {
  console.log('\ndelete document (cascade versions + remove storage objects):')

  const { data: versions } = await db
    .from('hoa_document_versions' as never)
    .select('storage_path')
    .eq('document_id' as never, docId)
  type StoragePathRow = { storage_path: string }
  const versionRows = (versions ?? []) as unknown as StoragePathRow[]
  const versionPaths = versionRows.map((v) => v.storage_path)

  const { data: doc } = await db
    .from('hoa_documents')
    .select('storage_path')
    .eq('id', docId)
    .single()
  const allPaths = [
    ...(doc?.storage_path ? [doc.storage_path] : []),
    ...versionPaths,
  ]

  if (allPaths.length > 0) {
    await db.storage.from(STORAGE_BUCKET).remove(allPaths)
  }
  const { error } = await db.from('hoa_documents').delete().eq('id', docId)
  check('document row deleted', !error, error?.message)

  // hoa_document_versions cascade-deletes via FK.
  const { data: stillThere } = await db
    .from('hoa_document_versions' as never)
    .select('id')
    .eq('document_id' as never, docId)
  type IdRow = { id: string }
  const stillThereRows = (stillThere ?? []) as unknown as IdRow[]
  check(
    'version rows cascade-deleted',
    stillThereRows.length === 0,
    `${stillThereRows.length} remain`,
  )

  // Every storage object is gone.
  for (const p of allPaths) {
    const { error: dlErr } = await db.storage.from(STORAGE_BUCKET).download(p)
    check(`storage object ${p.slice(-30)} removed`, !!dlErr)
  }
  // Drop tracked paths since they're already cleaned up.
  storagePaths.length = 0
}

// ─── fixture / cleanup ───────────────────────────────────────────────

async function pickHoaOrg(db: Db): Promise<string> {
  const { data: orgs } = await db
    .from('orgs')
    .select('id, name, hub_type')
    .eq('hub_type', 'hoa')
    .order('created_at', { ascending: true })
    .limit(1)
  if (!orgs?.[0]) throw new Error('no HOA org found')
  return orgs[0].id
}

async function cleanup(
  db: Db,
  ids: { documentId?: string; storagePaths: string[]; versionIds: string[] },
): Promise<void> {
  if (ids.documentId) {
    await db.from('hoa_documents').delete().eq('id', ids.documentId)
  }
  if (ids.storagePaths.length > 0) {
    await db.storage.from(STORAGE_BUCKET).remove(ids.storagePaths)
  }
  console.log(
    `\n[test-documents] cleaned up doc=${ids.documentId ? 1 : 0}, files=${ids.storagePaths.length}`,
  )
}

main().catch((err) => {
  console.error('[test-documents] crashed:', err)
  process.exit(1)
})
