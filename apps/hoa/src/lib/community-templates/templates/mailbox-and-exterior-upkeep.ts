import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'mailbox-and-exterior-upkeep',
  name: 'Mailboxes and Exterior Upkeep — Faded, Damaged or Mismatched',
  description:
    'A community-wide note about the exterior items that drift out of standard slowly — mailboxes, house numbers, shutters, paint. Includes where to source a matching replacement, which is usually the real blocker.',
  genre: 'maintenance',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#2F6B6B',
  visual: {
    kind: 'illustration',
    asset: 'mailbox-and-exterior-upkeep.png',
    alt: 'A mailbox with its flag raised',
  },
  subject: 'Mailboxes and exteriors in {{association_name}}',
  preview: 'What is drifting out of standard, and where to get a match.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'Exterior items wear out slowly enough that nobody notices their own — which is why this goes to everyone rather than to the handful of homes we happened to walk past.',
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: 'The items showing wear across the community are {{upkeep_items}}.',
    },
    {
      type: 'callout',
      text: '{{sourcing_info}}',
    },
    {
      type: 'paragraph',
      text: 'Replacing a mailbox is a small job made annoying by not knowing which one to buy. If you are unsure whether yours needs attention, reply with a photo and we will tell you honestly.',
    },
  ],
  questions: [
    {
      id: 'upkeep_items',
      label: 'What needs attention?',
      type: 'multiselect',
      options: [
        'faded or peeling mailbox paint',
        'leaning or damaged mailbox posts',
        'missing or unreadable house numbers',
        'shutters that are faded or coming loose',
        'front doors and trim needing paint',
        'damaged or discolored driveways and walkways',
      ],
      required: false,
    },
    {
      id: 'sourcing_info',
      label: 'Where do residents get a matching replacement?',
      type: 'textarea',
      required: false,
      help: 'This is the part that actually gets it done — the approved model, supplier, colour code, or the vendor the association uses. Without it most people simply postpone.',
    },
  ],
  legalNote:
    'Mailboxes are federal property once installed for delivery: USPS regulations govern the box, its height and its placement, so an association standard cannot conflict with them, and only the postal service may authorize changes affecting delivery. Cite the approved standard from the architectural guidelines rather than describing it loosely, and give the exact specification — "matching" is not enforceable, a named model and colour is. This is a courtesy reminder and does not replace the individual cited notice your documents require before any fine. Do not list addresses or attach photographs of specific homes.',
}

export default template
