'use server'

/**
 * Server actions behind /properties/import (P4 / PR-02): the board runs
 * its own roster import.
 *
 * Every action gates on board/admin BEFORE building a client, then uses
 * the caller's own RLS client (never service-role: a board member can
 * read and write their org's homes themselves) and scopes every read and
 * write to the gate's org. Logs carry ids, codes and counts only.
 *
 *   previewRosterMatches  the dry run's one read: which existing home
 *                         each row is (match-home.ts)
 *   beginRosterImport     the audit row (who, which community, the counts
 *                         the dry run showed), written BEFORE any data,
 *                         the BL-011 "audit first" rule
 *   commitRosterChunk     one chunk of homes → commit.ts → importLots
 */
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadHomeIndex } from '../import'
import { chooseAssociation } from '../lot'
import { matchHome, type HomeMatch } from '../match-home'
import { COMMIT_CHUNK_ROWS } from './classify'
import { commitRosterHomes, type ChunkResult } from './commit'
import { MAX_ROWS } from './parse'

const text = (max: number) => z.string().max(max).nullable()

const RowSchema = z.object({
  row: z.number().int().min(1).max(1_000_000),
  address: z.string().max(200),
  unit: text(50),
  city: text(100),
  state: text(50),
  zip: text(20),
  ownerName: text(200),
  ownerEmail: text(254),
  ownerPhone: text(50),
  mailingAddress: text(300),
  tenure: z.enum(['owner_occupied', 'leased', 'unknown']).nullable(),
})

const ModeSchema = z.enum(['skip', 'update'])
const AssociationSchema = z.string().uuid('Choose a community from the list.').nullable()

const PreviewSchema = z.object({
  homes: z
    .array(z.object({ address: z.string().max(200), unit: text(50) }))
    .max(MAX_ROWS, 'That file has more than 5,000 rows. Split it into smaller files.'),
})

const BeginSchema = z.object({
  associationId: AssociationSchema,
  mode: ModeSchema,
  counts: z.object({
    total: z.number().int().min(0).max(MAX_ROWS),
    new: z.number().int().min(0).max(MAX_ROWS),
    update: z.number().int().min(0).max(MAX_ROWS),
    duplicate: z.number().int().min(0).max(MAX_ROWS),
    error: z.number().int().min(0).max(MAX_ROWS),
  }),
  fileType: z.enum(['csv', 'xlsx']),
  preset: z.enum(['cinc', 'template', 'generic']),
})

const ChunkSchema = z.object({
  associationId: AssociationSchema,
  mode: ModeSchema,
  homes: z
    .array(z.object({ rows: z.array(RowSchema).min(1).max(50) }))
    .min(1)
    .max(COMMIT_CHUNK_ROWS)
    // chunkHomes keeps a chunk to COMMIT_CHUNK_ROWS rows unless one home
    // alone is bigger; this bounds a hand-built request too.
    .refine((homes) => homes.reduce((n, h) => n + h.rows.length, 0) <= 100),
})

type Fail = { ok: false; error: string }
const firstIssue = (e: z.ZodError): string => e.issues[0]?.message ?? 'Something in the request isn’t valid.'
const INVALID = 'Some rows couldn’t be read. Check the file and try again.'

export type PreviewResult = { ok: true; matches: HomeMatch[] } | Fail

export async function previewRosterMatches(input: unknown): Promise<PreviewResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = PreviewSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: issue?.code === 'too_big' && issue.path.length === 1 ? issue.message : INVALID }
  }

  const supabase = await getSupabaseServerClient()
  const index = await loadHomeIndex(supabase, gate.orgId)
  if (!index) return { ok: false, error: 'Couldn’t check your existing homes. Try again.' }
  return { ok: true, matches: parsed.data.homes.map((h) => matchHome(index, h.address, h.unit)) }
}

export type BeginResult = { ok: true; associationId: string | null } | Fail

export async function beginRosterImport(input: unknown): Promise<BeginResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = BeginSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { orgId } = gate
  const supabase = await getSupabaseServerClient()

  const assoc = await chooseAssociation(supabase, orgId, parsed.data.associationId)
  if (!assoc.ok) return { ok: false, error: assoc.error }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You are not signed in.' }

  // Counts and choices only: no addresses, names or emails.
  const { counts, mode, fileType, preset } = parsed.data
  const { error } = await supabase.from('audit_log').insert({
    action: 'properties_import',
    org_id: orgId,
    user_id: user.id,
    entity_type: 'org',
    entity_id: orgId,
    metadata: { source: 'board', association_id: assoc.data.associationId, mode, file_type: fileType, preset, rows: counts },
  })
  if (error) {
    console.error('[properties.roster] audit insert failed', { orgId, code: error.code ?? null })
    return { ok: false, error: 'Couldn’t start the import. Nothing was written. Try again.' }
  }
  console.info('[properties.roster] import started', { orgId, mode, rows: counts.total })
  return { ok: true, associationId: assoc.data.associationId }
}

export async function commitRosterChunk(input: unknown): Promise<ChunkResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  const parsed = ChunkSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: INVALID }
  const { orgId } = gate
  const supabase = await getSupabaseServerClient()

  try {
    const assoc = await chooseAssociation(supabase, orgId, parsed.data.associationId)
    if (!assoc.ok) return { ok: false, error: assoc.error }
    const result = await commitRosterHomes(supabase, {
      orgId,
      associationId: assoc.data.associationId,
      mode: parsed.data.mode,
      homes: parsed.data.homes,
    })
    revalidatePath('/properties')
    return result
  } catch (err) {
    console.error('[properties.roster] chunk failed', { orgId, code: (err as { code?: string } | null)?.code ?? null })
    return { ok: false, error: 'Couldn’t save these rows. Try again.' }
  }
}
