// W23 — Bid Normalizer & Comparator eval harness skeleton.
//
// Spec §5 W23 acceptance:
//   - 3 landscape bids, ≥ 90% line-alignment accuracy
//   - ≥ 1 real-world hidden exclusion correctly flagged
//   - Board decision in ≤ 10 minutes from reading the memo (usability;
//     measured separately during Madison Park's first RFP cycle)
//
// Two anticipated fixture sets:
//   1. Alignment cases: known-correct line mappings, computed accuracy
//      against the model's comparison_table
//   2. Exclusion-flagging cases: bids with a deliberate hidden exclusion
//      that the model must surface

export interface AlignmentCase {
  id: string
  description: string
  /** Known-correct mapping: RFP line description → bid descriptions per vendor. */
  expectedAlignment: Record<string, Record<string, string | 'EXCLUDED' | 'ADDITION'>>
  expectedMinAccuracy: number
}

export const ALIGNMENT_CASES: AlignmentCase[] = [
  {
    id: 'landscape-three-bids',
    description: '3 landscape bids: spring cleanup / mowing / fertilization aligned across vendors',
    expectedAlignment: {
      'Spring cleanup': {
        'Vendor A': 'Spring cleanup',
        'Vendor B': 'Pre-season prep',
        'Vendor C': 'Opening visit',
      },
      'Bi-weekly mowing (April–October)': {
        'Vendor A': 'Mowing service, bi-weekly',
        'Vendor B': 'Mow + edge, 14-day cycle',
        'Vendor C': 'Lawn maintenance visits (alternate weeks)',
      },
      'Quarterly fertilization': {
        'Vendor A': 'Fertilizer application (Q1, Q2, Q3, Q4)',
        'Vendor B': 'Granular fertilization, 4× per year',
        'Vendor C': 'EXCLUDED',
      },
    },
    expectedMinAccuracy: 0.9,
  },
]

export interface ExclusionCase {
  id: string
  description: string
  /** Substring the model must surface in flagged_exclusions[].detail. */
  expectedFlagContains: string
}

export const EXCLUSION_CASES: ExclusionCase[] = [
  {
    id: 'leaf-removal-excluded',
    description: 'Vendor A excludes fall leaf removal; Vendors B and C include it',
    expectedFlagContains: 'leaf removal',
  },
  {
    id: 'irrigation-winterization-gap',
    description: 'RFP requires irrigation winterization; Vendor B does not bid on it',
    expectedFlagContains: 'irrigation',
  },
]
