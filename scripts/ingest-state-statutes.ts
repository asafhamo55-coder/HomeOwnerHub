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
 * Reads `data/statutes/<state>.jsonl` — one statute per line, each an
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

async function main(): Promise<void> {
  const state = (process.argv[2] ?? '').toUpperCase()
  if (!SUPPORTED_STATES.has(state)) {
    console.error(
      `[ingest] Usage: pnpm exec tsx scripts/ingest-state-statutes.ts <GA|FL|CA|TX>`,
    )
    process.exit(1)
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('[ingest] Missing SUPABASE env vars.')
    process.exit(1)
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
