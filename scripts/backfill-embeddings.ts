/**
 * scripts/backfill-embeddings.ts
 *
 * Fills in `governing_document_chunks.embedding` for any rows that were
 * inserted before the embedding pipeline existed (or before
 * HUGGINGFACE_API_TOKEN was configured). Idempotent — safe to re-run any
 * number of times; skips rows that already have an embedding.
 *
 * Run from repo root (use `pnpm exec tsx` so workspace dependencies
 * resolve — `npx tsx` fails with "Cannot find module @supabase/supabase-js"
 * because it bypasses the workspace's node_modules):
 *
 *   HUGGINGFACE_API_TOKEN=hf_... \
 *   NEXT_PUBLIC_SUPABASE_URL=https://xwdjsxfskvreguyvryhc.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   pnpm exec tsx scripts/backfill-embeddings.ts
 *
 * Optional flags via env:
 *   BATCH_SIZE     — chunks per HF API call (default 32)
 *   MAX_CHUNKS     — stop after N chunks (useful for dry-run; default unlimited)
 */

import './_load-env'
import { createClient } from '@supabase/supabase-js'
import { embedTexts, toPgVector } from '../packages/ai/src/embeddings'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const HF_TOKEN = process.env.HUGGINGFACE_API_TOKEN

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[backfill] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!HF_TOKEN) {
  console.error('[backfill] Missing HUGGINGFACE_API_TOKEN')
  process.exit(1)
}

const BATCH_SIZE = Number(process.env.BATCH_SIZE ?? 32)
const MAX_CHUNKS = process.env.MAX_CHUNKS ? Number(process.env.MAX_CHUNKS) : null

interface ChunkRow {
  id: string
  text: string
}

async function main(): Promise<void> {
  const db = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Pull chunks that need embeddings, in batches keyed on id so we can
  // resume cleanly if the script is killed.
  let processed = 0
  let cursor: string | null = null

  while (true) {
    if (MAX_CHUNKS && processed >= MAX_CHUNKS) {
      console.log(`[backfill] Hit MAX_CHUNKS=${MAX_CHUNKS}, stopping`)
      break
    }

    let query = db
      .from('governing_document_chunks' as never)
      .select('id, text')
      .is('embedding' as never, null)
      .order('id' as never, { ascending: true })
      .limit(BATCH_SIZE)
    if (cursor) {
      query = query.gt('id' as never, cursor)
    }
    const { data, error } = (await query) as unknown as {
      data: ChunkRow[] | null
      error: { message: string } | null
    }

    if (error) {
      console.error('[backfill] read failed:', error.message)
      process.exit(1)
    }
    if (!data || data.length === 0) {
      console.log('[backfill] no more chunks needing embeddings')
      break
    }

    let embeddings: number[][]
    try {
      embeddings = await embedTexts(data.map((r) => r.text))
    } catch (err) {
      console.error('[backfill] embedding batch failed:', err)
      process.exit(1)
    }

    // Update each row. Supabase doesn't support bulk-update-with-different-
    // values in one query, so this is one round-trip per row. Acceptable
    // because backfill is a one-shot.
    for (let i = 0; i < data.length; i++) {
      const row = data[i]
      const vec = embeddings[i]
      if (!vec) continue
      const { error: updateErr } = await db
        .from('governing_document_chunks' as never)
        .update({ embedding: toPgVector(vec) } as never)
        .eq('id' as never, row.id)
      if (updateErr) {
        console.warn(`[backfill] update ${row.id} failed: ${updateErr.message}`)
      } else {
        processed += 1
      }
    }

    cursor = data[data.length - 1].id
    console.log(`[backfill] embedded ${processed} chunks so far`)
  }

  console.log(`[backfill] ✅ Done — ${processed} chunks embedded`)
}

main().catch((err) => {
  console.error('[backfill] crashed:', err)
  process.exit(1)
})
