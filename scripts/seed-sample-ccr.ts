/**
 * scripts/seed-sample-ccr.ts
 *
 * Loads the placeholder Declaration fixture into governing_documents +
 * governing_document_chunks for whichever HOA org is named in the
 * SEED_ORG_NAME env var (or the first HOA org if unset).
 *
 * Run from repo root with pnpm exec so the workspace resolves
 * @supabase/supabase-js (plain `npx tsx` fails on module resolution):
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   NEXT_PUBLIC_SUPABASE_URL=https://xwdjsxfskvreguyvryhc.supabase.co \
 *   pnpm exec tsx scripts/seed-sample-ccr.ts
 *
 * Optionally set HUGGINGFACE_API_TOKEN to embed the chunks during seed;
 * without it the chunks land with NULL embeddings (FTS retrieval still
 * works) and you can fill them later with scripts/backfill-embeddings.ts.
 *
 * Idempotent: if a governing_documents row with title='Sample Declaration
 * (W1 demo)' already exists for the org, it deletes that row's chunks
 * and re-inserts. Useful while iterating on chunk granularity.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { embedTexts, toPgVector } from '../packages/ai/src/embeddings'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    '[seed] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
  )
  process.exit(1)
}

const FIXTURE_PATH = resolve(
  process.cwd(),
  'packages/workflows/src/W1-governing-docs-brain/fixtures/sample-ccr.md',
)
const DOC_TITLE = 'Sample Declaration (W1 demo)'

async function main(): Promise<void> {
  const db = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const targetOrgName = process.env.SEED_ORG_NAME

  const { data: orgs, error: orgErr } = await db
    .from('orgs')
    .select('id, name, hub_type')
    .eq('hub_type', 'hoa')
    .order('created_at', { ascending: true })

  if (orgErr || !orgs || orgs.length === 0) {
    console.error('[seed] No HOA orgs found.', orgErr?.message)
    process.exit(1)
  }

  const targetOrg = targetOrgName
    ? orgs.find((o) => o.name === targetOrgName)
    : orgs[0]

  if (!targetOrg) {
    console.error(
      `[seed] No HOA org matching name="${targetOrgName}". Available:`,
      orgs.map((o) => o.name),
    )
    process.exit(1)
  }

  console.log(
    `[seed] Targeting org: ${targetOrg.name} (${targetOrg.id})`,
  )

  // Find or create the backing association. Migration 0004 backfilled one
  // per org, but a fresh org created post-migration may not have one yet.
  const { data: assocs, error: assocErr } = await db
    .from('associations' as never)
    .select('id, name')
    .eq('organization_id' as never, targetOrg.id)
    .limit(1)

  if (assocErr) {
    console.error('[seed] Failed to read associations:', assocErr.message)
    process.exit(1)
  }

  let associationId: string
  if (assocs && assocs.length > 0) {
    associationId = (assocs[0] as { id: string }).id
    console.log(`[seed] Using existing association ${associationId}`)
  } else {
    const { data: newAssoc, error: insertErr } = await db
      .from('associations' as never)
      .insert({
        organization_id: targetOrg.id,
        name: targetOrg.name,
        state: 'GA',
        type: 'hoa',
      } as never)
      .select('id')
      .single<{ id: string }>()
    if (insertErr || !newAssoc) {
      console.error('[seed] Failed to create association:', insertErr?.message)
      process.exit(1)
    }
    associationId = newAssoc.id
    console.log(`[seed] Created association ${associationId}`)
  }

  // Idempotency: drop prior demo doc + chunks for this association.
  const { data: existing } = await db
    .from('governing_documents' as never)
    .select('id')
    .eq('organization_id' as never, targetOrg.id)
    .eq('association_id' as never, associationId)
    .eq('title' as never, DOC_TITLE)

  for (const row of (existing ?? []) as { id: string }[]) {
    await db.from('governing_documents' as never).delete().eq('id' as never, row.id)
    console.log(`[seed] Removed prior demo doc ${row.id}`)
  }

  const fixtureText = readFileSync(FIXTURE_PATH, 'utf8')

  const { data: doc, error: docErr } = await db
    .from('governing_documents' as never)
    .insert({
      organization_id: targetOrg.id,
      association_id: associationId,
      type: 'declaration',
      title: DOC_TITLE,
      effective_date: '2024-01-01',
      parsed_text: fixtureText,
      parsed_at: new Date().toISOString(),
      parser_version: 'manual-seed-1.0.0',
    } as never)
    .select('id')
    .single<{ id: string }>()

  if (docErr || !doc) {
    console.error('[seed] Failed to create document:', docErr?.message)
    process.exit(1)
  }
  console.log(`[seed] Created document ${doc.id}`)

  const chunks = chunkBySectionHeading(fixtureText)
  console.log(`[seed] Splitting into ${chunks.length} chunks`)

  // Generate embeddings if HF token is available; fall back to NULL
  // (FTS still works for retrieval).
  let embeddings: number[][] | null = null
  if (process.env.HUGGINGFACE_API_TOKEN) {
    try {
      console.log('[seed] Generating embeddings…')
      embeddings = await embedTexts(chunks.map((c) => c.text))
      console.log(`[seed] Embedded ${embeddings.length} chunks`)
    } catch (err) {
      console.warn(
        '[seed] embedding failed, inserting chunks without:',
        err instanceof Error ? err.message : err,
      )
    }
  } else {
    console.log(
      '[seed] HUGGINGFACE_API_TOKEN not set — skipping embeddings (FTS will still work).',
    )
  }

  const inserts = chunks.map((c, ordinal) => ({
    organization_id: targetOrg.id,
    document_id: doc.id,
    section: c.section,
    page_number: null,
    ordinal,
    text: c.text,
    embedding: embeddings?.[ordinal] ? toPgVector(embeddings[ordinal]) : null,
    metadata: {
      doc_title: DOC_TITLE,
      seeded_from: 'sample-ccr.md',
      embedding_status: embeddings ? 'embedded' : 'pending',
    },
  }))

  const { error: chunkErr } = await db
    .from('governing_document_chunks' as never)
    .insert(inserts as never)

  if (chunkErr) {
    console.error('[seed] Failed to insert chunks:', chunkErr.message)
    process.exit(1)
  }

  console.log(
    `[seed] ✅ Inserted ${inserts.length} chunks. W1 can now answer questions about this fixture.`,
  )
}

/**
 * Split a markdown document by heading sections. Each H3 (### Section X.Y)
 * becomes one chunk along with the preceding H2 (## Article ...) for
 * context. The H1 is dropped; it's just the title.
 */
function chunkBySectionHeading(
  markdown: string,
): { section: string; text: string }[] {
  const lines = markdown.split('\n')
  const chunks: { section: string; text: string }[] = []
  let currentArticle = ''
  let currentSection: { section: string; lines: string[] } | null = null

  const flush = (): void => {
    if (currentSection && currentSection.lines.length > 0) {
      const body = currentSection.lines.join('\n').trim()
      if (body.length > 0) {
        chunks.push({
          section: currentSection.section,
          text: `${currentArticle ? currentArticle + '\n\n' : ''}${body}`,
        })
      }
    }
    currentSection = null
  }

  for (const line of lines) {
    if (line.startsWith('# ')) {
      // doc title — skip
      continue
    }
    if (line.startsWith('## ')) {
      flush()
      currentArticle = line.slice(3).trim()
      continue
    }
    if (line.startsWith('### ')) {
      flush()
      const heading = line.slice(4).trim()
      currentSection = { section: heading, lines: [heading] }
      continue
    }
    if (currentSection) {
      currentSection.lines.push(line)
    }
  }
  flush()
  return chunks
}

main().catch((err) => {
  console.error('[seed] crashed:', err)
  process.exit(1)
})
