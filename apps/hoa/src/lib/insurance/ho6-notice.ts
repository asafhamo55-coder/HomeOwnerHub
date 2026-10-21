/**
 * BL-142 (remainder): the optional HO-6 notice to owners, and its hand-off
 * to the communications wizard. Pure apart from the storage it is given.
 *
 * The insurance page writes the subject and HTML body to this tab's
 * sessionStorage and opens /communications/new?from=ho6-notice; the wizard
 * reads it back and pre-fills the message, addressed to owners. Nothing is
 * saved on the server and nothing is sent: the board reviews it in the
 * wizard, and the normal send (with the outbound guard) is the only way it
 * leaves. Same shape as lib/dues-rates/notice.ts.
 *
 * Facts come from the master (property) policy on record: carrier, limit,
 * deductible, and the day it ends. Those are the owner-facing columns the
 * resident insurance summary already shows (never the premium, the policy
 * number or the notes). What the policy covers is a bracketed blank the
 * board fills in from the declarations page: the app doesn't hold it. No
 * statute is quoted: what an owner must insure depends on the governing
 * documents, so the notice says so.
 */

import { formatCents, isActive, type InsurancePolicy } from './model'

export const HO6_NOTICE_FROM = 'ho6-notice'
export const HO6_NOTICE_DRAFT_KEY = 'hoh:ho6-notice-draft'
export const HO6_NOTICE_WIZARD_HREF = `/communications/new?from=${HO6_NOTICE_FROM}`

export interface Ho6NoticeDraft {
  subject: string
  bodyHtml: string
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

function longDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

/**
 * The master policy the notice describes: the property policy in force
 * today that ends last (the current term when a renewal is already on
 * record). Null when none is in force.
 */
export function masterPolicyForNotice(policies: readonly InsurancePolicy[], today: string): InsurancePolicy | null {
  const active = policies.filter((p) => p.kind === 'property' && isActive(p, today))
  if (active.length === 0) return null
  return [...active].sort((a, b) => (a.expiresOn < b.expiresOn ? 1 : a.expiresOn > b.expiresOn ? -1 : 0))[0]!
}

export function buildHo6Notice(input: { associationName: string | null; master: InsurancePolicy | null }): Ho6NoticeDraft {
  const name = input.associationName?.trim() || 'the association'
  const m = input.master
  const subject = 'Your home insurance and the association’s master policy'

  const lines: string[] = []
  lines.push(`<p>Dear owner,</p>`)
  lines.push(
    `<p>This is a reminder about what ${esc(name)}’s insurance covers, and what it leaves to you. Nothing here changes your coverage; it is information to help you check your own policy.</p>`,
  )
  lines.push(`<p><strong>The association’s master policy</strong></p>`)
  if (m) {
    const facts: string[] = []
    facts.push(`<li>Insurer: ${esc(m.carrier.trim() || '[insurer]')}</li>`)
    facts.push(`<li>Coverage limit: ${m.coverageLimitCents !== null ? esc(formatCents(m.coverageLimitCents)) : '[limit]'}</li>`)
    facts.push(`<li>Deductible: ${m.deductibleCents !== null ? esc(formatCents(m.deductibleCents)) : '[deductible]'}</li>`)
    facts.push(`<li>In force until: ${esc(longDay(m.expiresOn))}</li>`)
    lines.push(`<ul>${facts.join('')}</ul>`)
  } else {
    lines.push(`<ul><li>Insurer: [insurer]</li><li>Coverage limit: [limit]</li><li>Deductible: [deductible]</li><li>In force until: [date]</li></ul>`)
  }
  lines.push(
    `<p><strong>What it covers:</strong> [From the declarations page: for example the common areas, the clubhouse and pool, and, if our governing documents say so, the building exteriors or structure.]</p>`,
  )
  lines.push(
    `<p><strong>What it usually does not cover:</strong> your belongings, the inside of your home and improvements you have made, your personal liability, and the cost of living elsewhere while your home is repaired. [Check this list against the policy before sending.]</p>`,
  )
  lines.push(`<p><strong>Your own policy</strong></p>`)
  lines.push(
    `<p>Talk to your insurance agent about a policy for your home. Where the association insures the building, owners usually carry an HO-6 (condominium or townhome) policy; owners of single-family homes usually carry an HO-3 policy. Ask about loss assessment coverage too: it can help if the association charges owners for a large claim or for the master policy’s deductible.</p>`,
  )
  lines.push(
    `<p>Our governing documents decide what the association insures and what each owner insures. This is general information, not insurance or legal advice. A summary of the association’s policies is in the resident portal under Documents, then Association insurance.</p>`,
  )
  lines.push(`<p>If you have questions, reply to this message or contact the board.</p>`)
  lines.push(`<p>The Board of Directors<br />${esc(name)}</p>`)
  return { subject, bodyHtml: lines.join('\n') }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function writeHo6NoticeDraft(storage: StorageLike | null | undefined, draft: Ho6NoticeDraft): boolean {
  try {
    if (!storage) return false
    storage.setItem(HO6_NOTICE_DRAFT_KEY, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

export function readHo6NoticeDraft(storage: StorageLike | null | undefined): Ho6NoticeDraft | null {
  try {
    const raw = storage?.getItem(HO6_NOTICE_DRAFT_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<Ho6NoticeDraft>
    if (typeof v.subject !== 'string' || typeof v.bodyHtml !== 'string') return null
    if (!v.subject.trim() || !v.bodyHtml.trim()) return null
    return { subject: v.subject, bodyHtml: v.bodyHtml }
  } catch {
    return null
  }
}
