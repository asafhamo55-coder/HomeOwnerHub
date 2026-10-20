// BL-108 — the board's email when its org reaches a monthly AI spend level
// (20%: FYI; 25%: resident AI paused; 30%: all AI paused). Once per level
// per calendar month (UTC).
//
// Recipients: the org's BOARD members only (fetchBoardMembers(orgId,
// ['board'])), never residents. Every send goes through the app's guarded
// sendEmail (BL-004 outbound guard, with the org's sandbox mode), the same
// path the other board notices use.
//
// Once a month: a claim row `ai.spend.notice.<level>` is written to
// audit_log BEFORE sending, and a level whose claim already exists this
// month is skipped. Not atomic (two concurrent first-crossings can both
// pass the read); the cost of that race is a duplicate FYI email, and no
// migration is needed. A failed claim write sends nothing, so a broken
// write can never turn into an email on every AI call.
//
// Logs carry ids, counts and codes only (RC-2): never an address.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, type Database } from '@homeowner-portal/db'
import { fetchOrgSandbox } from '@homeowner-portal/observability/outbound-guard'
import { logRouteFailure } from './log'
import { monthKeyUtc, monthStartUtc, type AiSpendLevel } from './ai-limits'
import { aiSpendNoticeCopy } from './ai-spend'

type Db = SupabaseClient<Database>

export function aiSpendNoticeAction(level: Exclude<AiSpendLevel, 'normal'>): string {
  return `ai.spend.notice.${level}`
}

export interface AiSpendNoticeDeps {
  db?: Db
  /** Board members' emails (board role only). */
  boardEmails?: (orgId: string) => Promise<string[]>
  sendEmail?: (
    input: { to: string; subject: string; html: string; text: string },
    opts: { orgSandbox?: boolean; ref?: string },
  ) => Promise<{ ok: true } | { ok: false; error: string }>
  appUrl?: (path: string) => string
  orgSandbox?: (db: Db, orgId: string) => Promise<boolean>
}

async function defaultBoardEmails(orgId: string): Promise<string[]> {
  const { fetchBoardMembers } = await import('@/lib/communications/audience')
  const members = await fetchBoardMembers(orgId, ['board'])
  return [...new Set(members.map((m) => m.email).filter((e): e is string => !!e))]
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Returns how many emails went out (0 when this level was already sent this month). */
export async function notifyAiSpendLevel(
  orgId: string,
  level: Exclude<AiSpendLevel, 'normal'>,
  now: number,
  deps: AiSpendNoticeDeps = {},
): Promise<number> {
  const copy = aiSpendNoticeCopy(level, now)
  if (!copy) return 0
  const db = deps.db ?? createAdminClient()
  const action = aiSpendNoticeAction(level)

  const { data: prior, error: priorErr } = await db
    .from('audit_log')
    .select('id')
    .eq('org_id', orgId)
    .eq('action', action)
    .gte('created_at', monthStartUtc(now).toISOString())
    .limit(1)
  if (priorErr) {
    logRouteFailure('ai.spend.notice.read', priorErr, { orgId, level })
    return 0
  }
  if (prior && prior.length > 0) return 0

  const { error: claimErr } = await db
    .from('audit_log')
    .insert({ action, org_id: orgId, metadata: { month: monthKeyUtc(now), level } })
  if (claimErr) {
    logRouteFailure('ai.spend.notice.claim', claimErr, { orgId, level })
    return 0
  }

  const emails = await (deps.boardEmails ?? defaultBoardEmails)(orgId)
  if (emails.length === 0) return 0

  const send = deps.sendEmail ?? (await import('@/lib/email')).sendEmail
  const appUrl = deps.appUrl ?? (await import('@/lib/email')).appUrl
  const orgSandbox = await (deps.orgSandbox ?? fetchOrgSandbox)(db, orgId)
  const link = appUrl('/settings/billing')
  const subject = copy.title
  const text = `${copy.body}\n\nSee your plan: ${link}`
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111;">
  <h2 style="margin:0 0 12px 0;font-size:18px;">${escapeHtml(copy.title)}</h2>
  <p style="margin:0 0 16px 0;color:#333;">${escapeHtml(copy.body)}</p>
  <p style="margin:0;"><a href="${link}">See your plan</a></p>
</div>`

  let sent = 0
  for (const to of emails) {
    const res = await send({ to, subject, html, text }, { orgSandbox, ref: `ai-spend:${orgId}:${level}` })
    if (res.ok) sent += 1
  }
  if (sent < emails.length) {
    logRouteFailure('ai.spend.notice.send', new Error('send_failed'), { orgId, level, count: emails.length - sent })
  }
  return sent
}
