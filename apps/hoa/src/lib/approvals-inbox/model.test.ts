import { describe, expect, it } from 'vitest'
import {
  approvalsBadge,
  arcItems,
  billItems,
  contactItems,
  decisionId,
  openingItems,
  buildInbox,
  canUseApprovals,
  parseApprovalFilter,
  vendorItems,
  vendorNeedsBoard,
  w18Items,
  w3Items,
  type InboxSection,
} from './model'

const T1 = '2026-10-01T10:00:00.000Z'
const T2 = '2026-10-02T10:00:00.000Z'
const T3 = '2026-10-03T10:00:00.000Z'

describe('canUseApprovals (role gate)', () => {
  it('lets board and admin in', () => {
    expect(canUseApprovals('board')).toBe(true)
    expect(canUseApprovals('admin')).toBe(true)
  })
  it('keeps residents, unknown roles and no role out', () => {
    expect(canUseApprovals('resident')).toBe(false)
    expect(canUseApprovals('owner')).toBe(false)
    expect(canUseApprovals(null)).toBe(false)
    expect(canUseApprovals(undefined)).toBe(false)
  })
})

describe('parseApprovalFilter', () => {
  it('accepts each source and defaults to all', () => {
    expect(parseApprovalFilter('w18')).toBe('w18')
    expect(parseApprovalFilter('w3')).toBe('w3')
    expect(parseApprovalFilter('vendor')).toBe('vendor')
    expect(parseApprovalFilter(undefined)).toBe('all')
    expect(parseApprovalFilter('')).toBe('all')
    expect(parseApprovalFilter('drop table')).toBe('all')
    expect(parseApprovalFilter(['w3', 'w18'])).toBe('w3')
  })
})

describe('w18Items', () => {
  const proposal = (id: string, subject: string, at: string, amount: number | string | null = 250) => ({
    id,
    subject_id: subject,
    summary: `Zelle ${id}`,
    amount,
    proposed_at: at,
  })

  it('maps a proposal to a decidable item with amount and the latest matcher notes', () => {
    const items = w18Items(
      [proposal('p1', 't1', T1, '250.00')],
      [
        { input: { bankTransactionId: 't1' }, output: { notes: 'older run', confidence: 0.5 }, created_at: T1 },
        { input: { bankTransactionId: 't1' }, output: { notes: 'exact memo match', confidence: 0.99 }, created_at: T2 },
      ],
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      source: 'w18',
      id: 'p1',
      title: 'Zelle p1',
      amount: 250,
      createdAt: T1,
      reasoning: 'exact memo match',
      confidenceLabel: '99% confident',
      decision: { kind: 'w18', approvalRequestId: 'p1' },
    })
  })

  it('has no reasoning (not a made-up one) when the run is missing or notes failed to load', () => {
    expect(w18Items([proposal('p1', 't1', T1)], [])[0].reasoning).toBeNull()
    expect(w18Items([proposal('p1', 't1', T1)], null)[0].reasoning).toBeNull()
  })

  it('keeps a null amount null rather than $0', () => {
    expect(w18Items([proposal('p1', 't1', T1, null)], [])[0].amount).toBeNull()
  })
})

describe('w3Items', () => {
  it('maps a pending W3 run with fine, citations and reasoning, decidable in one click (BL-048)', () => {
    const [item] = w3Items([
      {
        id: 'r1',
        created_at: T2,
        input: { violationType: 'landscaping' },
        output: {
          notice: 'Please trim the hedge.',
          citedSection: 'CC&R §4.2',
          recommendedFineAmountCents: 2500,
          confidence: 'HIGH',
        },
        citations: ['chunk-1'],
        reasoning_trace: 'The hedge exceeds the height limit.',
      },
    ])
    expect(item).toMatchObject({
      source: 'w3',
      id: 'r1',
      title: 'Landscaping',
      detail: 'Please trim the hedge.',
      amount: 25,
      amountNote: 'per day',
      createdAt: T2,
      reasoning: 'The hedge exceeds the height limit.',
      citations: ['CC&R §4.2'],
      confidenceLabel: 'High confidence',
      decision: { kind: 'w3', runId: 'r1' },
    })
    expect(item.href).toBe('/violations/approval-queue')
  })

  it('tolerates a run with no output fields, and offers no approve for a draft with no letter text', () => {
    const [item] = w3Items([
      { id: 'r2', created_at: T1, input: null, output: null, citations: null, reasoning_trace: null },
    ])
    expect(item).toMatchObject({ title: 'Violation notice', amount: null, citations: [], reasoning: null, decision: null })
  })

  it('truncates a long notice', () => {
    const [item] = w3Items([
      { id: 'r3', created_at: T1, input: {}, output: { notice: 'x'.repeat(500) }, citations: null, reasoning_trace: null },
    ])
    expect(item.detail!.length).toBeLessThanOrEqual(241)
    expect(item.detail!.endsWith('…')).toBe(true)
  })
})

describe('vendor queue predicate and items', () => {
  const vendor = (id: string, status: string, coi: string | null, deficiencies: { code: string; severity: string; detail: string }[] = []) => ({
    id,
    legal_name: `Vendor ${id}`,
    status,
    created_at: T1,
    compliance: coi === null ? null : { status: coi, deficiencies, last_reviewed_at: T3 },
  })

  it('matches the vendor approval queue: green prospects and yellow/red/missing', () => {
    expect(vendorNeedsBoard(vendor('a', 'prospect', 'green'))).toBe(true)
    expect(vendorNeedsBoard(vendor('b', 'active', 'green'))).toBe(false)
    expect(vendorNeedsBoard(vendor('c', 'active', 'yellow'))).toBe(true)
    expect(vendorNeedsBoard(vendor('d', 'prospect', 'red'))).toBe(true)
    expect(vendorNeedsBoard(vendor('e', 'prospect', 'missing'))).toBe(true)
    expect(vendorNeedsBoard(vendor('f', 'prospect', null))).toBe(false)
  })

  it('only a compliant prospect can be approved; any prospect can be rejected; active vendors link to review', () => {
    const items = vendorItems([
      vendor('a', 'prospect', 'green'),
      vendor('b', 'active', 'green'),
      vendor('c', 'active', 'red', [{ code: 'gl', severity: 'high', detail: 'GL below $1M' }]),
      vendor('d', 'prospect', 'yellow'),
    ])
    expect(items.map((i) => i.id)).toEqual(['a', 'c', 'd'])
    expect(items[0].decision).toEqual({ kind: 'vendor', vendorId: 'a', canApprove: true })
    expect(items[1].decision).toBeNull()
    expect(items[2].decision).toEqual({ kind: 'vendor', vendorId: 'd', canApprove: false })
    expect(items[1].reasoning).toBe('GL below $1M')
    expect(items[1].href).toBe('/vendors/c')
    expect(items[0].amount).toBeNull()
  })
})

describe('buildInbox (aggregation)', () => {
  const ok = (source: 'w18' | 'bill' | 'opening' | 'w3' | 'collections' | 'arc' | 'contact' | 'join' | 'vendor', n: number, total = n): InboxSection => ({
    source,
    ok: true,
    total,
    items: Array.from({ length: n }, (_, i) => ({
      source,
      id: `${source}-${i}`,
      title: 't',
      detail: null,
      amount: null,
      amountNote: null,
      createdAt: T1,
      reasoning: null,
      citations: [],
      confidenceLabel: null,
      href: '/',
      decision: null,
    })),
  })

  it('counts each source and the total from the totals, not just the rows shown', () => {
    const inbox = buildInbox([ok('w18', 2, 120), ok('bill', 2), ok('opening', 0), ok('w3', 1), ok('collections', 4), ok('arc', 3), ok('contact', 2), ok('join', 0), ok('vendor', 0)], 'all')
    expect(inbox.counts).toEqual({ w18: 120, bill: 2, opening: 0, w3: 1, collections: 4, arc: 3, contact: 2, join: 0, vendor: 0 })
    expect(inbox.total).toBe(132)
    expect(inbox.anyFailed).toBe(false)
    expect(inbox.allClear).toBe(false)
    expect(inbox.sections.map((s) => s.source)).toEqual(['w18', 'bill', 'opening', 'w3', 'collections', 'arc', 'contact', 'join', 'vendor'])
  })

  it('a failed source has an unknown count and the total is unknown — never 0', () => {
    const inbox = buildInbox([ok('w18', 0), ok('bill', 0), ok('opening', 0), { source: 'w3', ok: false }, ok('collections', 0), ok('arc', 0), ok('contact', 0), ok('vendor', 0)], 'all')
    expect(inbox.counts.w3).toBeNull()
    expect(inbox.total).toBeNull()
    expect(inbox.anyFailed).toBe(true)
    expect(inbox.allClear, 'empty-but-failed is not inbox zero').toBe(false)
    expect(inbox.sections.find((s) => s.source === 'w3')).toEqual({ source: 'w3', ok: false })
  })

  it('is all clear only when every source loaded and is empty', () => {
    expect(buildInbox([ok('w18', 0), ok('bill', 0), ok('opening', 0), ok('w3', 0), ok('collections', 0), ok('arc', 0), ok('contact', 0), ok('join', 0), ok('vendor', 0)], 'all').allClear).toBe(true)
    // BL-143: a join-request source that never loaded is unknown, not empty.
    expect(buildInbox([ok('w18', 0), ok('bill', 0), ok('opening', 0), ok('w3', 0), ok('collections', 0), ok('arc', 0), ok('contact', 0), ok('vendor', 0)], 'all').allClear).toBe(false)
    // BL-089: a collections-letter source that never loaded is unknown, not empty.
    expect(buildInbox([ok('w18', 0), ok('bill', 0), ok('opening', 0), ok('w3', 0), ok('arc', 0), ok('contact', 0), ok('vendor', 0)], 'all').allClear).toBe(false)
    // PR-10: a contact source that never loaded is unknown, not empty.
    expect(buildInbox([ok('w18', 0), ok('bill', 0), ok('opening', 0), ok('w3', 0), ok('arc', 0), ok('vendor', 0)], 'all').allClear).toBe(false)
    // BL-027: an ARC source that never loaded is unknown, not empty.
    expect(buildInbox([ok('w18', 0), ok('bill', 0), ok('opening', 0), ok('w3', 0), ok('vendor', 0)], 'all').allClear).toBe(false)
    // BL-021: a bill source that never loaded is unknown, not empty.
    expect(buildInbox([ok('w18', 0), ok('w3', 0), ok('vendor', 0)], 'all').allClear).toBe(false)
  })

  it('a type filter shows only that section but keeps every count for the tabs', () => {
    const inbox = buildInbox([ok('w18', 2), ok('bill', 4), ok('opening', 0), ok('w3', 1), ok('collections', 3), ok('arc', 2), ok('contact', 1), ok('join', 0), { source: 'vendor', ok: false }], 'w3')
    expect(inbox.sections.map((s) => s.source)).toEqual(['w3'])
    expect(inbox.counts).toEqual({ w18: 2, bill: 4, opening: 0, w3: 1, collections: 3, arc: 2, contact: 1, join: 0, vendor: null })
  })

  it('orders sections by source regardless of input order', () => {
    const inbox = buildInbox([ok('vendor', 1), ok('contact', 1), ok('arc', 1), ok('collections', 1), ok('w3', 1), ok('bill', 1), ok('w18', 1)], 'all')
    expect(inbox.sections.map((s) => s.source)).toEqual(['w18', 'bill', 'w3', 'collections', 'arc', 'contact', 'vendor'])
  })
})

describe('approvalsBadge (sidebar)', () => {
  it('shows the total when every count loaded', () => {
    expect(approvalsBadge({ w18: 2, bill: 1, opening: 0, w3: 1, collections: 0, arc: 0, contact: 0, join: 0, vendor: 0 })).toBe('4')
  })
  it('shows no badge for zero', () => {
    expect(approvalsBadge({ w18: 0, bill: 0, opening: 0, w3: 0, collections: 0, arc: 0, contact: 0, join: 0, vendor: 0 })).toBeNull()
  })
  it('shows no badge — not 0 — when a count failed and nothing else is known', () => {
    expect(approvalsBadge({ w18: null, bill: 0, opening: 0, w3: 0, collections: 0, arc: 0, contact: 0, join: 0, vendor: 0 })).toBeNull()
    expect(approvalsBadge({ w18: null, bill: null, opening: 0, w3: null, collections: 0, arc: 0, contact: 0, join: 0, vendor: null })).toBeNull()
  })
  it('marks a partial count as a lower bound', () => {
    expect(approvalsBadge({ w18: 2, bill: null, opening: 0, w3: null, collections: 0, arc: 0, contact: 0, join: 0, vendor: 1 })).toBe('3+')
  })
  it('caps at 99+', () => {
    expect(approvalsBadge({ w18: 150, bill: 0, opening: 0, w3: 0, collections: 0, arc: 0, contact: 0, join: 0, vendor: 0 })).toBe('99+')
  })
})

describe('billItems (BL-021)', () => {
  const V = '11111111-1111-4111-8111-111111111111'
  const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const complete = {
    kind: 'w36.ap_bill',
    version: 1,
    associationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    aiRunId: 'run-1',
    storagePath: 'org/bills/x.pdf',
    contentType: 'application/pdf',
    source: 'pdf_text',
    vendor: {
      extractedName: 'Sample Landscaping Co',
      nameConfidence: 'high',
      vendorId: V,
      vendorLabel: 'Sample Landscaping Co',
      match: 'exact',
      matchConfidence: 'high',
    },
    invoiceNumber: { value: 'SL-2210', confidence: 'high' },
    invoiceDate: { value: '2026-10-01', confidence: 'high' },
    dueDate: { value: '2026-10-31', confidence: 'high' },
    total: { value: 1200, confidence: 'high' },
    lineItems: [{ description: 'Mowing', amount: 1200 }],
    expenseAccount: { accountId: A, label: '5100 — Landscaping', reasoning: 'Grounds work.', confidence: 'high' },
    warnings: [],
  }
  const row = (payload: unknown) => ({ id: 'b1', summary: 'Bill from Sample Landscaping Co · #SL-2210', amount: 1200, proposed_at: T1, payload })

  it('a complete, confident bill is approvable in one click, with the GL reasoning', () => {
    const [item] = billItems([row(complete)])
    expect(item).toMatchObject({
      source: 'bill',
      title: 'Bill from Sample Landscaping Co · #SL-2210',
      amount: 1200,
      reasoning: 'Grounds work.',
      confidenceLabel: 'High confidence',
      detail: null,
      decision: { kind: 'bill', approvalRequestId: 'b1', canApprove: true },
    })
    expect(item!.bill).toMatchObject({ missing: [], needsCheck: [] })
  })

  it('low-confidence fields are named on the card and still approvable', () => {
    const p = { ...complete, total: { value: 1200, confidence: 'low' }, invoiceNumber: { value: 'SL-22l0', confidence: 'medium' } }
    const [item] = billItems([row(p)])
    expect(item!.detail).toBe('Check the invoice number and total against the bill before approving.')
    expect(item!.confidenceLabel).toBe('2 fields to check')
    expect(item!.decision).toMatchObject({ canApprove: true })
  })

  it('a missing field makes it reject-only, and says what is missing', () => {
    const p = { ...complete, vendor: { ...complete.vendor, vendorId: null, vendorLabel: null, match: 'none', matchConfidence: 'low' } }
    const [item] = billItems([row(p)])
    expect(item!.detail).toBe('Missing a vendor on file. Fill it in with Edit details, or reject it.')
    expect(item!.confidenceLabel).toBe('Incomplete')
    expect(item!.decision).toMatchObject({ canApprove: false })
    // BL-059: still a readable bill, so the card offers the edit.
    expect(item!.bill).toBeDefined()
  })

  it('several missing fields read as a list (BL-059)', () => {
    const p = { ...complete, invoiceNumber: { value: null, confidence: 'low' }, total: { value: null, confidence: 'low' } }
    const [item] = billItems([row(p)])
    expect(item!.detail).toBe('Missing the invoice number and the total. Fill them in with Edit details, or reject it.')
  })

  it('a board-picked vendor is not flagged for checking (BL-059)', () => {
    const p = {
      ...complete,
      vendor: { ...complete.vendor, match: 'manual', matchConfidence: 'high', nameConfidence: 'low' },
      humanEdits: { fields: ['vendor'], editedBy: '11111111-1111-4111-8111-111111111111', editedAt: '2026-10-17T12:00:00.000Z' },
    }
    const [item] = billItems([row(p)])
    expect(item!.bill?.needsCheck).toEqual([])
    expect(item!.bill?.payload.humanEdits?.fields).toEqual(['vendor'])
  })

  it('an unreadable payload is reject-only and says so — no invented fields', () => {
    const [item] = billItems([row({ demo: true })])
    expect(item!.bill).toBeUndefined()
    expect(item!.reasoning).toBeNull()
    expect(item!.decision).toMatchObject({ canApprove: false })
    expect(item!.detail).toMatch(/couldn’t be read/)
  })

  it('the bill source has its own tab', () => {
    expect(parseApprovalFilter('bill')).toBe('bill')
  })
})

describe('arcItems (BL-027)', () => {
  const ARC = '44444444-4444-4444-8444-444444444444'
  const output = {
    mode: 'review',
    status: 'answered',
    summary: 'Front fences are limited to 4 feet.',
    confidence: 'HIGH',
    rules: [
      { chunkId: 'c1', documentId: 'd1', docType: 'rules', section: '4.2', point: 'Front fences may not exceed 4 feet.', status: 'possible_conflict' },
      { chunkId: 'c2', documentId: 'd1', docType: 'rules', section: '4.2', point: 'No chain-link.', status: 'fits' },
    ],
    questions: [],
    missingInfo: [],
    suggestion: { decision: 'deny', reasoning: 'The fence is 6 feet in the front yard.', conditions: [] },
    warnings: [],
    disclaimer: 'A suggestion only.',
  }

  it('maps a pending W37 draft to an item decided by the ARC actions', () => {
    const [item] = arcItems([{ id: 'r1', created_at: T1, input: { mode: 'review', arcRequestId: ARC, facts: { summary: 'Front fence' } }, output }], {
      associationName: 'Maple Ridge HOA',
    })
    expect(item).toMatchObject({
      source: 'arc',
      id: 'r1',
      title: 'Front fence',
      detail: 'Front fences are limited to 4 feet.',
      reasoning: 'The fence is 6 feet in the front yard.',
      citations: ['Rules § 4.2'],
      confidenceLabel: 'Suggests: Deny',
      href: `/arc/${ARC}`,
      decision: { kind: 'arc', runId: 'r1', arcId: ARC },
    })
    // BL-079: a full decision letter per action, signed for the association.
    expect(item!.arc?.drafts.deny).toContain('Re: Your architectural review application — Front fence')
    expect(item!.arc?.drafts.deny).toContain('- Rules § 4.2: Front fences may not exceed 4 feet.')
    expect(item!.arc?.drafts.deny).toMatch(/Maple Ridge HOA$/)
    expect(Object.keys(item!.arc!.drafts).sort()).toEqual(['approve', 'approve_with_conditions', 'deny', 'need_more_info'])
    expect(decisionId(item!.decision!)).toBe('r1')
  })

  it('a refusal still lists, with no suggestion', () => {
    const [item] = arcItems([
      { id: 'r2', created_at: T2, input: { arcRequestId: ARC, facts: { summary: 'Lawn' } }, output: { ...output, status: 'no_rules', rules: [], suggestion: null } },
    ])
    expect(item).toMatchObject({ confidenceLabel: 'No suggestion', reasoning: null, citations: [] })
    expect(item!.arc?.suggestion).toBeNull()
  })

  it('skips a run that names no application', () => {
    expect(arcItems([{ id: 'r3', created_at: T3, input: {}, output }])).toEqual([])
  })
})

describe('contactItems (PR-10)', () => {
  const ticket = (id: string) => ({
    id,
    unit_id: 'u1',
    submitted_by: 'user-1',
    subject: 'Contact details update',
    description: '',
    status: 'open',
    created_at: T1,
  })
  const ctx = {
    request: { signInEmail: 'pat@example.test', changes: { phone: '(555) 222-3333', mailing: null } },
    submitterId: 'user-1',
    residents: [{ id: 'r1', full_name: 'Pat Example', email: 'pat@example.test', phone: '(555) 123-4567', notes: 'Mailing address: PO Box 1', role: 'owner' }],
    ownerships: [],
    tenancies: [],
    property: null,
  }
  const entry = (over: Record<string, unknown> = {}) => ({
    ticket: ticket('tk1'),
    request: ctx.request,
    home: '12 Oak Street',
    propertyId: 'p1',
    current: { phone: '(555) 123-4567', email: 'pat@example.test', mailing: 'PO Box 1' },
    context: ctx,
    ...over,
  })

  it('shows each change from -> to, who it is for, and is approvable when it can apply', () => {
    const [item] = contactItems([ticket('tk1')], [entry() as never])
    expect(item).toMatchObject({
      source: 'contact',
      title: 'Contact details — 12 Oak Street',
      detail: 'From Pat Example',
      href: '/tickets/tk1',
      decision: { kind: 'contact', ticketId: 'tk1', canApprove: true },
    })
    expect(item!.contact!.changes).toEqual([
      { label: 'Phone', from: '(555) 123-4567', to: '(555) 222-3333' },
      { label: 'Mailing address', from: 'PO Box 1', to: 'Same as the home' },
    ])
    expect(item!.contact!.problem).toBeNull()
  })

  it('withholds approve, and says why, when nothing on the home is theirs', () => {
    const [item] = contactItems([ticket('tk1')], [entry({ context: { ...ctx, residents: [] } }) as never])
    expect(item!.decision).toEqual({ kind: 'contact', ticketId: 'tk1', canApprove: false })
    expect(item!.contact!.problem).toMatch(/Nothing on file/)
  })

  it('a ticket that is not a readable request still lists, with no decision', () => {
    const [item] = contactItems([ticket('tk2')], [])
    expect(item).toMatchObject({ id: 'tk2', decision: null, href: '/tickets/tk2' })
  })
})

describe('w3Items — follow-up letters', () => {
  it('labels the letter and links to its violation', () => {
    const vid = '55555555-5555-4555-8555-555555555555'
    const [item] = w3Items([
      {
        id: 'r9',
        created_at: T1,
        input: { violationType: 'parking', followUp: { violationId: vid, letterKind: 'hearing_notice' } },
        output: { notice: 'Hearing on [DATE].' },
        citations: null,
        reasoning_trace: null,
      },
    ])
    expect(item.title).toBe('Hearing notice · Parking')
    expect(item.href).toBe(`/violations/${vid}`)
    expect(item.decision).toEqual({ kind: 'w3', runId: 'r9' })
  })
})

describe('openingItems (BL-126)', () => {
  const ASSOC = '00000000-0000-4000-8000-0000000000bb'
  const FUND = '10000000-0000-4000-8000-000000000001'
  const acct = (n: string) => `30000000-0000-4000-8000-00000000${n}`
  const payload = {
    version: 1,
    associationId: ASSOC,
    cutoverDate: '2026-01-01',
    chargesDueDate: '2026-02-01',
    fiscalPeriodId: '40000000-0000-4000-8000-000000000001',
    lines: [
      { accountId: acct('1010'), fundId: FUND, debitCents: 100_00, creditCents: 0, label: '1010 Cash — Operating' },
      { accountId: acct('3000'), fundId: FUND, debitCents: 0, creditCents: 100_00, label: '3000 Fund Balance — Operating' },
    ],
    charges: [],
    arAccountId: null,
    funds: [{ fundId: FUND, name: 'Operating Fund', equityCents: 100_00 }],
  }

  it('is decided through its own kind, linking to the opening balances page', () => {
    const [item] = openingItems([{ id: 'req-1', summary: 'Opening balances as of 2026-01-01 — 1 fund', amount: '100.00', proposed_at: T1, payload }])
    expect(item).toMatchObject({
      source: 'opening',
      amount: 100,
      href: '/accounting/opening-balances',
      decision: { kind: 'opening', approvalRequestId: 'req-1' },
    })
    expect(item.detail).toMatch(/one journal entry \(2 lines, balanced in every fund/)
    expect(decisionId(item.decision!)).toBe('req-1')
  })

  it('an unreadable payload gets no one-click decision', () => {
    const [item] = openingItems([{ id: 'req-2', summary: 's', amount: null, proposed_at: T1, payload: { version: 9 } }])
    expect(item.decision).toBeNull()
    expect(item.detail).toMatch(/can’t be read/)
  })
})
