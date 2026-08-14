import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'lawn-and-landscaping',
  name: 'Lawn and Landscaping — Seasonal Upkeep Reminder',
  description:
    'A community-wide nudge about yard maintenance ahead of the season, sent before individual violation notices go out. Names the standard and the deadline so nobody is surprised by a letter.',
  genre: 'maintenance',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#3E6B22',
  visual: {
    kind: 'illustration',
    asset: 'lawn-and-landscaping.png',
    alt: 'Blades of grass',
  },
  subject: 'Yard upkeep in {{association_name}} before {{deadline_date}}',
  preview: 'What the standard is, and when inspections start.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'Ahead of {{season_context}}, this is a reminder about yard upkeep — sent to everyone, so please do not read it as a note about your particular yard.',
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: 'The items that most often come up are {{upkeep_items}}.',
    },
    {
      type: 'callout',
      text: 'Walk-throughs begin {{deadline_date}}. Anything addressed before then will not generate a letter.',
    },
    {
      type: 'paragraph',
      text: 'If keeping up with your yard is difficult right now — illness, travel, cost, a landscaper who stopped showing up — reply to this email. We would far rather help you find a solution than send a violation notice.',
    },
  ],
  questions: [
    {
      id: 'season_context',
      label: 'What is the occasion?',
      type: 'select',
      options: [
        'the spring growing season',
        'the summer months',
        'fall leaf drop',
        'the annual property walk-through',
      ],
      required: true,
    },
    {
      id: 'upkeep_items',
      label: 'What needs attention?',
      type: 'multiselect',
      options: [
        'grass height and edging',
        'weeds in beds and along walkways',
        'overgrown shrubs blocking sidewalks',
        'dead or fallen limbs',
        'leaves left in gutters and drains',
        'bare or eroding areas of lawn',
      ],
      required: true,
    },
    {
      id: 'deadline_date',
      label: 'When do walk-throughs begin?',
      type: 'date',
      required: true,
      help: 'Give people a realistic window — at least two weekends, and more if a landscaper is needed.',
    },
  ],
  legalNote:
    'This is a courtesy reminder, not a notice of violation, and it does not satisfy any notice or hearing requirement in your governing documents — an individual, cited notice still has to precede a fine. Cite the maintenance standard from the declaration rather than a subjective one; "unkempt" is not enforceable, a stated grass height is. Do not name addresses or attach photographs of specific yards. Be careful with drought restrictions and any state or local water rules, since demanding a green lawn during a watering ban puts residents in an impossible position. Georgia also protects certain landscape choices in some circumstances, so confirm before requiring turf grass specifically.',
}

export default template
