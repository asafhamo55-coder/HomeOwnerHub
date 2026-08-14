import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'street-parking-and-vehicles',
  name: 'Street Parking — Blocked Access and Inoperable Vehicles',
  description:
    'A community-wide reminder about parking on the street, blocking access, and vehicles that have not moved in weeks. Distinct from guest parking: this is about resident vehicles and access, not visitors.',
  genre: 'conduct',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#2C5F8A',
  visual: {
    kind: 'illustration',
    asset: 'street-parking-and-vehicles.png',
    alt: 'A parked car seen from the front three-quarter view',
  },
  subject: 'Parking and access in {{association_name}}',
  preview: 'Keeping the streets passable for trucks and emergency vehicles.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: "We've had trouble lately with {{parking_issue}}, most often around {{affected_areas}}.",
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: 'The practical concern is access. A fire truck needs a clear lane, and a moving van or trash truck that cannot get through simply leaves — which means the whole street waits another week.',
    },
    {
      type: 'callout',
      text: '{{parking_guidance}}',
    },
    {
      type: 'paragraph',
      text: 'If you are expecting a delivery, a contractor, or a stretch of guests, reply to this email and let us know. A heads-up prevents almost every complaint we receive.',
    },
  ],
  questions: [
    {
      id: 'parking_issue',
      label: 'What is the problem?',
      type: 'multiselect',
      options: [
        'vehicles parked in the roadway overnight',
        'cars blocking driveways or mailboxes',
        'parking too close to corners and fire hydrants',
        'vehicles that have not moved in weeks',
        'trailers, boats or RVs parked in view',
        'commercial vehicles parked overnight',
      ],
      required: true,
    },
    {
      id: 'affected_areas',
      label: 'Where is it worst?',
      type: 'multiselect',
      options: [
        'the main entrance',
        'the cul-de-sacs',
        'the clubhouse lot',
        'the visitor spaces',
        'the streets near the playground',
        'throughout the community',
      ],
      required: true,
    },
    {
      id: 'parking_guidance',
      label: 'What should residents do instead?',
      type: 'textarea',
      required: true,
      help: 'State the rule plainly — e.g. "Park in your driveway or garage first. On-street parking is for guests, and never overnight."',
    },
  ],
  legalNote:
    'Towing is the risk here. Most states, Georgia included, regulate non-consensual towing from private property — signage, notice, and who may authorize it — and an association that tows without meeting those requirements can end up liable for the vehicle and the owner\'s costs. Do not threaten towing in this email unless your counsel has confirmed the association currently satisfies every requirement. Do not list plate numbers, vehicle descriptions, or addresses: that identifies a household to the entire community. "Inoperable" and "commercial vehicle" are usually defined terms in the declaration, so use its definition rather than a common-sense one. Street parking is frequently governed by the municipality, not the association, in which case the association cannot enforce it at all.',
}

export default template
