// W21 — what the association requires, and the deterministic floor under
// the model's grade (BL-084).
//
// The insurance minimums — umbrella included since 2026-10-20 — come from
// the board's signed setting (../vendor-insurance/settings.ts, edited at
// Settings → Vendors). The remaining requirements — additional insured and
// licensed trades — have no screen yet and are still read from their
// top-level compliance_settings keys, exactly as before.

import {
  minimumsDeficiencies,
  resolveVendorInsuranceSettings,
  type InsuranceMinimums,
} from '../vendor-insurance/settings'
import type { AssociationRequirements } from './prompt'

export function requirementsFor(
  associationId: string,
  complianceSettings: unknown,
  secret?: string | null,
): AssociationRequirements {
  const { minimums } = resolveVendorInsuranceSettings(associationId, complianceSettings, secret)
  const obj = (complianceSettings && typeof complianceSettings === 'object' ? complianceSettings : {}) as Record<
    string,
    unknown
  >
  return {
    ...minimums,
    additionalInsuredRequired: obj.additional_insured_required === true,
    licenseRequiredFor: Array.isArray(obj.license_required_for)
      ? (obj.license_required_for as unknown[]).filter((t): t is string => typeof t === 'string')
      : [],
  }
}

type Status = 'green' | 'yellow' | 'red' | 'missing'
interface Deficiency {
  code: string
  severity: 'red' | 'yellow'
  detail: string
}

/**
 * A certificate that shows coverage under a minimum the board set is red,
 * whatever the model returned: the comparison is arithmetic, and a board
 * relying on "Compliant" must not depend on a model reading numbers
 * correctly. Our deficiency replaces a model one with the same code.
 */
export function applyMinimums(
  graded: { complianceStatus: Status; deficiencies: Deficiency[] },
  minimums: InsuranceMinimums,
  coi: Parameters<typeof minimumsDeficiencies>[1],
): { complianceStatus: Status; deficiencies: Deficiency[] } {
  const ours = minimumsDeficiencies(minimums, coi)
  if (ours.length === 0) return graded
  const byCode = new Map(ours.map((d) => [d.code as string, d]))
  const merged: Deficiency[] = graded.deficiencies.map((d) => byCode.get(d.code) ?? d)
  for (const d of ours) if (!graded.deficiencies.some((g) => g.code === d.code)) merged.push(d)
  const complianceStatus: Status = graded.complianceStatus === 'missing' ? 'missing' : 'red'
  return { complianceStatus, deficiencies: merged }
}
