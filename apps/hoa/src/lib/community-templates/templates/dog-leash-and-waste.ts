import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'dog-leash-and-waste',
  name: 'Dogs — Leash Rules and Picking Up After Your Pet',
  description:
    'A community-wide nudge about pet waste and off-leash dogs, naming the areas where it has become a problem and where the bag stations are. Send before anything formal.',
  genre: 'conduct',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#1C6772',
  visual: {
    kind: 'illustration',
    asset: 'dog-leash-and-waste.png',
    alt: 'A resident walking a leashed dog past a waste bag station',
  },
  subject: 'A friendly reminder about dogs in {{association_name}}',
  preview: 'Where the bag stations are, and a note about leashes.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: "We've had a number of reports about {{issue_type}} over the past few weeks, most often around {{affected_areas}}.",
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: 'The overwhelming majority of dog owners here already clean up and keep their dogs leashed in shared spaces. This is just a nudge for everyone to keep at it.',
    },
    {
      type: 'callout',
      text: "You'll find bag stations at {{station_locations}}. If one is empty or damaged, reply to this email and we will restock it.",
    },
    {
      type: 'paragraph',
      text: 'Thanks for helping keep the neighborhood pleasant for everyone — including the neighbors who are nervous around dogs they do not know.',
    },
  ],
  questions: [
    {
      id: 'issue_type',
      label: 'What is the problem right now?',
      type: 'select',
      options: [
        'pet waste left on lawns and paths',
        'dogs off leash in shared spaces',
        'both pet waste and off-leash dogs',
      ],
      required: true,
    },
    {
      id: 'affected_areas',
      label: 'Where is it worst?',
      type: 'multiselect',
      options: [
        'the east entrance',
        'the main walking path',
        'the mailboxes',
        'the playground',
        'the clubhouse lawn',
        'the north cul-de-sac',
      ],
      required: true,
      help: 'Naming the actual spots is what makes people recognize themselves.',
    },
    {
      id: 'station_locations',
      label: 'Where are the bag stations? (optional)',
      type: 'text',
      required: false,
      // Optional questions MUST carry a fallback: buildMergeBag writes
      // `q.fallback ?? ''` when unanswered, and an empty string reads as a
      // missing field to renderTemplateStrict, which fails the send. The
      // wording is deliberately non-specific — inventing station locations
      // in a fallback would assert something about the community that may
      // not be true.
      fallback: 'the marked points around the community',
      help: 'Optional. Naming the actual spots gets more use out of them, but leave it blank if you would rather not commit to a list.',
    },
  ],
  legalNote:
    'Keep this community-wide. Do not describe a specific dog, breed, unit or time of day that identifies one household, and never attach a camera still of an identifiable person — that turns a nudge into a public accusation. Breed-specific wording invites discrimination and insurance disputes. If a bite occurred, handle it directly, not here. Service and assistance animals are not pets.',
}

export default template
