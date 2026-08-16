import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'noise-and-quiet-hours',
  name: 'Noise — Quiet Hours and Being a Good Neighbor',
  description:
    'A community-wide reminder of quiet hours and the kinds of noise that have been generating complaints. Send before anyone files a formal complaint against a specific household.',
  genre: 'conduct',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#8A4B2A',
  visual: {
    kind: 'illustration',
    asset: 'noise-and-quiet-hours.png',
    alt: 'A speaker emitting sound waves',
  },
  subject: 'Quiet hours in {{association_name}}',
  preview: 'When quiet hours run, and what has been coming up lately.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: "We've had a few reports about {{noise_source}} recently, so this is a general reminder rather than a note aimed at anyone in particular.",
    },
    { type: 'visual' },
    {
      type: 'callout',
      text: 'Quiet hours run from {{quiet_start}} to {{quiet_end}}. Outside those hours, ordinary daytime noise is expected and fine.',
    },
    {
      type: 'paragraph',
      text: 'Most noise complaints resolve with a short conversation between neighbors, and we would rather that than a formal process. If a direct conversation is uncomfortable or has not worked, reply to this email and we will follow up discreetly.',
    },
    {
      type: 'paragraph',
      text: 'Thanks for being considerate — sound carries further between these homes than most people expect.',
    },
  ],
  questions: [
    {
      id: 'noise_source',
      label: 'What has been generating complaints?',
      type: 'multiselect',
      options: [
        'late-night music and gatherings',
        'barking dogs',
        'early-morning lawn equipment',
        'vehicle engines and car audio',
        'contractor work outside permitted hours',
        'children playing late in shared areas',
      ],
      required: false,
      help: 'Pick the categories, not the households. Naming a source is a reminder; naming a neighbor is an accusation.',
    },
    {
      id: 'quiet_start',
      label: 'Quiet hours start',
      type: 'time',
      required: false,
      help: 'Use the time in your governing documents, not a time the board prefers.',
    },
    {
      id: 'quiet_end',
      label: 'Quiet hours end',
      type: 'time',
      required: false,
    },
  ],
  legalNote:
    'Quote quiet hours from the declaration or rules, not from memory or from a local ordinance you have not checked — residents will hold you to whatever this email says, and a wrong time undercuts every later enforcement step. Keep it community-wide: do not identify a household, a unit, or a specific night, and never forward a neighbor complaint verbatim, since it usually identifies the complainant. Barking dogs and contractor hours often sit under separate rules; if you plan to fine, cite the specific covenant in the individual notice rather than relying on this reminder.',
}

export default template
