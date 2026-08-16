import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'holiday-decoration-timing',
  name: 'Holiday Decorations — When They Can Go Up and Come Down',
  description:
    'A seasonal note on decoration timing, written so it applies to every holiday rather than one. Send well before the season so the dates are a plan and not a correction.',
  genre: 'seasonal',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#96407A',
  visual: {
    kind: 'illustration',
    asset: 'holiday-decoration-timing.png',
    alt: 'A party popper releasing streamers',
  },
  subject: 'Decoration dates for {{association_name}}',
  preview: 'The window for putting decorations up and taking them down.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'Decorations are one of the nicer things neighborhoods do, and the association is not trying to referee taste. The only rule worth stating is timing, so nothing lingers into the following season.',
    },
    { type: 'visual' },
    {
      type: 'callout',
      text: 'Decorations may go up from {{display_start}} and should come down by {{display_end}}.',
    },
    {
      type: 'paragraph',
      text: '{{additional_guidance}}',
    },
    {
      type: 'paragraph',
      text: 'If you need longer — a display that takes a while to dismantle, or a stretch away from home — just reply and tell us. We will note it and leave you alone.',
    },
  ],
  questions: [
    {
      id: 'display_start',
      label: 'Decorations may go up from',
      type: 'date',
      required: false,
    },
    {
      id: 'display_end',
      label: 'And should come down by',
      type: 'date',
      required: false,
    },
    {
      id: 'additional_guidance',
      label: 'Anything else worth saying?',
      type: 'textarea',
      required: false,
      fallback:
        'Please keep displays clear of sidewalks and driveways, and keep any extension cords off walking paths.',
      help: 'Common additions: limits on inflatables, projected lights, sound, or anything that spills into shared areas.',
    },
  ],
  legalNote:
    'Decoration rules touch protected expression and are the single most litigated small-stakes HOA topic. Religious displays are the sharp edge: federal fair housing law and several state statutes protect a resident\'s right to display religious symbols, and a blanket ban or a rule that in practice permits one faith\'s decorations and not another\'s is a fair housing problem. Keep restrictions to neutral, evenly applied terms — timing, size, safety, encroachment on shared property — and never to the content or meaning of a display. Flag displays have their own protections, including federal law on the United States flag. Do not name a household or photograph a specific home.',
}

export default template
