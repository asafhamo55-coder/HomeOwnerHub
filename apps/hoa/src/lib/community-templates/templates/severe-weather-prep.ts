import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'severe-weather-prep',
  name: 'Severe Weather — What to Secure and Who to Call',
  description:
    'Ahead of a storm or a season: what residents should secure, what the association handles, and who to call when. The division of responsibility is the part people get wrong at 2am.',
  genre: 'safety',
  shape: 'notice',
  audience: 'broadcast',
  accentColor: '#5560B4',
  visual: {
    kind: 'illustration',
    asset: 'severe-weather-prep.png',
    alt: 'A cloud with a lightning bolt',
  },
  subject: 'Storm preparation for {{association_name}}',
  preview: 'What to secure, and who handles what afterwards.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'With {{weather_event}} expected, here is what is worth doing in advance and how responsibility divides once it passes.',
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: 'Before it arrives, please secure {{items_to_secure}}. Loose items in shared areas become projectiles, and most storm damage in a neighborhood like ours is caused by a neighbor\'s patio furniture rather than by the wind itself.',
    },
    {
      type: 'callout',
      text: '{{responsibility_split}}',
    },
    {
      type: 'paragraph',
      text: 'For anything genuinely dangerous — downed power lines, a gas smell, structural damage, water rising into a home — call 911 first. Do not wait on the association, and do not reply to this email and wait for us to see it.',
    },
  ],
  questions: [
    {
      id: 'weather_event',
      label: 'What are you preparing for?',
      type: 'select',
      options: [
        'severe thunderstorms',
        'a tropical storm or hurricane',
        'a winter storm and freezing temperatures',
        'the coming storm season',
        'high winds',
      ],
      required: true,
    },
    {
      id: 'items_to_secure',
      label: 'What should residents secure?',
      type: 'multiselect',
      options: [
        'patio furniture and umbrellas',
        'trash and recycling bins',
        'grills and fire pits',
        'garden decorations and planters',
        'trampolines and play equipment',
        'holiday decorations and flags',
      ],
      required: true,
    },
    {
      id: 'responsibility_split',
      label: 'Who handles what afterwards?',
      type: 'textarea',
      required: true,
      help: 'The most useful thing in this email. State plainly what the association clears versus what an owner is responsible for, and the number to call for each.',
    },
  ],
  legalNote:
    'Be precise about the maintenance boundary between association and owner, and take it from the declaration rather than from custom — a storm is exactly when an inaccurate description gets tested, and telling residents the association will handle something it will not can create reliance you have to answer for. Do not offer safety instructions beyond directing people to emergency services and official guidance; the association is not an emergency authority, and detailed advice creates a duty it cannot meet at 2am. Never promise a response time. Do not advise residents on whether to file an insurance claim or on what their policy covers.',
}

export default template
