// Executes a StatuteSyncPlan against state_statutes / state_statute_chunks /
// state_statute_changes. Shared by the weekly Inngest job
// (packages/jobs/src/state-law-refresh.ts) and the CLI
// (scripts/ingest-state-statutes.ts --from-source).
//
// Every function here is safe to re-run with the same input: the job calls
// each from an Inngest step, and a step is retried from the top.
//
// Ordering inside applyStatuteWrite is deliberate:
//   1. the statute row (verbatim body + content_hash)
//   2. the change-log row (the event outbox)
//   3. the chunks
// Once (1) lands, the next run sees the new hash and will never re-detect
// the change, so (2) must follow immediately: the outbox — not this run's
// memory — is what guarantees an event is eventually emitted. Chunks are
// derived data and repairable: a statute left with zero chunks is rebuilt
// on the next run (repairMissingChunks).

import type { createAdminClient } from '@homeowner-portal/db'
import { embedTexts, toPgVector } from '@homeowner-portal/ai'
import { chunkPlainText } from '../W1-governing-docs-brain/chunker'
import type {
  ChangeKind,
  ExistingStatuteRow,
  PlannedRemoval,
  PlannedUnchanged,
  PlannedWrite,
} from './plan'
import type { StatuteRecord } from './sources/types'

export type StatuteDb = ReturnType<typeof createAdminClient>

/** Returns one vector (or null) per text. null = no embedding available. */
export type EmbedFn = (texts: string[]) => Promise<(number[] | null)[]>

/**
 * Default embedder: the HF path ingest-state-statutes.ts always used.
 * Without a token (or on provider failure) chunks land with NULL embeddings
 * and W30 falls back to FTS — loudly, per the existing W30 pattern.
 */
export function defaultEmbed(log: (m: string) => void = console.warn): EmbedFn {
  let warnedMissing = false
  return async (texts) => {
    if (!process.env.HUGGINGFACE_API_TOKEN && !process.env.EMBEDDING_BASE_URL) {
      if (!warnedMissing) {
        log('[state-law] HUGGINGFACE_API_TOKEN not set — statute chunks stored WITHOUT embeddings (W30 falls back to FTS)')
        warnedMissing = true
      }
      return texts.map(() => null)
    }
    try {
      return await embedTexts(texts)
    } catch (err) {
      log(`[state-law] embedding failed (${err instanceof Error ? err.name : 'error'}) — chunks stored without embeddings`)
      return texts.map(() => null)
    }
  }
}

export const noEmbed: EmbedFn = async (texts) => texts.map(() => null)

export interface StatuteChange {
  changeId: string
  kind: ChangeKind
  statuteId: string
  codeCitation: string
  oldHash: string | null
  newHash: string | null
}

function fail(what: string, err: { message: string } | null): never {
  throw new Error(`state-law sync: ${what}: ${err?.message ?? 'no row returned'}`)
}

export async function loadExistingStatutes(db: StatuteDb, state: string): Promise<ExistingStatuteRow[]> {
  const { data, error } = await db
    .from('state_statutes')
    .select('id, code_citation, title, category, body, source_url, source_name, content_hash, superseded_at')
    .eq('state', state)
  if (error) fail(`load ${state} statutes`, error)
  return data ?? []
}

/** Chunk text carries the citation and title on EVERY chunk (design §6):
 *  verbatim statutory prose matches plain-English questions poorly, and the
 *  prefix is what lets FTS find "720.303" or "official records". */
export function statuteChunkTexts(record: Pick<StatuteRecord, 'code_citation' | 'title' | 'body'>): {
  text: string
  section: string
}[] {
  const prefix = `${record.code_citation} — ${record.title}`
  return chunkPlainText(record.body).map((c) => ({ text: `${prefix}\n\n${c.text}`, section: c.section }))
}

async function replaceChunks(
  db: StatuteDb,
  state: string,
  statuteId: string,
  record: Pick<StatuteRecord, 'code_citation' | 'title' | 'body'>,
  embed: EmbedFn,
): Promise<number> {
  const chunks = statuteChunkTexts(record)
  const vectors = chunks.length ? await embed(chunks.map((c) => c.text)) : []

  const { error: delErr } = await db.from('state_statute_chunks').delete().eq('statute_id', statuteId)
  if (delErr) fail(`delete chunks ${record.code_citation}`, delErr)
  if (chunks.length === 0) return 0

  const { error: insErr } = await db.from('state_statute_chunks').insert(
    chunks.map((c, i) => ({
      statute_id: statuteId,
      state,
      chunk_index: i,
      content: c.text,
      embedding: vectors[i] ? toPgVector(vectors[i]!) : null,
      metadata: { section: c.section },
    })),
  )
  if (insErr) fail(`insert chunks ${record.code_citation}`, insErr)
  return chunks.length
}

/**
 * Inserts a change-log row unless an identical one already exists (a
 * retried step). Identity is (statute, kind, old, new): the same transition
 * re-detected is the same change.
 */
async function logChange(
  db: StatuteDb,
  row: {
    statute_id: string
    state: string
    code_citation: string
    change_kind: ChangeKind
    old_hash: string | null
    new_hash: string | null
    source_name: string
  },
): Promise<string> {
  let q = db
    .from('state_statute_changes')
    .select('id')
    .eq('statute_id', row.statute_id)
    .eq('change_kind', row.change_kind)
  q = row.old_hash === null ? q.is('old_hash', null) : q.eq('old_hash', row.old_hash)
  q = row.new_hash === null ? q.is('new_hash', null) : q.eq('new_hash', row.new_hash)
  const { data: existing, error: selErr } = await q.limit(1)
  if (selErr) fail(`check change log ${row.code_citation}`, selErr)
  if (existing && existing.length > 0) return existing[0].id

  const { data, error } = await db.from('state_statute_changes').insert(row).select('id').single()
  if (error || !data) fail(`log change ${row.code_citation}`, error)
  return data.id
}

export interface ApplyOptions {
  state: string
  sourceName: string
  embed: EmbedFn
  now?: () => Date
}

export async function applyStatuteWrite(
  db: StatuteDb,
  write: PlannedWrite,
  opts: ApplyOptions,
): Promise<StatuteChange> {
  const nowIso = (opts.now ?? (() => new Date()))().toISOString()
  const r = write.record
  const { data: row, error } = await db
    .from('state_statutes')
    .upsert(
      {
        state: opts.state,
        code_citation: r.code_citation,
        title: r.title,
        category: r.category,
        body: r.body,
        source_url: r.source_url,
        effective_date: r.effective_date,
        content_hash: write.newHash,
        source_name: opts.sourceName,
        fetched_at: nowIso,
        last_checked_at: nowIso,
        superseded_at: null,
      },
      { onConflict: 'state,code_citation' },
    )
    .select('id')
    .single()
  if (error || !row) fail(`upsert ${r.code_citation}`, error)

  // A reinstated citation is new law to every consumer (its old findings
  // were superseded with it), so it reports no previous hash.
  const oldHash = write.kind === 'changed' ? write.oldHash : null
  const changeId = await logChange(db, {
    statute_id: row.id,
    state: opts.state,
    code_citation: r.code_citation,
    change_kind: write.kind,
    old_hash: oldHash,
    new_hash: write.newHash,
    source_name: opts.sourceName,
  })

  await replaceChunks(db, opts.state, row.id, r, opts.embed)

  return {
    changeId,
    kind: write.kind,
    statuteId: row.id,
    codeCitation: r.code_citation,
    oldHash,
    newHash: write.newHash,
  }
}

/** Hash unchanged: touch last_checked_at; backfill content_hash on pre-0062
 *  rows and refresh moved metadata, without logging a change. */
export async function applyUnchanged(
  db: StatuteDb,
  unchanged: PlannedUnchanged[],
  opts: Omit<ApplyOptions, 'embed'>,
): Promise<{ checked: number; backfilled: number }> {
  if (unchanged.length === 0) return { checked: 0, backfilled: 0 }
  const nowIso = (opts.now ?? (() => new Date()))().toISOString()

  const { error } = await db
    .from('state_statutes')
    .update({ last_checked_at: nowIso })
    .in('id', unchanged.map((u) => u.statuteId))
  if (error) fail(`touch last_checked_at (${opts.state})`, error)

  let backfilled = 0
  for (const u of unchanged) {
    if (!u.backfillHash && !u.metadataChanged) continue
    const { error: updErr } = await db
      .from('state_statutes')
      .update({
        content_hash: u.newHash,
        source_name: opts.sourceName,
        title: u.record.title,
        category: u.record.category,
        source_url: u.record.source_url,
      })
      .eq('id', u.statuteId)
    if (updErr) fail(`refresh metadata ${u.record.code_citation}`, updErr)
    if (u.backfillHash) backfilled++
  }
  return { checked: unchanged.length, backfilled }
}

export async function applyRemoval(
  db: StatuteDb,
  removal: PlannedRemoval,
  opts: Omit<ApplyOptions, 'embed'>,
): Promise<StatuteChange> {
  const nowIso = (opts.now ?? (() => new Date()))().toISOString()
  const { error } = await db
    .from('state_statutes')
    .update({ superseded_at: nowIso, last_checked_at: nowIso })
    .eq('id', removal.statuteId)
    .is('superseded_at', null)
  if (error) fail(`supersede ${removal.codeCitation}`, error)

  const changeId = await logChange(db, {
    statute_id: removal.statuteId,
    state: opts.state,
    code_citation: removal.codeCitation,
    change_kind: 'removed',
    old_hash: removal.oldHash,
    new_hash: null,
    source_name: opts.sourceName,
  })
  return {
    changeId,
    kind: 'removed',
    statuteId: removal.statuteId,
    codeCitation: removal.codeCitation,
    oldHash: removal.oldHash,
    newHash: null,
  }
}

/**
 * Rebuilds chunks for live statutes that have none — the residue of a run
 * that wrote a statute row and then died before its chunks landed. Bodies
 * are read from the row (the stored text is the verbatim text).
 */
export async function repairMissingChunks(
  db: StatuteDb,
  state: string,
  statuteIds: string[],
  embed: EmbedFn,
): Promise<string[]> {
  if (statuteIds.length === 0) return []
  const { data: chunkRows, error } = await db
    .from('state_statute_chunks')
    .select('statute_id')
    .in('statute_id', statuteIds)
  if (error) fail(`load chunk presence (${state})`, error)
  const withChunks = new Set((chunkRows ?? []).map((c) => c.statute_id))
  const missing = statuteIds.filter((id) => !withChunks.has(id))
  if (missing.length === 0) return []

  const { data: rows, error: rowErr } = await db
    .from('state_statutes')
    .select('id, code_citation, title, body')
    .in('id', missing)
  if (rowErr) fail(`load statutes for chunk repair (${state})`, rowErr)
  for (const row of rows ?? []) {
    await replaceChunks(db, state, row.id, row, embed)
  }
  return (rows ?? []).map((r) => r.code_citation)
}

// ─── Outbox ──────────────────────────────────────────────────────────

export interface PendingChange {
  id: string
  statute_id: string
  state: string
  code_citation: string
  change_kind: ChangeKind
  old_hash: string | null
  new_hash: string | null
}

export async function loadUnsentChanges(db: StatuteDb, limit = 500): Promise<PendingChange[]> {
  const { data, error } = await db
    .from('state_statute_changes')
    .select('id, statute_id, state, code_citation, change_kind, old_hash, new_hash')
    .is('event_sent_at', null)
    .order('detected_at', { ascending: true })
    .limit(limit)
  if (error) fail('load unsent changes', error)
  return (data ?? []) as PendingChange[]
}

export async function markChangesSent(db: StatuteDb, ids: string[], now: Date = new Date()): Promise<void> {
  if (ids.length === 0) return
  const { error } = await db
    .from('state_statute_changes')
    .update({ event_sent_at: now.toISOString() })
    .in('id', ids)
    .is('event_sent_at', null)
  if (error) fail('mark changes sent', error)
}
