// SEO batch 5: two product-led guides (AI violation letters with board
// approval, AI meeting minutes) and, in checklists-d.ts, the announcement
// templates. Same truth rules as the other guides: statute text only through
// the quote bank, product claims only with an apps/hoa route and a release
// note that exist, and no promise about what the AI gets right.

import type { Guide } from './types'

const PUBLISHED = '2026-10-27'

export const AI_VIOLATION_LETTERS: Guide = {
  slug: 'ai-hoa-violation-letters-board-approval',
  path: '/guides/ai-hoa-violation-letters-board-approval',
  title: 'Using AI to draft HOA violation letters, with the board approving every one',
  metaTitle: 'AI HOA violation letters: draft, then approve',
  description:
    'How a self-managed HOA board can use AI to draft violation letters that cite the rule, and keep the board in charge of approving what goes to an owner.',
  eyebrow: 'AI for boards · Violations',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'AI is good at the slow part of a violation letter: a calm first draft that names the rule and describes what was seen. It should never be the one that decides to send it.',
    'In HomeownerHub the drafter works from a photo and a caption, cites the section of your documents, and puts the letter in Approvals. Approving it never emails the homeowner by itself.',
    'A fine is a separate, later step with its own limits. The app will not draft a fine letter where state law blocks it, such as before a required hearing.',
    'Your governing documents decide what you may enforce and how. The AI reads them; it does not replace your attorney.',
  ],
  sections: [
    {
      heading: 'Why boards use AI for violation letters',
      body: [
        'A volunteer board often puts off a violation letter because writing it is awkward. The tone has to be firm without being hostile, the rule has to be right, and the facts have to match what a neighbor reported. A first draft that does the wording and the rule lookup leaves the board with the part only people should do: deciding whether to act.',
        'That is the line to hold. AI drafts; the board reviews, edits and approves. If a tool sends a letter to an owner on its own, that is not drafting help. It is a decision made without you.',
      ],
    },
    {
      heading: 'What the draft should contain',
      body: [
        'A good first notice is short and factual. Whatever tool wrote it, check that the draft has these before you approve.',
      ],
      list: [
        'The owner and the property address, and the date of the observation.',
        'What was seen, in neutral words, with a photo on file.',
        'The section of your declaration, bylaws or rules that the issue breaks. A letter with no rule cited is a weak letter.',
        'What the owner can do to fix it, and a reasonable date to do it by.',
        'How the owner can respond or ask for a conversation.',
        'No threat of a fine unless your documents allow fines and a fine process is in place.',
      ],
    },
    {
      heading: 'The rule has to come from your documents',
      body: [
        'Georgia’s statute ties an association’s power to its own instrument. An owner must follow reasonable rules that have been provided to the lot owners, and fines are available only if and to the extent the instrument provides for them. So a draft is only as good as the document section behind it.',
        'This is why a cited rule matters more than polished wording. If the AI cannot find a section that covers the issue, the honest result is “your documents do not cover this”, and the board should treat that as a stop sign.',
      ],
      quotes: ['reasonableRules', 'fineAuth'],
    },
    {
      heading: 'Approval is the control',
      body: [
        'Put every draft through one place where a board member reads it before it can leave. In HomeownerHub that place is Approvals. The board can approve the letter or reject it with a reason, and a draft can be edited before it is saved. Approving files the violation and does not email the homeowner by itself, so sending stays a separate act.',
        'Record who approved what. When an owner disputes a letter months later, a record showing the cited rule, the photo and a named board approval is the strongest thing you can have.',
      ],
    },
    {
      heading: 'Follow-up letters and fines are different',
      body: [
        'A first notice asks for a fix. A fine, a suspension or a lawsuit is a bigger step with its own rules. Your documents may require a hearing before a fine. Some states require one by law, and California adds a bar on fining an owner who has made a financial commitment to cure.',
        'Draft those letters from the violation’s own history, so the second notice refers to the first. Where state law does not allow the step yet, a good tool says so instead of drafting it.',
      ],
    },
    {
      heading: 'Court is the exception, not the next step',
      body: [
        'For Georgia associations, the statute allows an injunction after notice under the instrument, or ten days’ written notice if the instrument is silent. That is a legal action with consequences, so it is a conversation for your attorney, not a letter template.',
      ],
      quotes: ['injunctNotice'],
    },
    {
      heading: 'What AI cannot decide for you',
      body: [
        'It cannot tell you whether a rule is reasonable, whether you have enforced it evenly, or whether a particular owner deserves leniency. It can misread a photo. It does not know your history with a neighbor. Treat the draft like a draft from a new volunteer: useful, and not yet yours until you have read every line.',
      ],
    },
  ],
  steps: [
    'Gather the facts: a dated photo, a short neutral note, and the owner’s address.',
    'Find the section of your documents that covers it, or confirm it is missing.',
    'Let the drafter write the letter, with the rule cited.',
    'Read every line. Fix facts, tone and the deadline.',
    'Approve it as a board member, and keep the approval on record.',
    'Send it yourself, and diary the date to check the fix.',
    'Move to a second notice, a hearing or a fine only as your documents and state law allow.',
  ],
  faqs: [
    {
      q: 'Can AI write an HOA violation letter?',
      a: 'It can write a first draft that describes the issue and cites the rule. A board member should read, edit and approve it before anything goes to the owner.',
    },
    {
      q: 'Does HomeownerHub send violation letters automatically?',
      a: 'No. A drafted letter waits in Approvals. Approving it files the violation and does not email the homeowner by itself.',
    },
    {
      q: 'Can the AI draft a fine letter?',
      a: 'Follow-up letters, including a fine notice, can be drafted from a violation’s history. Where state law blocks the step, for example a fine before a required hearing, the app explains why and does not draft it.',
    },
    {
      q: 'Is an AI-drafted letter legal advice?',
      a: 'No. It is a draft prepared from your documents. Your attorney can review the wording and your enforcement process once, and you can reuse that process.',
    },
  ],
  related: ['violation-notice-checklist', 'hoa-violation-letter-georgia', 'fines-and-violation-hearings', 'hoa-board-meeting-minutes', 'complaint-process'],
  hoaDoes: [
    {
      text: 'Violation Drafter: add a photo and a caption on New violation, and a letter is drafted with the rule cited. It waits in Approvals for the board to approve or reject in one click. Approving never emails the homeowner by itself.',
      route: '/violations/new',
      release: '2026-10-17-1555-approvals-search-books',
    },
    {
      text: 'On a violation’s page, Draft follow-up letter writes a second notice, hearing notice, fine notice or decision letter from the violation and your state’s rules. You edit it and Save to approvals. If state law does not allow that letter yet, you see why and nothing is drafted.',
      route: '/violations/[id]',
      release: '2026-10-19-1404-follow-up-letters',
    },
    {
      text: 'A California violation with a commitment to cure on file cannot be moved to Fined, and letter drafts for it refuse a fine or suspension.',
      route: '/violations/[id]',
      release: '2026-10-19-1301-cure-commitment',
    },
  ],
}

export const AI_MEETING_MINUTES: Guide = {
  slug: 'ai-hoa-meeting-minutes',
  path: '/guides/ai-hoa-meeting-minutes',
  title: 'AI HOA meeting minutes: from a transcript to board-ready minutes',
  metaTitle: 'AI HOA meeting minutes from a transcript',
  description:
    'How a volunteer HOA board can turn a meeting transcript into draft minutes with AI, what the board must still check, and what the minutes need to contain.',
  eyebrow: 'AI for boards · Meetings',
  datePublished: PUBLISHED,
  dateModified: PUBLISHED,
  howTo: true,
  summary: [
    'Minutes are a permanent record, so the secretary must stand behind every line. AI can save the typing; it cannot save the reading.',
    'In HomeownerHub you paste the meeting transcript, the AI drafts the minutes, and the board edits and approves them.',
    'Good minutes record decisions, motions and votes, not every remark. A tool that drafts them should be checked against exactly those points.',
    'Georgia requires a nonprofit corporation to keep minutes of board and member meetings as permanent records.',
  ],
  sections: [
    {
      heading: 'What minutes are for',
      body: [
        'Minutes show what the board decided, who voted and how. A new board, an auditor, an insurer or an owner’s attorney will read them long after anyone remembers the meeting. Minutes that read like a transcript bury the decisions. Minutes that skip the votes prove nothing.',
        'Our minutes template lists what a set of minutes should hold. This guide covers the step before it, getting a draft without retyping an hour of conversation.',
      ],
    },
    {
      heading: 'Where AI helps, and where it does not',
      body: [
        'Give an AI a transcript and it can sort the talk into agenda items, pull out each motion, find the action items and write neutral sentences. That is real time saved for a secretary who also has a day job.',
        'What it cannot know is what was meant. It may hear “I’ll move that” and miss who seconded. It may turn an offhand remark into a decision. It can misspell a neighbor’s name. Every one of those is an error in a permanent record, and it is the board’s error once approved.',
      ],
    },
    {
      heading: 'The record Georgia expects you to keep',
      body: [
        'Georgia’s nonprofit corporation code lists the records a corporation must keep permanently. Minutes of board and member meetings are first on the list. Most Georgia associations are nonprofit corporations, though yours may differ, so confirm with your attorney.',
      ],
      quotes: ['requiredRecords'],
    },
    {
      heading: 'Check the draft against five things',
      body: ['Before the secretary signs, read the draft once with this list in hand.'],
      list: [
        'Quorum: does it state who was present and that there was a quorum?',
        'Motions: is each motion in the words actually used, with mover, seconder and result?',
        'Votes: are the votes for, against and abstaining right, and was any conflict of interest noted?',
        'Spending: are vendor names, amounts and bids correct?',
        'Action items: does each have a name and a due date?',
      ],
    },
    {
      heading: 'Quorum is the line the AI cannot check',
      body: [
        'Unless the instrument or bylaws specify a larger percentage, Georgia sets the board quorum at half the board’s votes. An AI has no way to know how many directors you have, so the secretary must confirm the count. If the meeting lacked a quorum, the minutes should say so rather than record decisions that were not valid.',
      ],
      quotes: ['boardQuorum'],
    },
    {
      heading: 'Keep the transcript private and the draft honest',
      body: [
        'A transcript often holds names, addresses and money details. Paste only what the minutes need, and leave out anything said in executive session. Then label the result as a draft until the board approves it at the next meeting, and file the approved copy in the minute book.',
        'When you correct the draft, correct it in the file you keep. Do not rewrite approved minutes later without a recorded vote.',
      ],
    },
    {
      heading: 'After approval, the minutes do more work',
      body: [
        'Once the minutes are approved, the motions in them become a searchable list, and the action items become tasks with owners and due dates. That is the second payoff of writing minutes carefully: the next board can see what was decided and who promised what.',
      ],
    },
  ],
  steps: [
    'Record or take notes at the meeting, and get a transcript.',
    'Remove anything that belongs in executive session.',
    'Paste the transcript and the meeting date into the minutes drafter.',
    'Check quorum, motions, votes, spending and action items against your own notes.',
    'Edit the draft, mark it a draft, and sign it as secretary.',
    'Approve it at the next meeting and file the approved copy.',
    'Put the action items on a task list with names and due dates.',
  ],
  faqs: [
    {
      q: 'Can AI write HOA meeting minutes?',
      a: 'It can draft them from a transcript. The secretary and the board still check and approve the minutes, because they are a permanent record.',
    },
    {
      q: 'Does HomeownerHub write the minutes automatically?',
      a: 'No. You paste the transcript, the AI drafts the minutes, and the board edits and approves them.',
    },
    {
      q: 'Should the minutes include everything that was said?',
      a: 'No. Record decisions, motions, votes and action items, with neutral facts. Leave out opinions about owners and side remarks.',
    },
    {
      q: 'How long do we keep minutes?',
      a: 'Georgia’s nonprofit code says to keep minutes as permanent records. Your state and bylaws may differ, so ask your attorney.',
    },
  ],
  related: ['hoa-board-meeting-minutes', 'hoa-board-meeting-agenda', 'hoa-treasurer-duties', 'annual-meeting-quorum-proxies', 'ai-hoa-violation-letters-board-approval'],
  hoaDoes: [
    {
      text: 'On New meeting, paste the transcript and the AI drafts board-ready minutes. The board edits and approves them; if the AI is offline you can write the minutes yourself on the same screen.',
      route: '/meetings/new',
      release: '2026-10-17-2100-user-guide',
    },
    {
      text: 'Meetings → Motion log lists every motion from your minutes: what was moved, who moved and seconded it, and the result, with a link to the minutes. You can search it and download it.',
      route: '/meetings/motions',
      release: '2026-10-20-1440-arc-clock-activity-motions',
    },
    {
      text: 'The Tasks page gathers every action item from your meetings, with an owner and a due date for each.',
      route: '/tasks',
      release: '2026-10-20-1450-tasks-handover-reserves-cpa-quorum',
    },
  ],
}
