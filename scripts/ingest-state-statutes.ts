/**
 * scripts/ingest-state-statutes.ts
 *
 * Ingests state HOA statutes into `state_statutes` + chunks them into
 * `state_statute_chunks` for W30 (State Law Brain).
 *
 * Usage (from repo root):
 *
 *   pnpm exec tsx scripts/ingest-state-statutes.ts <STATE>
 *
 * Where <STATE> is one of: GA, FL, CA, TX.
 *
 *   pnpm ingest:state-law FL --from-source
 *
 * --from-source fetches the official verbatim text through the state's
 * source adapter (packages/workflows/src/W30-state-law-brain/sources/;
 * FL, CA and TX from their official sites, GA from its vetted snapshot), diffs it against state_statutes by content_hash exactly
 * as the weekly refresh job does, and writes the changes. Each change is
 * logged to state_statute_changes; the next refresh-job run emits the
 * unsent rows as law/statute.changed / law/statute.removed. It also writes
 * data/statutes/<state>.jsonl as a reviewable diff artifact. Needs
 * migration 0062.
 *
 * Without the flag, behaviour is unchanged: reads `data/statutes/<state>.jsonl` — one statute per line, each an
 * object with the shape:
 *
 *   {
 *     "code_citation": "O.C.G.A. Section 44-3-108",
 *     "title": "Annual meetings of association",
 *     "category": "meetings",
 *     "body": "<full statute text>",
 *     "source_url": "https://...",          // optional
 *     "effective_date": "2024-07-01"        // optional
 *   }
 *
 * Idempotent: re-running the script updates statutes whose code_citation
 * is already on file (treats the new ingestion as the current version
 * and marks the old chunks superseded).
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)
 * Optional (skipped if missing — chunks land without embeddings and the
 * RPC falls back to FTS):
 *   HUGGINGFACE_API_TOKEN
 */

import './_load-env'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { chunkPlainText } from '../packages/workflows/src/W1-governing-docs-brain/chunker'
import { embedTexts, toPgVector } from '../packages/ai/src/embeddings'
import type { Database } from '../packages/db/src/database.types'
import {
  adapterFor,
  applyRemoval,
  applyStatuteWrite,
  applyUnchanged,
  defaultEmbed,
  loadExistingStatutes,
  planStatuteSync,
  repairMissingChunks,
} from '../packages/workflows/src/W30-state-law-brain/ingest'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN

const SUPPORTED_STATES = new Set(['GA', 'FL', 'CA', 'TX'])

interface StatuteRecord {
  code_citation: string
  title: string
  category?: string | null
  body: string
  source_url?: string | null
  effective_date?: string | null
}

async function ingestFromSource(state: string): Promise<void> {
  const adapter = adapterFor(state)
  if (!adapter) {
    console.error(`[ingest] ${state} has no source adapter (GA, FL, CA and TX have one).`)
    process.exit(1)
  }
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log(`[ingest] ${state}: fetching from the official source (rate-limited)...`)
  const fetched = await adapter.fetchSections()
  console.log(`[ingest] ${state}: ${fetched.records.length} sections from ${fetched.sourceName}`)

  const artifact = path.resolve(process.cwd(), `data/statutes/${state.toLowerCase()}.jsonl`)
  const header = [
    `// ${fetched.sourceName} - verbatim official text, written by`,
    `// "pnpm ingest:state-law ${state} --from-source" on ${new Date().toISOString().slice(0, 10)}.`,
    '// Review artifact only: the refresh job reads the official source, not this file.',
    '',
  ]
  const lines = [...header, ...fetched.records.map((r) => JSON.stringify(r)), '']
  await fs.writeFile(artifact, lines.join('\n'), 'utf-8')
  console.log(`[ingest] wrote ${path.relative(process.cwd(), artifact)}`)

  const plan = planStatuteSync({
    state,
    sourceName: fetched.sourceName,
    records: fetched.records,
    existing: await loadExistingStatutes(db, state),
    covers: adapter.covers,
  })
  const opts = { state, sourceName: plan.sourceName }
  const embed = defaultEmbed()

  const touched = await applyUnchanged(db, plan.unchanged, opts)
  for (const w of plan.writes) {
    const change = await applyStatuteWrite(db, w, { ...opts, embed })
    console.log(`[ingest] ${change.kind}: ${change.codeCitation}`)
  }
  for (const r of plan.removals) {
    await applyRemoval(db, r, opts)
    console.log(`[ingest] removed: ${r.codeCitation}`)
  }
  const repaired = await repairMissingChunks(db, state, plan.unchanged.map((u) => u.statuteId), embed)

  console.log(
    `[ingest] done - ${plan.writes.length} written, ${plan.removals.length} superseded, ` +
      `${touched.checked} unchanged (${touched.backfilled} hashes backfilled), ` +
      `${repaired.length} chunk sets repaired. Change events go out on the next refresh-job run.`,
  )
}

async function main(): Promise<void> {
  const state = (process.argv[2] ?? '').toUpperCase()
  if (!SUPPORTED_STATES.has(state)) {
    console.error(
      `[ingest] Usage: pnpm exec tsx scripts/ingest-state-statutes.ts <GA|FL|CA|TX> [--from-source]`,
    )
    process.exit(1)
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[ingest] Missing SUPABASE env vars.')
    process.exit(1)
  }
  if (process.argv.includes('--from-source')) {
    await ingestFromSource(state)
    return
  }

  const fixturePath = path.resolve(
    process.cwd(),
    `data/statutes/${state.toLowerCase()}.jsonl`,
  )
  let raw: string
  try {
    raw = await fs.readFile(fixturePath, 'utf-8')
  } catch (err) {
    console.error(
      `[ingest] Could not read ${fixturePath}: ${err instanceof Error ? err.message : err}`,
    )
    process.exit(1)
  }

  const records: StatuteRecord[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//')) continue
    try {
      records.push(JSON.parse(trimmed) as StatuteRecord)
    } catch (err) {
      console.error(
        `[ingest] Failed to parse line: ${trimmed.slice(0, 80)}... · ${err instanceof Error ? err.message : err}`,
      )
      process.exit(1)
    }
  }

  if (records.length === 0) {
    console.warn(`[ingest] No records found in ${fixturePath}`)
    return
  }
  // Upserts are keyed on (state, code_citation): a file carrying dated
  // versions of one citation (data/statutes/ga.jsonl, BL-154) would load
  // whichever comes last, in force or not. --from-source picks by date.
  const citations = records.map((r) => r.code_citation)
  const repeated = citations.filter((c, i) => citations.indexOf(c) !== i)
  if (repeated.length > 0) {
    console.error(
      `[ingest] ${fixturePath} lists ${[...new Set(repeated)].join(', ')} more than once (dated versions). ` +
        `Use --from-source, which loads the version in force.`,
    )
    process.exit(1)
  }

  console.log(`[ingest] ${state}: ${records.length} statutes from ${fixturePath}`)
  if (!HF_TOKEN) {
    console.warn(
      '[ingest] HUGGINGFACE_API_TOKEN not set — chunks will land without embeddings (FTS fallback in W30 still works).',
    )
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let statutesUpserted = 0
  let chunksInserted = 0

  for (const rec of records) {
    // Upsert the statute row keyed on (state, code_citation).
    const { data: statuteRow, error: statuteErr } = await db
      .from('state_statutes')
      .upsert(
        {
          state,
          code_citation: rec.code_citation,
          title: rec.title,
          category: rec.category ?? null,
          body: rec.body,
          source_url: rec.source_url ?? null,
          effective_date: rec.effective_date ?? null,
          fetched_at: new Date().toISOString(),
          superseded_at: null,
          // Curated text, not official verbatim. Clearing the hash makes the
          // refresh job re-hash this body instead of trusting a hash that
          // described the official text this write just replaced.
          content_hash: null,
          source_name: null,
        },
        { onConflict: 'state,code_citation' },
      )
      .select('id')
      .single<{ id: string }>()

    if (statuteErr || !statuteRow) {
      console.error(
        `[ingest] ${rec.code_citation}: upsert failed — ${statuteErr?.message ?? 'unknown'}`,
      )
      continue
    }
    statutesUpserted += 1

    // Wipe old chunks for this statute — we're replacing them.
    await db
      .from('state_statute_chunks')
      .delete()
      .eq('statute_id', statuteRow.id)

    // Re-chunk.
    const chunks = chunkPlainText(`${rec.code_citation} — ${rec.title}\n\n${rec.body}`)
    if (chunks.length === 0) {
      console.warn(`[ingest] ${rec.code_citation}: 0 chunks produced — body may be empty`)
      continue
    }

    // Embed in one batch per statute (each statute is typically small).
    let embeddings: (number[] | null)[] = chunks.map(() => null)
    if (HF_TOKEN) {
      try {
        embeddings = await embedTexts(chunks.map((c) => c.text))
      } catch (err) {
        console.warn(
          `[ingest] ${rec.code_citation}: embedding failed (${err instanceof Error ? err.message : err}) — inserting chunks without embeddings`,
        )
      }
    }

    const chunkRows = chunks.map((c, i) => ({
      statute_id: statuteRow.id,
      state,
      chunk_index: i,
      content: c.text,
      embedding: embeddings[i] ? toPgVector(embeddings[i]!) : null,
      metadata: { section: c.section },
    }))

    const { error: insertErr } = await db
      .from('state_statute_chunks')
      .insert(chunkRows)

    if (insertErr) {
      console.error(
        `[ingest] ${rec.code_citation}: chunk insert failed — ${insertErr.message}`,
      )
      continue
    }
    chunksInserted += chunkRows.length
    console.log(`[ingest] ${rec.code_citation}: ${chunkRows.length} chunks`)
  }

  console.log(
    `[ingest] done — ${statutesUpserted} statutes, ${chunksInserted} chunks`,
  )
}

main().catch((err) => {
  console.error('[ingest] fatal:', err)
  process.exit(1)
})
