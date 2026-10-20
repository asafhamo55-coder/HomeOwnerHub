/**
 * Built-in message templates (BL-102 A4), available to every HOA with no
 * database rows.
 *
 * Before this, the starter templates were seeded for one org only, and a
 * new HOA's composer said "No Announcement templates yet". These live in
 * code, so every association has them on day one.
 *
 * Rules every template here follows (built-in-templates.test.ts enforces
 * them):
 *
 *   - Plain language. Short sentences, no jargon, no legal citations.
 *   - The only merge fields are ones the send path can fill: the template's
 *     own questions, plus {{ recipient_name }} and {{ association_name }},
 *     which the send supplies for every recipient (merge-bag.ts).
 *   - Every optional question has a non-empty fallback, so an unanswered
 *     one still renders under the strict render and the message can be
 *     scheduled.
 *
 * Synthetic examples only (Elm St, Lakeside HOA) — no real people.
 */

import type { TemplateQuestion } from '@/lib/community-templates/types'

export type BuiltInCategory = 'dues' | 'meeting' | 'emergency' | 'announcement' | 'welcome'

export interface BuiltInTemplate {
  /** Prefixed so it can never be mistaken for a communication_templates
   *  uuid. The send stores template_id = null for these. */
  id: `builtin:${string}`
  name: string
  description: string
  category: BuiltInCategory
  channels: Array<'email' | 'portal' | 'sms'>
  subject: string
  bodyHtml: string
  questions: readonly TemplateQuestion[]
}

export const BUILT_IN_PREFIX = 'builtin:'

export function isBuiltInTemplateId(id: string): boolean {
  return id.startsWith(BUILT_IN_PREFIX)
}

const SIGN_OFF = '<p>Thank you,<br>{{ association_name }} Board</p>'

export const BUILT_IN_TEMPLATES: readonly BuiltInTemplate[] = [
  {
    id: 'builtin:dues-reminder',
    name: 'Dues reminder',
    description: 'A friendly reminder that dues are coming up, with how to pay.',
    category: 'dues',
    channels: ['email', 'portal'],
    subject: 'Reminder: {{ dues_period }} dues are due {{ due_date }}',
    bodyHtml: [
      '<p>Hi {{ recipient_name }},</p>',
      '<p>This is a friendly reminder that {{ dues_period }} dues of {{ amount }} are due on {{ due_date }}.</p>',
      '<p><strong>How to pay:</strong> {{ payment_instructions }}</p>',
      '<p>If you have already paid, thank you. You can ignore this message. If you have a question about your account, reply to this email.</p>',
      SIGN_OFF,
    ].join('\n'),
    questions: [
      { id: 'dues_period', label: 'Which dues?', type: 'text', required: true, help: 'For example: fourth-quarter 2026' },
      { id: 'amount', label: 'Amount per home', type: 'text', required: true, help: 'For example: $250' },
      { id: 'due_date', label: 'Due date', type: 'date', required: true },
      {
        id: 'payment_instructions',
        label: 'How to pay',
        type: 'textarea',
        required: false,
        help: 'Leave blank to point people to the resident portal.',
        fallback: 'Sign in to the resident portal and choose Pay.',
      },
    ],
  },
  {
    id: 'builtin:meeting-notice',
    name: 'Meeting notice',
    description: 'Tell owners when and where the next meeting is, and what is on the agenda.',
    category: 'meeting',
    channels: ['email', 'portal'],
    subject: '{{ meeting_type }} on {{ meeting_date }}',
    bodyHtml: [
      '<p>Hi {{ recipient_name }},</p>',
      '<p>You are invited to the next {{ association_name }} meeting.</p>',
      '<p><strong>What:</strong> {{ meeting_type }}<br><strong>When:</strong> {{ meeting_date }} at {{ meeting_time }}<br><strong>Where:</strong> {{ meeting_location }}</p>',
      '<p><strong>Agenda:</strong> {{ agenda }}</p>',
      '<p>All owners are welcome. If you have a question for the board, bring it to the meeting or reply to this email.</p>',
      SIGN_OFF,
    ].join('\n'),
    questions: [
      {
        id: 'meeting_type',
        label: 'Type of meeting',
        type: 'select',
        options: ['Board meeting', 'Annual members’ meeting', 'Special members’ meeting'],
        required: true,
      },
      { id: 'meeting_date', label: 'Date', type: 'date', required: true },
      { id: 'meeting_time', label: 'Start time', type: 'time', required: true },
      {
        id: 'meeting_location',
        label: 'Where',
        type: 'text',
        required: true,
        help: 'An address, a room, or a video link. For example: Clubhouse, 100 Elm St',
      },
      {
        id: 'agenda',
        label: 'Agenda',
        type: 'textarea',
        required: false,
        help: 'The main topics. Leave blank if it isn’t ready yet.',
        fallback: 'The agenda will be shared before the meeting.',
      },
    ],
  },
  {
    id: 'builtin:water-shutoff',
    name: 'Water shutoff',
    description: 'Warn homes about a planned water shutoff and how to get ready.',
    category: 'emergency',
    channels: ['email', 'portal'],
    subject: 'Water shutoff on {{ shutoff_date }}, {{ start_time }} to {{ end_time }}',
    bodyHtml: [
      '<p>Hi {{ recipient_name }},</p>',
      '<p>The water will be off on <strong>{{ shutoff_date }}</strong> from <strong>{{ start_time }} to {{ end_time }}</strong> for {{ shutoff_reason }}.</p>',
      '<p><strong>Homes affected:</strong> {{ affected_area }}</p>',
      '<p>To get ready:</p>',
      '<ul><li>Fill a few jugs or a large pot with water for drinking and cooking.</li><li>Don’t run the dishwasher or washing machine while the water is off.</li><li>When the water comes back, run a cold tap for a minute to clear any air or cloudy water.</li></ul>',
      '<p>We’ll let you know if the timing changes. Thank you for your patience.</p>',
      SIGN_OFF,
    ].join('\n'),
    questions: [
      { id: 'shutoff_date', label: 'Date', type: 'date', required: true },
      { id: 'start_time', label: 'Water off at', type: 'time', required: true },
      { id: 'end_time', label: 'Water back by', type: 'time', required: true },
      {
        id: 'affected_area',
        label: 'Which homes?',
        type: 'text',
        required: true,
        help: 'For example: all homes on Elm St and Maple Ct',
      },
      {
        id: 'shutoff_reason',
        label: 'Why?',
        type: 'text',
        required: false,
        help: 'For example: a water main repair',
        fallback: 'planned repair work',
      },
    ],
  },
  {
    id: 'builtin:pool-closing',
    name: 'Pool closing',
    description: 'Let residents know the pool is closing, why, and when it reopens.',
    category: 'announcement',
    channels: ['email', 'portal'],
    subject: 'The pool closes {{ closing_date }}',
    bodyHtml: [
      '<p>Hi {{ recipient_name }},</p>',
      '<p>The community pool will close on <strong>{{ closing_date }}</strong> for {{ closing_reason }}.</p>',
      '<p><strong>Reopening:</strong> {{ reopening }}</p>',
      '<p>Please stay out of the pool area while it is closed. Thank you for helping keep everyone safe.</p>',
      SIGN_OFF,
    ].join('\n'),
    questions: [
      { id: 'closing_date', label: 'Closing date', type: 'date', required: true },
      {
        id: 'closing_reason',
        label: 'Why is it closing?',
        type: 'text',
        required: false,
        help: 'For example: repairs to the pool deck',
        fallback: 'the season',
      },
      {
        id: 'reopening',
        label: 'When will it reopen?',
        type: 'text',
        required: false,
        help: 'For example: Saturday, May 22, 2027. Leave blank if you don’t know yet.',
        fallback: 'We’ll let you know as soon as we have a date.',
      },
    ],
  },
  {
    id: 'builtin:holiday-office-closure',
    name: 'Holiday office closure',
    description: 'Tell residents the office is closed for a holiday and who to call in an emergency.',
    category: 'announcement',
    channels: ['email', 'portal'],
    subject: 'Office closed for {{ holiday }}',
    bodyHtml: [
      '<p>Hi {{ recipient_name }},</p>',
      '<p>The {{ association_name }} office will be closed for {{ holiday }} starting {{ closed_from }}. We’ll be back on {{ back_on }}.</p>',
      '<p>Messages sent while we’re closed will be answered when we’re back.</p>',
      '<p>For an urgent problem while we’re closed, such as a water leak, {{ emergency_contact }}. In a fire or medical emergency, call 911.</p>',
      '<p>Happy holidays,<br>{{ association_name }} Board</p>',
    ].join('\n'),
    questions: [
      { id: 'holiday', label: 'Which holiday?', type: 'text', required: true, help: 'For example: Thanksgiving' },
      { id: 'closed_from', label: 'Closed from', type: 'date', required: true },
      { id: 'back_on', label: 'Back open on', type: 'date', required: true },
      {
        id: 'emergency_contact',
        label: 'Who to call for something urgent',
        type: 'text',
        required: false,
        help: 'Start with a verb. For example: call Lakeside Property Services at 555-0100',
        fallback: 'use the emergency contact listed in the resident portal',
      },
    ],
  },
  {
    id: 'builtin:welcome-new-owner',
    name: 'Welcome new owner',
    description: 'Welcome a new owner and tell them where to start.',
    category: 'welcome',
    channels: ['email', 'portal'],
    subject: 'Welcome to {{ association_name }}',
    bodyHtml: [
      '<p>Hi {{ recipient_name }},</p>',
      '<p>Welcome to {{ association_name }}! We’re glad you’re here.</p>',
      '<p>{{ first_steps }}</p>',
      '<p>If you have a question, {{ board_contact }}.</p>',
      '<p>Welcome home,<br>{{ association_name }} Board</p>',
    ].join('\n'),
    questions: [
      {
        id: 'first_steps',
        label: 'Where to start',
        type: 'textarea',
        required: false,
        help: 'Anything a new owner should know first, like trash day or the gate code process.',
        fallback: 'Sign in to the resident portal to see your account, pay dues and read the community rules.',
      },
      {
        id: 'board_contact',
        label: 'How to reach the board',
        type: 'text',
        required: false,
        help: 'Start with a verb. For example: email the board at board@lakesidehoa.example',
        fallback: 'just reply to this email',
      },
    ],
  },
  {
    id: 'builtin:severe-weather',
    name: 'Severe weather',
    description: 'Help residents get ready for a storm that is on the way.',
    category: 'emergency',
    channels: ['email', 'portal'],
    subject: 'Severe weather expected {{ expected_when }}',
    bodyHtml: [
      '<p>Hi {{ recipient_name }},</p>',
      '<p>Forecasters expect {{ storm_name }} {{ expected_when }}. Please take a few minutes to get ready.</p>',
      '<ul><li>{{ prep_steps }}</li><li>Charge your phone and keep a flashlight and water handy.</li><li>Check on neighbors who may need help.</li><li>Follow instructions from local officials. If you are told to leave, go.</li></ul>',
      '<p>{{ amenities_status }}</p>',
      '<p>In an emergency, call 911. Stay safe.</p>',
      '<p>{{ association_name }} Board</p>',
    ].join('\n'),
    questions: [
      {
        id: 'storm_name',
        label: 'What is coming?',
        type: 'text',
        required: true,
        help: 'For example: Hurricane Milo, or a winter storm',
      },
      {
        id: 'expected_when',
        label: 'When?',
        type: 'text',
        required: true,
        help: 'For example: Wednesday night into Thursday',
      },
      {
        id: 'prep_steps',
        label: 'What should residents do?',
        type: 'textarea',
        required: false,
        help: 'Leave blank for the usual advice.',
        fallback: 'Bring in patio furniture, trash bins and anything else the wind could pick up.',
      },
      {
        id: 'amenities_status',
        label: 'Pool, clubhouse and other shared spaces',
        type: 'text',
        required: false,
        help: 'For example: The pool and clubhouse are closed until Friday.',
        fallback: 'Shared spaces like the pool may close until it is safe.',
      },
    ],
  },
]
