import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'pool-rules-and-guests',
  name: 'Pool Rules — Guests, Glass and Supervision',
  description:
    'In-season conduct at the pool: guest limits, glass, and who must supervise children. Distinct from the pool pass renewal template, which is about paperwork before opening day.',
  genre: 'safety',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#1C6F31',
  visual: {
    kind: 'illustration',
    asset: 'pool-rules-and-guests.png',
    alt: 'A swimmer doing the front crawl',
  },
  subject: 'Pool rules for the season in {{association_name}}',
  preview: 'Guests, glass, and supervision — the three that come up every year.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'The pool is open and mostly runs itself. These are the few rules that come up every season, sent to everyone at once so nobody gets singled out at the gate.',
    },
    { type: 'visual' },
    {
      type: 'list',
      items: [
        'Guests: {{guest_policy}}',
        'No glass of any kind inside the pool area.',
        'Children: {{supervision_policy}}',
        'Pool hours are {{pool_hours}}.',
      ],
    },
    {
      type: 'callout',
      text: 'There is no lifeguard on duty. Everyone swims at their own risk, and an adult must be responsible for every child in the water.',
    },
    {
      type: 'paragraph',
      text: 'If something is wrong with the pool itself — cloudy water, a broken gate latch, missing safety equipment — reply immediately. A gate that does not latch is the one problem here that cannot wait.',
    },
  ],
  questions: [
    {
      id: 'guest_policy',
      label: 'What is the guest rule?',
      type: 'text',
      required: true,
      help: 'e.g. "up to four guests per household, and a resident must be present with them"',
    },
    {
      id: 'supervision_policy',
      label: 'What is the child supervision rule?',
      type: 'text',
      required: true,
      help: 'Use the age from your pool rules, not a guess — this is the rule most likely to be quoted back to you.',
    },
    {
      id: 'pool_hours',
      label: 'Pool hours',
      type: 'text',
      required: true,
    },
  ],
  legalNote:
    'Pools carry the association\'s largest premises-liability exposure, so state the rules exactly as adopted and as posted at the pool — an email that contradicts the posted sign creates ambiguity a plaintiff will use. Do not describe the pool as safe, supervised, or lifeguarded unless a lifeguard is genuinely on duty. Georgia public-pool rules and county health regulations may impose signage, fencing and gate-latch requirements the association cannot waive by email. Age-based supervision rules touch familial status under fair housing law: rules must be tied to genuine safety and applied evenly, and blanket adult-only hours have drawn HUD complaints. Confirm anything about accessibility or pool lifts against ADA requirements if the pool serves the public in any way.',
}

export default template
