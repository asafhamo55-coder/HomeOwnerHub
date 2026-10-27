import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { grantExpired, homeFor, isProfessionalRole } from '../roles'
import {
  CAPABILITIES,
  InviteProfessionalSchema,
  MONEY_ACTIONS,
  PRO_ACTIONS,
  PRO_HOME,
  defaultExpiry,
  entryProblem,
  entryTotal,
  expiryNote,
  expiryProblem,
  isMoneyAction,
  proMayOpen,
  proNav,
  readProPayload,
  roleCan,
  routeApproval,
  signoffsNeeded,
  type Signer,
} from './model'

const U = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`

describe('roleCan', () => {
  it('board and admin can do everything the app offers', () => {
    for (const cap of CAPABILITIES) {
      expect(roleCan('admin', cap)).toBe(true)
      expect(roleCan('board', cap)).toBe(true)
    }
  })
  it('a CPA reads accounting, exports, reviews and proposes entries, and nothing else', () => {
    const can = CAPABILITIES.filter((c) => roleCan('cpa', c))
    expect(can).toEqual(['accounting.read', 'reports.export', 'period.review', 'entry.propose'])
  })
  it('an attorney reads matters, adds notes and uploads, drafts letters; governing documents only as general counsel', () => {
    expect(CAPABILITIES.filter((c) => roleCan('attorney', c))).toEqual(['matters.read', 'note.add', 'upload.add', 'letter.draft'])
    expect(roleCan('attorney', 'governing.read')).toBe(false)
    expect(roleCan('attorney', 'governing.read', { general: true })).toBe(true)
    expect(roleCan('cpa', 'governing.read', { general: true })).toBe(false)
  })
  it('nobody outside the board writes money, sends, or reads the inbox and the residents list', () => {
    for (const role of ['cpa', 'attorney', 'resident', null, undefined, 'auditor']) {
      for (const cap of ['money.write', 'send', 'inbox.read', 'residents.read'] as const) {
        expect(roleCan(role, cap, { general: true })).toBe(false)
      }
    }
  })
})

describe('navigation', () => {
  it('lands a CPA on Accounting and an attorney on My matters', () => {
    expect(PRO_HOME).toEqual({ cpa: '/pro/accounting', attorney: '/pro/matters' })
    expect(homeFor('cpa')).toBe('/pro')
    expect(homeFor('attorney')).toBe('/pro')
    expect(homeFor('resident')).toBe('/resident')
    expect(homeFor('board')).toBe('/')
  })
  it('each role sees only its own links', () => {
    expect(proNav('cpa').map((l) => l.label)).toEqual(['Accounting & Reports', 'My submissions'])
    expect(proNav('attorney').map((l) => l.label)).toEqual(['My matters', 'My submissions'])
    expect(proNav('attorney', { general: true }).map((l) => l.label)).toEqual(['My matters', 'Governing documents', 'My submissions'])
  })
  it('a professional may open only the /pro pages of their role', () => {
    expect(proMayOpen('cpa', '/pro/accounting')).toBe(true)
    expect(proMayOpen('cpa', '/pro/matters')).toBe(false)
    expect(proMayOpen('attorney', '/pro/matters/violation/x')).toBe(true)
    expect(proMayOpen('attorney', '/pro/accounting')).toBe(false)
    expect(proMayOpen('attorney', '/pro/counsel')).toBe(false)
    expect(proMayOpen('attorney', '/pro/counsel', { general: true })).toBe(true)
    for (const role of ['cpa', 'attorney'] as const) {
      for (const p of ['/', '/approvals', '/inbox', '/settings/members', '/resident', '/accounting/ledger']) {
        expect(proMayOpen(role, p, { general: true })).toBe(false)
      }
    }
  })
  it('knows a professional role when it sees one', () => {
    expect(isProfessionalRole('cpa')).toBe(true)
    expect(isProfessionalRole('attorney')).toBe(true)
    expect(isProfessionalRole('board')).toBe(false)
    expect(isProfessionalRole(null)).toBe(false)
  })
})

describe('access windows', () => {
  it('defaults: a year for a CPA, six months for an attorney', () => {
    expect(defaultExpiry('cpa', '2026-10-26')).toBe('2027-10-26')
    expect(defaultExpiry('attorney', '2026-10-26')).toBe('2027-04-24')
  })
  it('an end date must be after today and within a year', () => {
    expect(expiryProblem('2026-10-26', '2026-10-26')).toMatch(/after today/)
    expect(expiryProblem('2026-10-27', '2026-10-26')).toBeNull()
    expect(expiryProblem('2027-10-27', '2026-10-26')).toMatch(/a year/)
    expect(expiryProblem('2027-10-26', '2026-10-26')).toBeNull()
    expect(expiryProblem('soon', '2026-10-26')).toMatch(/end date/)
  })
  it('a grant is expired at or after its end, and a missing end fails closed', () => {
    const now = Date.parse('2026-10-26T12:00:00Z')
    expect(grantExpired('2026-10-26T11:59:59Z', now)).toBe(true)
    expect(grantExpired('2026-10-26T12:00:00Z', now)).toBe(true)
    expect(grantExpired('2026-10-26T12:00:01Z', now)).toBe(false)
    expect(grantExpired(null, now)).toBe(true)
    expect(grantExpired('nonsense', now)).toBe(true)
  })
  it('says how long is left', () => {
    expect(expiryNote('2026-11-05T23:59:59Z', '2026-10-26')).toBe('ends in 10 days')
    expect(expiryNote('2026-10-25T23:59:59Z', '2026-10-26')).toBe('ended 1 day ago')
    expect(expiryNote(null, '2026-10-26')).toBe('no end date')
  })
})

describe('the invite form', () => {
  const base = { email: 'a@example.test', role: 'attorney' as const, expiresOn: '2027-01-01' }
  it('takes an attorney with matters and general counsel', () => {
    const r = InviteProfessionalSchema.safeParse({ ...base, generalCounsel: true, matters: [{ type: 'violation', id: U(1) }] })
    expect(r.success).toBe(true)
  })
  it('refuses matters or general counsel on a CPA', () => {
    expect(InviteProfessionalSchema.safeParse({ ...base, role: 'cpa', generalCounsel: true }).success).toBe(false)
    expect(InviteProfessionalSchema.safeParse({ ...base, role: 'cpa', matters: [{ type: 'violation', id: U(1) }] }).success).toBe(false)
  })
  it('refuses a role that is not a professional role', () => {
    expect(InviteProfessionalSchema.safeParse({ ...base, role: 'board' }).success).toBe(false)
    expect(InviteProfessionalSchema.safeParse({ ...base, role: 'admin' }).success).toBe(false)
  })
})

describe('proposals', () => {
  const lines = [
    { accountId: U(1), fundId: U(2), debit: 100, credit: 0 },
    { accountId: U(3), fundId: U(2), debit: 0, credit: 100 },
  ]
  it('reads a payload only for its own action, and nothing it cannot parse', () => {
    const entry = { version: 1, kind: 'entry', associationId: U(4), fiscalPeriodId: U(5), entryDate: '2026-10-01', memo: 'Accrue audit fee', lines }
    expect(readProPayload(PRO_ACTIONS.entry, entry)?.kind).toBe('entry')
    expect(readProPayload(PRO_ACTIONS.note, entry)).toBeNull()
    expect(readProPayload('w18.cash_receipt', entry)).toBeNull()
    expect(readProPayload(PRO_ACTIONS.entry, { ...entry, lines: [lines[0]] })).toBeNull()
  })
  it('an entry balances overall and per fund', () => {
    expect(entryProblem(lines)).toBeNull()
    expect(entryProblem([lines[0]!, { ...lines[1]!, credit: 90 }])).toMatch(/equal/)
    expect(entryProblem([lines[0]!, { ...lines[1]!, fundId: U(9) }])).toMatch(/each fund/)
    expect(entryTotal(lines)).toBe(100)
  })
})

describe('Treasurer routing and dual control', () => {
  const treasurer: Signer = { userId: 't', role: 'board', title: 'treasurer' }
  const member: Signer = { userId: 'm', role: 'board', title: null }
  const member2: Signer = { userId: 'm2', role: 'board', title: 'secretary' }
  const admin: Signer = { userId: 'a', role: 'admin', title: null }
  const money = { actionType: PRO_ACTIONS.entry, amount: 500, thresholdCents: null, treasurerExists: true }

  it('only money actions are routed', () => {
    expect(isMoneyAction('w36.ap_bill')).toBe(true)
    expect(isMoneyAction(PRO_ACTIONS.entry)).toBe(true)
    expect(isMoneyAction('w18.cash_receipt')).toBe(true)
    expect(isMoneyAction('accounting.opening_balances')).toBe(true)
    expect(isMoneyAction(PRO_ACTIONS.note)).toBe(false)
    expect(isMoneyAction('collections.letter')).toBe(false)
    expect(routeApproval({ ...money, actionType: PRO_ACTIONS.note, signoffs: [], signer: member })).toEqual({ kind: 'approve' })
  })
  it('the Treasurer goes first: another board member waits', () => {
    expect(routeApproval({ ...money, signoffs: [], signer: member }).kind).toBe('wait')
    expect(routeApproval({ ...money, signoffs: [], signer: treasurer })).toEqual({ kind: 'approve' })
  })
  it('an admin stands in for the Treasurer, and with no Treasurer anyone on the board may approve', () => {
    expect(routeApproval({ ...money, signoffs: [], signer: admin })).toEqual({ kind: 'approve' })
    expect(routeApproval({ ...money, treasurerExists: false, signoffs: [], signer: member })).toEqual({ kind: 'approve' })
  })
  it('above the amount two different people must sign', () => {
    const big = { ...money, amount: 5000.01, thresholdCents: 500_000 }
    expect(signoffsNeeded(5000.01, 500_000)).toBe(2)
    expect(signoffsNeeded(5000, 500_000)).toBe(1)
    expect(signoffsNeeded(5000, null)).toBe(1)
    expect(signoffsNeeded(null, 500_000)).toBe(2)
    expect(signoffsNeeded(null, null)).toBe(1)
    const first = routeApproval({ ...big, signoffs: [], signer: treasurer })
    expect(first).toMatchObject({ kind: 'signoff', remaining: 1 })
    // The same person again is still one signature.
    expect(routeApproval({ ...big, signoffs: [treasurer], signer: treasurer })).toMatchObject({ kind: 'signoff', remaining: 1 })
    expect(routeApproval({ ...big, signoffs: [treasurer], signer: member })).toEqual({ kind: 'approve' })
    // A non-Treasurer cannot be the first signature.
    expect(routeApproval({ ...big, signoffs: [], signer: member2 }).kind).toBe('wait')
  })
})

describe('the money list matches the database trigger', () => {
  it('approval_is_money_action() names exactly MONEY_ACTIONS', () => {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const sql = readFileSync(path.resolve(here, '../../../../../migrations/0070_m6_roles.sql'), 'utf8')
    const m = /approval_is_money_action\(p_action text\)[\s\S]*?p_action IN \(([^)]*)\)/.exec(sql)
    expect(m).not.toBeNull()
    const inSql = [...m![1]!.matchAll(/'([^']+)'/g)].map((x) => x[1])
    expect(inSql.sort()).toEqual([...MONEY_ACTIONS].sort())
  })
})
