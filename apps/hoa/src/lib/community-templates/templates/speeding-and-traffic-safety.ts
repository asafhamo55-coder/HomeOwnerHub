import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'speeding-and-traffic-safety',
  name: 'Speeding and Traffic Safety in the Neighborhood',
  description:
    'A community-wide note about driving speed, stop signs and visibility. Written on the assumption that most speeders live here, which is what makes this worth sending at all.',
  genre: 'safety',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#A33A3A',
  visual: {
    kind: 'illustration',
    asset: 'speeding-and-traffic-safety.png',
    alt: 'A speedometer with its needle low in the range',
  },
  subject: 'Slowing down in {{association_name}}',
  preview: 'Where it is worst, and what the board is doing about it.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'We have had repeated reports of {{traffic_issue}}, particularly around {{affected_areas}}.',
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: 'Worth saying plainly: almost everyone driving through this neighborhood lives in it. This is not about outsiders. It is about the gap between the speed that feels normal on a familiar street and the speed at which a driver can stop for a child stepping out between parked cars.',
    },
    {
      type: 'callout',
      text: 'The posted limit is {{speed_limit}}. {{board_action}}',
    },
    {
      type: 'paragraph',
      text: 'If there is a spot where sightlines are genuinely bad — an overgrown corner, a blind driveway, a missing sign — reply and tell us where. That is a fixable problem and we would rather fix it than ask everyone to compensate for it.',
    },
  ],
  questions: [
    {
      id: 'traffic_issue',
      label: 'What is happening?',
      type: 'multiselect',
      options: [
        'speeding on the main road',
        'rolling through stop signs',
        'cutting through the parking areas',
        'distracted driving near the playground',
        'speeding during school drop-off and pickup',
      ],
      required: true,
    },
    {
      id: 'affected_areas',
      label: 'Where is it worst?',
      type: 'multiselect',
      options: [
        'the main entrance',
        'the loop road',
        'the streets near the playground',
        'the clubhouse and pool area',
        'the school bus stop',
      ],
      required: true,
    },
    {
      id: 'speed_limit',
      label: 'Posted speed limit',
      type: 'text',
      required: true,
      help: 'e.g. "25 mph". Use what is actually posted, not what the board wishes it were.',
    },
    {
      id: 'board_action',
      label: 'What is the board doing?',
      type: 'textarea',
      required: false,
      fallback: 'The board is reviewing options and welcomes suggestions.',
      help: 'A reminder with no action behind it reads as noise. Signage, a speed study, striping, or a request to the county all count.',
    },
  ],
  legalNote:
    'Do not describe a specific vehicle, plate, driver or household — a speeding accusation aimed at an identifiable neighbor is the fastest route from a newsletter to a defamation claim. Be careful about promising enforcement the association cannot deliver: private associations generally cannot issue traffic citations, and if the streets are public, speed enforcement belongs to the police and the speed limit is set by the municipality, not the board. Radar signs, speed humps and new signage on public roads usually need municipal approval. If you are considering hiring off-duty officers or a private patrol, get counsel involved first, as that carries its own liability.',
}

export default template
