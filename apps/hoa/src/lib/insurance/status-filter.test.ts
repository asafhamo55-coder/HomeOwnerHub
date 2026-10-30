import { describe, expect, it } from 'vitest'
import { coverageCheck, policyReminders, type InsurancePolicy } from './model'
import { insuranceCounts, parseInsuranceStatus, policiesForStatus } from './status-filter'

const TODAY = '2026-06-01'
const p = (id: string, kind: InsurancePolicy['kind'], expiresOn: string, effectiveOn: string | null = '2025-01-01'): InsurancePolicy => ({
  id, associationId: null, kind, carrier: 'Acme', policyNumber: null, coverageLimitCents: null,
  deductibleCents: null, premiumCents: null, effectiveOn, expiresOn, documentId: null, notes: null,
})

const policies = [
  p('a', 'property', '2027-03-01'),
  p('b', 'liability', '2026-07-01'),
  p('c', 'fidelity', '2026-05-01'),
]
const reminders = policyReminders(policies, TODAY)
const checks = [{ check: coverageCheck('FL', policies.filter((x) => x.id !== 'c'), TODAY) }]

describe('insurance status strip', () => {
  it('counts active, expiring, expired and missing from loaded data', () => {
    const counts = insuranceCounts(policies, reminders, checks, TODAY)
    expect(counts).toEqual({ active: 2, expiring: 1, expired: 1, missing: 1 })
  })
  it('filters the list per status', () => {
    const ids = (s: Parameters<typeof policiesForStatus>[0]) => policiesForStatus(s, policies, reminders, TODAY).map((x) => x.id)
    expect(ids('active')).toEqual(['a', 'b'])
    expect(ids('expiring')).toEqual(['b'])
    expect(ids('expired')).toEqual(['c'])
    expect(ids('missing')).toEqual([])
  })
  it('ignores unknown status values', () => {
    expect(parseInsuranceStatus('expired')).toBe('expired')
    expect(parseInsuranceStatus('nope')).toBeNull()
  })
})
