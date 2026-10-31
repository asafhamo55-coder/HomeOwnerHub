import {
  createAdminClient,
  loadAccountingRefs,
  postJournalEntry,
} from '@homeowner-portal/db'
import { M3_APPLIED } from '@homeowner-portal/db/m3'
import { inngest } from './client'
import { reportJobFailures } from './failure-reporting'
import { readAll } from './read-all'
import { ASSOCIATION_ZONE_COLUMNS, associationTimeZone, todayIn } from './association-time'
// BL-147: the board's late-fee policy and the state caps. Dependency-free
// (node:crypto only), relative-path import like daily-digest.ts's, so the
// job enforces exactly what the settings screen saved and checked.
import { lateFeeLaw, lateFeeStateOf } from '../../../apps/hoa/src/lib/late-fees/law'
import {
  LATE_FEE_NIGHTLY_AUDIT_ACTION,
  effectiveGraceDays,
  eligibleChargeTypes,
  lateCutoff,
  lateFeeForCharge,
  lawErrors,
  policyCharges,
  type LateFeePolicy,
} from '../../../apps/hoa/src/lib/late-fees/policy'
import { lateFeeSettingsSecret, readLateFeePolicy } from '../../../apps/hoa/src/lib/late-fees/store'
// BL-149: the Georgia SB 406 registration record (signed; same secret chain).
import { gaGateBlocks, gaUnregistered } from '../../../apps/hoa/src/lib/ga-registration/model'
import { gaStandingOf } from '../../../apps/hoa/src/lib/ga-registration/store'
// BL-161: the Secretary of State complaints the board recorded (signed; same secret chain).
import { gaComplaintStayBlocks, stayedUnitsOn } from '../../../apps/hoa/src/lib/ga-complaints/model'
import { readGaComplaints } from '../../../apps/hoa/src/lib/ga-complaints/store'

/** assessments.source the opening-balances executor writes (migration 0067, BL-136). */
export const OPENING_BALANCE_SOURCE = 'opening_balance'

/** audit_log.action for one association's nightly run that charged at least one fee. Ids and counts only. */
export const LATE_FEE_AUDIT_ACTION = LATE_FEE_NIGHTLY_AUDIT_ACTION

/** memo_code `.in()` lists are chunked so the request URL stays small. */
const MEMO_CHUNK = 150

type Db = ReturnType<typeof createAdminClient>
type QueryError = { code?: string; message?: string }

export interface DefaultedAssessment {
  id: string
  unit_id: string
  fiscal_period_id: string
  amount: number
  assessment_type: string
  due_date: string
  payments?: { amount: number }[] | null
}

function readFailed(what: string, e: QueryError): Error {
  // Code only: a PostgrestError message/details can echo row values.
  return new Error(`hoa-late-fees: ${what} read failed (${e.code ?? 'no code'})`)
}

export interface DefaultsFilter {
  /** Only these assessment types (BL-147: dues, plus fines when the board includes them). */
  types: readonly string[]
  /** Only charges whose due_date is before this day (today minus the grace period). */
  dueBefore: string
}

/**
 * Every open/partial, not deleted, eligible-type assessment in
 * `associationId` due before `filter.dueBefore`, and which of those have
 * no late fee booked yet.
 *
 * Both reads page to the end and THROW on failure (BL-047). Before:
 *  - the defaulted read was capped at PostgREST's 1000 rows, so charges
 *    past the first 1000 waited for later nights;
 *  - the "already charged?" read put every source id in ONE `.in()` and
 *    ignored its error. At a large association that URL overflows, the
 *    read fails, `existing` came back null, and every source looked
 *    uncharged — a second late fee on each. A failed read now fails the
 *    step (Inngest retries it) instead of charging.
 */
export async function findUnchargedDefaults(
  db: Db,
  associationId: string,
  filter: DefaultsFilter,
  skipOpeningBalances: boolean = M3_APPLIED,
): Promise<{ defaulted: DefaultedAssessment[]; uncharged: DefaultedAssessment[] }> {
  if (filter.types.length === 0) return { defaulted: [], uncharged: [] }
  const defaulted = await readAll<DefaultedAssessment>(
    (from, to) => {
      let q = db
        .from('assessments')
        .select('id, unit_id, fiscal_period_id, amount, assessment_type, due_date, payments(amount)')
        .eq('association_id', associationId)
        .in('status', ['open', 'partial'])
        .in('assessment_type', [...filter.types])
        .lt('due_date', filter.dueBefore)
        .is('deleted_at', null)
      // BL-136 (migration 0067): a balance carried over by the opening-
      // balances approval was late at the previous manager, not here, so it
      // never earns a late fee. `source` is NULL for every other charge, and
      // NULL <> 'opening_balance' is NULL in SQL, hence the explicit is.null.
      if (skipOpeningBalances) q = q.or(`source.is.null,source.neq.${OPENING_BALANCE_SOURCE}`)
      return q
        .order('id', { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: DefaultedAssessment[] | null; error: QueryError | null }>
    },
    (e) => readFailed('defaulted assessments', e),
  )

  const memoCodes = defaulted.map((a) => `LATE-${a.id}`)
  const alreadyCharged = new Set<string>()
  for (let i = 0; i < memoCodes.length; i += MEMO_CHUNK) {
    const part = memoCodes.slice(i, i + MEMO_CHUNK)
    const rows = await readAll<{ memo_code: string | null }>(
      (from, to) =>
        db
          .from('assessments')
          .select('id, memo_code')
          .eq('association_id', associationId)
          .eq('assessment_type', 'late_fee')
          .in('memo_code', part)
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: { memo_code: string | null }[] | null; error: QueryError | null }>,
      (e) => readFailed('existing late fees', e),
    )
    for (const r of rows) if (r.memo_code) alreadyCharged.add(r.memo_code)
  }

  return { defaulted, uncharged: defaulted.filter((a) => !alreadyCharged.has(`LATE-${a.id}`)) }
}

const toCents = (n: number) => Math.round(Number(n) * 100)

export interface LateFeeAssociation {
  id: string
  organization_id: string
  state?: string | null
  governing_law_state?: string | null
  compliance_settings?: unknown
  /** BL-155: associations.type; a Georgia 'condo' is capped under § 44-3-109(b)(1). */
  type?: string | null
}

export type LateFeeRunStatus =
  /** No saved policy: the safe default, nothing charged (BL-147). */
  | 'no_policy'
  /** A policy is stored but its signature does not verify: nothing charged. */
  | 'unverified'
  /** Saved but off, unattested, or outside the state rule: nothing charged. */
  | 'off'
  /** BL-149: Georgia, from 2027-01-01, not recorded as registered with the Secretary of State: nothing charged. */
  | 'unregistered'
  /** BL-161: Georgia, from 2027-01-01, a complaint record that doesn't verify (a stay can't be ruled out): nothing charged. */
  | 'complaints_unverified'
  | 'no_accounting'
  | 'read_failed'
  | 'ran'

export interface LateFeeRunResult {
  status: LateFeeRunStatus
  evaluated: number
  charged: number
  skipped: number
  capped: number
  failed: number
  totalCents: number
  /** BL-161: charges skipped because the unit's complaint stay runs today (also counted in `skipped`). */
  stayed: number
}

export interface LateFeeRunDeps {
  secret: string | null
  log: { warn: (msg: string) => void; info: (msg: string) => void }
  skipOpeningBalances?: boolean
}

const EMPTY = { evaluated: 0, charged: 0, skipped: 0, capped: 0, failed: 0, totalCents: 0, stayed: 0 }

/**
 * One association's night (BL-147). Charges ONLY under a saved, signed,
 * enabled policy that the board attested the declaration provides for and
 * that is inside the state rule today. Otherwise nothing is read and
 * nothing is charged. Each fee is one `late_fee` assessment plus its
 * Dr AR / Cr Late Fee Income JE, once per charge (memo_code), and a run
 * that charged anything writes one audit_log row with ids and counts only;
 * the board's morning digest reads that row.
 */
export async function runLateFeesForAssociation(
  db: Db,
  assoc: LateFeeAssociation,
  today: string,
  deps: LateFeeRunDeps,
): Promise<LateFeeRunResult> {
  const read = readLateFeePolicy(assoc.id, assoc.compliance_settings, deps.secret)
  if (read.state === 'none') return { status: 'no_policy', ...EMPTY }
  if (read.state === 'unverified') {
    deps.log.warn(`[hoa-late-fees] ${assoc.id}: stored late-fee policy does not verify; charging nothing`)
    return { status: 'unverified', ...EMPTY }
  }
  const policy: LateFeePolicy = read.policy
  const law = lateFeeLaw(lateFeeStateOf(assoc), assoc.type)
  if (!policyCharges(policy, law)) {
    if (policy.enabled) {
      // Field names only (never the text the board typed).
      deps.log.warn(
        `[hoa-late-fees] ${assoc.id}: policy on but not chargeable (${Object.keys(lawErrors(policy, law)).join(', ') || 'no amount'}); charging nothing`,
      )
    }
    return { status: 'off', ...EMPTY }
  }

  // BL-149: from Jan 1, 2027 a Georgia association that isn't recorded as
  // registered with the Secretary of State (registration kit, signed) may
  // not collect fees (§ 43-17A-2(a)(2)(A)); one that opted out may not
  // assess them ((a)(2)(B)(ii)). Charge nothing. Before that day, nothing changes.
  if (lateFeeStateOf(assoc) === 'GA' && gaGateBlocks(today)) {
    const standing = gaStandingOf(assoc.id, assoc.compliance_settings, deps.secret, today)
    if (gaUnregistered(standing.status)) {
      deps.log.warn(`[hoa-late-fees] ${assoc.id}: Georgia registration ${standing.status}; charging nothing`)
      return { status: 'unregistered', ...EMPTY }
    }
  }

  // BL-161: from Jan 1, 2027, while a resident's Secretary of State
  // complaint runs, the association may not collect fines or fees from them
  // (§ 43-17A-5(c)); a late fee on that unit is charged nothing. A record
  // that doesn't verify can't rule a stay out: charge nothing tonight.
  let stayed: ReadonlySet<string> = new Set()
  if (lateFeeStateOf(assoc) === 'GA' && gaComplaintStayBlocks(today)) {
    const units = stayedUnitsOn(readGaComplaints(assoc.id, assoc.compliance_settings, deps.secret), today)
    if (units === 'all') {
      deps.log.warn(`[hoa-late-fees] ${assoc.id}: Secretary of State complaint record does not verify; charging nothing`)
      return { status: 'complaints_unverified', ...EMPTY }
    }
    stayed = units
  }

  const refs = await loadAccountingRefs(db, assoc.id)
  if (!refs) {
    deps.log.warn(`[hoa-late-fees] ${assoc.id}: accounting not seeded, skipping`)
    return { status: 'no_accounting', ...EMPTY }
  }

  // We never compound: late_fee is never an eligible type, so a late fee
  // that itself goes overdue never spawns another. A failed read charges
  // NOTHING for this association tonight — never charge from a partial
  // "already charged" set. Caught so other associations still run.
  let found: Awaited<ReturnType<typeof findUnchargedDefaults>>
  try {
    found = await findUnchargedDefaults(
      db,
      assoc.id,
      { types: eligibleChargeTypes(policy), dueBefore: lateCutoff(today, effectiveGraceDays(policy, law)) },
      deps.skipOpeningBalances,
    )
  } catch (e) {
    deps.log.warn(`[hoa-late-fees] ${assoc.id}: ${e instanceof Error ? e.message : 'read failed'}; skipping`)
    return { status: 'read_failed', ...EMPTY }
  }
  const { defaulted, uncharged } = found
  const result: LateFeeRunResult = { status: 'ran', ...EMPTY, evaluated: defaulted.length, skipped: defaulted.length - uncharged.length }

  for (const src of uncharged) {
    if (stayed.has(src.unit_id)) {
      result.skipped += 1
      result.stayed += 1
      continue
    }
    const memoCode = `LATE-${src.id}`
    // Re-checked per charge: type, grace, unpaid amount and the state cap.
    const outcome = lateFeeForCharge(
      policy,
      law,
      {
        assessmentType: src.assessment_type,
        dueDate: src.due_date,
        amountCents: toCents(src.amount),
        paidCents: (src.payments ?? []).reduce((t, p) => t + toCents(p.amount), 0),
      },
      today,
    )
    if (!outcome.charge) {
      result.skipped += 1
      continue
    }
    const feeAmount = outcome.feeCents / 100

    const { data: lateFee, error: insErr } = await db
      .from('assessments')
      .insert({
        organization_id: assoc.organization_id,
        association_id: assoc.id,
        unit_id: src.unit_id,
        fiscal_period_id: src.fiscal_period_id,
        assessment_type: 'late_fee',
        amount: feeAmount,
        due_date: today,
        memo_code: memoCode,
        status: 'open',
      })
      .select('id')
      .single()

    if (insErr || !lateFee) {
      result.failed += 1
      deps.log.warn(`[hoa-late-fees] ${assoc.id}: insert late_fee for ${src.id} failed (${insErr?.code ?? 'no row'})`)
      continue
    }

    const je = await postJournalEntry(db, {
      organizationId: assoc.organization_id,
      associationId: assoc.id,
      fiscalPeriodId: src.fiscal_period_id,
      entryDate: today,
      memo: `Late fee: ${memoCode}`,
      source: 'recurring',
      sourceId: lateFee.id,
      lines: [
        { accountId: refs.acctAR, fundId: refs.fundOperating, debit: feeAmount, credit: 0 },
        { accountId: refs.acctLateFeeIncome, fundId: refs.fundOperating, debit: 0, credit: feeAmount },
      ],
    })

    if (!je.ok) {
      // Roll back the late-fee row so we don't show a charge that
      // left no ledger trace.
      await db.from('assessments').delete().eq('id', lateFee.id)
      result.failed += 1
      deps.log.warn(`[hoa-late-fees] ${assoc.id}: JE failed for ${memoCode}`)
      continue
    }

    result.charged += 1
    result.totalCents += outcome.feeCents
    if (outcome.capped) result.capped += 1
  }

  if (result.charged > 0) {
    const { error: auditErr } = await db.from('audit_log').insert({
      action: LATE_FEE_AUDIT_ACTION,
      org_id: assoc.organization_id,
      user_id: null,
      entity_type: 'association',
      entity_id: assoc.id,
      metadata: {
        charged: result.charged,
        evaluated: result.evaluated,
        capped: result.capped,
        failed: result.failed,
        total_cents: result.totalCents,
        day: today,
        policy_saved_at: read.updatedAt,
        ...(result.stayed > 0 ? { stayed: result.stayed } : {}),
      },
    })
    if (auditErr) deps.log.warn(`[hoa-late-fees] ${assoc.id}: audit write failed (${auditErr.code ?? 'no code'})`)
  }
  // Count only: never a unit id or an owner in the log.
  if (result.stayed > 0) deps.log.info(`[hoa-late-fees] ${assoc.id}: ${result.stayed} charge(s) skipped under a Georgia complaint stay`)
  return result
}

/**
 * At midnight ET each day, for each HOA association with a board-saved
 * late-fee policy (BL-147), charge one late fee on each eligible charge
 * past its due date plus the grace period, capped by the state rule.
 * Associations without a policy are charged nothing.
 *
 * Idempotency lives in `assessments.memo_code` — each late-fee row stamps
 * `LATE-<sourceAssessmentId>`, and the run skips any source that already
 * has one. So re-running the same day, or recovering from a partial
 * failure, never double-charges. (memo_code's other use, Pay-by-Zelle
 * matching per ADR-005, uses a different shape `MP-1247-DUES`, so they
 * don't collide.)
 *
 * Loops per HOA association in its own Inngest step so:
 *  - one tenant's bad data can't poison the others' runs (per-step retries)
 *  - logs always carry association context for debugging
 *  - the SELECT only ever pulls one tenant's rows into memory at a time
 */
export interface LateFeeJobStep {
  run(id: string, fn: () => Promise<unknown>): Promise<unknown>
}

export interface LateFeeJobLogger {
  warn(msg: string): void
  info(msg: string): void
  error(msg: string, meta?: unknown): void
}

export async function runHoaLateFees(
  db: Db,
  step: LateFeeJobStep,
  logger: LateFeeJobLogger,
  now: Date = new Date(),
  report: typeof reportJobFailures = reportJobFailures,
  runForAssociation: typeof runLateFeesForAssociation = runLateFeesForAssociation,
) {
  const secret = lateFeeSettingsSecret()

  // All HOA associations — joined to their org so the `hub_type` filter
  // stays applied even though we're now keyed on association_id.
  const { data: associations, error } = await db
    .from('associations')
    .select(
      `id, organization_id, governing_law_state, compliance_settings, type, ${ASSOCIATION_ZONE_COLUMNS}, orgs:organization_id(hub_type)`,
    )

  if (error) {
    logger.error('[hoa-late-fees] failed to load associations', { code: error.code })
    throw new Error(`hoa-late-fees: associations read failed (${error.code ?? 'no code'})`)
  }

  const hoaAssocs = (associations ?? []).filter((a) => {
    const org = a.orgs as { hub_type: string } | null
    return org?.hub_type === 'hoa'
  })

  const totals = { evaluated: 0, charged: 0, skipped: 0, capped: 0, notCharged: 0 }
  const failedIds: string[] = []
  let readFailed = 0
  let failedCharges = 0

  for (const assoc of hoaAssocs) {
    const result = (await step.run(`late-fees-${assoc.id}`, () =>
      runForAssociation(db, assoc as unknown as LateFeeAssociation, todayIn(associationTimeZone(assoc), now), {
        secret,
        log: { warn: (m) => logger.warn(m), info: (m) => logger.info(m) },
      }),
    )) as LateFeeRunResult
    totals.evaluated += result.evaluated
    totals.charged += result.charged
    totals.skipped += result.skipped
    totals.capped += result.capped
    if (result.status !== 'ran') totals.notCharged += 1
    // Policy outcomes (no_policy, off, unregistered, ...) are intended; only
    // a failed read or a failed insert/JE is a failure worth a report.
    if (result.status === 'read_failed') readFailed += 1
    failedCharges += result.failed
    if (result.status === 'read_failed' || result.failed > 0) failedIds.push(assoc.id)
  }

  // Report-only: counts and association ids, never thrown, nothing re-run.
  if (failedIds.length > 0) {
    report(
      'hoa-late-fees',
      { associations: hoaAssocs.length, failedAssociations: failedIds.length, readFailed, failedCharges, notCharged: totals.notCharged },
      failedIds,
    )
  }

  return { associations: hoaAssocs.length, ...totals }
}

export const hoaLateFeeJob = inngest.createFunction(
  { id: 'hoa-late-fees', name: 'HOA Late Fee Calculation' },
  { cron: 'TZ=America/New_York 0 0 * * *' },
  async ({ step, logger }) => {
    // One instant for the whole run; each association reads its own day
    // from it (BL-043).
    return runHoaLateFees(createAdminClient(), step, logger)
  },
)
