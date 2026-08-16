import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'work-on-site',
  name: 'Scheduled Work On-Site — Paving, Landscaping, Roof or Utility Work',
  description:
    'A heads-up for scheduled work that will disrupt part of the property — paving, landscaping, roof work, utility or road work, or an amenity closure. Leads with dates, areas, and whether residents need to move their car.',
  genre: 'maintenance',
  shape: 'notice',
  audience: 'broadcast',
  accentColor: '#7A6A1D',
  visual: {
    kind: 'map',
    asset: 'work-on-site.png',
    alt: 'An orange traffic cone marking off a work area on a community roadway',
  },
  subject: 'Scheduled {{reason}} at {{association_name}}: {{start_date}}–{{end_date}}',
  preview: "What's happening, where, and what to do with your car.",
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: '{{association_name}} has scheduled {{reason}} at {{affected_areas}}, expected to run from {{start_date}} through {{end_date}}. {{parking_instructions}}',
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: 'Expect crews, equipment, and some noise in the area during work hours. Access to {{affected_areas}} may be limited while the work is underway.',
    },
    {
      type: 'callout',
      text: "Please have vehicles clear of {{affected_areas}} before work begins on {{start_date}}. If your schedule doesn't allow it, reply to this email and we'll help you find another spot.",
    },
    {
      type: 'paragraph',
      text: "We'll send an update if the schedule changes. Questions in the meantime? Just reply to this email.",
    },
  ],
  questions: [
    {
      id: 'reason',
      label: 'What kind of work is happening?',
      type: 'select',
      options: ['paving', 'landscaping work', 'roof work', 'utility work', 'road work', 'an amenity closure'],
      required: true,
    },
    {
      id: 'affected_areas',
      label: 'Which area is affected?',
      type: 'text',
      required: false,
      help: 'Name the exact spot — e.g. "the visitor lot and the north driveway" — specifics are what tell someone whether this affects them.',
    },
    {
      id: 'start_date',
      label: 'When does the work begin?',
      type: 'date',
      required: true,
    },
    {
      id: 'end_date',
      label: 'When is the work expected to wrap up?',
      type: 'date',
      required: true,
      help: 'An estimate is fine — the email phrases this as expected, not guaranteed.',
    },
    {
      id: 'parking_instructions',
      label: 'What do residents need to do before work starts?',
      type: 'textarea',
      required: false,
      help: 'Be specific: which vehicles need to move, where to park instead, and by what date or time. This is the single most useful line in the email.',
    },
  ],
  legalNote:
    "Treat {{end_date}} as the contractor's estimate, not a promise — phrase it as expected in any edits you make, and don't add a firm completion date unless the contractor has confirmed it in writing. Don't state or imply that the association will pay for, reimburse, or otherwise be liable for vehicle damage or towing costs; that language creates liability exposure and needs counsel's sign-off before it goes out.",
}

export default template
