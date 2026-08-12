/**
 * scripts/test-community-templates.ts
 *
 * Real-Postgres checks for the global community template library.
 * Hits real Postgres (via _load-env + service-role client, mirroring
 * scripts/test-comms.ts). Never prints resident data, addresses, or full
 * email bodies — ids and counts only.
 *
 * Cases:
 *   A. Seven global rows exist with category 'community'
 *   B. Every one has questions, visual_block and accent_color populated
 *   C. Every merge field in body_html is covered by a question, is ambient,
 *      or (lease-cap-status only) is a code-provided field per the in-code
 *      registry — see the comment at ORPHAN handling below.
 *   D. An anon/tenant client can SELECT globals but cannot INSERT one
 *      (D2 is the most important assertion in this file — see below).
 *   E. The communications CHECK accepts category 'community'
 *
 * Any row this script creates, it deletes — verified, not assumed.
 *
 * Run: pnpm test:community-templates
 */

import './_load-env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'
// The registry is the in-code source of truth for `providedFields` — fields
// a template's body uses but that the send pipeline supplies at render time
// (e.g. lease-cap occupancy figures pulled live from the database) rather
// than collecting via a board-facing question. Task 12's seed deliberately
// does NOT persist providedFields (there is no column for it — see
// scripts/generate-community-templates-sql.ts's header comment), so from
// the database's point of view alone, lease-cap-status's body would appear
// to have orphan merge fields. Importing the registry here — rather than
// hardcoding an exemption list — means this check stays honest: if a
// template's providedFields declaration in code ever drifts from what its
// body actually uses, the registry's own module-load validation
// (validateTemplate in community-templates/registry.ts) fails first, so
// this harness can trust the declared set.
import { COMMUNITY_TEMPLATES } from '../apps/hoa/src/lib/community-templates/registry'

type Db = SupabaseClient<Database>

let failures = 0
function check(name: string, ok: boolean, detail?: string): void {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const AMBIENT = new Set(['association_name', 'recipient_name', 'owner_name', 'unit_id'])

// slug -> declared providedFields, straight from the in-code registry.
const PROVIDED_BY_SLUG = new Map<string, Set<string>>(
  COMMUNITY_TEMPLATES.map((t) => [t.slug, new Set(t.providedFields ?? [])]),
)

async function main(): Promise<void> {
  const admin: Db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { data: rows, error } = await admin
    .from('communication_templates')
    .select('topic_slug, name, shape, accent_color, questions, visual_block, body_html, subject')
    .is('organization_id', null)
    .eq('category', 'community')

  if (error) {
    check('A. query global templates', false, error.message)
    process.exit(1)
  }

  check('A. seven global community templates', rows!.length === 7, `got ${rows!.length}`)

  for (const r of rows!) {
    const qs = (r.questions ?? []) as Array<{ id: string }>
    check(
      `B. ${r.topic_slug} fully populated`,
      Boolean(r.accent_color) && Boolean(r.visual_block) && Array.isArray(qs),
    )

    const used = new Set(
      [...String(r.body_html).matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1]),
    )
    const answered = new Set(qs.map((q) => q.id))
    const provided = PROVIDED_BY_SLUG.get(r.topic_slug ?? '') ?? new Set<string>()
    const orphans = [...used].filter(
      (f) => !answered.has(f) && !AMBIENT.has(f) && !provided.has(f),
    )
    check(`C. ${r.topic_slug} has no orphan merge fields`, orphans.length === 0, orphans.join(', '))
  }

  // D. RLS — the anon key must read globals but never write one.
  const anon: Db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  const { data: readable } = await anon
    .from('communication_templates')
    .select('topic_slug')
    .is('organization_id', null)
  check('D1. globals are readable', (readable?.length ?? 0) > 0)

  // D2 — the single most important assertion in this harness. Migration
  // 0044 split the original FOR ALL policy (no WITH CHECK, so Postgres
  // reused USING as WITH CHECK) into four per-command policies precisely
  // so a tenant could not write into the shared global library. If this
  // insert succeeds, that split did not take and the global library is
  // writable by any authenticated tenant — a security failure, not an
  // ordinary test failure.
  const { data: insertedRow, error: insertErr } = await anon
    .from('communication_templates')
    .insert({
      organization_id: null,
      category: 'community',
      name: 'rls probe',
      subject: 's',
      body_html: '<p>x</p>',
    } as never)
    .select('id')
    .maybeSingle()

  if (insertErr === null) {
    console.log(
      '\n*** SECURITY FAILURE *** D2. tenant/anon INSERT into the global community ' +
        'template library SUCCEEDED. Migration 0044\'s RLS split did not take — the ' +
        'shared global library is writable by any authenticated tenant. This is not ' +
        'a normal test failure; stop and investigate before anything else.\n',
    )
    failures++
    // Clean up the row this insert should never have been able to create.
    if (insertedRow?.id) {
      await admin.from('communication_templates').delete().eq('id', insertedRow.id)
      const { data: stillThere } = await admin
        .from('communication_templates')
        .select('id')
        .eq('id', insertedRow.id)
        .maybeSingle()
      console.log(
        stillThere
          ? `*** cleanup FAILED — probe row ${insertedRow.id} still present ***`
          : `cleaned up unexpected probe row ${insertedRow.id}`,
      )
    }
  } else {
    check('D2. tenant cannot insert a global', true, insertErr.message)
  }

  // E. The communications CHECK must accept 'community' too. Widening only
  // communication_templates passes every check above and then blows up at
  // the communications INSERT in send.ts — after the audience has resolved
  // and the board member has clicked Send. Prove it by actually inserting
  // a communications row with category 'community' and rolling it back.
  const { data: assoc } = await admin
    .from('associations')
    .select('id, organization_id')
    .limit(1)
    .maybeSingle()

  if (!assoc) {
    check('E. communications accepts community', false, 'no association to test against')
  } else {
    const probe = {
      organization_id: assoc.organization_id,
      association_id: assoc.id,
      category: 'community',
      subject: 'rls/check probe',
      body_html: '<p>probe</p>',
      status: 'draft',
      // NOT NULL with no default — only relevant because this harness
      // bypasses the app's send pipeline, which always sets this.
      audience_definition: { kind: 'specific_units' },
    }
    const { data: inserted, error: commErr } = await admin
      .from('communications')
      .insert(probe as never)
      .select('id')
      .maybeSingle()

    check('E. communications CHECK accepts category community', commErr === null, commErr?.message)

    if (inserted?.id) {
      await admin.from('communications').delete().eq('id', inserted.id)
      const { data: stillThere } = await admin
        .from('communications')
        .select('id')
        .eq('id', inserted.id)
        .maybeSingle()
      check('E. probe communications row cleaned up', !stillThere)
    }
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
