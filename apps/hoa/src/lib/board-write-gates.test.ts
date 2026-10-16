import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BOARD_ONLY_DENIED } from './accounting/guard'
import * as violations from './violations'
import * as actionItems from './meeting-action-items'
import * as meetings from './meetings'
import * as documents from './documents'
import * as properties from './properties'
import * as propertyEvents from './property-events'
import * as commActions from './communications/actions'
import * as commSend from './communications/send'
import * as parseDocument from '../app/api/ai/parse-document/route'
import * as governingUpload from '../app/api/governing-docs/upload/route'
import * as violationDraft from '../app/api/ai/violations/draft/route'
import * as meetingSummary from '../app/api/ai/meeting-summary/route'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'

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
vi.mock('@/lib/vendors', () => ({
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
    ['createActionItem', () => actionItems.createActionItem(form({ meeting_id: ID, title: 'x' })), DENIED],
    ['setActionItemStatus', () => actionItems.setActionItemStatus(ID, 'done'), DENIED],
    ['updateActionItem', () => actionItems.updateActionItem(ID, { title: 'x' }), DENIED],
    ['deleteActionItem', () => actionItems.deleteActionItem(ID), DENIED],
    ['approveMeetingMinutes', () => meetings.approveMeetingMinutes({} as never), DENIED],
    ['scheduleMeeting', () => meetings.scheduleMeeting({ meetingDate: '2026-01-01', meetingType: 'regular' }), DENIED],
    ['uploadDocument', () => documents.uploadDocument({}, form({ name: 'x' })), { error: BOARD_ONLY_DENIED }],
    ['replaceDocumentFile', () => documents.replaceDocumentFile({}, form({ documentId: ID })), { error: BOARD_ONLY_DENIED }],
    ['restoreDocumentVersion', () => documents.restoreDocumentVersion({ versionId: ID }), DENIED],
    ['createProperty', () => properties.createProperty({}, form({ address: '1 Main' })), { error: BOARD_ONLY_DENIED }],
    ['logPropertyEvent', () => propertyEvents.logPropertyEvent({ propertyId: ID, kind: 'note' }), DENIED],
    ['deleteCommunication', () => commActions.deleteCommunication(ID), DENIED],
    ['sendCommunication', () => commSend.sendCommunication({} as never), DENIED],
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

  it('POST /api/governing-docs/upload (would otherwise poison Ask-the-Docs)', async () => {
    vi.mocked(getSupabaseServerClient).mockClear()
    const res = await governingUpload.POST(
      new Request('http://x/api/governing-docs/upload', {
        method: 'POST',
        body: form({ title: 'Rules', type: 'rules', associationId: ID, pastedText: 'x'.repeat(200) }),
      }),
    )
    expect(res.status).toBe(403)
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
})
