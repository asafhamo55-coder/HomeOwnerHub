import { describe, it, expect } from 'vitest'
import {
  selectParsableAttachments,
  joinAttachmentText,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MAX_TOTAL_CHARS,
  type CandidateAttachment,
} from './attachment-text'

function attachment(over: Partial<CandidateAttachment> = {}): CandidateAttachment {
  return {
    id: 'att-1',
    file_name: 'w9.pdf',
    content_type: 'application/pdf',
    size_bytes: 30_000,
    storage_path: 'org/thread/w9.pdf',
    fetch_status: 'stored',
    ...over,
  }
}

describe('selectParsableAttachments', () => {
  it('takes a stored PDF', () => {
    expect(selectParsableAttachments([attachment()])).toEqual([
      { id: 'att-1', fileName: 'w9.pdf', storagePath: 'org/thread/w9.pdf' },
    ])
  })

  it('skips an attachment that was never fetched', () => {
    // storage_path is null until the fetch job succeeds; downloading it
    // would 404.
    expect(
      selectParsableAttachments([
        attachment({ fetch_status: 'pending', storage_path: null }),
      ]),
    ).toEqual([])
  })

  it('skips a stored row whose storage_path is still null', () => {
    expect(selectParsableAttachments([attachment({ storage_path: null })])).toEqual([])
  })

  it('skips images and calendar invites', () => {
    const rows = [
      attachment({ id: 'a', content_type: 'image/png', file_name: 'photo.png' }),
      attachment({ id: 'b', content_type: 'text/calendar', file_name: 'invite.ics' }),
    ]
    expect(selectParsableAttachments(rows)).toEqual([])
  })

  it('accepts a PDF mislabelled as octet-stream, by extension', () => {
    // Real senders do this; missing a W-9 on a MIME technicality would
    // defeat the point of the feature.
    const rows = [attachment({ content_type: 'application/octet-stream', file_name: 'W9.PDF' })]
    expect(selectParsableAttachments(rows)).toHaveLength(1)
  })

  it('skips a PDF over the per-file size cap', () => {
    const rows = [attachment({ size_bytes: MAX_ATTACHMENT_BYTES + 1 })]
    expect(selectParsableAttachments(rows)).toEqual([])
  })

  it('keeps a PDF whose size is unknown', () => {
    expect(selectParsableAttachments([attachment({ size_bytes: null })])).toHaveLength(1)
  })

  it('caps how many attachments it will open', () => {
    const rows = Array.from({ length: MAX_ATTACHMENTS + 3 }, (_, i) =>
      attachment({ id: `a${i}` }),
    )
    expect(selectParsableAttachments(rows)).toHaveLength(MAX_ATTACHMENTS)
  })
})

describe('joinAttachmentText', () => {
  it('returns null when there is nothing usable', () => {
    // Null is not cosmetic here: it is the signal that forbids an EIN in
    // W33's output.
    expect(joinAttachmentText([])).toBeNull()
    expect(joinAttachmentText([{ fileName: 'w9.pdf', text: '   ' }])).toBeNull()
  })

  it('labels each file, so a reviewer can tell where an EIN came from', () => {
    const out = joinAttachmentText([
      { fileName: 'w9.pdf', text: 'EIN 12-3456789' },
      { fileName: 'quote.pdf', text: 'Total $400' },
    ])
    expect(out).toContain('--- w9.pdf ---')
    expect(out).toContain('--- quote.pdf ---')
    expect(out).toContain('12-3456789')
  })

  it('truncates the combined text so one long PDF cannot crowd out the email', () => {
    const out = joinAttachmentText([{ fileName: 'big.pdf', text: 'x'.repeat(MAX_TOTAL_CHARS * 2) }])
    expect(out!.length).toBeLessThanOrEqual(MAX_TOTAL_CHARS + '\n[truncated]'.length)
    expect(out).toContain('[truncated]')
  })
})
