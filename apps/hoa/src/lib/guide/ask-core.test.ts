import { describe, expect, it } from 'vitest'
import { GUIDE_ARTICLES } from '../../generated/guide'
import {
  MIN_SCORE,
  articleLabels,
  buildAskMessages,
  coverageScore,
  isRulesQuestion,
  parseModelReply,
  passesGate,
  retrieve,
  stripLinks,
  suggestionsFrom,
  topScore,
  validateModelReply,
} from './ask-core'

// Runs against the committed generated guide, so these also prove the real
// corpus retrieves and refuses the way /api/help/ask will.

const reply = (over: Partial<{ answer: string; citations: string[]; route: string | null; covered: boolean }> = {}) => ({
  answer: '1. Open Dues from the sidebar. [S1]\n2. Select [[Mark paid]] on the row. [S1]',
  citations: ['S1'],
  route: 'S1',
  covered: true,
  ...over,
})

describe('isRulesQuestion', () => {
  it('routes questions about what the community allows to Ask the Docs', () => {
    for (const q of ['Can I paint my front door red?', 'What does our CC&R say about fences?', 'Are pets allowed by the bylaws?', 'How tall can a fence be?'])
      expect(isRulesQuestion(q), q).toBe(true)
  })
  it('keeps questions about using the app, even with a rules word in them', () => {
    for (const q of ['How do I upload our CC&Rs?', 'How do I record a payment?', 'Where do I see the Ask the Docs page?', 'How do I invite the board?'])
      expect(isRulesQuestion(q), q).toBe(false)
  })

  // What does OUR governing document say / am I allowed to X: Ask the Docs.
  const RULES = [
    'Does our declaration allow solar panels on the roof?',
    'How long can guests park in the driveway?',
    'Can I add a second story to my house?',
    'Are basketball hoops allowed in the driveway?',
    'What do the rules say about trash cans being visible from the street?',
    'How late can I play music on a Saturday night?',
    'Can I rent my home on Airbnb?',
    'Is it ok to put a shed in my backyard?',
    'What does the declaration say about leasing?',
    'Are pickup trucks permitted to park overnight on the street?',
    'Can I install a satellite dish on my roof?',
    'Under our bylaws, how many directors do we need for a quorum?',
    'How many pets can I have?',
    'Can I keep a boat on a trailer in my driveway?',
    'Can I add a screened porch to the back of my house?',
    'Are owners allowed to lease their home for less than a year?',
    'Am I allowed to keep two dogs?',
    'Are short-term rentals allowed in our community?',
  ]
  it.each(RULES)('rules: %s', (q) => expect(isRulesQuestion(q)).toBe(true))

  // How do I use the app to do X, even worded with "allowed", "can I add",
  // "how long can", "declaration" or "rules": the guide.
  const APP = [
    // The six phase-2 questions, in the wording people first wrote them.
    'Our declaration says only 20% of homes can be rented. Where do I set that?',
    'How many more units are allowed to be leased right now?',
    'How long can a text message to residents be?',
    'The rules check said possible conflict on my fence request. What should I do?',
    'The rules check says no clear rules found. Can I still submit?',
    'Can I add a photo to my maintenance request?',
    'How do I set how many homes are allowed to be rented?',
    'What does the rules check on my ARC request look at?',
    'Can I add a line item to a vendor bill?',
    'Can I add another admin to our account?',
    'Am I allowed to edit my ARC application after I submit it?',
    'How do I ask a question about what our CC&Rs say?',
    'How long can a reminder be scheduled before the event?',
    "Can I add a note to a ticket that the resident won't see?",
    'How do I add our declaration to the documents the AI reads?',
    'Can I add a recurring entry for the management fee?',
    'Can I add drawings to my architectural request?',
  ]
  it.each(APP)('app: %s', (q) => expect(isRulesQuestion(q)).toBe(false))
})

describe('retrieve', () => {
  it('numbers at most six sources and finds the right article', () => {
    const s = retrieve('How do I record a check payment?', 'admin')
    expect(s.length).toBeGreaterThan(0)
    expect(s.length).toBeLessThanOrEqual(6)
    expect(s.map((x) => x.id)).toEqual(s.map((_, i) => `S${i + 1}`))
    expect(s[0]!.articleId).toBe('dues-record-payment')
  })

  it('never hands a resident a board section, or a board member a resident one', () => {
    const residentIds = new Set(GUIDE_ARTICLES.filter((a) => a.roles.includes('resident')).map((a) => a.id))
    const forResident = retrieve('How do I pay dues?', 'resident')
    expect(forResident.length).toBeGreaterThan(0)
    expect(forResident.every((x) => residentIds.has(x.articleId))).toBe(true)
    expect(retrieve('How do I pay dues?', 'board').some((x) => residentIds.has(x.articleId))).toBe(false)
  })

  it('board members do not get admin-only articles', () => {
    expect(retrieve('How do I invite another board member?', 'board').some((x) => x.articleId === 'members-invite-board')).toBe(false)
    expect(retrieve('How do I invite another board member?', 'admin')[0]!.articleId).toBe('members-invite-board')
  })

  it('boosts the articles of the page the question was asked from (an id path matches its template)', () => {
    const plain = retrieve('How do I approve it?', 'board')
    const onPage = retrieve('How do I approve it?', 'board', '/violations/0f1c-uuid')
    expect(onPage[0]!.articleId).toBe('violations-report-and-letter')
    expect(plain[0]!.articleId).not.toBe('violations-report-and-letter')
  })
})

describe('the gate', () => {
  it('passes a covered how-to', () => {
    expect(passesGate(retrieve('How do I schedule a board meeting?', 'board'))).toBe(true)
  })

  it('refuses features the guide does not describe, before any model call', () => {
    for (const q of ['Can residents book the clubhouse for a party?', 'How do I sync our books with QuickBooks?', 'Is there a forum where neighbors can chat?']) {
      const s = retrieve(q, 'admin')
      expect(topScore(s), q).toBeLessThan(MIN_SCORE)
      expect(passesGate(s), q).toBe(false)
    }
  })

  it('refuses when nothing is retrieved at all', () => {
    expect(passesGate([])).toBe(false)
    expect(passesGate(retrieve('zzzz qqqq', 'admin'))).toBe(false)
  })

  it('coverage counts a word the guide never uses against the section', () => {
    expect(coverageScore('record payment', 'dues-record-payment#steps')).toBeGreaterThan(coverageScore('record payment clubhouse', 'dues-record-payment#steps'))
  })
})

describe('suggestionsFrom', () => {
  it('lists distinct articles with the audience-correct href', () => {
    const s = suggestionsFrom(retrieve('pay dues balance', 'resident'), 'resident')
    expect(s.length).toBeGreaterThan(0)
    expect(new Set(s.map((x) => x.articleId)).size).toBe(s.length)
    expect(s.every((x) => x.href.startsWith('/resident/help/'))).toBe(true)
  })
})

describe('buildAskMessages', () => {
  it('numbers the sources and carries nothing but sources and the question', () => {
    const sources = retrieve('How do I record a check payment?', 'admin')
    const [system, user] = buildAskMessages('How do I record a check payment?', sources)
    expect(system!.content).toMatch(/ONLY the numbered guide sources/)
    expect(user!.content).toContain('[S1] Record a payment by check or cash')
    expect(user!.content).toMatch(/Question: How do I record a check payment\?$/)
  })
})

describe('parseModelReply', () => {
  it('reads JSON, even fenced', () => {
    expect(parseModelReply('```json\n{"answer":"x [S1]","citations":["S1"],"route":null,"covered":true}\n```')).toEqual({
      answer: 'x [S1]',
      citations: ['S1'],
      route: null,
      covered: true,
    })
  })
  it('returns null for anything that is not a JSON object', () => {
    expect(parseModelReply('Sure! Here is how')).toBeNull()
    expect(parseModelReply('null')).toBeNull()
  })
  it('treats a missing covered flag as not covered', () => {
    expect(parseModelReply('{"answer":"x"}')?.covered).toBe(false)
  })
})

describe('stripLinks', () => {
  it('removes URLs, markdown link targets and app paths, keeps and/or', () => {
    expect(stripLinks('Go to https://evil.example/x now.')).toBe('Go to now.')
    expect(stripLinks('Open [the Dues page](/dues).')).toBe('Open the Dues page.')
    expect(stripLinks('Open /settings/members or (/dues) and/or www.x.com')).toBe('Open or and/or')
    expect(stripLinks('Email mailto:a@b.co')).toBe('Email')
  })
})

describe('validateModelReply — what can reach the client', () => {
  const sources = retrieve('How do I record a check payment?', 'admin')

  it('keeps a cited answer and maps the deep link from the article frontmatter', () => {
    const v = validateModelReply(reply(), sources, 'admin')!
    expect(v.citations).toEqual([
      expect.objectContaining({ articleId: 'dues-record-payment', href: expect.stringMatching(/^\/help\/dues-record-payment#/) }),
    ])
    expect(v.takeMeThere).toEqual({ label: 'Record a payment by check or cash', href: '/dues' })
    expect(v.answer).toContain('[[Mark paid]]')
    expect(v.answer).toContain('[1]')
    expect(v.answer).not.toContain('[S1]')
  })

  it('an intro citation is labelled Overview, not the article title twice', () => {
    const overview = sources.find((x) => x.sectionId === 'overview')
    if (!overview) return
    const v = validateModelReply(reply({ answer: `Use it for checks. [${overview.id}]`, citations: [overview.id] }), sources, 'admin')!
    expect(v.citations[0]!.sectionHeading).toBe('Overview')
  })

  it('drops invented citation ids; with none left there is no answer', () => {
    expect(validateModelReply(reply({ answer: 'Do it. [S9]', citations: ['S9'] }), sources, 'admin')).toBeNull()
    expect(validateModelReply(reply({ answer: 'Do it.', citations: ['https://x', 'S77'] }), sources, 'admin')).toBeNull()
    const v = validateModelReply(reply({ answer: 'Open Dues. [S1] Then pray. [S9]', citations: ['S1', 'S9'] }), sources, 'admin')!
    expect(v.citations).toHaveLength(1)
    expect(v.answer).toBe('Open Dues. [1] Then pray.')
  })

  it('never lets a model URL or path through, and ignores a model-chosen route that was not cited', () => {
    const v = validateModelReply(
      reply({ answer: 'Go to https://phish.example/login or /admin/tenants. [S1]', route: 'S6', citations: ['S1'] }),
      sources,
      'admin',
    )!
    expect(v.answer).not.toMatch(/https?:|phish|\/admin/)
    expect(v.takeMeThere?.href).toBe('/dues')
  })

  it('keeps a [[Label]] chip only when a cited article has that control', () => {
    const v = validateModelReply(reply({ answer: 'Select [[Mark paid]] then [[Refund everyone]]. [S1]' }), sources, 'admin')!
    expect(v.answer).toContain('[[Mark paid]]')
    expect(v.answer).toContain('Refund everyone')
    expect(v.answer).not.toContain('[[Refund everyone]]')
    expect(articleLabels('dues-record-payment').has('Mark paid')).toBe(true)
  })

  it('covered:false, or an empty answer, is not an answer', () => {
    expect(validateModelReply(reply({ covered: false }), sources, 'admin')).toBeNull()
    expect(validateModelReply(reply({ answer: '[S1]' }), sources, 'admin')).toBeNull()
  })

  it('resident citations link to resident help pages and resident routes', () => {
    const rs = retrieve('How do I pay my dues?', 'resident')
    const v = validateModelReply(reply({ answer: 'Select [[Pay dues]]. [S1]' }), rs, 'resident')!
    expect(v.citations.every((c) => c.href.startsWith('/resident/help/resident-portal-basics#'))).toBe(true)
    expect(v.takeMeThere?.href.startsWith('/resident')).toBe(true)
  })
})
