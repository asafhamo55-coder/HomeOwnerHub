/**
 * BL-101 A1/A2 — one home's account, read for the board's inbox.
 *
 * Two jobs, shared by the context rail and the reply drafter so they can
 * never disagree:
 *
 *   1. The disclosure gate (`checkSenderForUnit`). Is the person who wrote
 *      this email actually a resident of the home the thread is filed
 *      under? The drafter puts a balance, a charge or a request status into
 *      a reply ONLY when this says yes. A neighbour who writes "what does
 *      12 Example Ct owe?" must get a blank, never a figure.
 *
 *   2. The account itself (`loadHomeAccount`): ledger, payment plan,
 *      violations, ARC and tickets, through the resident assistant's reads
 *      (lib/resident-assistant/reads.ts) with a one-unit board scope on the
 *      board member's OWN RLS client. Never the service role.
 *
 * The gate checks the sender address directly against the home's records:
 * a current resident's email (property_residents / the owner email, via
 * resolvePropertyByEmail) or a "remember sender" alias the board saved for
 * this home. The thread's match rule alone is not enough: a
 * `thread_continuity` or `address_in_body` match, or a manual filing, says
 * which home the email is ABOUT, not that the writer lives there.
 *
 * Logs carry ids and error codes only — never an address or a figure.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { escapeLikePattern, resolvePropertyByEmail } from '@/lib/properties/resolve'
import { orgTimeZone } from '@/lib/association-time-server'
import {
  readMyAccount,
  readMyPaymentPlan,
  readMyRequests,
  unitScope,
  type MyAccount,
  type MyRequests,
} from '@/lib/resident-assistant/reads'

type Db = SupabaseClient<Database>

// ─── The disclosure gate ────────────────────────────────────────────

export type SenderCheck =
  | { verified: true; residentId: string | null; via: 'resident_email' | 'sender_alias' }
  | { verified: false; reason: 'not_filed' | 'no_sender' | 'not_a_resident' | 'check_failed' }

/**
 * Why account details were left out, in words the board reads on the
 * blank. Fixed strings: never the sender's address, never a figure.
 */
export const WITHHELD_REASON: Record<Extract<SenderCheck, { verified: false }>['reason'], string> = {
  not_filed: 'This email is not filed under a home, so no account details were used.',
  no_sender: 'The sender address is missing, so it could not be checked against this home.',
  not_a_resident:
    "The sender's address is not on file for a resident of this home, so account details were withheld.",
  check_failed: "The sender couldn't be checked against this home's residents, so account details were withheld.",
}

/**
 * Pure decision, exported for the unit test that pins the gate.
 *
 * Verified only when the thread is filed AND the sender's own address
 * resolves to THIS unit — through a resident/owner email or a saved alias.
 * An address that resolves only to some other home is "not a resident".
 */
export function decideSenderCheck(input: {
  unitId: string | null
  senderEmail: string | null
  emailMatches: ReadonlyArray<{ unitId: string; residentId: string | null }>
  aliasMatches: ReadonlyArray<{ unitId: string | null; residentId: string | null }>
}): SenderCheck {
  if (!input.unitId) return { verified: false, reason: 'not_filed' }
  if (!input.senderEmail || !input.senderEmail.trim()) return { verified: false, reason: 'no_sender' }
  const email = input.emailMatches.find((m) => m.unitId === input.unitId)
  if (email) return { verified: true, residentId: email.residentId, via: 'resident_email' }
  const alias = input.aliasMatches.find((m) => m.unitId === input.unitId)
  if (alias) return { verified: true, residentId: alias.residentId, via: 'sender_alias' }
  return { verified: false, reason: 'not_a_resident' }
}

/** The address a reply goes back to: the newest inbound message's sender. */
export function latestInboundSender(
  messages: ReadonlyArray<{ direction: 'inbound' | 'outbound'; fromEmail: string | null }>,
): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.direction === 'inbound') return m.fromEmail?.trim().toLowerCase() || null
  }
  return null
}

/**
 * Run the gate against the database. Fails CLOSED: any read error is
 * `check_failed`, which withholds, exactly like "not a resident".
 */
export async function checkSenderForUnit(
  db: Db,
  orgId: string,
  unitId: string | null,
  senderEmail: string | null,
): Promise<SenderCheck> {
  const pre = decideSenderCheck({ unitId, senderEmail, emailMatches: [], aliasMatches: [] })
  if (!pre.verified && pre.reason !== 'not_a_resident') return pre
  const email = senderEmail!.trim().toLowerCase()

  try {
    const [matches, aliasRes] = await Promise.all([
      resolvePropertyByEmail(db, orgId, email),
      db
        .from('inbox_sender_aliases')
        .select('unit_id, resident_id')
        .eq('organization_id', orgId)
        .ilike('email_address', escapeLikePattern(email))
        .limit(5),
    ])
    if (aliasRes.error) {
      console.error('checkSenderForUnit: alias read failed', { orgId, unitId, code: aliasRes.error.code })
      return { verified: false, reason: 'check_failed' }
    }
    return decideSenderCheck({
      unitId,
      senderEmail: email,
      emailMatches: matches.map((m) => ({ unitId: m.ref.unitId, residentId: m.residentId })),
      aliasMatches: (aliasRes.data ?? []).map((a) => ({ unitId: a.unit_id, residentId: a.resident_id })),
    })
  } catch (error) {
    console.error('checkSenderForUnit: resident lookup failed', {
      orgId,
      unitId,
      code: (error as { code?: unknown } | null)?.code ?? null,
    })
    return { verified: false, reason: 'check_failed' }
  }
}

// ─── The account ────────────────────────────────────────────────────

export type PaymentPlanView = Awaited<ReturnType<typeof readMyPaymentPlan>>

export interface HomeAccount {
  /** Null when the ledger read failed: unknown, never "nothing owed". */
  account: MyAccount | null
  plan: PaymentPlanView
  /** Null when the requests read failed. */
  requests: MyRequests | null
  degraded: Array<'ledger' | 'requests'>
}

/**
 * Everything on file for one home, on the caller's RLS client. Each part
 * degrades on its own: a failed ledger read does not hide the violations.
 */
export async function loadHomeAccount(db: Db, orgId: string, unitId: string, now: Date = new Date()): Promise<HomeAccount> {
  const timeZone = await orgTimeZone(db, orgId)
  const scope = unitScope({ db, orgId, unitIds: [unitId], timeZone })
  const [account, plan, requests] = await Promise.allSettled([
    readMyAccount(scope, now),
    readMyPaymentPlan(scope),
    readMyRequests(scope),
  ])
  const degraded: HomeAccount['degraded'] = []
  if (account.status === 'rejected') {
    console.error('loadHomeAccount: ledger read failed', { orgId, unitId })
    degraded.push('ledger')
  }
  if (requests.status === 'rejected') {
    console.error('loadHomeAccount: requests read failed', { orgId, unitId })
    degraded.push('requests')
  }
  return {
    account: account.status === 'fulfilled' ? account.value : null,
    plan: plan.status === 'fulfilled' ? plan.value : { visible: false },
    requests: requests.status === 'fulfilled' ? requests.value : null,
    degraded,
  }
}

/** Calendar day a violation's cure period ends, from the notice date. */
export function cureDate(noticeSentAt: string | null, curePeriodDays: number | null): string | null {
  if (!noticeSentAt || curePeriodDays === null || curePeriodDays === undefined) return null
  const start = new Date(noticeSentAt)
  if (Number.isNaN(start.getTime())) return null
  start.setUTCDate(start.getUTCDate() + curePeriodDays)
  return start.toISOString().slice(0, 10)
}
