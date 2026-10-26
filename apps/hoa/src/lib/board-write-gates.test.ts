import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNTING_DENIED, BOARD_ONLY_DENIED } from './accounting/guard'
import * as violations from './violations'
import * as actionItems from './meeting-action-items'
import * as meetings from './meetings'
import * as documents from './documents'
import * as properties from './properties'
import * as propertyEvents from './property-events'
import * as propertySale from './properties/sale-actions'
import * as commActions from './communications/actions'
import * as commSend from './communications/send'
import * as parseDocument from '../app/api/ai/parse-document/route'
import * as governingUpload from '../app/api/governing-docs/upload/route'
import * as violationDraft from '../app/api/ai/violations/draft/route'
import * as meetingSummary from '../app/api/ai/meeting-summary/route'
import * as violationPhoto from '../app/api/violations/photo/route'
import * as askCommunity from '../app/api/ai/ask-community/route'
import * as composeCommunication from '../app/api/ai/compose-communication/route'
import * as plaidExchange from '../app/api/plaid/exchange/route'
import * as recordSearch from '../app/api/search/route'
import * as billScan from '../app/api/accounting/bill-scan/route'
import * as billScanActions from './bill-scan/actions'
import * as coiRequest from './vendor-coi-request/actions'
import * as recordsRequests from './records-requests/actions'
import * as bankImport from './bank-import/actions'
import * as cincAging from './accounting/opening-balances/cinc-actions'
import * as lateFees from './late-fees/actions'
import * as gaRegistration from './ga-registration/actions'
import * as gaComplaints from './ga-complaints/actions'
import * as collections from './collections/actions'
import * as collectionsLetters from './collections/letters/actions'
import * as hearingActions from './violation-hearings/actions'
import * as attachmentBill from './inbox/attachment-bill'
import * as rosterExport from '../app/(dashboard)/properties/roster/export/route'
import * as activityExport from '../app/api/settings/activity/export/route'
import * as motionsExport from '../app/api/meetings/motions/export/route'
import * as yearEndExport from '../app/api/accounting/year-end/[periodId]/route'
import YearEndPage from '../app/(dashboard)/accounting/reports/year-end/page'
import ActivityLogPage from '../app/(dashboard)/settings/activity/page'
import MotionLogPage from '../app/(dashboard)/meetings/motions/page'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  approveVendor,
  createVendor,
  deleteVendor,
  deleteVendorDocument,
  getPrimaryAssociation,
  getVendorDocumentSignedUrl,
  recordVendorDocument,
  runComplianceCheck,
  updateVendor,
} from '@/lib/vendors'
import * as bids from './bids'
import * as rfps from './rfps'
import * as stateLaw from './state-law'
import * as approvals from './approvals'
import * as events from './events'
import { listBoardMembers } from './communications/actions'
import * as rfpInvitations from './rfp-invitations'
import * as vendorInvitations from './vendor-invitations'

// Server actions are public POST endpoints: the (dashboard) layout
// redirecting residents does not stop one calling an action id directly.
// 0063 makes RLS refuse these writes; these gates (added in the same
// sweep) refuse first, with a readable error and without touching the DB.

const h = vi.hoisted(() => ({ role: 'resident' as 'admin' | 'board' | 'resident' | null }))

vi.mock('@/lib/auth', () => ({
  getCurrentUserRole: vi.fn(async () =>
    h.role === null
      ? null
      : { role: h.role, org: { id: 'org-1', name: 'Test HOA', hub_type: 'hoa', plan: 'pro', doors_count: 1 } },
  ),
  getCurrentUserRoleInOrg: vi.fn(async () => h.role),
  requireBoardOrAdmin: vi.fn(async () => {
    throw new Error('requireBoardOrAdmin redirect')
  }),
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => {
    throw new Error('reached the database')
  }),
}))
vi.mock('@/lib/orgs', () => ({
  getCurrentOrg: vi.fn(async () => ({ id: 'org-1', name: 'Test HOA' })),
}))
// Partial: approveVendor (BL-057) is exercised for real; other modules'
// getPrimaryAssociation calls hit the spy.
vi.mock('@/lib/vendors', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/vendors')>()),
  getPrimaryAssociation: vi.fn(async () => ({ id: 'assoc-1', name: 'Test' })),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))
vi.mock('next/navigation', () => ({
  redirect: vi.fn(() => {
    throw new Error('redirected')
  }),
}))

const ID = '11111111-1111-4111-8111-111111111111'
const DENIED = { ok: false, error: BOARD_ONLY_DENIED }

function form(entries: Record<string, string | Blob>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(entries)) f.append(k, v)
  return f
}

beforeEach(() => {
  h.role = 'resident'
})

describe('board-only server actions refuse a resident before touching the database', () => {
  const returning: Array<[string, () => Promise<unknown>, unknown]> = [
    ['createApprovedViolation', () => violations.createApprovedViolation({} as never), DENIED],
    ['updateViolation', () => violations.updateViolation({ violationId: ID } as never), DENIED],
    ['deleteViolation', () => violations.deleteViolation(ID), DENIED],
    ['updateViolationStatus', () => violations.updateViolationStatus({ violationId: ID, status: 'resolved' } as never), DENIED],
    ['approveViolationDraft (BL-048)', () => violations.approveViolationDraft(ID), DENIED],
    ['rejectViolationDraft (BL-048)', () => violations.rejectViolationDraft(ID, 'wrong lot'), DENIED],
    ['approveVendor (BL-057)', () => approveVendor(ID), DENIED],
    ['createActionItem', () => actionItems.createActionItem(form({ meeting_id: ID, title: 'x' })), DENIED],
    ['setActionItemStatus', () => actionItems.setActionItemStatus(ID, 'done'), DENIED],
    ['updateActionItem', () => actionItems.updateActionItem(ID, { title: 'x' }), DENIED],
    ['deleteActionItem', () => actionItems.deleteActionItem(ID), DENIED],
    ['assignActionItem (BL-119)', () => actionItems.assignActionItem(ID, ID), DENIED],
    ['approveMeetingMinutes', () => meetings.approveMeetingMinutes({} as never), DENIED],
    ['scheduleMeeting', () => meetings.scheduleMeeting({ meetingDate: '2026-01-01', meetingType: 'regular' }), DENIED],
    ['uploadDocument', () => documents.uploadDocument({}, form({ name: 'x' })), { error: BOARD_ONLY_DENIED }],
    ['replaceDocumentFile', () => documents.replaceDocumentFile({}, form({ documentId: ID })), { error: BOARD_ONLY_DENIED }],
    ['restoreDocumentVersion', () => documents.restoreDocumentVersion({ versionId: ID }), DENIED],
    ['createProperty', () => properties.createProperty({}, form({ address: '1 Main' })), { error: BOARD_ONLY_DENIED }],
    ['logPropertyEvent', () => propertyEvents.logPropertyEvent({ propertyId: ID, kind: 'note' }), DENIED],
    ['logPropertyNote (P2 "Log note")', () => propertyEvents.logPropertyNote(ID, 'Called about the gate'), DENIED],
    ['recordPropertySale (P3 "Record a sale")', () => propertySale.recordPropertySale(ID, { settlementDate: '2026-01-01', buyers: [{ name: 'B' }] }), DENIED],
    ['deleteCommunication', () => commActions.deleteCommunication(ID), DENIED],
    ['sendCommunication', () => commSend.sendCommunication({} as never), DENIED],
    ['editBillProposal (BL-059: the only write path to a proposal payload)', () => billScanActions.editBillProposal({ approvalRequestId: ID }), DENIED],
    ['scanAttachmentAsBill (BL-059: runs W36 on an inbox attachment and files a proposal with the service role)', () => attachmentBill.scanAttachmentAsBill(ID), DENIED],
    ['sendCoiRequest (BL-083: emails a vendor)', () => coiRequest.sendCoiRequest({ vendorId: ID, subject: 's', body: 'b' }), DENIED],
    ['loadCoiRequestDraft (BL-083)', () => coiRequest.loadCoiRequestDraft(ID), { ok: false, reason: 'not_found' }],
    ['markRecordsRequestFulfilled (BL-123: closes an owner records request)', () => recordsRequests.markRecordsRequestFulfilled({ ticketId: ID }), DENIED],
    // Security sweep 2026-10-20 (H-1, H-2, M-1): these reach W21/W22/W23/W30
    // or the service role, and charge the board AI quota.
    ['runBidComparison (H-1: W23 reads rfps/bids with the service role)', () => bids.runBidComparison(ID), DENIED],
    ['awardBid', () => bids.awardBid(ID, ID), DENIED],
    ['runComplianceCheck (H-2: W21 reads vendors with the service role)', () => runComplianceCheck({ vendorId: ID, manualExtract: { coi: null, w9: null, license: null } }), DENIED],
    ['createVendor', () => createVendor({ legalName: 'Acme', ein: '12-3456789', trades: ['x'] } as never), DENIED],
    ['updateVendor', () => updateVendor(ID, { legalName: 'Acme' }), DENIED],
    ['deleteVendor', () => deleteVendor(ID), DENIED],
    ['recordVendorDocument', () => recordVendorDocument({ vendorId: ID, docType: 'w9', storagePath: 'org-1/vendors/x' }), DENIED],
    ['deleteVendorDocument', () => deleteVendorDocument(ID), DENIED],
    ['createRfpDraft (M-1: W22 + board_ai quota)', () => rfps.createRfpDraft({ freeTextNeed: 'Repave the lot please.', submissionDeadline: '2027-01-01T00:00:00.000Z' }), DENIED],
    ['updateRfp', () => rfps.updateRfp({ rfpId: ID, title: 'x' }), DENIED],
    ['publishRfp', () => rfps.publishRfp(ID), DENIED],
    ['cancelRfp', () => rfps.cancelRfp(ID), DENIED],
    ['askStateLawAction (M-1: W30 + board_ai quota)', () => stateLaw.askStateLawAction('Can we fine for parking?'), DENIED],
    ['approvePosting (service-role executor)', () => approvals.approvePosting({ approvalRequestId: ID }), DENIED],
    ['rejectPosting', () => approvals.rejectPosting({ approvalRequestId: ID, reason: 'no' }), DENIED],
    ['getBidDocumentSignedUrl (bid PDFs)', () => bids.getBidDocumentSignedUrl('org-1/rfps/x/bids/y/a.pdf'), null],
    ['getVendorDocumentSignedUrl (COI / W-9)', () => getVendorDocumentSignedUrl('org-1/vendors/x/w9/a.pdf'), null],
    ['listBoardMembers (board contact details via the service role)', () => listBoardMembers(), []],
    ['inviteVendorsToRfp (emails vendors bid links)', () => rfpInvitations.inviteVendorsToRfp({ rfpId: ID, vendorIds: [ID] }), DENIED],
    ['revokeRfpInvitation', () => rfpInvitations.revokeRfpInvitation(ID), DENIED],
    ['listRfpInvitations (vendor names + bid status)', () => rfpInvitations.listRfpInvitations(ID), []],
    ['listInvitableVendors', () => rfpInvitations.listInvitableVendors(ID, ID), []],
    ['createInvitation (vendor onboarding email)', () => vendorInvitations.createInvitation({ inviteeEmail: 'v@example.com' }), DENIED],
    ['revokeInvitation (vendor onboarding)', () => vendorInvitations.revokeInvitation(ID), DENIED],
    // BL-144: manual bank accounts and statement imports write the bank feed.
    ['createManualBankAccount (BL-144)', () => bankImport.createManualBankAccount({ accountName: 'Ops', fundId: ID }), { ok: false, error: ACCOUNTING_DENIED }],
    ['previewBankImport (BL-144: reads the bank feed)', () => bankImport.previewBankImport(form({ bankAccountId: ID, file: new Blob(['Date,Amount\n']) })), { ok: false, error: ACCOUNTING_DENIED }],
    ['commitBankImport (BL-144: inserts bank transactions)', () => bankImport.commitBankImport(form({ bankAccountId: ID, file: new Blob(['Date,Amount\n']), fileHash: 'a'.repeat(64) })), { ok: false, error: ACCOUNTING_DENIED }],
    // BL-031: the CINC aging preview reads every home and writes an audit row.
    ['previewCincAging (BL-031: reads the homes, audited)', () => cincAging.previewCincAging(form({ file: new Blob(['Account,Balance\n']) })), { ok: false, error: ACCOUNTING_DENIED }],
    // BL-147: the late-fee policy the nightly job charges under; audited.
    ['saveLateFeePolicy (BL-147: sets what the nightly job charges)', () => lateFees.saveLateFeePolicy({ enabled: true, mode: 'percent', percent: '50', flat: '', graceDays: '0', excludeFines: false, declarationAttested: true, declarationRef: 'x' }), DENIED],
    ['getBoardLateFeePolicy (BL-147)', () => lateFees.getBoardLateFeePolicy(), { ok: false, reason: 'forbidden' }],
    ['updateGaRegistration (BL-149: the record the registration gate trusts)', () => gaRegistration.updateGaRegistration({ op: 'decide', associationId: ID, decision: 'register' }), DENIED],
    ['updateGaComplaint (BL-161: add — the record the complaint-stay gate trusts)', () => gaComplaints.updateGaComplaint({ op: 'add', unitId: ID, filedOn: '2027-01-02', subject: 'both' }), DENIED],
    ['updateGaComplaint (BL-161: conclude — ends the stay)', () => gaComplaints.updateGaComplaint({ op: 'conclude', unitId: ID, complaintId: ID, conclusionsOn: '2027-02-01' }), DENIED],
    ['updateGaComplaint (BL-161: remove)', () => gaComplaints.updateGaComplaint({ op: 'remove', unitId: ID, complaintId: ID }), DENIED],
    ['recordCollectionEvent (BL-149: a lien filed runs the registration gate, overrides audited)', () => collections.recordCollectionEvent({ caseId: ID, eventType: 'lien_filed', occurredOn: '2026-10-01', advanceStatus: false }), DENIED],
    // BL-089 / BL-148: collections letters, incl. the Georgia notices. Audited; nothing is sent.
    ['saveLetterToApprovals (BL-148: GA notice before attorney’s fees)', () => collectionsLetters.saveLetterToApprovals({ propertyId: ID, kind: 'ga_fee_notice', values: {}, verified: true }), DENIED],
    ['saveLetterToApprovals (BL-148: GA notice before foreclosure)', () => collectionsLetters.saveLetterToApprovals({ propertyId: ID, kind: 'ga_pre_foreclosure', values: {}, verified: true }), DENIED],
    ['recordLetterPrinted (BL-089: records the event and audit row)', () => collectionsLetters.recordLetterPrinted({ propertyId: ID, approvalRequestId: ID, verified: true }), DENIED],
    ['saveViolationHearing (BL-133)', () => hearingActions.saveViolationHearing({ violationId: ID } as never), DENIED],
    ['cancelHearingAfterCure (BL-140: cancels a fine hearing, audited)', () => hearingActions.cancelHearingAfterCure({ violationId: ID, reason: 'cured_before_hearing' }), DENIED],
    ['sendTestAlert (service-role audience send)', () => events.sendTestAlert(ID), { ok: false, error: "You don't have permission to perform this action." }],
  ]

  for (const [name, call, expected] of returning) {
    it(name, async () => {
      vi.mocked(getSupabaseServerClient).mockClear()
      vi.mocked(getPrimaryAssociation).mockClear()
      expect(await call()).toEqual(expected)
      expect(getSupabaseServerClient).not.toHaveBeenCalled()
      expect(getPrimaryAssociation).not.toHaveBeenCalled()
    })
  }

  // These three keep their existing throw-on-error contract (the UI
  // surfaces the thrown message), so the gate throws too.
  const throwing: Array<[string, () => Promise<unknown>]> = [
    ['updateParsedText', () => documents.updateParsedText(ID, 'text')],
    ['deleteDocument', () => documents.deleteDocument(ID)],
    ['deleteProperty', () => properties.deleteProperty(ID)],
  ]
  for (const [name, call] of throwing) {
    it(name, async () => {
      vi.mocked(getSupabaseServerClient).mockClear()
      await expect(call()).rejects.toThrow(BOARD_ONLY_DENIED)
      expect(getSupabaseServerClient).not.toHaveBeenCalled()
    })
  }

  it('a board member gets past the gate (control)', async () => {
    h.role = 'board'
    await expect(actionItems.deleteActionItem(ID)).rejects.toThrow('reached the database')
  })
})

describe('board-only routes return 403 to a resident', () => {
  it('POST /api/ai/parse-document', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    const res = await parseDocument.POST(
      new Request('http://x/api/ai/parse-document', {
        method: 'POST',
        body: JSON.stringify({ documentId: ID, rawText: 'x'.repeat(300) }),
      }),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('POST /api/ai/compose-communication (BL-102 A2: the one-box composer)', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    const res = await composeCommunication.POST(
      new Request('http://x/api/ai/compose-communication', { method: 'POST', body: '{not json' }),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('POST /api/ai/violations/draft (R-01: org membership alone let a resident draft notices)', async () => {
    const res = await violationDraft.POST(
      new Request('http://x/api/ai/violations/draft', {
        method: 'POST',
        body: JSON.stringify({ unitId: ID, violationType: 'parking', description: 'x'.repeat(20) }),
      }),
    )
    expect(res.status).toBe(403)
  })

  it('POST /api/ai/ask-community (agent tools read owner contact and dues balances)', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    const res = await askCommunity.POST(
      new Request('http://x/api/ai/ask-community', {
        method: 'POST',
        body: '{not json',
      }),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('POST /api/plaid/exchange (must not mint a Plaid access token for a resident)', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    vi.mocked(getPrimaryAssociation).mockClear()
    const res = await plaidExchange.POST(
      new Request('http://x/api/plaid/exchange', {
        method: 'POST',
        body: JSON.stringify({ publicToken: 'public-sandbox-x', fundId: ID }),
      }),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
    expect(getPrimaryAssociation).not.toHaveBeenCalled()
  })

  it('POST /api/governing-docs/upload (would otherwise poison Ask-the-Docs)', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    const res = await governingUpload.POST(
      new Request('http://x/api/governing-docs/upload', {
        method: 'POST',
        body: form({ title: 'Rules', type: 'rules', associationId: ID, pastedText: 'x'.repeat(200) }),
      }),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('POST /api/ai/meeting-summary (R-02/R-16: was org-only, and validated the body before any gate)', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    const res = await meetingSummary.POST(
      new Request('http://x/api/ai/meeting-summary', {
        method: 'POST',
        body: '{not json',
      }),
    )
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('GET /api/search (BL-022: record search must not let a resident find other owners)', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    const res = await recordSearch.GET(new Request('http://x/api/search?q=kaur'))
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('POST /api/violations/photo (hoa-photos INSERT admits any member; the route is the boundary)', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    const res = await violationPhoto.POST(
      new Request('http://x/api/violations/photo', {
        method: 'POST',
        body: form({ file: new File([new Uint8Array([1, 2, 3])], 'a.png', { type: 'image/png' }) }),
      }),
    )
    expect(res.status).toBe(403)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('POST /api/accounting/bill-scan (BL-021: runs W36 and files a proposal with the service role)', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    const res = await billScan.POST(
      new Request('http://x/api/accounting/bill-scan', {
        method: 'POST',
        body: form({ file: new File([new Uint8Array([1, 2, 3])], 'a.pdf', { type: 'application/pdf' }) }),
      }),
    )
    expect(res.status).toBe(403)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })
})

// Board-only reads of owner data. The roster export lives outside /api
// and answers 404 (the page doesn't exist for a resident), decided before
// any database client is made.
describe('board-only owner-data exports hide from a resident', () => {
  for (const kind of ['owners', 'voters', 'records']) {
    it(`GET /properties/roster/export?kind=${kind} (P5 statutory roster)`, async () => {
      vi.mocked(getSupabaseServerClient).mockClear()
      const res = await rosterExport.GET(new Request(`http://x/properties/roster/export?kind=${kind}&asOf=2026-10-18`) as never)
      expect(res.status).toBe(404)
      expect((await res.json()).error.code).toBe('not_found')
      expect(getSupabaseServerClient).not.toHaveBeenCalled()
    })
  }

  it('signed out gets the same 404', async () => {
    h.role = null
    vi.mocked(getSupabaseServerClient).mockClear()
    const res = await rosterExport.GET(new Request('http://x/properties/roster/export?kind=records') as never)
    expect(res.status).toBe(404)
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })
})

// Board-only reads that answer 403 to a resident (BL-115 activity log,
// BL-116 motion log): the export routes refuse before any client is made,
// and the pages bounce at requireBoardOrAdmin before any read.
describe('board-only activity and motion logs refuse a resident', () => {
  it('GET /api/settings/activity/export (BL-115: who did what is board-only)', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    const res = await activityExport.GET(new Request('http://x/api/settings/activity/export'))
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('GET /api/meetings/motions/export (BL-116: minutes, drafts included, are board-only)', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    const res = await motionsExport.GET(new Request('http://x/api/meetings/motions/export'))
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('GET /api/accounting/year-end/[periodId] (BL-121: the CPA package is the whole ledger)', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    const periodId = '11111111-1111-4111-8111-111111111111'
    const res = await yearEndExport.GET(new Request(`http://x/api/accounting/year-end/${periodId}`), {
      params: Promise.resolve({ periodId }),
    })
    expect(res.status).toBe(403)
    expect((await res.json()).error.code).toBe('forbidden')
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('/accounting/reports/year-end gates on requireBoardOrAdmin before any read', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    await expect(YearEndPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('requireBoardOrAdmin redirect')
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })

  it('/settings/activity and /meetings/motions gate on requireBoardOrAdmin before any read', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    await expect(ActivityLogPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('requireBoardOrAdmin redirect')
    await expect(MotionLogPage({ searchParams: Promise.resolve({}) })).rejects.toThrow('requireBoardOrAdmin redirect')
    expect(getSupabaseServerClient).not.toHaveBeenCalled()
  })
})
