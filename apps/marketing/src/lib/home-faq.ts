// Homepage FAQ. One list feeds both the visible section and the FAQPage
// JSON-LD, so they cannot drift. Every answer restates copy already on the
// site: lib/hoa-pricing.ts, lib/state-law.ts, /security, /pricing's FAQ.
// Imports are relative: marketing-truth tests import this file.

import { HOA_PRICE_COPY } from './hoa-pricing'
import { STATE_COVERAGE_SENTENCE, STATE_LAW_ANSWERS_NOTE } from './state-law'
import type { FaqItem } from './jsonld'

export const HOME_FAQS: readonly FaqItem[] = [
  {
    q: 'What does it cost?',
    a: `${HOA_PRICE_COPY.summary} No card is needed to start the trial.`,
  },
  {
    q: 'Is it only for Georgia?',
    a: `No. Georgia comes first. Dues, violations, documents, accounting, announcements and the inbox work for an HOA in any state. ${STATE_COVERAGE_SENTENCE} State-law answers: ${STATE_LAW_ANSWERS_NOTE}`,
  },
  {
    q: 'Does the AI send anything on its own?',
    a: 'No. Letters, notices, announcements and bills wait for a person. Nothing is sent, filed or entered until the board says so.',
  },
  {
    q: 'Can we export our data?',
    a: 'Yes. You own everything you upload, and we never train on your documents. Board members and admins can download everything at any time from Settings → Your data: one zip with a spreadsheet (CSV) per area.',
  },
  {
    q: 'Who can see our association’s data?',
    a: 'Only your own association. Row-level security in Postgres scopes every read and write to it, and a failing test blocks the merge. Every AI run is logged, and only your own board and admins can read the log.',
  },
  {
    q: 'How do we cancel?',
    a: `${HOA_PRICE_COPY.contract} No data migration is needed.`,
  },
  {
    q: 'Do we need a management company?',
    a: 'No. HomeownerHub is built for self-managed HOAs, where volunteer board members do the paperwork themselves: rules, notices, minutes and money in one system.',
  },
]
