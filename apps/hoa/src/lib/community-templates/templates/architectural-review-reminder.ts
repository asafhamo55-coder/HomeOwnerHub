import type { CommunityTemplate } from '../types'

const template: CommunityTemplate = {
  slug: 'architectural-review-reminder',
  name: 'Before You Build — Architectural Review Reminder',
  description:
    'A reminder to submit for approval before starting exterior work, sent ahead of project season. The point is to reach people while a project is still an idea, because the expensive conversation is the one that happens after the fence is up.',
  genre: 'governance',
  shape: 'reminder',
  audience: 'broadcast',
  accentColor: '#7A6138',
  visual: {
    kind: 'illustration',
    asset: 'architectural-review-reminder.png',
    alt: 'A drafting compass over architectural lines',
  },
  subject: 'Planning exterior work in {{association_name}}? Submit first',
  preview: 'What needs approval, and how long review takes.',
  body: [
    { type: 'paragraph', text: 'Hi {{recipient_name}},' },
    {
      type: 'paragraph',
      text: 'This is the season when projects start, so a reminder while yours is still an idea: most exterior changes need written approval before work begins.',
    },
    { type: 'visual' },
    {
      type: 'paragraph',
      text: 'Work that typically requires approval includes {{project_types}}.',
    },
    {
      type: 'callout',
      text: 'Submit to {{submission_route}}. Review takes {{review_window}}, so build that into your contractor\'s schedule rather than discovering it the week they are due to start.',
    },
    {
      type: 'paragraph',
      text: 'The reason to submit first is simple: if something is built without approval and does not conform, the owner can be required to remove it at their own cost. That is a miserable outcome for everyone and it is entirely avoidable with one form.',
    },
    {
      type: 'paragraph',
      text: 'Not sure whether your project needs approval? Ask before you order materials. We would much rather answer a quick question than review a finished deck.',
    },
  ],
  questions: [
    {
      id: 'project_types',
      label: 'What needs approval here?',
      type: 'multiselect',
      options: [
        'fences and walls',
        'decks, patios and pergolas',
        'exterior paint colour changes',
        'roof replacement and material changes',
        'sheds and outbuildings',
        'solar panels, satellite dishes and antennas',
      ],
      required: false,
      help: 'Take this from the architectural guidelines rather than memory — an incomplete list here is read as permission for anything not on it.',
    },
    {
      id: 'submission_route',
      label: 'How do owners submit?',
      type: 'text',
      required: false,
      help: 'The form, the portal, or the email address — plus what has to accompany it (plans, materials, a survey).',
    },
    {
      id: 'review_window',
      label: 'How long does review take?',
      type: 'text',
      required: false,
      help: 'Use the period in your documents. Many set a deadline after which an unanswered application is deemed approved.',
    },
  ],
  legalNote:
    'Several categories owners often assume are restricted are in fact protected, and listing them as requiring approval can itself be unlawful: solar access is protected in many states, over-the-air antennas and satellite dishes under a metre are protected by the FCC\'s OTARD rule, flags have federal and state protections, and religious displays on doorposts are protected. Do not present those as prohibited — the association may usually regulate placement and appearance modestly, and no further. Note also that most governing documents deem an application approved if the committee does not respond within a stated period, so the review window here is a commitment, not an aspiration. Approval under the covenants is not a building permit and does not substitute for one. This reminder does not replace the individual written decision an applicant is entitled to.',
}

export default template
