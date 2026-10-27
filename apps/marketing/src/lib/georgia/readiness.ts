// The SB 406 readiness check: ten yes/no questions, scored in the browser.
// Nothing is stored or sent. Pure functions, so the tests can drive them.

export interface ReadinessQuestion {
  id: string
  question: string
  /** What to do when the answer is no (shown in the checklist). */
  action: string
  /** Slug of the guide that covers it. */
  guide: string
}

export const READINESS_QUESTIONS: readonly ReadinessQuestion[] = [
  {
    id: 'statute',
    question: 'Do you know whether your association is under the Condominium Act or the Property Owners’ Association Act?',
    action: 'Confirm with your attorney which statute governs, so you use the right deadlines.',
    guide: 'condo-vs-hoa-law',
  },
  {
    id: 'decision',
    question: 'Has the board voted to register with the Secretary of State, or to opt out in writing?',
    action: 'Put “register or opt out” on the next agenda and record the vote.',
    guide: 'registration-2027',
  },
  {
    id: 'filing-pack',
    question: 'Do you have your governing documents and a financial statement dated within the past year ready to file?',
    action: 'Gather the recorded governing documents and produce a current balance sheet and income statement.',
    guide: 'registration-2027',
  },
  {
    id: 'renewal',
    question: 'Is someone responsible for renewing by December 31 and for filing an amendment within 30 days of an officer change?',
    action: 'Name the person and put both dates on the board calendar.',
    guide: 'registration-2027',
  },
  {
    id: 'fee-notice',
    question: 'Does your delinquency process send the written attorney’s-fee notice, by certified mail or overnight delivery, and wait 30 days from receipt?',
    action: 'Add the fee notice and a delivery log before any attorney’s fees are claimed.',
    guide: 'attorney-fee-notice',
  },
  {
    id: 'sixty-day',
    question: 'Is your notice before foreclosure ready for 60 days and the statement that paying before day 60 ends the right to foreclose?',
    action: 'Update the template before January 1, 2027 and have your attorney review it.',
    guide: 'foreclosure-threshold-2027',
  },
  {
    id: 'threshold',
    question: 'Do you know which part of an owner’s balance counts toward the 2027 foreclosure threshold (regular dues, not fines or late fees)?',
    action: 'Split each delinquent balance into regular dues and fees, and learn the new threshold.',
    guide: 'foreclosure-threshold-2027',
  },
  {
    id: 'late-fee',
    question: 'Is your late fee authorized by your declaration and within the greater of $10 or 10 percent of the late installment?',
    action: 'Find the authorizing language and check the fee against the cap.',
    guide: 'late-fee-limits',
  },
  {
    id: 'records',
    question: 'Could you hand an owner three years of balance sheets, budgets, income statements and bank statements, plus the insurance certificate, after a written request?',
    action: 'Collect those records in one folder and name an officer to answer requests.',
    guide: 'owners-rights-2027',
  },
  {
    id: 'complaint',
    question: 'If an owner filed a complaint with the Secretary of State, could you pause fines and fees on that home the same day?',
    action: 'Write a short complaint procedure and tell your manager and bookkeeper.',
    guide: 'complaint-process',
  },
]

export interface ReadinessResult {
  /** Number answered yes. */
  yes: number
  total: number
  /** Questions answered no, in order. */
  open: ReadinessQuestion[]
  /** Plain headline for the score. */
  headline: string
}

/** answers[id] === true means yes. A missing answer counts as not yet. */
export function scoreReadiness(answers: Readonly<Record<string, boolean | undefined>>): ReadinessResult {
  const open = READINESS_QUESTIONS.filter((q) => answers[q.id] !== true)
  const yes = READINESS_QUESTIONS.length - open.length
  const total = READINESS_QUESTIONS.length
  const headline =
    open.length === 0
      ? 'You are ready on all ten points. Have your attorney confirm the details.'
      : open.length === total
        ? 'Nothing is in place yet. That is normal, and the list below is a start.'
        : `${open.length} ${open.length === 1 ? 'item is' : 'items are'} still open.`
  return { yes, total, open, headline }
}
