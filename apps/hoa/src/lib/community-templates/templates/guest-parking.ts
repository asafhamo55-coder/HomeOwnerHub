import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'guest-parking',
  name: 'Guest Parking — Where to Park and For How Long',
  description:
    'A community-wide reminder about guest parking: where visitors may park, how long they may stay, and which spaces are reserved or off-limits. Send when shared parking gets tight.',
  genre: 'conduct',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#2C6FAF',
  visual: {
    kind: 'map',
    asset: 'guest-parking.png',
    alt: 'A community map with visitor parking spaces highlighted along the main loop road, and resident-reserved spaces and fire lanes near the clubhouse and mailboxes marked off-limits',
  },
  subject: 'A note about guest parking in {{association_name}}',
  preview: 'Where guests can park, how long they may stay, and which spots are off-limits.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'With {{reason}}, we want to make sure every guest knows where to park. Visitor vehicles may stay in the marked guest spaces for {{max_guest_stay}}.',
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: 'Most guests already park in the right spots without a second thought — this is just a reminder while shared parking is tighter than usual.',
    },
    {
      type: 'callout',
      text: 'Guests should avoid {{affected_areas}} — these stay reserved for residents and for emergency access. Vehicles parked outside the marked guest areas may be subject to towing under our posted policy.',
    },
    {
      type: 'paragraph',
      text: 'Questions about where guests can park? Reach out to {{report_contact}} and we are happy to help.',
    },
  ],
  questions: [
    {
      id: 'reason',
      label: 'What is driving this reminder?',
      type: 'select',
      options: [
        'shared guest spaces reaching capacity',
        'guests parking in spaces reserved for residents',
        'vehicles left in guest spaces for multiple days',
        'contractor and vendor trucks taking up guest spaces',
      ],
      required: false,
    },
    {
      id: 'max_guest_stay',
      label: 'How long may a guest vehicle stay?',
      type: 'select',
      options: ['up to 24 hours', 'up to 48 hours', 'up to 72 hours', 'no overnight guest parking'],
      required: false,
    },
    {
      id: 'affected_areas',
      label: 'Which areas are reserved or off-limits to guests?',
      type: 'multiselect',
      options: [
        'spaces marked reserved for residents',
        'fire lanes and no-parking zones',
        'the spaces nearest the clubhouse',
        'the visitor lot at the main entrance',
        'accessible spaces without a permit',
      ],
      required: false,
      help: 'Select every area guests should avoid right now.',
    },
    {
      id: 'report_contact',
      label: 'Who should residents contact with questions?',
      type: 'text',
      required: false,
      help: 'e.g. "the front office at 555-0134" or "the HOA management company"',
    },
  ],
  legalNote:
    "Keep this community-wide and free of identifying detail — do not include license plate numbers, vehicle descriptions, or unit numbers, even for a vehicle that has been sitting for days. If towing comes up, use only the phrase 'may be subject to towing under our posted policy'; many states require specific signage and advance notice before a vehicle can actually be towed, so do not state a warning period, grace period, or towing timeline that isn't already reflected on your posted signage and governing documents.",
}

export default template
