import { describe, it, expect, vi } from 'vitest'
import { deflateRawSync } from 'node:zlib'

vi.mock('@/lib/inbox/attachment-pdf', () => ({
  readPdfTexts: vi.fn(async (_db: unknown, _bucket: string, files: Array<{ fileName: string }>) =>
    files.map((f) => ({ fileName: f.fileName, text: 'Certificate of insurance. Policy covers fence repair work.' })),
  ),
}))

import {
  MAX_EXCERPT_CHARS_PER_FILE,
  MAX_EXCERPT_CHARS_TOTAL,
  MAX_EXTRACTED_CHARS,
  attachmentKind,
  buildAttachmentContext,
  decodeTextFile,
  extractDocxText,
  loadAttachmentContext,
  relevantExcerpt,
  selectContextAttachments,
  type AttachmentRow,
} from './attachment-context'
import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from '@/lib/inbox/vendor/attachment-text'
import { findContactPII } from '@homeowner-portal/ai/pii'

/** A minimal one-entry zip, the shape a .docx is. */
function zipOne(name: string, content: Buffer, method: 0 | 8 = 8): Buffer {
  const data = method === 8 ? deflateRawSync(content) : content
  const nameBuf = Buffer.from(name)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(method, 8)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(content.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(method, 10)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(content.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt32LE(0, 42)
  const cdOffset = local.length + nameBuf.length + data.length
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(central.length + nameBuf.length, 12)
  eocd.writeUInt32LE(cdOffset, 16)
  return Buffer.concat([local, nameBuf, data, central, nameBuf, eocd])
}

function row(over: Partial<AttachmentRow> = {}): AttachmentRow {
  return {
    id: 'a1',
    message_id: 'm1',
    file_name: 'file.pdf',
    content_type: 'application/pdf',
    size_bytes: 1000,
    storage_path: 'org-1/inbox/thread-1/m1/a1/file.pdf',
    fetch_status: 'stored',
    ...over,
  }
}

describe('attachmentKind', () => {
  it('reads PDF, plain text/CSV and docx — by type or extension — and nothing else', () => {
    expect(attachmentKind('x.pdf', null)).toBe('pdf')
    expect(attachmentKind('scan', 'application/pdf')).toBe('pdf')
    expect(attachmentKind('notes.txt', 'application/octet-stream')).toBe('text')
    expect(attachmentKind('a', 'text/plain; charset=utf-8')).toBe('text')
    expect(attachmentKind('letter.docx', null)).toBe('docx')
    expect(attachmentKind('photo.jpg', 'image/jpeg')).toBeNull()
    expect(attachmentKind('page.html', 'text/html')).toBeNull()
    expect(attachmentKind('old.doc', 'application/msword')).toBeNull()
  })
})

describe('selectContextAttachments — caps', () => {
  it('only the given messages, only stored, only under the byte cap, newest message first', () => {
    const picked = selectContextAttachments(
      [
        row({ id: 'old', message_id: 'm-old' }),
        row({ id: 'new', message_id: 'm-new' }),
        row({ id: 'other-sender', message_id: 'm-x' }),
        row({ id: 'pending', message_id: 'm-new', fetch_status: 'pending' }),
        row({ id: 'nopath', message_id: 'm-new', storage_path: null }),
        row({ id: 'huge', message_id: 'm-new', size_bytes: MAX_ATTACHMENT_BYTES + 1 }),
        row({ id: 'empty', message_id: 'm-new', size_bytes: 0 }),
        row({ id: 'img', message_id: 'm-new', file_name: 'p.jpg', content_type: 'image/jpeg' }),
      ],
      ['m-new', 'm-old'],
    )
    expect(picked.map((p) => p.id)).toEqual(['new', 'old'])
  })

  it(`never more than ${MAX_ATTACHMENTS} files`, () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ id: `a${i}` }))
    expect(selectContextAttachments(rows, ['m1'])).toHaveLength(MAX_ATTACHMENTS)
  })
})

describe('extraction caps', () => {
  it('a text file is capped at MAX_EXTRACTED_CHARS', () => {
    const text = decodeTextFile(Buffer.from('x'.repeat(MAX_EXTRACTED_CHARS * 2)))
    expect(text).toHaveLength(MAX_EXTRACTED_CHARS)
  })

  it('reads the visible text of a .docx, paragraphs as lines, entities decoded', () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Fence quote</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">Total &amp; tax: </w:t></w:r><w:r><w:t>$1,200</w:t></w:r></w:p></w:body></w:document>'
    expect(extractDocxText(zipOne('word/document.xml', Buffer.from(xml)))).toBe('Fence quote\nTotal & tax: $1,200')
    expect(extractDocxText(zipOne('word/document.xml', Buffer.from(xml), 0))).toBe('Fence quote\nTotal & tax: $1,200')
  })

  it('a docx whose text inflates past the cap (zip bomb) or that is not a zip yields null', () => {
    const bomb = Buffer.from('<w:p><w:t>' + 'a'.repeat(5 * 1024 * 1024) + '</w:t></w:p>')
    expect(extractDocxText(zipOne('word/document.xml', bomb))).toBeNull()
    expect(extractDocxText(Buffer.from('not a zip at all'))).toBeNull()
    expect(extractDocxText(zipOne('other.xml', Buffer.from('<w:t>x</w:t>')))).toBeNull()
  })

  it('a docx body is capped at MAX_EXTRACTED_CHARS', () => {
    const xml = '<w:p><w:t>' + 'b'.repeat(MAX_EXTRACTED_CHARS + 500) + '</w:t></w:p>'
    expect(extractDocxText(zipOne('word/document.xml', Buffer.from(xml)))).toHaveLength(MAX_EXTRACTED_CHARS)
  })
})

describe('relevantExcerpt / buildAttachmentContext', () => {
  const doc =
    'ACME Roofing Invoice. Thank you for your business. Payment terms net 30. ' +
    'Gutter replacement on the north side was completed. ' +
    'Unrelated boilerplate about warranties and liability limits.'

  it('picks the sentences that match the resident’s question', () => {
    const out = relevantExcerpt(doc, 'Can the board reimburse my gutter replacement?', 400)
    expect(out).toContain('Gutter replacement')
    expect(out).not.toContain('boilerplate')
  })

  it('falls back to the head of the file when nothing matches', () => {
    expect(relevantExcerpt(doc, 'zzzz qqqq', 20)).toBe('ACME Roofing Invoice')
  })

  it('caps each file and the total, labels by position (never the file name), strips contact details', () => {
    const long = ('Fence permit details. ' + 'w'.repeat(80) + '. ').repeat(200)
    const files = Array.from({ length: 5 }, () => ({ kind: 'pdf' as const, text: long }))
    const out = buildAttachmentContext(files, 'fence permit')
    for (const e of out) expect(e.excerpt.length).toBeLessThanOrEqual(MAX_EXCERPT_CHARS_PER_FILE)
    expect(out.reduce((n, e) => n + e.excerpt.length, 0)).toBeLessThanOrEqual(MAX_EXCERPT_CHARS_TOTAL)
    expect(out[0]!.label).toBe('Attachment 1 (PDF)')

    const pii = buildAttachmentContext(
      [{ kind: 'text', text: 'Fence contractor: call 555-123-4567 or email bob@example.test about the fence.' }],
      'fence',
    )
    expect(findContactPII(pii[0]!.excerpt)).toEqual([])
  })

  it('no readable text: no excerpts', () => {
    expect(buildAttachmentContext([{ kind: 'pdf', text: '   ' }], 'fence')).toEqual([])
    expect(buildAttachmentContext([], 'fence')).toEqual([])
  })
})

describe('loadAttachmentContext', () => {
  function fakeDb(rows: AttachmentRow[], files: Record<string, Buffer> = {}) {
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(async () => ({ data: rows, error: null })),
    }
    const download = vi.fn(async (path: string) =>
      files[path]
        ? { data: { arrayBuffer: async () => files[path]!.buffer.slice(files[path]!.byteOffset, files[path]!.byteOffset + files[path]!.length) }, error: null }
        : { data: null, error: { message: 'missing' } },
    )
    return { from: vi.fn(() => chain), storage: { from: vi.fn(() => ({ download })) }, _download: download }
  }

  it('reads PDF and text attachments on the given messages into excerpts', async () => {
    const txtPath = 'org-1/inbox/thread-1/m1/a2/notes.txt'
    const db = fakeDb(
      [row(), row({ id: 'a2', file_name: 'notes.txt', content_type: 'text/plain', storage_path: txtPath })],
      { [txtPath]: Buffer.from('The fence repair was finished on Monday.') },
    )
    const out = await loadAttachmentContext(db as never, 'org-1', 'thread-1', ['m1'], 'fence repair')
    expect(out.failed).toBe(false)
    expect(out.excerpts.map((e) => e.label)).toEqual(['Attachment 1 (PDF)', 'Attachment 2 (TEXT)'])
    expect(out.excerpts[1]!.excerpt).toContain('fence repair was finished')
  })

  it('refuses a storage path outside this thread/attachment before any download', async () => {
    const db = fakeDb([
      row({ id: 'a3', file_name: 'x.txt', content_type: 'text/plain', storage_path: 'org-2/inbox/thread-1/m1/a3/x.txt' }),
    ])
    const out = await loadAttachmentContext(db as never, 'org-1', 'thread-1', ['m1'], 'fence')
    expect(db._download).not.toHaveBeenCalled()
    expect(out.excerpts).toEqual([])
  })

  it('a read error is soft: no excerpts, failed, no throw', async () => {
    const chain = { select: () => chain, eq: () => chain, in: async () => ({ data: null, error: { code: '42501' } }) }
    const out = await loadAttachmentContext({ from: () => chain } as never, 'org-1', 'thread-1', ['m1'], 'q')
    expect(out).toEqual({ excerpts: [], failed: true })
  })

  it('no messages: no read at all', async () => {
    const db = fakeDb([row()])
    expect(await loadAttachmentContext(db as never, 'org-1', 'thread-1', [], 'q')).toEqual({ excerpts: [], failed: false })
    expect(db.from).not.toHaveBeenCalled()
  })
})
