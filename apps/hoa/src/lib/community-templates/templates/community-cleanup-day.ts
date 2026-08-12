import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'community-cleanup-day',
  name: 'Community Cleanup Day — Volunteer Invitation',
  description:
    'An invitation to the annual community cleanup and bulk dumpster weekend, when volunteers tidy the common areas and a roll-off dumpster is on site for bulk items. Send a couple of weeks ahead so residents can plan their Saturday.',
  genre: 'community-life',
  shape: 'invitation',
  audience: 'broadcast',
  accentColor: '#A63A87',
  visual: {
    kind: 'illustration',
    asset: 'community-cleanup-day.png',
    alt: 'A broom with bright bristles sweeping leaves and yard debris off a pathway',
  },
  subject: 'Join us for Community Cleanup Day in {{association_name}} — {{event_date}}',
  preview: 'Bags, gloves, and refreshments provided, plus a dumpster on site for bulk items.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: "It's time for our annual Community Cleanup Day! Grab a pair of gloves and join your neighbors on {{event_date}} from {{start_time}} to {{end_time}} — we'll spend the morning tidying up our shared spaces, and there's a roll-off dumpster on site for bulk items you've been meaning to get rid of.",
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: "Meet us at {{meeting_location}}. We'll form small teams and split up the common areas, so however much time you can spare — an hour or the whole morning — makes a real difference.",
    },
    {
      type: 'paragraph',
      text: "We'll have trash bags, work gloves, and refreshments on hand to keep everyone going. Just bring closed-toe shoes, sun protection, and a water bottle — and your own gloves too, if you've got a favorite pair.",
    },
    {
      type: 'callout',
      text: "The dumpster is for bulk household items — furniture, yard debris, scrap wood, and the like. It cannot take paint, tires, electronics, chemicals, or mattresses; those need a hazardous-waste or bulk-pickup program instead. If you're not sure whether something belongs in there, ask one of the volunteers before you toss it in.",
    },
    {
      type: 'paragraph',
      text: "RSVPs: {{rsvp_instructions}}. Either way, come say hi — we'd love to see you.",
    },
    {
      type: 'paragraph',
      text: "Bring a neighbor, bring the kids, and let's make {{association_name}} look its best together. We're grateful for every hour you can spare on a Saturday.",
    },
  ],
  questions: [
    {
      id: 'event_date',
      label: 'What Saturday is Cleanup Day?',
      type: 'date',
      required: true,
    },
    {
      id: 'start_time',
      label: 'What time does it start?',
      type: 'time',
      required: true,
    },
    {
      id: 'end_time',
      label: 'What time does it wrap up?',
      type: 'time',
      required: true,
    },
    {
      id: 'meeting_location',
      label: 'Where should volunteers meet?',
      type: 'text',
      required: true,
      help: 'e.g. "the clubhouse parking lot"',
    },
    {
      id: 'rsvp_instructions',
      label: 'How should residents let you know they are coming?',
      type: 'select',
      options: [
        'No RSVP needed — just show up',
        'Reply to this email to let us know',
        'Sign up at the clubhouse front desk',
        'Sign up using the community app',
      ],
      required: true,
    },
  ],
  legalNote:
    "The prohibited-items copy is not just logistics — it's a liability item. Anything the hauler's contract excludes (paint, tires, electronics, chemicals, mattresses) that ends up in the dumpster becomes the association's disposal problem and can carry a surcharge, so never promise to take anything outside what the rental contract actually covers; confirm the current exclusion list with the hauler before sending. This is also volunteer physical labor with real injury exposure (lifting, yard tools, moving debris) — do not word this in a way that implies the association supervises, trains, or insures volunteers during the event.",
}

export default template
