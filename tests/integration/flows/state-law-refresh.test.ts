/**
 * Sub-project F phase 0: the State Law refresh job against real Postgres.
 *
 * The Florida adapter is driven by the RECORDED flsenate.gov Chapter 720
 * page (scripts/fixtures/state-law/flsenate-ch720-2026.html) through an
 * injected HTTP getter, and embeddings are disabled: nothing here touches
 * the network. What is under test is the real diff → write → change-log →
 * event path, including migration 0062's columns, constraints and RLS.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  floridaAdapter,
  floridaChapterUrl,
  noEmbed,
  statuteContentHash,
  type HttpGetter,
} from '../../../packages/workflows/src/W30-state-law-brain/ingest'
import {
  runStateLawRefresh,
  type StateLawRefreshStep,
  type StatuteLawEvent,
} from '../../../packages/jobs/src/state-law-refresh'
import type { Database } from '../../../packages/db/src/database.types'
import { adminDb, makeOrg, mintUser } from '../fixtures/factory'
import { truncateAll } from '../fixtures/truncate'
import { LOCAL_ANON_KEY, LOCAL_SUPABASE_URL } from '../setup/env'

const FIXTURE = readFileSync(
  resolve(__dirname, '../../../scripts/fixtures/state-law/flsenate-ch720-2026.html'),
  'utf8',
)
const NOW = () => new Date('2026-10-15T12:00:00Z')
const STARTER_303 =
  'The board of directors shall maintain official records ... SAMPLE EXCERPT — replace with full statutory text from leg.state.fl.us before production use.'

function adapterServing(html: string) {
  const http: HttpGetter = {
    async get(url) {
      if (url !== floridaChapterUrl(2026)) throw new Error(`unexpected request in test: ${url}`)
      return { status: 200, url, body: html }
    },
  }
  return floridaAdapter({ http, now: NOW })
}

/**
 * Inline steps that behave like Inngest's in the ways that matter here:
 * every step result crosses a JSON boundary (so a non-serialisable plan
 * fails), and step ids must be unique within a run.
 */
function inngestLikeStep() {
  const ids = new Set<string>()
  const sent: StatuteLawEvent[] = []
  const claim = (id: string) => {
    if (ids.has(id)) throw new Error(`duplicate step id: ${id}`)
    ids.add(id)
  }
  const step: StateLawRefreshStep = {
    async run(id, fn) {
      claim(id)
      const out = await fn()
      return out === undefined ? undefined : JSON.parse(JSON.stringify(out))
    },
    async sendEvent(id, events) {
      claim(id)
      sent.push(...events)
    },
  }
  return { step, sent, ids }
}

const logger = { info: () => {}, warn: () => {}, error: () => {} }

async function refresh(html: string) {
  const s = inngestLikeStep()
  const result = await runStateLawRefresh({
    db: adminDb(),
    step: s.step,
    logger,
    adapters: [adapterServing(html)],
    embed: noEmbed,
    now: NOW,
  })
  return { result, sent: s.sent }
}

async function flRows() {
  const { data, error } = await adminDb()
    .from('state_statutes')
    .select('id, code_citation, body, content_hash, source_name, fetched_at, last_checked_at, superseded_at')
    .eq('state', 'FL')
  if (error) throw new Error(error.message)
  return new Map((data ?? []).map((r) => [r.code_citation, r]))
}

async function resetStatutes() {
  const db = adminDb()
  // FL rows cascade to their chunks and change-log rows.
  const { error: e1 } = await db.from('state_statutes').delete().eq('state', 'FL')
  if (e1) throw new Error(e1.message)
  const { error: e2 } = await db.from('state_statute_changes').delete().not('id', 'is', null)
  if (e2) throw new Error(e2.message)
}

/** The pre-0062 production shape: 4 starter rows, paraphrased, no hash.
 *  Plus one Chapter 718 row the 720 adapter must never touch. */
async function seedStarterRows() {
  const { error } = await adminDb().from('state_statutes').insert([
    {
      state: 'FL',
      code_citation: 'Fla. Stat. § 720.303',
      title: 'Association powers and duties; meetings of board; official records',
      category: 'records',
      body: STARTER_303,
      fetched_at: '2026-01-01T00:00:00Z',
    },
    {
      state: 'FL',
      code_citation: 'Fla. Stat. § 718.112',
      title: 'Bylaws',
      category: 'governance',
      body: 'Condominium bylaws starter text.',
      fetched_at: '2026-01-01T00:00:00Z',
    },
  ])
  if (error) throw new Error(error.message)
}

describe('state-law refresh (FL, recorded official source)', () => {
  beforeEach(async () => {
    await resetStatutes()
    await seedStarterRows()
  })

  it('first run: loads Chapter 720 verbatim, hashes every section, and emits one event per change', async () => {
    const { result, sent } = await refresh(FIXTURE)

    expect(result.states).toEqual([
      expect.objectContaining({ state: 'FL', fetched: 36, added: 35, changed: 1, removed: 0, unchanged: 0 }),
    ])
    const rows = await flRows()
    expect(rows.size).toBe(37) // 36 sections + the untouched 718 row

    for (const [cite, r] of rows) {
      if (cite === 'Fla. Stat. § 718.112') continue
      expect(r.content_hash).toBe(statuteContentHash(r.body))
      expect(r.source_name).toBe('flsenate.gov Fla. Stat. Ch. 720 (2026)')
      expect(r.last_checked_at).not.toBeNull()
    }
    // The paraphrased starter text was replaced with the statute itself.
    expect(rows.get('Fla. Stat. § 720.303')!.body).toContain('official records')
    expect(rows.get('Fla. Stat. § 720.303')!.body).not.toContain('SAMPLE EXCERPT')
    // Out of the adapter's scope: neither rewritten nor superseded.
    const condo = rows.get('Fla. Stat. § 718.112')!
    expect(condo.superseded_at).toBeNull()
    expect(condo.content_hash).toBeNull()

    expect(sent).toHaveLength(36)
    expect(sent.every((e) => e.name === 'law/statute.changed')).toBe(true)
    const e303 = sent.find((e) => e.data.code_citation === 'Fla. Stat. § 720.303')!
    expect(e303.data).toMatchObject({
      change_kind: 'changed',
      old_hash: statuteContentHash(STARTER_303),
      new_hash: rows.get('Fla. Stat. § 720.303')!.content_hash,
    })
    const added = sent.filter((e) => e.name === 'law/statute.changed' && e.data.change_kind === 'added')
    expect(added).toHaveLength(35)
    expect(added.every((e) => e.name === 'law/statute.changed' && e.data.old_hash === null)).toBe(true)

    // The outbox is drained.
    const { count } = await adminDb()
      .from('state_statute_changes')
      .select('id', { count: 'exact', head: true })
      .is('event_sent_at', null)
    expect(count).toBe(0)
  })

  it('stores chunks with the citation and title on every chunk', async () => {
    await refresh(FIXTURE)
    const rows = await flRows()
    const id = rows.get('Fla. Stat. § 720.303')!.id
    const { data: chunks } = await adminDb()
      .from('state_statute_chunks')
      .select('chunk_index, content, embedding')
      .eq('statute_id', id)
      .order('chunk_index')
    expect(chunks!.length).toBeGreaterThan(1) // 720.303 is ~55k characters
    for (const c of chunks!) {
      expect(c.content.startsWith('Fla. Stat. § 720.303 — Association powers and duties')).toBe(true)
      expect(c.embedding).toBeNull() // embeddings disabled in tests
    }
  })

  it('second run over identical text: no writes, no events, last_checked_at moves, fetched_at does not', async () => {
    await refresh(FIXTURE)
    const before = await flRows()
    const later = () => new Date('2026-10-22T12:00:00Z')
    const s = inngestLikeStep()
    const { states } = await runStateLawRefresh({
      db: adminDb(),
      step: s.step,
      logger,
      adapters: [adapterServing(FIXTURE)],
      embed: noEmbed,
      now: later,
    })
    expect(states[0]).toMatchObject({ added: 0, changed: 0, removed: 0, unchanged: 36 })
    expect(s.sent).toEqual([])
    const after = await flRows()
    const r = after.get('Fla. Stat. § 720.305')!
    expect(r.fetched_at).toBe(before.get('Fla. Stat. § 720.305')!.fetched_at)
    expect(new Date(r.last_checked_at!).toISOString()).toBe(later().toISOString())
  })

  it('a forced hash change emits law/statute.changed for exactly that section; a dropped section emits law/statute.removed', async () => {
    await refresh(FIXTURE)
    const before = await flRows()

    const amended = FIXTURE.replace(
      'are governed by, and must comply with, this chapter',
      'are governed by, and shall comply with, this chapter',
    )
    expect(amended).not.toBe(FIXTURE)
    const dropStart = amended.indexOf('<div class="Section"><span class="SectionNumber">720.3015&')
    const dropEnd = amended.indexOf('<div class="Section"><span class="SectionNumber">720.302&')
    const html = amended.slice(0, dropStart) + amended.slice(dropEnd)

    const { result, sent } = await refresh(html)
    expect(result.states[0]).toMatchObject({ added: 0, changed: 1, removed: 1, unchanged: 34 })
    expect(sent).toHaveLength(2)

    const after = await flRows()
    const changed = sent.find((e) => e.name === 'law/statute.changed')!
    expect(changed.data).toEqual({
      state: 'FL',
      statute_id: before.get('Fla. Stat. § 720.305')!.id,
      code_citation: 'Fla. Stat. § 720.305',
      change_kind: 'changed',
      old_hash: before.get('Fla. Stat. § 720.305')!.content_hash,
      new_hash: after.get('Fla. Stat. § 720.305')!.content_hash,
    })
    expect(after.get('Fla. Stat. § 720.305')!.body).toContain('shall comply with')

    const removed = sent.find((e) => e.name === 'law/statute.removed')!
    expect(removed.data).toEqual({
      state: 'FL',
      statute_id: before.get('Fla. Stat. § 720.3015')!.id,
      code_citation: 'Fla. Stat. § 720.3015',
      old_hash: before.get('Fla. Stat. § 720.3015')!.content_hash,
    })
    expect(after.get('Fla. Stat. § 720.3015')!.superseded_at).not.toBeNull()

    // The section comes back next week: reinstated, reported as new.
    const back = await refresh(amended)
    expect(back.result.states[0]).toMatchObject({ reinstated: 1, changed: 0 })
    expect(back.sent).toEqual([
      expect.objectContaining({
        name: 'law/statute.changed',
        data: expect.objectContaining({ code_citation: 'Fla. Stat. § 720.3015', change_kind: 'reinstated', old_hash: null }),
      }),
    ])
  })

  it('emits a change a previous run logged but died before announcing (outbox)', async () => {
    await refresh(FIXTURE)
    const rows = await flRows()
    const r = rows.get('Fla. Stat. § 720.306')!
    // Simulate: the write + change-log landed, the run died before sendEvent.
    const { data: orphan, error } = await adminDb()
      .from('state_statute_changes')
      .insert({
        statute_id: r.id,
        state: 'FL',
        code_citation: 'Fla. Stat. § 720.306',
        change_kind: 'changed',
        old_hash: '0'.repeat(64),
        new_hash: r.content_hash,
        source_name: r.source_name,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    const { sent } = await refresh(FIXTURE)
    expect(sent).toEqual([expect.objectContaining({ id: `statute-change-${orphan!.id}`, name: 'law/statute.changed' })])
  })

  it('rebuilds chunks for a statute left with none, without reporting a change', async () => {
    await refresh(FIXTURE)
    const id = (await flRows()).get('Fla. Stat. § 720.317')!.id
    await adminDb().from('state_statute_chunks').delete().eq('statute_id', id)
    const { result, sent } = await refresh(FIXTURE)
    expect(result.states[0].repairedChunks).toBe(1)
    expect(sent).toEqual([])
    const { count } = await adminDb()
      .from('state_statute_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('statute_id', id)
    expect(count).toBeGreaterThan(0)
  })

  it('a broken source fails the run and supersedes nothing', async () => {
    await refresh(FIXTURE)
    const broken = FIXTURE.slice(0, FIXTURE.indexOf('<div class="Section"><span class="SectionNumber">720.303&'))
    const failing: HttpGetter = {
      async get(url) {
        return url === floridaChapterUrl(2026)
          ? { status: 200, url, body: broken }
          : { status: 503, url, body: '' }
      },
    }
    const s = inngestLikeStep()
    await expect(
      runStateLawRefresh({
        db: adminDb(),
        step: s.step,
        logger,
        adapters: [floridaAdapter({ http: failing, now: NOW })],
        embed: noEmbed,
        now: NOW,
      }),
    ).rejects.toThrow(/FL: flsenate\.gov Chapter 720: no usable edition/)
    const rows = await flRows()
    expect([...rows.values()].filter((r) => r.superseded_at !== null)).toEqual([])
  })
})

describe('0062 RLS: statutes are public reference data, writes are service-role only', () => {
  beforeEach(async () => {
    await truncateAll()
    await resetStatutes()
    await seedStarterRows()
    await refresh(FIXTURE)
  })

  it('an authenticated user can read statutes and the change log', async () => {
    const user = await mintUser(await makeOrg(), 'resident')
    const { data: statutes, error } = await user.client
      .from('state_statutes')
      .select('code_citation, content_hash, source_name, last_checked_at')
      .eq('state', 'FL')
    expect(error).toBeNull()
    expect(statutes!.length).toBe(37)
    const { data: changes, error: chErr } = await user.client.from('state_statute_changes').select('id')
    expect(chErr).toBeNull()
    expect(changes!.length).toBe(36)
  })

  it('an authenticated user (even an admin) cannot write statutes, chunks or the change log', async () => {
    const admin = await mintUser(await makeOrg(), 'admin')
    const target = (await flRows()).get('Fla. Stat. § 720.305')!

    const ins = await admin.client.from('state_statutes').insert({
      state: 'FL',
      code_citation: 'Fla. Stat. § 720.999',
      title: 'Forged',
      body: 'Forged text.',
    })
    expect(ins.error).not.toBeNull()

    const upd = await admin.client.from('state_statutes').update({ body: 'Tampered.' }).eq('id', target.id).select('id')
    expect(upd.error ?? (upd.data?.length === 0 ? null : 'rows updated')).not.toBe('rows updated')

    const chunkIns = await admin.client.from('state_statute_chunks').insert({
      statute_id: target.id,
      state: 'FL',
      chunk_index: 999,
      content: 'Forged chunk.',
    })
    expect(chunkIns.error).not.toBeNull()

    const logIns = await admin.client.from('state_statute_changes').insert({
      statute_id: target.id,
      state: 'FL',
      code_citation: target.code_citation,
      change_kind: 'removed',
      old_hash: target.content_hash,
    })
    expect(logIns.error).not.toBeNull()

    const markSent = await admin.client
      .from('state_statute_changes')
      .update({ event_sent_at: null })
      .eq('statute_id', target.id)
      .select('id')
    expect(markSent.error ?? (markSent.data?.length === 0 ? null : 'rows updated')).not.toBe('rows updated')

    // Nothing moved.
    const after = (await flRows()).get('Fla. Stat. § 720.305')!
    expect(after.body).toBe(target.body)
    expect((await flRows()).has('Fla. Stat. § 720.999')).toBe(false)
  })

  it('anon sees no change-log rows (its only policy is for authenticated)', async () => {
    const anon = createClient<Database>(LOCAL_SUPABASE_URL, LOCAL_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await anon.from('state_statute_changes').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
    // ...while the statutes themselves stay public, as 0010 intended.
    const { data: statutes } = await anon.from('state_statutes').select('id').eq('state', 'FL')
    expect(statutes!.length).toBe(37)
  })
})
