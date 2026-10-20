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
 * BL-105: an address can be forged. When the thread's newest inbound
 * message carries the receiving server's verdict (inbox_messages.sender_auth,
 * from its Authentication-Results header — packages/mailbox auth-results.ts),
 * a `fail` makes the sender `sender_unauthenticated` whatever the address
 * matches; `pass` / `none` keep the address check and ride along on a
 * verified result as `auth` so the rail can say how sure it is. Read only
 * while SENDER_AUTH_COLUMN_LIVE is on.
 *
 * Logs carry ids and error codes only — never an address or a figure.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import {
  SENDER_AUTH_COLUMN_LIVE,
  toSenderAuthVerdict,
  type SenderAuthVerdict,
} from '@homeowner-portal/mailbox'
import { escapeLikePattern, resolvePropertyByEmail } from '@/lib/properties/resolve'
import { orgTimeZone } from '@/lib/association-time-server'
import { chargesFromForOwnership } from '@/lib/resident-sale-window'
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
  | {
      verified: true
      residentId: string | null
      via: 'resident_email' | 'sender_alias'
      /**
       * BL-105: the newest inbound message's SPF/DKIM/DMARC verdict, when it
       * was read (`pass` or `none` — a `fail` is never verified). Absent =
       * not read (flag off, or no thread given).
       */
      auth?: Exclude<SenderAuthVerdict, 'fail'>
    }
  | {
      verified: false
      reason: 'not_filed' | 'no_sender' | 'not_a_resident' | 'check_failed' | 'sender_unauthenticated'
    }

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
  sender_unauthenticated:
    "This email failed the sender authentication check (SPF/DKIM/DMARC), so the From address can't be trusted and account details were withheld.",
}

/**
 * BL-105, pure: fold the newest inbound message's verdict into the address
 * check. `fail` overrides any address match (a forged From matches by
 * design); `not_filed` / `no_sender` stay as they are because they say
 * something more basic. `null` = verdict not read: the check is unchanged.
 */
export function applySenderAuth(check: SenderCheck, auth: SenderAuthVerdict | null): SenderCheck {
  if (auth === null) return check
  if (!check.verified && (check.reason === 'not_filed' || check.reason === 'no_sender')) return check
  if (auth === 'fail') return { verified: false, reason: 'sender_unauthenticated' }
  return check.verified ? { ...check, auth } : check
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
 * The newest inbound message's verdict for a thread. Throws on a read
 * error so the caller fails closed. A row stored before the column was
 * filled reads as `none`.
 */
async function readLatestInboundAuth(db: Db, orgId: string, threadId: string): Promise<SenderAuthVerdict> {
  // `sender_auth` is not in the generated types until the migration is
  // applied and the types regenerated; read it through a loose handle.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loose = db as unknown as { from: (table: string) => any }
  const { data, error } = (await loose
    .from('inbox_messages')
    .select('sender_auth')
    .eq('organization_id', orgId)
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    // The message latestInboundSender picks: newest by sent_at, where a
    // missing sent_at sorts last ascending, so first here.
    .order('sent_at', { ascending: false, nullsFirst: true })
    .limit(1)
    .maybeSingle()) as { data: { sender_auth: unknown } | null; error: { code?: string } | null }
  if (error) throw error
  return toSenderAuthVerdict(data?.sender_auth ?? null)
}

export interface SenderCheckOptions {
  /** The thread whose newest inbound message's verdict applies (BL-105). */
  threadId?: string | null
  /** Defaults to SENDER_AUTH_COLUMN_LIVE; tests pass it explicitly. */
  authColumnLive?: boolean
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
  options: SenderCheckOptions = {},
): Promise<SenderCheck> {
  const pre = decideSenderCheck({ unitId, senderEmail, emailMatches: [], aliasMatches: [] })
  if (!pre.verified && pre.reason !== 'not_a_resident') return pre
  const email = senderEmail!.trim().toLowerCase()
  const live = options.authColumnLive ?? SENDER_AUTH_COLUMN_LIVE

  let auth: SenderAuthVerdict | null = null
  if (live && options.threadId) {
    try {
      auth = await readLatestInboundAuth(db, orgId, options.threadId)
    } catch (error) {
      console.error('checkSenderForUnit: sender auth read failed', {
        orgId,
        unitId,
        threadId: options.threadId,
        code: (error as { code?: unknown } | null)?.code ?? null,
      })
      return { verified: false, reason: 'check_failed' }
    }
    // A forged From is not worth looking up.
    if (auth === 'fail') return { verified: false, reason: 'sender_unauthenticated' }
  }

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
    const check = decideSenderCheck({
      unitId,
      senderEmail: email,
      emailMatches: matches.map((m) => ({ unitId: m.ref.unitId, residentId: m.residentId })),
      aliasMatches: (aliasRes.data ?? []).map((a) => ({ unitId: a.unit_id, residentId: a.resident_id })),
    })
    return applySenderAuth(check, auth)
  } catch (error) {
    console.error('checkSenderForUnit: resident lookup failed', {
      orgId,
      unitId,
      code: (error as { code?: unknown } | null)?.code ?? null,
    })
    return { verified: false, reason: 'check_failed' }
  }
}

// ─── The sale window ────────────────────────────────────────────────

/**
 * The first day of charges a reply may mention, for a home whose current
 * ownership began with a recorded sale; null = the whole unit history.
 *
 * Same rule as the resident portal (lib/resident-sale-window.ts,
 * `chargesFromForOwnership`): only an ownership with source 'sale' dates
 * the boundary. An imported, invited or hand-entered ownership is dated by
 * the day it was typed in, so it never narrows anything.
 *
 * Why the home's current ownership and not only the sender's own row: the
 * sale moves the seller's household out (lib/properties/sale.ts), so every
 * verified sender of a sold home is on the buyer's side — the buyer, a
 * co-buyer, the buyer writing from a saved alias, or a household member on
 * property_residents. None of them may be told the seller's charges, and
 * matching only the buyer's own ownership row would let the alias or the
 * spouse through. With several current sale rows the latest day wins. Pure.
 */
export function saleWindowStart(
  currentOwnerships: ReadonlyArray<{ valid_from: string; source?: string | null }>,
): string | null {
  let from: string | null = null
  for (const o of currentOwnerships) {
    const day = chargesFromForOwnership(o)
    if (day && (!from || day > from)) from = day
  }
  return from
}

/**
 * The home's requests a reply may mention after a recorded sale: tickets
 * and ARC applications filed on or after the sale day. Earlier ones were
 * the seller's (a board reader keys requests on the unit, not on who
 * filed them, so without this the buyer would be told about the seller's
 * fence application). Open violations are kept whatever their date: they
 * run with the lot and the buyer inherits the cure. Null `from` = no
 * narrowing. Compared by calendar day (YYYY-MM-DD prefix). Pure.
 */
export function scopeRequestsToSaleWindow(requests: MyRequests, from: string | null): MyRequests {
  if (!from) return requests
  const onOrAfter = (iso: string | null | undefined) => typeof iso === 'string' && iso.slice(0, 10) >= from
  return {
    ...requests,
    tickets: requests.tickets.filter((t) => onOrAfter(t.createdAt)),
    arcApplications: requests.arcApplications.filter((a) => onOrAfter(a.submittedAt)),
  }
}

/** The home's current ownerships. `ok: false` = unknown, so the ledger is withheld. */
async function readSaleWindow(
  db: Db,
  orgId: string,
  unitId: string,
): Promise<{ ok: true; from: string | null } | { ok: false }> {
  try {
    const { data, error } = await db
      .from('ownerships')
      .select('valid_from, source')
      .eq('organization_id', orgId)
      .eq('unit_id', unitId)
      .is('valid_to', null)
    if (error) {
      console.error('loadHomeAccount: ownership read failed', { orgId, unitId, code: error.code })
      return { ok: false }
    }
    return { ok: true, from: saleWindowStart((data ?? []) as Array<{ valid_from: string; source: string | null }>) }
  } catch (error) {
    console.error('loadHomeAccount: ownership read failed', {
      orgId,
      unitId,
      code: (error as { code?: unknown } | null)?.code ?? null,
    })
    return { ok: false }
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
  /**
   * YYYY-MM-DD: `account` and `plan` cover only charges due on or after
   * this day, because the home's current ownership began with a sale on
   * it (saleWindowStart). Null/absent = the whole unit history. The
   * property page's ledger still shows the board everything.
   */
  chargesFrom?: string | null
}

/**
 * Everything on file for one home, on the caller's RLS client, scoped to
 * what its current residents may be told: after a recorded sale the
 * seller's charges, payments and payment plan are left out (the sale
 * window above), and so are tickets and ARC applications filed before the
 * sale (scopeRequestsToSaleWindow). Each part degrades on its own: a
 * failed ledger read does not hide the violations. A failed ownership
 * read withholds the ledger, the plan, the tickets and the ARC
 * applications rather than risk the seller's history (fails closed).
 */
export async function loadHomeAccount(db: Db, orgId: string, unitId: string, now: Date = new Date()): Promise<HomeAccount> {
  const [timeZone, window] = await Promise.all([orgTimeZone(db, orgId), readSaleWindow(db, orgId, unitId)])
  const chargesFrom = window.ok ? window.from : null
  const scope = unitScope({ db, orgId, unitIds: [unitId], timeZone, chargesFrom })
  const [account, plan, requests] = await Promise.allSettled([
    window.ok ? readMyAccount(scope, now) : Promise.reject(new Error('sale window unknown')),
    window.ok ? readMyPaymentPlan(scope) : Promise.resolve<PaymentPlanView>({ visible: false }),
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
  let planView: PaymentPlanView = plan.status === 'fulfilled' ? plan.value : { visible: false }
  // A plan that started before the sale covers the seller's charges.
  if (planView.visible && chargesFrom && planView.plan.startDate.slice(0, 10) < chargesFrom) {
    planView = { visible: false }
  }
  return {
    account: account.status === 'fulfilled' ? account.value : null,
    plan: planView,
    // Unknown window (ownership read failed): keep the lot's open
    // violations, drop every ticket and ARC application rather than risk
    // the seller's. The fragments only state what is present, so a
    // dropped list never reads as "none on file".
    requests:
      requests.status !== 'fulfilled'
        ? null
        : window.ok
          ? scopeRequestsToSaleWindow(requests.value, chargesFrom)
          : { ...requests.value, tickets: [], arcApplications: [] },
    degraded,
    chargesFrom,
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
