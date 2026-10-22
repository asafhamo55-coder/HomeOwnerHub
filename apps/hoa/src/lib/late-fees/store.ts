// BL-147 storage: the late-fee policy in
// associations.compliance_settings[LATE_FEE_POLICY_KEY]. No migration.
//
// Signed for the same reason as the BL-122 quorum kit and the BL-141
// election planner: any org member can PATCH compliance_settings with their
// own session, so a policy is trusted only when it carries the HMAC the
// board's server action wrote. Anything else reads as "unverified", and
// the nightly job charges NOTHING for that association (fail closed).
//
// Server-only (node:crypto). Dependency-free otherwise: packages/jobs
// imports this file by relative path.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { DEFAULT_LATE_FEE_POLICY, isLateFeePolicy, type LateFeePolicy } from './policy'

export const LATE_FEE_POLICY_KEY = 'late_fee_policy'
const SIGNATURE_DOMAIN = 'late-fee-policy:v1'

export interface StoredLateFeePolicy {
  v: 1
  policy: LateFeePolicy
  updated_at: string
  updated_by: string | null
  sig: string
}

export type LateFeePolicyRead =
  | { state: 'saved'; policy: LateFeePolicy; updatedAt: string }
  | { state: 'none'; policy: LateFeePolicy }
  | { state: 'unverified'; policy: LateFeePolicy }

/** Same server-only chain as paySettingsSecret(); repeated because packages/jobs imports this file. */
export function lateFeeSettingsSecret(env: Record<string, string | undefined> = process.env): string | null {
  return env.PAY_SETTINGS_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || null
}

function payload(associationId: string, p: LateFeePolicy, updatedAt: string, updatedBy: string | null): string {
  return JSON.stringify([
    SIGNATURE_DOMAIN,
    associationId,
    p.enabled,
    p.mode,
    p.percentBps,
    p.flatCents,
    p.graceDays,
    p.excludeFines,
    p.oncePerCharge,
    p.declarationAttested,
    p.declarationRef,
    updatedAt,
    updatedBy,
  ])
}

/** Only the policy's own fields, in a fixed shape. */
function cleanPolicy(p: LateFeePolicy): LateFeePolicy {
  return {
    enabled: p.enabled,
    mode: p.mode,
    percentBps: p.percentBps,
    flatCents: p.flatCents,
    graceDays: p.graceDays,
    excludeFines: p.excludeFines,
    oncePerCharge: true,
    declarationAttested: p.declarationAttested,
    declarationRef: p.declarationRef,
  }
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

export function signLateFeePolicy(
  associationId: string,
  policy: LateFeePolicy,
  stamp: { updatedAt: string; updatedBy: string | null },
  secret: string,
): StoredLateFeePolicy {
  if (!isLateFeePolicy(policy)) throw new RangeError('not a late-fee policy')
  const clean = cleanPolicy(policy)
  return {
    v: 1,
    policy: clean,
    updated_at: stamp.updatedAt,
    updated_by: stamp.updatedBy,
    sig: hmac(secret, payload(associationId, clean, stamp.updatedAt, stamp.updatedBy)),
  }
}

function asObject(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function readLateFeePolicy(associationId: string, complianceSettings: unknown, secret: string | null): LateFeePolicyRead {
  const raw = asObject(complianceSettings)?.[LATE_FEE_POLICY_KEY]
  if (raw === undefined || raw === null) return { state: 'none', policy: { ...DEFAULT_LATE_FEE_POLICY } }
  const obj = asObject(raw)
  const unverified = { state: 'unverified' as const, policy: { ...DEFAULT_LATE_FEE_POLICY } }
  if (
    !obj ||
    !secret ||
    obj.v !== 1 ||
    !isLateFeePolicy(obj.policy) ||
    typeof obj.updated_at !== 'string' ||
    !(obj.updated_by === null || typeof obj.updated_by === 'string') ||
    typeof obj.sig !== 'string'
  ) {
    return unverified
  }
  const policy = obj.policy
  const expected = Buffer.from(hmac(secret, payload(associationId, policy, obj.updated_at, obj.updated_by as string | null)), 'hex')
  const actual = Buffer.from(obj.sig, 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return unverified
  return { state: 'saved', policy: cleanPolicy(policy), updatedAt: obj.updated_at }
}

/** compliance_settings with the policy replaced and every other key kept. */
export function withLateFeePolicy(complianceSettings: unknown, stored: StoredLateFeePolicy): Record<string, unknown> {
  return { ...(asObject(complianceSettings) ?? {}), [LATE_FEE_POLICY_KEY]: stored }
}
