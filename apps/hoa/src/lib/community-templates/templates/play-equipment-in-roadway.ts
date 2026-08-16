import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'play-equipment-in-roadway',
  name: 'Basketball Hoops and Play Equipment in the Street',
  description:
    'A reminder about portable hoops, goals and toys left in the roadway. Written to protect kids playing outside rather than to stop them, because the version that reads as anti-children generates more complaints than it resolves.',
  genre: 'conduct',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#9A4E1C',
  visual: {
    kind: 'illustration',
    asset: 'play-equipment-in-roadway.png',
    alt: 'A basketball, of the kind used with a portable hoop',
  },
  subject: 'Play equipment in the streets of {{association_name}}',
  preview: 'Keeping the roadway clear without pushing kids indoors.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'Kids playing outside is one of the better things about living here, and nothing in this note is meant to change that. The issue is equipment left in the roadway after everyone has gone in.',
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: 'A hoop or goal parked at the curb overnight — most often around {{affected_areas}} — is invisible to a driver at dusk, forces cars into the oncoming lane, and is the first thing a delivery truck hits.',
    },
    {
      type: 'callout',
      text: '{{storage_guidance}}',
    },
    {
      type: 'paragraph',
      text: 'If your equipment is too heavy to move on your own, reply and let us know — that is a solvable problem and not a reason for a violation notice.',
    },
  ],
  questions: [
    {
      id: 'storage_guidance',
      label: 'What are you asking residents to do?',
      type: 'textarea',
      required: false,
      help: 'Be concrete and achievable — e.g. "Please move portable hoops back onto your driveway at the end of the day."',
    },
    {
      id: 'affected_areas',
      label: 'Where is it happening? (optional)',
      type: 'multiselect',
      options: [
        'the cul-de-sacs',
        'the main loop road',
        'the streets near the playground',
        'throughout the community',
      ],
      required: false,
      fallback: 'several streets',
    },
  ],
  legalNote:
    'Familial status is a protected class under the federal Fair Housing Act, and rules that single out children — or that a reasonable reader hears as "keep your kids off the street" — have produced real HUD complaints against associations. Frame this around the equipment and the roadway, never around children or their behavior, and never name a family. Permanent basketball goals are usually an architectural matter with its own approval process, so do not mix the two here. If the streets are public rather than association-owned, the association likely has no authority over what sits in them; check before sending.',
}

export default template
