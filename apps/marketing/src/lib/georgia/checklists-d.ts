// SEO batch 5: community announcement templates. State-neutral: it quotes no
// law except one labelled Georgia note on meeting notice. The letter keeps
// every date, time and rule as a blank.

import type { Checklist } from './checklists'

export const ANNOUNCEMENT_TEMPLATES: Checklist = {
  slug: 'hoa-announcement-templates',
  path: '/templates/hoa-announcement-templates',
  title: 'HOA announcement templates: Halloween, holidays, pets and more',
  metaTitle: 'HOA announcement templates for boards',
  description:
    'Free, printable HOA announcement templates and a send checklist for Halloween, holidays, pet rules and other community notices. Fill in the blanks. No sign-up.',
  eyebrow: 'Free template · Print it',
  intro: [
    'Most community announcements are the same few notices every year: a Halloween party, happy holidays, pet waste and leash rules, a pool opening, trash pickup changes. This page gives you a short checklist to run before you send any of them, and a fill-in notice you can reuse for a social event.',
    'It works in any state. Georgia appears only in the labelled note at the bottom, about notice of a meeting. This is a template, not legal advice. A rule reminder only has force if your documents support the rule.',
  ],
  howTo: true,
  items: [
    { text: 'Pick one purpose for the message, and put it in the subject line.', detail: 'For example, “Halloween party Friday, October 31, 6 pm at the clubhouse”.' },
    { text: 'Lead with the date, time and place.', detail: 'Residents skim. Put what they need to act on in the first two lines.' },
    { text: 'Check every fact against a source, not memory.', detail: 'Dates, times, addresses, fees and phone numbers.' },
    { text: 'For a rule reminder, name the rule and where it is written.', detail: 'Cite the section of your rules or declaration, and say it is a reminder, not a violation.' },
    { text: 'Keep the tone friendly and the same for everyone.', detail: 'Do not hint at a particular home. Use a violation letter for that.' },
    { text: 'Choose the audience on purpose.', detail: 'All residents, owners only, one street, or the homes behind on dues. A pet reminder does not belong in a dues notice.' },
    { text: 'Check who agreed to which channel.', detail: 'Send email to those with email, and text only to residents who agreed to receive texts. Residents who opted out must stay out.' },
    { text: 'Add a Spanish version if your community needs one, and have a Spanish speaker read it.', detail: 'A machine translation should not go out unread.' },
    { text: 'Name a contact for questions and say how they can reach them.' },
    { text: 'For a safety notice, add the time it takes effect and who to call.', detail: 'Severe weather, water shutoffs and road closures are time-sensitive. Send them early.' },
    { text: 'Send yourself a test first, and read it on a phone.' },
    { text: 'Have a second board member read it, then send or schedule it.', detail: 'Keep a copy with the board packet.' },
  ],
  letter: {
    heading: 'A community event notice',
    intro: 'Replace each [bracket]. Use it for a Halloween party, a pool opening, a yard sale or a holiday gathering, and delete any line that does not apply.',
    lines: [
      'Subject: [Event name] on [day, date] at [time]',
      '',
      'Dear neighbors,',
      '',
      'The [Association name] board invites you to [event name] on [day, date], from [start time] to [end time], at [place].',
      '',
      '[One or two sentences on what to expect, for example: costumes are welcome, and there will be treats for the children.]',
      '',
      'A few things to know:',
      '- [Parking, safety or noise note, if any.]',
      '- [What to bring, or what is provided.]',
      '- [Rain date or cancellation plan, if any.]',
      '',
      'If you have questions, please contact [name] at [email or phone].',
      '',
      'Thank you for helping make [community name] a good place to live.',
      '',
      '[Board member name], [title]',
      '[Association name]',
    ],
  },
  quotesHeading: 'Georgia note: notice of a meeting',
  quotes: ['meetingNotice'],
  faqs: [
    {
      q: 'What announcements should an HOA send every year?',
      a: 'Common ones are the annual meeting reminder, holiday and seasonal notices, pet rules, trash or bulk-pickup changes, pool opening and closing, and severe weather.',
    },
    {
      q: 'Can an HOA text residents an announcement?',
      a: 'Send texts only to residents who agreed to receive them, and honor opt-outs. Email can go to everyone with an email on file. Ask your attorney if you are unsure about consent.',
    },
    {
      q: 'How do we remind people of a rule without sounding harsh?',
      a: 'Say it is a reminder to everyone, name the rule and where it is written, and give the reason in a sentence.',
    },
  ],
  related: ['hoa-board-meeting-agenda', 'annual-meeting-notice-checklist', 'hoa-violation-letter-georgia', 'hoa-board-meeting-minutes', 'ai-hoa-violation-letters-board-approval'],
  hoaDoes: [
    {
      text: 'New announcement on Messages, Inbox and the dashboard offers 16 ready occasions in English and Spanish, among them Halloween party, happy holidays, graduation, pet waste and leash rules, pool opening and annual meeting reminder. Or type one sentence and the date, time and place are filled in. Everything stays editable.',
      route: '/communications/announce',
      release: '2026-10-26-2305-announcements-website-restyle',
    },
    {
      text: 'One review screen shows the email and text previews, for all residents or chosen streets. Nothing goes out until a board member clicks Send. Opt-outs and channel choices are respected, and texts go only to residents who opted in.',
      route: '/communications/announce',
      release: '2026-10-26-2305-announcements-website-restyle',
    },
  ],
  datePublished: '2026-10-27',
  dateModified: '2026-10-27',
}
