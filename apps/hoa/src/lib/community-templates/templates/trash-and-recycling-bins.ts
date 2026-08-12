import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'trash-and-recycling-bins',
  name: 'Trash & Recycling Bins — Curb Timing and Storage',
  description:
    'A community-wide reminder about when trash and recycling bins may go to the curb, when they need to come back in, and where to keep them the rest of the week. Send when bins start living on driveways all week instead of just on collection day.',
  genre: 'conduct',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#268298',
  visual: {
    kind: 'illustration',
    asset: 'trash-and-recycling-bins.png',
    alt: 'A single trash bin with its lid closed, standing at the curb',
  },
  subject: 'A reminder about trash and recycling bin timing in {{association_name}}',
  preview: 'When bins can go out, when they need to come in, and where to keep them between pickups.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'Trash and recycling are collected on {{collection_day}}. Bins may go out to the curb starting at {{early_out_time}} the evening before, and need to be back out of sight by {{late_in_time}} that same day.',
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: 'For the rest of the week, please keep bins {{storage_location}} rather than out on the driveway — it keeps the street looking its best for everyone.',
    },
    {
      type: 'callout',
      text: '{{holiday_note}}',
    },
    {
      type: 'paragraph',
      text: 'Thanks for keeping the curb clear between pickups — most of us already do, and it makes a real difference for the whole street.',
    },
  ],
  questions: [
    {
      id: 'collection_day',
      label: 'What day is trash and recycling collected?',
      type: 'select',
      options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      required: true,
    },
    {
      id: 'early_out_time',
      label: 'How early may bins go out to the curb?',
      type: 'time',
      required: true,
      help: 'The earliest time on the evening before pickup, e.g. 6:00 PM.',
    },
    {
      id: 'late_in_time',
      label: 'By when must bins be back out of sight?',
      type: 'time',
      required: true,
      help: 'The deadline on collection day itself, e.g. 8:00 PM.',
    },
    {
      id: 'storage_location',
      label: 'Where should bins be stored the rest of the week?',
      type: 'select',
      options: [
        'in the side yard',
        'in the garage',
        'behind a fence or screen',
        'in a designated enclosure or pad',
      ],
      required: true,
      help: 'Pick whichever matches your community rule.',
    },
    {
      id: 'holiday_note',
      label: 'Any upcoming holiday schedule change to mention?',
      type: 'textarea',
      required: false,
      fallback: 'There are no holiday schedule changes at this time.',
      help: 'e.g. "Collection will run one day late the week of Labor Day." Leave blank if none.',
    },
  ],
  legalNote:
    'Keep this addressed to the whole community. Never name a unit, address, or resident, and never attach a photo of one driveway, even though everyone will privately know whose bins prompted this email. Do not state that fines begin immediately — assume the board has not adopted and noticed a fine schedule for bin storage. If one has actually been adopted and noticed, that step belongs in a separate, individually addressed notice under the association\'s enforcement policy, not here.',
}

export default template
