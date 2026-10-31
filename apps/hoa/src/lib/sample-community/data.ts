/**
 * The sample community: plain content only, no database and no sending.
 *
 * HOW SAMPLE ROWS ARE MARKED (no migration, existing columns only)
 *
 * The root of the sample data is the home (hoa_properties). A home is a
 * sample home only when BOTH hold:
 *   - its notes start with SAMPLE_NOTES_PREFIX, and
 *   - its owner email ends in SAMPLE_EMAIL_DOMAIN (example.com is reserved
 *     by RFC 2606, so it can never be a real mailbox).
 * Everything else hangs off those homes: units (bridged by
 * legacy_hoa_property_id), owners, dues, violations, tickets and ARC
 * requests are found through the sample homes, and each of them ALSO
 * carries a text marker of its own, so removal needs two independent
 * matches before it deletes a row. The announcement draft, the meeting and
 * the dues rate have no home, so they carry only the text marker.
 *
 * A row a person has since edited so the marker is gone is treated as
 * theirs, and stays.
 */

export const SAMPLE_NOTES_PREFIX = 'Sample data:'
export const SAMPLE_EMAIL_DOMAIN = '@example.com'
/** Prefix for the subject / summary / description of sample records. */
export const SAMPLE_TEXT_PREFIX = 'Sample:'
/** Prefix for the announcement draft subject. */
export const SAMPLE_DRAFT_PREFIX = '[Sample] '
export const SAMPLE_MEMO_PREFIX = 'SAMPLE-'

export const SAMPLE_BANNER_TEXT = 'You’re looking at sample data. Remove it when you’re ready to add your own homes.'

export interface SampleHome {
  address: string
  unitNumber: string | null
  ownerName: string
  ownerEmail: string
  ownerPhone: string
}

const MAPLE: Array<[string, string]> = [
  ['101', 'Priya Raman'],
  ['103', 'Tom and Denise Walker'],
  ['105', 'Marcus Bell'],
  ['107', 'Elena Ortiz'],
  ['109', 'Harold Finch'],
  ['111', 'Grace Nakamura'],
]
const WILLOW: Array<[string, string]> = [
  ['210', 'Samuel Okafor'],
  ['212', 'Linda Hartley'],
  ['214', 'Ben and Cara Dunn'],
  ['216', 'Rosa Delgado'],
  ['218', 'Walter Pruitt'],
  ['220', 'Mei Chen'],
]

/** 12 homes on 2 streets. Phone numbers use the reserved 555-01xx range. */
export function sampleHomes(): SampleHome[] {
  const make = (street: string, rows: Array<[string, string]>, offset: number): SampleHome[] =>
    rows.map(([num, owner], i) => ({
      address: `${num} ${street}`,
      unitNumber: null,
      ownerName: owner,
      ownerEmail: `sample.home${offset + i + 1}${SAMPLE_EMAIL_DOMAIN}`,
      ownerPhone: `555-01${String(offset + i).padStart(2, '0')}`,
    }))
  return [...make('Maple Court', MAPLE, 0), ...make('Willow Lane', WILLOW, MAPLE.length)]
}

export const SAMPLE_HOME_COUNT = 12
export const SAMPLE_DUES_AMOUNT = 150
export const SAMPLE_DUES_RATE_NOTE = `${SAMPLE_NOTES_PREFIX} the dues rate that came with the sample community.`

export function sampleHomeNote(): string {
  return `${SAMPLE_NOTES_PREFIX} added with the sample community. Remove the sample community to delete it.`
}

/** True for a home that was made by the sample fill (both markers present). */
export function isSampleHome(row: { notes: string | null; owner_email: string | null }): boolean {
  return (
    typeof row.notes === 'string' &&
    row.notes.startsWith(SAMPLE_NOTES_PREFIX) &&
    typeof row.owner_email === 'string' &&
    row.owner_email.toLowerCase().endsWith(SAMPLE_EMAIL_DOMAIN)
  )
}

/** Which of the 12 homes are paid. The rest are unpaid and overdue. */
export function samplePaidFlags(): boolean[] {
  return [true, true, true, true, true, true, true, false, false, false, false, false]
}

export interface SampleViolation {
  homeIndex: number
  type: string
  description: string
  severity: 'low' | 'medium' | 'high'
  stage: 'open' | 'notice_sent' | 'resolved'
  ccr: string
  curePeriodDays: number
}

export const SAMPLE_VIOLATIONS: SampleViolation[] = [
  {
    homeIndex: 4,
    type: 'Landscaping',
    description: `${SAMPLE_TEXT_PREFIX} The front lawn has not been mowed in several weeks and the grass is over 8 inches tall.`,
    severity: 'low',
    stage: 'open',
    ccr: 'Section 4.2',
    curePeriodDays: 14,
  },
  {
    homeIndex: 8,
    type: 'Parking',
    description: `${SAMPLE_TEXT_PREFIX} A boat trailer has been parked in the driveway overnight for the past week.`,
    severity: 'medium',
    stage: 'notice_sent',
    ccr: 'Section 6.1',
    curePeriodDays: 10,
  },
  {
    homeIndex: 2,
    type: 'Trash bins',
    description: `${SAMPLE_TEXT_PREFIX} Trash bins were left at the curb for several days after pickup. The owner moved them once the notice arrived.`,
    severity: 'low',
    stage: 'resolved',
    ccr: 'Section 5.3',
    curePeriodDays: 7,
  },
]

export interface SampleTicket {
  homeIndex: number
  category: 'maintenance' | 'common_area'
  priority: 'normal' | 'high'
  subject: string
  description: string
  /** Messages in order. */
  thread: Array<{ role: 'board' | 'resident'; body: string }>
  status: 'open' | 'in_progress'
}

export const SAMPLE_TICKETS: SampleTicket[] = [
  {
    homeIndex: 1,
    category: 'common_area',
    priority: 'normal',
    subject: `${SAMPLE_TEXT_PREFIX} Light out by the Maple Court mailboxes`,
    description: 'The light above the mailboxes has been out for about a week. It is dark when I pick up my mail.',
    thread: [],
    status: 'open',
  },
  {
    homeIndex: 9,
    category: 'maintenance',
    priority: 'high',
    subject: `${SAMPLE_TEXT_PREFIX} Standing water near the Willow Lane drain`,
    description: 'Water pools at the drain after every rain and does not go down for a day or two.',
    thread: [
      { role: 'board', body: 'Thank you for telling us. Can you say roughly where the water collects, and how deep it gets?' },
      { role: 'resident', body: 'It collects right in front of number 214, about two inches deep after a hard rain.' },
    ],
    status: 'in_progress',
  },
]

export interface SampleArc {
  homeIndex: number
  category: 'paint' | 'fence'
  summary: string
  scope: string
  status: 'submitted' | 'in_review'
  contractor: string
}

export const SAMPLE_ARC: SampleArc[] = [
  {
    homeIndex: 3,
    category: 'paint',
    summary: `${SAMPLE_TEXT_PREFIX} Repaint the front door dark green`,
    scope: 'Repaint the front door and trim in a dark green. The owner will do the work over one weekend.',
    status: 'submitted',
    contractor: 'Owner will do the work',
  },
  {
    homeIndex: 10,
    category: 'fence',
    summary: `${SAMPLE_TEXT_PREFIX} Replace the back fence with a 6 foot wood fence`,
    scope: 'Take down the old back fence and put up a 6 foot wood fence on the same line.',
    status: 'in_review',
    contractor: 'Sample Fence Company',
  },
]

export const SAMPLE_ANNOUNCEMENT = {
  subject: `${SAMPLE_DRAFT_PREFIX}Welcome to our community portal`,
  bodyHtml:
    '<p>Hello neighbors,</p><p>Our association now has one place for dues, requests and news. ' +
    'This is a sample message so you can see how an announcement looks. It is a draft and has not been sent to anyone.</p>' +
    '<p>Thank you,<br/>The Board</p>',
}

export const SAMPLE_MEETING = {
  type: 'regular' as const,
  /** Days from today. */
  daysAhead: 14,
  /** Stored in raw_transcript, which a scheduled meeting does not use. */
  marker: `${SAMPLE_NOTES_PREFIX} this meeting was added with the sample community.`,
  agenda: [
    `${SAMPLE_TEXT_PREFIX} Agenda`,
    '1. Call to order and roll call',
    '2. Approve the last meeting minutes',
    '3. Treasurer report: dues collected and unpaid accounts',
    '4. Open violations and architectural requests',
    '5. Mailbox light repair and drainage on Willow Lane',
    '6. Homeowner comments',
    '7. Adjourn',
  ].join('\n'),
}
