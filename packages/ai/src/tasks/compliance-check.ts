import { runReason } from '../agents/reason'

// AI edge-case check ONLY. Use a static rule engine (apps/eviction/lib/compliance/*)
// for the deterministic "can we file yet?" decision. This task surfaces things
// like SCRA, Section 8, ADA, or domestic-violence protections that the static
// engine cannot reason about.
export interface AIComplianceFlags {
  additionalFlags: string[]
  recommendation: string
  confidence: 'high' | 'medium' | 'low'
}

export async function aiComplianceCheck(params: {
  county: string
  state: string
  daysUnpaid: number
  tenantSituation: string
}): Promise<AIComplianceFlags> {
  return runReason<AIComplianceFlags>([
    {
      role: 'user',
      content: `You are a landlord-tenant attorney reviewing an eviction case for edge-case flags.

County: ${params.county}, ${params.state}
Days unpaid: ${params.daysUnpaid}
Situation notes: ${params.tenantSituation}

Check for: military/SCRA protections, Section 8 / HUD rules, disability accommodations, domestic violence protections, any reason normal process should not apply.

Respond JSON:
{
  "additionalFlags": ["any flags as strings, empty array if none"],
  "recommendation": "1-2 sentence plain English guidance",
  "confidence": "high|medium|low"
}`,
    },
  ])
}
