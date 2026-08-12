import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'pool-pass-renewal',
  name: 'Pool Pass Renewal — Paperwork Needed Before Opening Day',
  description:
    'Asks each household to turn in its roster, signed waiver, and fob request ahead of the season so passes are ready before opening day instead of being sorted out at the gate.',
  genre: 'safety',
  shape: 'submission_request',
  audience: 'broadcast',
  accentColor: '#1C6F31',
  visual: {
    kind: 'illustration',
    asset: 'pool-pass-renewal.png',
    alt: 'A swimmer doing front crawl across sunlit pool water lines',
  },
  subject: 'Pool passes for {{association_name}} — paperwork due {{deadline_date}}',
  preview: 'Turn in your roster, waiver, and fob request before opening day.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'To have your pass ready before opening day, every household needs to turn in {{required_items}} by {{deadline_date}}. Submit via {{submission_method}}.',
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: "This is the same paperwork we ask for every season — nothing new, just a reminder to get it in early rather than at the gate on a busy opening weekend.",
    },
    {
      type: 'callout',
      text: 'Submission method: {{submission_method}}. Paperwork turned in after {{deadline_date}} will still be processed, but passes may not be ready for the first open weekend — plan on picking yours up in person once it is issued.',
    },
    {
      type: 'paragraph',
      text: "Questions about what's needed or how to submit it? Reach out to {{contact_name}} and we'll help you get sorted.",
    },
  ],
  questions: [
    {
      id: 'deadline_date',
      label: 'Paperwork deadline',
      type: 'date',
      required: true,
      help: 'The last day paperwork can come in and still guarantee a pass by opening day.',
    },
    {
      id: 'required_items',
      label: 'What does each household need to submit?',
      type: 'multiselect',
      options: [
        'a completed household roster',
        'a signed liability waiver for all household members',
        'a fob or key request form',
        'a current emergency contact card',
      ],
      required: true,
      help: 'Select everything you need back before you can issue a pass.',
    },
    {
      id: 'submission_method',
      label: 'How should households submit their paperwork?',
      type: 'select',
      options: [
        'drop-off at the clubhouse office',
        'email to the property manager',
        'upload through the resident portal',
        'mail to the management office',
      ],
      required: true,
    },
    {
      id: 'contact_name',
      label: 'Who should residents contact with questions?',
      type: 'text',
      required: false,
      fallback: 'the management office',
      help: 'e.g. "Jamie in the front office" or "the property manager"',
    },
  ],
  legalNote:
    "If your pool rules include adult-only swim hours or a minimum age for unaccompanied entry, confirm with counsel before sending this — age-based access rules can be read as familial-status discrimination under the Fair Housing Act unless they rest on a narrow, documented safety need. The signed waiver is a condition of pass issuance, not a shield: in several states a parent's or guardian's signature does not bind a minor, and it does not relieve the association of its duty of care for pool conditions, so don't describe it as protecting the association from liability. And do not tell residents that pool access depends on assessments being current — some states restrict conditioning amenity access on unpaid dues, so leave that condition out unless counsel has signed off on it.",
}

export default template
