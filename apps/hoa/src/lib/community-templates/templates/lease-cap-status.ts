import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'lease-cap-status',
  name: 'Lease Cap — Where the Community Stands',
  description:
    'A status update on the rental cap: how many homes are currently leased against the cap set in the governing documents, how many slots remain, and how many households are on the waiting list. Send periodically or whenever the cap is close to being reached.',
  genre: 'governance',
  shape: 'notice',
  audience: 'broadcast',
  accentColor: '#3A5AA8',
  // The meter needs live occupancy data, which does not exist at
  // registry/seed time — it is resolved server-side at send time
  // (apps/hoa/src/lib/community-templates/lease-cap.ts) and substituted
  // into the {{lease_meter_html}} placeholder below via a `raw` body block.
  visual: { kind: 'none' },
  subject: 'Lease cap update for {{association_name}}',
  preview: 'Where we stand against the rental cap, and what it means for owners.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'This is a periodic update on the community’s rental cap, set under {{policy_reference}}. Right now {{leased_count}} of {{total_units}} homes are leased — that’s {{leased_pct}} against a cap of {{cap_pct}}. {{remaining_slots}} more homes may still be leased, and {{waiting_phrase}}.',
    },
    { type: 'raw', html: '{{lease_meter_html}}' },
    {
      type: 'paragraph',
      text: 'This cap exists for a reason that affects every owner, not just those who rent out their home: once an association exceeds its allowed share of leased homes, FHA and Fannie Mae owner-occupancy rules can make homes here unmortgageable. That can make it harder for any owner — renter or not — to sell, and harder for a buyer to get financing. Staying under the cap protects resale value for the whole community.',
    },
    {
      type: 'paragraph',
      text: 'If you are on the waiting list, we will contact you in order as slots open up. {{waiting_list_status}}',
    },
    {
      type: 'callout',
      text: 'Questions about the cap, the waiting list, or how it applies to your home? Reach out to {{contact_name}}.',
    },
  ],
  questions: [
    {
      id: 'policy_reference',
      label: 'Which section of the governing documents sets the lease cap?',
      type: 'text',
      required: false,
      help: 'e.g. "Article VII, Section 3 of the Declaration" — quote it exactly, do not paraphrase.',
    },
    {
      id: 'waiting_list_status',
      label: 'Any update on how the waiting list works right now?',
      type: 'select',
      options: [
        'The waiting list is open and working as usual.',
        'The waiting list is temporarily paused while we confirm current numbers.',
        'We are changing how the waiting list is managed — details to follow separately.',
      ],
      required: false,
      help: 'Pick the one that matches what is actually happening today.',
    },
    {
      id: 'contact_name',
      label: 'Who should residents contact with questions about the cap or waiting list?',
      type: 'text',
      required: false,
      help: 'e.g. "the management office" or a board member’s name.',
    },
  ],
  providedFields: [
    'cap_pct', 'leased_count', 'total_units', 'leased_pct', 'remaining_slots',
    'waiting_phrase', 'lease_meter_html',
  ],
  legalNote:
    'Do not name who is currently leasing, who is on the waiting list, or any unit number — report totals only. State the cap exactly as the governing documents state it, citing the section given above; do not paraphrase or round it. If the lease cap has not been set in the system, do not send this email — do not guess a figure and never substitute an AI-suggested value. The occupancy totals and cap percentage in the body are populated from the association’s live records at send time, not estimated.',
}

export default template
