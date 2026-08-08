import { describe, it, expect, vi, beforeEach } from 'vitest'

// getThreadDetail is mocked so the real degradation logic in
// retrieveForVendorRequest runs without a database. readPdfTexts is mocked
// because its own contract (swallow per-file, return what parsed) is covered
// where it lives; here what matters is that its output reaches
// joinAttachmentText and that a failed ROW READ is distinguished from an
// empty one.
vi.mock('@/lib/inbox/queries', () => ({ getThreadDetail: vi.fn() }))
vi.mock('@/lib/inbox/attachment-pdf', () => ({ readPdfTexts: vi.fn(async () => []) }))

import { retrieveForVendorRequest } from './vendor-request-retrieve'
import { getThreadDetail } from '@/lib/inbox/queries'
import { readPdfTexts } from '@/lib/inbox/attachment-pdf'

const ORG = 'org-1'
const THREAD = 'thread-1'

interface TableResult {
  data: unknown
  error: unknown
}

/**
 * Minimal Supabase stand-in. Every builder method returns `this` so the
 * chains in the module under test resolve, and the terminal methods hand
 * back whatever this table was configured with.
 */
function dbWith(tables: Record<string, TableResult>) {
  const seen: string[] = []
  const db = {
    from(table: string) {
      seen.push(table)
      const result = tables[table] ?? { data: null, error: null }
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        returns: () => Promise.resolve(result),
        maybeSingle: () => Promise.resolve(result),
        then: (resolve: (v: TableResult) => unknown) => resolve(result),
      }
      return chain
    },
    tablesRead: seen,
  }
  return db as unknown as Parameters<typeof retrieveForVendorRequest>[0] & {
    tablesRead: string[]
  }
}

function threadDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: THREAD,
    subject: 'water coming through my ceiling',
    status: 'open',
    unitId: 'unit-1',
    vendorId: 'vendor-1',
    messages: [
      {
        id: 'msg-1',
        direction: 'inbound' as const,
        fromName: 'Owner',
        fromEmail: 'owner@example.com',
        toEmails: ['board@hoa.org'],
        subject: 'water',
        bodyText: 'full body with quoted history',
        strippedText: 'There is a stain on my ceiling.',
        sentAt: '2026-08-06T08:14:00Z',
        attachments: [],
      },
    ],
    ...overrides,
  }
}

const UNIT = { data: { address_line1: '412 Madison Park Dr', unit_number: '8B' }, error: null }
const VENDOR = {
  data: { legal_name: "Mike's Roofing LLC", dba: null, trades: ['roofing'] },
  error: null,
}
const ACCOUNT = { data: { mailbox_account_id: 'acct-1' }, error: null }
const NO_ATTACHMENTS = { data: [], error: null }

beforeEach(() => {
  vi.mocked(getThreadDetail).mockResolvedValue(threadDetail() as never)
  vi.mocked(readPdfTexts).mockResolvedValue([])
})

describe('retrieveForVendorRequest', () => {
  it('returns null when the thread is not in this org', async () => {
    vi.mocked(getThreadDetail).mockResolvedValue(null)

    expect(await retrieveForVendorRequest(dbWith({}), ORG, THREAD)).toBeNull()
  })

  it('resolves the property, the vendor, and the mailbox with nothing degraded', async () => {
    const result = await retrieveForVendorRequest(
      dbWith({
        units: UNIT,
        vendors: VENDOR,
        inbox_attachments: NO_ATTACHMENTS,
        inbox_threads: ACCOUNT,
      }),
      ORG,
      THREAD,
    )

    expect(result?.property).toEqual({ addressLine1: '412 Madison Park Dr', unitNumber: '8B' })
    expect(result?.vendor).toEqual({
      legalName: "Mike's Roofing LLC",
      dba: null,
      trades: ['roofing'],
    })
    expect(result?.mailboxAccountId).toBe('acct-1')
    expect(result?.vendorId).toBe('vendor-1')
    expect(result?.degraded).toEqual([])
  })

  // strippedText, not bodyText: W34 summarizes rather than forwards, so the
  // quoted history costs tokens and invites restating an old exchange.
  it('uses strippedText for message content', async () => {
    const result = await retrieveForVendorRequest(
      dbWith({ units: UNIT, vendors: VENDOR, inbox_attachments: NO_ATTACHMENTS, inbox_threads: ACCOUNT }),
      ORG,
      THREAD,
    )

    expect(result?.messages[0].text).toBe('There is a stain on my ceiling.')
    expect(result?.messages[0].text).not.toContain('quoted history')
  })

  it('falls back to bodyText when a message has no stripped text', async () => {
    vi.mocked(getThreadDetail).mockResolvedValue(
      threadDetail({
        messages: [{ ...threadDetail().messages[0], strippedText: null }],
      }) as never,
    )

    const result = await retrieveForVendorRequest(
      dbWith({ units: UNIT, vendors: VENDOR, inbox_attachments: NO_ATTACHMENTS, inbox_threads: ACCOUNT }),
      ORG,
      THREAD,
    )

    expect(result?.messages[0].text).toBe('full body with quoted history')
  })

  it('drops messages with no text at all rather than sending the model empty turns', async () => {
    vi.mocked(getThreadDetail).mockResolvedValue(
      threadDetail({
        messages: [{ ...threadDetail().messages[0], strippedText: '   ', bodyText: null }],
      }) as never,
    )

    const result = await retrieveForVendorRequest(
      dbWith({ units: UNIT, vendors: VENDOR, inbox_attachments: NO_ATTACHMENTS, inbox_threads: ACCOUNT }),
      ORG,
      THREAD,
    )

    expect(result?.messages).toEqual([])
  })

  // The address is the one field a vendor cannot do without, so an
  // unmatched thread must SAY so rather than silently omitting it.
  it('degrades property when the thread has no unit matched', async () => {
    vi.mocked(getThreadDetail).mockResolvedValue(threadDetail({ unitId: null }) as never)

    const result = await retrieveForVendorRequest(
      dbWith({ vendors: VENDOR, inbox_attachments: NO_ATTACHMENTS, inbox_threads: ACCOUNT }),
      ORG,
      THREAD,
    )

    expect(result?.property).toBeNull()
    expect(result?.degraded).toContain('property')
  })

  it('degrades property when the unit lookup errors', async () => {
    const result = await retrieveForVendorRequest(
      dbWith({
        units: { data: null, error: { code: '500', message: 'boom' } },
        vendors: VENDOR,
        inbox_attachments: NO_ATTACHMENTS,
        inbox_threads: ACCOUNT,
      }),
      ORG,
      THREAD,
    )

    expect(result?.property).toBeNull()
    expect(result?.degraded).toContain('property')
  })

  it('degrades vendor when the thread has no vendor filed', async () => {
    vi.mocked(getThreadDetail).mockResolvedValue(threadDetail({ vendorId: null }) as never)

    const result = await retrieveForVendorRequest(
      dbWith({ units: UNIT, inbox_attachments: NO_ATTACHMENTS, inbox_threads: ACCOUNT }),
      ORG,
      THREAD,
    )

    expect(result?.vendor).toBeNull()
    expect(result?.vendorId).toBeNull()
    expect(result?.degraded).toContain('vendor')
  })

  // "This thread has no attachments" and "we could not find out" are
  // different facts; only the second belongs in degraded.
  it('degrades attachments when the read fails, but not when there simply are none', async () => {
    const failed = await retrieveForVendorRequest(
      dbWith({
        units: UNIT,
        vendors: VENDOR,
        inbox_attachments: { data: null, error: { code: '500', message: 'boom' } },
        inbox_threads: ACCOUNT,
      }),
      ORG,
      THREAD,
    )
    expect(failed?.degraded).toContain('attachments')

    const empty = await retrieveForVendorRequest(
      dbWith({ units: UNIT, vendors: VENDOR, inbox_attachments: NO_ATTACHMENTS, inbox_threads: ACCOUNT }),
      ORG,
      THREAD,
    )
    expect(empty?.degraded).not.toContain('attachments')
  })

  it('joins extracted PDF text into a single labelled block', async () => {
    vi.mocked(readPdfTexts).mockResolvedValue([
      { fileName: 'estimate-2024.pdf', text: 'Apex Roofing, March 2024' },
    ])

    const result = await retrieveForVendorRequest(
      dbWith({
        units: UNIT,
        vendors: VENDOR,
        inbox_attachments: {
          data: [
            {
              id: 'att-1',
              file_name: 'estimate-2024.pdf',
              content_type: 'application/pdf',
              size_bytes: 340_000,
              storage_path: 'org/att-1.pdf',
              fetch_status: 'stored',
            },
          ],
          error: null,
        },
        inbox_threads: ACCOUNT,
      }),
      ORG,
      THREAD,
    )

    expect(result?.attachmentText).toContain('estimate-2024.pdf')
    expect(result?.attachmentText).toContain('Apex Roofing, March 2024')
  })

  it('lists only stored attachments for copying onto the draft', async () => {
    const result = await retrieveForVendorRequest(
      dbWith({
        units: UNIT,
        vendors: VENDOR,
        inbox_attachments: {
          data: [
            {
              id: 'att-1',
              file_name: 'ok.pdf',
              content_type: 'application/pdf',
              size_bytes: 100,
              storage_path: 'org/ok.pdf',
              fetch_status: 'stored',
            },
            {
              id: 'att-2',
              file_name: 'pending.pdf',
              content_type: 'application/pdf',
              size_bytes: 100,
              storage_path: null,
              fetch_status: 'pending',
            },
          ],
          error: null,
        },
        inbox_threads: ACCOUNT,
      }),
      ORG,
      THREAD,
    )

    expect(result?.attachments.map((a) => a.id)).toEqual(['att-1'])
  })

  // The vision producer does not exist yet (spec D9); the field must still
  // be present and empty so W34's schema validates.
  it('always returns an empty photoFindings array this phase', async () => {
    const result = await retrieveForVendorRequest(
      dbWith({ units: UNIT, vendors: VENDOR, inbox_attachments: NO_ATTACHMENTS, inbox_threads: ACCOUNT }),
      ORG,
      THREAD,
    )

    expect(result?.photoFindings).toEqual([])
  })
})
