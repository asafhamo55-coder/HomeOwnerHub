import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'annual-meeting-notice',
  name: 'Annual Meeting — Date, Quorum and Proxy',
  description:
    'The annual meeting announcement, written so people understand that quorum is the thing that actually fails. Explains the proxy in plain language rather than assuming anyone knows what one is.',
  genre: 'governance',
  shape: 'notice',
  audience: 'broadcast',
  accentColor: '#3F5C8C',
  visual: {
    kind: 'illustration',
    asset: 'annual-meeting-notice.png',
    alt: 'Three people standing together',
  },
  subject: '{{association_name}} annual meeting — {{meeting_date}}',
  preview: 'The date, what is on the agenda, and why your proxy matters.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'The annual meeting of {{association_name}} is on {{meeting_date}} at {{meeting_location}}.',
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: 'On the agenda: {{agenda_items}}.',
    },
    {
      type: 'callout',
      text: 'If you cannot attend, please return a proxy. A proxy simply lets another owner cast your vote. Without enough owners present or represented, the meeting cannot reach quorum and no business can be conducted — which means it has to be scheduled again, at the association\'s expense.',
    },
    {
      type: 'paragraph',
      text: 'Meetings fail on quorum far more often than on disagreement. Ten minutes returning a proxy is the single most useful thing an owner who cannot attend can do.',
    },
  ],
  questions: [
    {
      id: 'meeting_date',
      label: 'Meeting date and time',
      type: 'text',
      required: true,
      help: 'Include the time. Check your documents for the minimum notice period before choosing a send date.',
    },
    {
      id: 'meeting_location',
      label: 'Where is it?',
      type: 'text',
      required: true,
      help: 'Include the video link as well if it is hybrid — but confirm your documents permit electronic attendance and voting first.',
    },
    {
      id: 'agenda_items',
      label: 'What is on the agenda?',
      type: 'textarea',
      required: true,
      help: 'Board elections, the budget, and any owner vote. Some items must be described specifically in the notice to be voted on at all.',
    },
  ],
  legalNote:
    'This is a formal notice with statutory and documentary consequences, not a newsletter. Your declaration and bylaws set a minimum notice period, a required delivery method, and required content — email alone frequently does not satisfy them, and Georgia associations should confirm what O.C.G.A. § 44-3-231 and their own bylaws require before relying on this. A defectively noticed meeting can invalidate everything decided at it, including a board election or a budget ratification. Certain actions — amending the declaration, levying a special assessment, electing directors — usually carry stricter notice and quorum rules and must be described specifically in the notice to be acted on. Attach the actual proxy form; a proxy has formal requirements and one drafted informally may not count toward quorum. Have counsel review this notice the first time you use it.',
}

export default template
