# HOA Inbox Outbound Composer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the reply-only inbox send path into a general outbound composer — forward a thread onward, add To/Cc recipients, attach documents, and start a brand-new conversation — all through the existing approve → 30-second undo → audited send lifecycle.

**Architecture:** `inbox_drafts` generalizes into an outbound-message row (`kind` ∈ reply/forward/new) carrying explicit recipients, with a child `inbox_draft_attachments` table holding storage-path references. `packages/mailbox` gains `multipart/mixed` MIME assembly and moves to Gmail's upload endpoint. `DraftPanel` splits into a state machine plus a shared `Composer`.

**Tech Stack:** TypeScript, Next.js 15 App Router (server actions), Supabase (Postgres + Storage), Inngest, Vitest, Tailwind via `@homeowner-portal/ui`.

**Spec:** `docs/superpowers/specs/2026-08-02-hoa-inbox-outbound-composer-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

- **`packages/mailbox` has ZERO runtime dependencies.** Node builtins (`node:crypto`, `node:buffer`) are allowed. Never add a MIME library, never add `googleapis`.
- **Never log an email address, subject, body, or filename.** Log opaque ids and counts only. This module handles resident PII.
- **PostgrestError:** log `.code` and `.message` only, never `.details`.
- **Every Supabase query is org-scoped.** Inbox tables use `.eq('organization_id', org.id)`. `hoa_documents` and `hoa_document_versions` use **`org_id`**, not `organization_id`.
- **State transitions are conditional updates** (`.eq('status', …)`), never read-then-decide.
- **No Bcc.** No field, no column, no parameter, anywhere.
- **Attachment size ceiling: 15 MB** of raw file bytes per message, exported once as `MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024`. Never a literal.
- **Max 25 recipients** total across To + Cc, exported once as `MAX_RECIPIENTS = 25`.
- **Storage bucket is `hoa-documents`** (private). Draft uploads live under `inbox-drafts/<orgId>/<draftId>/<uuid>`.
- **Prefix shell commands with `rtk`** per `CLAUDE.md`, including inside `&&` chains.
- **Run unit tests with** `rtk npm run test:unit` from the repo root (Vitest, root `vitest.config.ts`).
- **Commit message trailer:** end every commit body with
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

---

## File Structure

### `packages/mailbox/src/`
| File | Responsibility |
|---|---|
| `send.ts` *(modify)* | `buildMimeMessage` (RFC822 assembly, single-part and `multipart/mixed`) and `sendReply` (Gmail upload endpoint). Replaces `buildRawMessage`. |
| `send.test.ts` *(modify)* | Golden single-part test, multipart structure, boundary collision, header/filename injection. |
| `types.ts` *(modify)* | `OutboundAttachment` interface. |
| `index.ts` *(modify)* | Export `buildMimeMessage`, `OutboundAttachment`; drop `buildRawMessage`. |

### `apps/hoa/src/lib/inbox/draft/`
| File | Responsibility |
|---|---|
| `recipients.ts` *(create)* | Pure recipient normalization/validation. `MAX_RECIPIENTS`. |
| `recipients.test.ts` *(create)* | Unit tests for the above. |
| `attachments.ts` *(create)* | Pure size-budget helpers. `MAX_ATTACHMENT_BYTES`. |
| `attachments.test.ts` *(create)* | Unit tests for the above. |
| `forward.ts` *(create)* | Pure `buildForwardBody` quoting helper. |
| `forward.test.ts` *(create)* | Unit tests for the above. |
| `actions.ts` *(modify)* | `createDraft`, `approveDraft`, `cancelDraft` + `createForwardDraft`, `createComposeDraft`. |
| `attachment-actions.ts` *(create)* | `createAttachmentUploadUrl`, `addDraftAttachment`, `removeDraftAttachment`. Split out so `actions.ts` does not keep growing. |

### `apps/hoa/src/lib/inbox/`
| File | Responsibility |
|---|---|
| `queries.ts` *(modify)* | `ThreadDraft` gains `kind`/`toEmails`/`ccEmails`/`attachments`; `ThreadMessage` gains `forwardedTo`; new `listAttachableDocuments`. |

### `apps/hoa/src/app/(dashboard)/inbox/`
| File | Responsibility |
|---|---|
| `[id]/DraftPanel.tsx` *(modify)* | State machine **only**; delegates the editable state to `Composer`. |
| `[id]/Composer.tsx` *(create)* | Shared editable form: recipients, subject, body, attachments, approve. |
| `[id]/RecipientFields.tsx` *(create)* | Chip-style To editor; Cc behind a toggle. |
| `[id]/AttachmentPicker.tsx` *(create)* | Upload / this thread / document library. |
| `compose/page.tsx` *(create)* | New-message screen. |

### `packages/jobs/src/`
| File | Responsibility |
|---|---|
| `mailbox-send.ts` *(modify)* | Reads recipients off the row, downloads attachments pre-send, handles `kind='new'`. |
| `mailbox-send.test.ts` *(modify)* | New cases + storage fake. |

### `migrations/`
| File | Responsibility |
|---|---|
| `0038_inbox_outbound_recipients.sql` *(create)* | `kind`, `to_emails`, `cc_emails`, `mailbox_account_id`, nullable `thread_id`. |
| `0039_inbox_draft_attachments.sql` *(create)* | `inbox_draft_attachments` + RLS. |

---

## Phase 1 — Transport (`packages/mailbox`)

No schema, no UI. Pure and fully unit-testable.

### Task 1: `buildMimeMessage` — RFC822 assembly with Cc

**Files:**
- Modify: `packages/mailbox/src/send.ts`
- Modify: `packages/mailbox/src/index.ts`
- Test: `packages/mailbox/src/send.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `buildMimeMessage(opts: { from: string; to: string[]; cc?: string[]; subject: string; body: string; inReplyTo: string | null; references: string[] }): string` — returns **raw RFC822 text**, not base64url. `buildRawMessage` is deleted.

Why the return type changes: Task 3 moves `sendReply` to Gmail's upload endpoint, which takes a `message/rfc822` part containing raw bytes. Base64url wrapping existed only for the JSON `{raw}` field and becomes dead weight.

- [ ] **Step 1: Write the failing tests**

Add to `packages/mailbox/src/send.test.ts`. Replace the existing `decode()` helper and the `describe('buildRawMessage', …)` block entirely — the new function returns text directly, so decoding is gone.

```ts
import { describe, it, expect } from 'vitest'
import { buildMimeMessage } from './send'

describe('buildMimeMessage — single part', () => {
  const base = {
    from: 'hoa@example.com',
    to: ['resident@example.com'],
    subject: 'Re: Fence',
    body: 'Thanks for writing.',
    inReplyTo: '<abc@mail.gmail.com>',
    references: ['<abc@mail.gmail.com>'],
  }

  // GOLDEN TEST — pins the exact byte layout of the no-attachment path so a
  // later multipart change cannot silently alter ordinary replies.
  it('emits the exact expected RFC822 message', () => {
    expect(buildMimeMessage(base)).toBe(
      [
        'From: hoa@example.com',
        'To: resident@example.com',
        'Subject: Re: Fence',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: 8bit',
        'In-Reply-To: <abc@mail.gmail.com>',
        'References: <abc@mail.gmail.com>',
        '',
        'Thanks for writing.',
      ].join('\r\n'),
    )
  })

  it('omits threading headers on a first message rather than emitting empty ones', () => {
    const out = buildMimeMessage({ ...base, inReplyTo: null, references: [] })
    expect(out).not.toContain('In-Reply-To:')
    expect(out).not.toContain('References:')
  })

  it('encodes a non-ASCII subject so it is not mangled', () => {
    const out = buildMimeMessage({ ...base, subject: 'Re: Grünanlage' })
    expect(out).toContain('=?UTF-8?B?')
    expect(out).not.toContain('Subject: Re: Grünanlage')
  })

  it('rejects a header-injection attempt in the subject', () => {
    expect(() => buildMimeMessage({ ...base, subject: 'Hi\r\nBcc: attacker@evil.com' })).toThrow()
  })
})

describe('buildMimeMessage — Cc', () => {
  const base = {
    from: 'hoa@example.com',
    to: ['resident@example.com'],
    subject: 'Re: Fence',
    body: 'Thanks.',
    inReplyTo: null,
    references: [],
  }

  it('emits a Cc header listing every address', () => {
    const out = buildMimeMessage({ ...base, cc: ['pm@example.com', 'board@example.com'] })
    expect(out).toContain('Cc: pm@example.com, board@example.com')
  })

  it('omits Cc entirely when empty', () => {
    expect(buildMimeMessage({ ...base, cc: [] })).not.toContain('Cc:')
  })

  it('rejects CR/LF in a Cc address', () => {
    expect(() =>
      buildMimeMessage({ ...base, cc: ['ok@example.com\r\nBcc: attacker@evil.com'] }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk npm run test:unit -- packages/mailbox/src/send.test.ts`
Expected: FAIL — `buildMimeMessage is not a function`.

- [ ] **Step 3: Implement**

In `packages/mailbox/src/send.ts`, replace `buildRawMessage` with:

```ts
export function buildMimeMessage(opts: {
  from: string
  to: string[]
  cc?: string[]
  subject: string
  body: string
  inReplyTo: string | null
  references: string[]
}): string {
  const cc = opts.cc ?? []

  assertNoHeaderInjection('subject', opts.subject)
  assertNoHeaderInjection('from', opts.from)
  for (const to of opts.to) assertNoHeaderInjection('to', to)
  for (const address of cc) assertNoHeaderInjection('cc', address)
  if (opts.inReplyTo) assertNoHeaderInjection('inReplyTo', opts.inReplyTo)
  for (const ref of opts.references) assertNoHeaderInjection('references', ref)

  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(', ')}`,
  ]
  // Omitted entirely when empty — an empty `Cc:` header is not useful and
  // some relays treat a bare header as malformed.
  if (cc.length > 0) headers.push(`Cc: ${cc.join(', ')}`)
  headers.push(
    `Subject: ${encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
  )

  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`)
  if (opts.references.length > 0) headers.push(`References: ${opts.references.join(' ')}`)

  return `${headers.join('\r\n')}\r\n\r\n${opts.body}`
}
```

Delete the old base64url tail (the `Buffer.from(...).toString('base64').replace(...)` block) — Task 3's transport takes raw bytes.

In `packages/mailbox/src/index.ts`, change the last line to:

```ts
export { buildMimeMessage, sendReply } from './send'
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk npm run test:unit -- packages/mailbox/src/send.test.ts`
Expected: PASS.

The repo will not typecheck yet — `packages/jobs/src/mailbox-send.ts` still imports `buildRawMessage`. Task 3 fixes that. Do not patch it here.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/mailbox/src/send.ts packages/mailbox/src/send.test.ts packages/mailbox/src/index.ts && rtk git commit -m "$(cat <<'EOF'
feat(mailbox): buildMimeMessage returns RFC822 and supports Cc

Replaces buildRawMessage. The base64url wrapping existed only for the
Gmail JSON {raw} field, which the upload endpoint does not use. Cc
addresses go through the same CR/LF injection guard as every other
interpolated header.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `multipart/mixed` attachments

**Files:**
- Modify: `packages/mailbox/src/send.ts`
- Modify: `packages/mailbox/src/types.ts`
- Modify: `packages/mailbox/src/index.ts`
- Test: `packages/mailbox/src/send.test.ts`

**Interfaces:**
- Consumes: `buildMimeMessage` from Task 1.
- Produces: `OutboundAttachment { fileName: string; contentType: string | null; bytes: Buffer }`, exported from `types.ts` and re-exported from `index.ts`. `buildMimeMessage` gains `attachments?: OutboundAttachment[]`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/mailbox/src/send.test.ts`:

```ts
import { buildMimeMessage, assertNoBoundaryCollision } from './send'

describe('buildMimeMessage — attachments', () => {
  const base = {
    from: 'hoa@example.com',
    to: ['resident@example.com'],
    subject: 'Re: Fence',
    body: 'See attached.',
    inReplyTo: null,
    references: [],
  }
  const pdf = {
    fileName: 'ccrs.pdf',
    contentType: 'application/pdf',
    bytes: Buffer.from('%PDF-1.4 fake'),
  }

  it('stays byte-identical to the single-part form when attachments is empty', () => {
    expect(buildMimeMessage({ ...base, attachments: [] })).toBe(buildMimeMessage(base))
  })

  it('declares multipart/mixed with a boundary and closes it', () => {
    const out = buildMimeMessage({ ...base, attachments: [pdf] })
    const match = out.match(/Content-Type: multipart\/mixed; boundary="([^"]+)"/)
    expect(match).not.toBeNull()
    const boundary = match![1]
    expect(out).toContain(`--${boundary}\r\n`)
    expect(out.endsWith(`--${boundary}--`)).toBe(true)
  })

  it('carries the body as the first part and the file as a base64 attachment part', () => {
    const out = buildMimeMessage({ ...base, attachments: [pdf] })
    expect(out).toContain('Content-Type: text/plain; charset="UTF-8"')
    expect(out).toContain('See attached.')
    expect(out).toContain('Content-Type: application/pdf; name="ccrs.pdf"')
    expect(out).toContain('Content-Disposition: attachment; filename="ccrs.pdf"')
    expect(out).toContain('Content-Transfer-Encoding: base64')
    expect(out).toContain(pdf.bytes.toString('base64'))
  })

  it('defaults a null contentType to application/octet-stream', () => {
    const out = buildMimeMessage({
      ...base,
      attachments: [{ ...pdf, contentType: null }],
    })
    expect(out).toContain('Content-Type: application/octet-stream; name="ccrs.pdf"')
  })

  it('wraps base64 at 76 columns', () => {
    const big = { ...pdf, bytes: Buffer.alloc(1000, 0x41) }
    const out = buildMimeMessage({ ...base, attachments: [big] })
    const payload = out.slice(out.lastIndexOf('base64\r\n\r\n') + 'base64\r\n\r\n'.length)
    for (const line of payload.split('\r\n').filter((l) => !l.startsWith('--') && l !== '')) {
      expect(line.length).toBeLessThanOrEqual(76)
    }
  })

  it('generates a fresh boundary per call', () => {
    const a = buildMimeMessage({ ...base, attachments: [pdf] })
    const b = buildMimeMessage({ ...base, attachments: [pdf] })
    const boundaryOf = (s: string) => s.match(/boundary="([^"]+)"/)![1]
    expect(boundaryOf(a)).not.toBe(boundaryOf(b))
  })

  it('keeps framing intact when the body merely resembles a boundary prefix', () => {
    // A true collision cannot be forced from outside — the boundary carries
    // 16 random bytes. What IS reachable is a body sharing the fixed prefix,
    // which must not be mistaken for a delimiter.
    const out = buildMimeMessage({
      ...base,
      body: '----=_HH_ not a real boundary',
      attachments: [pdf],
    })
    const boundary = out.match(/boundary="([^"]+)"/)![1]
    // Exactly three delimiter occurrences: open, mid, close.
    expect(out.split(`--${boundary}`).length - 1).toBe(3)
  })

  // The collision guard itself, exercised directly. `assertNoBoundaryCollision`
  // is exported for this reason and no other: the random boundary makes the
  // branch unreachable through buildMimeMessage, and an untested throw is a
  // throw nobody knows is broken.
  it('assertNoBoundaryCollision throws when a part contains the delimiter', () => {
    expect(() => assertNoBoundaryCollision(['hello --BOUND there'], 'BOUND')).toThrow(
      /boundary collision/,
    )
  })

  it('assertNoBoundaryCollision passes when no part contains the delimiter', () => {
    expect(() => assertNoBoundaryCollision(['hello there'], 'BOUND')).not.toThrow()
  })

  it('rejects CR/LF in a filename — it lands in a header parameter', () => {
    expect(() =>
      buildMimeMessage({
        ...base,
        attachments: [{ ...pdf, fileName: 'a.pdf"\r\nBcc: attacker@evil.com' }],
      }),
    ).toThrow()
  })

  it('rejects a double quote in a filename rather than escaping it', () => {
    expect(() =>
      buildMimeMessage({ ...base, attachments: [{ ...pdf, fileName: 'we"ird.pdf' }] }),
    ).toThrow()
  })

  it('rejects an empty filename', () => {
    expect(() =>
      buildMimeMessage({ ...base, attachments: [{ ...pdf, fileName: '   ' }] }),
    ).toThrow()
  })

  it('RFC 2047 encodes a non-ASCII filename', () => {
    const out = buildMimeMessage({
      ...base,
      attachments: [{ ...pdf, fileName: 'Grünanlage.pdf' }],
    })
    expect(out).toContain('=?UTF-8?B?')
    expect(out).not.toContain('filename="Grünanlage.pdf"')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk npm run test:unit -- packages/mailbox/src/send.test.ts`
Expected: FAIL — `attachments` is not a known property; multipart assertions fail.

- [ ] **Step 3: Implement**

Add to `packages/mailbox/src/types.ts`:

```ts
/**
 * One file on an outgoing message. `bytes` is the decoded file content —
 * the caller is responsible for having already enforced any size budget,
 * because this layer has no notion of a per-message cap.
 */
export interface OutboundAttachment {
  fileName: string
  contentType: string | null
  bytes: Buffer
}
```

Add to `packages/mailbox/src/send.ts`, above `buildMimeMessage`:

```ts
import { randomBytes } from 'node:crypto'
import { MailboxAuthError, type OutboundAttachment } from './types'

/**
 * A filename is interpolated into two header parameters below
 * (`name=` and `filename=`), so it is exactly as dangerous as any other
 * header value — see assertNoHeaderInjection's docstring. A double quote
 * would terminate the quoted-string early and let the rest of the filename
 * be read as further parameters, so it is REJECTED rather than escaped:
 * escaping is easy to get subtly wrong, and no legitimate HOA document is
 * named with a quote in it.
 */
function assertSafeFileName(name: string): void {
  assertNoHeaderInjection('fileName', name)
  if (name.includes('"')) {
    throw new Error('buildMimeMessage: fileName must not contain a double quote')
  }
  if (name.trim() === '') {
    throw new Error('buildMimeMessage: fileName must not be empty')
  }
}

/**
 * Random per message. The `-` and `_` characters cannot appear in standard
 * base64 output, so an attachment part can never contain the delimiter; the
 * BODY still can, which is what the assertion in buildMimeMessage covers.
 */
function makeBoundary(): string {
  return `----=_HH_${randomBytes(16).toString('hex')}`
}

function base64Lines(bytes: Buffer): string {
  return (bytes.toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}

/**
 * A part containing the delimiter would forge MIME structure — a crafted
 * reply could append an arbitrary extra part. The boundary carries 16 random
 * bytes, so this is astronomically unlikely and unreachable from outside;
 * it is asserted rather than trusted because the failure mode is message
 * forgery, not a rendering glitch.
 *
 * Exported ONLY so the unreachable branch can be tested directly. An
 * untested throw is a throw nobody knows is broken.
 */
export function assertNoBoundaryCollision(parts: string[], boundary: string): void {
  for (const part of parts) {
    if (part.includes(`--${boundary}`)) {
      throw new Error('buildMimeMessage: boundary collision in message content')
    }
  }
}
```

Then in `buildMimeMessage`, add `attachments?: OutboundAttachment[]` to the options type and replace the return with:

```ts
  const attachments = opts.attachments ?? []
  for (const file of attachments) assertSafeFileName(file.fileName)

  // No attachments — emit the single-part message unchanged, byte for byte.
  // A golden test pins this: ordinary replies are the overwhelming majority
  // of outbound mail and must not shift because attachments became possible.
  if (attachments.length === 0) {
    return `${headers.join('\r\n')}\r\n\r\n${opts.body}`
  }

  const boundary = makeBoundary()

  const parts = [
    [
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      opts.body,
    ].join('\r\n'),
    ...attachments.map((file) =>
      [
        `Content-Type: ${file.contentType ?? 'application/octet-stream'}; name="${encodeHeader(file.fileName)}"`,
        `Content-Disposition: attachment; filename="${encodeHeader(file.fileName)}"`,
        'Content-Transfer-Encoding: base64',
        '',
        base64Lines(file.bytes),
      ].join('\r\n'),
    ),
  ]

  assertNoBoundaryCollision(parts, boundary)

  // Swap the single-part content headers for the multipart declaration. The
  // 8bit transfer encoding moves onto the body PART; a multipart container
  // must not declare one.
  const multipartHeaders = headers.filter(
    (h) =>
      !h.startsWith('Content-Type: text/plain') &&
      !h.startsWith('Content-Transfer-Encoding:'),
  )
  multipartHeaders.splice(
    multipartHeaders.findIndex((h) => h === 'MIME-Version: 1.0') + 1,
    0,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  )

  const bodyBlock = `--${boundary}\r\n${parts.join(`\r\n--${boundary}\r\n`)}\r\n--${boundary}--`
  return `${multipartHeaders.join('\r\n')}\r\n\r\n${bodyBlock}`
```

Re-export the type from `packages/mailbox/src/index.ts` (`types.ts` is already `export *`, so no change is needed there — verify with `rtk grep -n "export \* from './types'" packages/mailbox/src/index.ts`).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk npm run test:unit -- packages/mailbox/src/send.test.ts`
Expected: PASS, including the golden single-part test from Task 1.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/mailbox/src/send.ts packages/mailbox/src/types.ts packages/mailbox/src/send.test.ts && rtk git commit -m "$(cat <<'EOF'
feat(mailbox): multipart/mixed attachments in buildMimeMessage

Hand-rolled, keeping the package dependency-free. The no-attachment path
is byte-identical to before and pinned by a golden test. Filenames land in
header parameters, so they go through the injection guard and reject a
double quote outright rather than escaping it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `sendReply` moves to the Gmail upload endpoint

**Files:**
- Modify: `packages/mailbox/src/send.ts`
- Modify: `packages/jobs/src/mailbox-send.ts:196-204` (call site only)
- Test: `packages/mailbox/src/send.test.ts`

**Interfaces:**
- Consumes: `buildMimeMessage` from Tasks 1–2.
- Produces: `sendReply(accessToken: string, threadId: string | null, mime: string): Promise<{ messageId: string; threadId: string | null }>`. The third parameter is now **raw RFC822 text**, not base64url. `threadId` accepts `null` for a message that starts a new conversation (Phase 5 needs this).

Why: `POST /gmail/v1/users/me/messages/send` with a JSON `{raw}` body caps the whole request near 5 MB — smaller than one phone photo. `POST /upload/gmail/v1/users/me/messages/send?uploadType=multipart` takes a JSON metadata part plus a `message/rfc822` part and allows 35 MB.

- [ ] **Step 1: Write the failing tests**

Replace the existing `describe('sendReply', …)` block in `packages/mailbox/src/send.test.ts`:

```ts
import { afterEach, vi } from 'vitest'
import { sendReply } from './send'
import { MailboxAuthError } from './types'

describe('sendReply', () => {
  afterEach(() => vi.restoreAllMocks())

  function mockOk() {
    return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'msg-1', threadId: 'thread-1' }), { status: 200 }),
    )
  }

  it('posts to the upload endpoint with uploadType=multipart', async () => {
    const fetchSpy = mockOk()
    await sendReply('at-1', 'thread-1', 'From: a@b.c\r\n\r\nhi')
    const url = String(fetchSpy.mock.calls[0][0])
    expect(url).toContain('/upload/gmail/v1/users/me/messages/send')
    expect(url).toContain('uploadType=multipart')
  })

  it('sends a related multipart carrying the threadId metadata and the rfc822 message', async () => {
    const fetchSpy = mockOk()
    await sendReply('at-1', 'thread-1', 'From: a@b.c\r\n\r\nhi')
    const init = fetchSpy.mock.calls[0][1] as RequestInit
    const contentType = String((init.headers as Record<string, string>)['Content-Type'])
    expect(contentType).toContain('multipart/related; boundary=')
    const body = String(init.body)
    expect(body).toContain('Content-Type: application/json; charset=UTF-8')
    expect(body).toContain('{"threadId":"thread-1"}')
    expect(body).toContain('Content-Type: message/rfc822')
    expect(body).toContain('From: a@b.c')
  })

  it('omits threadId from the metadata when null, so the message starts a new thread', async () => {
    const fetchSpy = mockOk()
    await sendReply('at-1', null, 'From: a@b.c\r\n\r\nhi')
    const body = String((fetchSpy.mock.calls[0][1] as RequestInit).body)
    expect(body).toContain('{}')
    expect(body).not.toContain('threadId')
  })

  it('returns the message id and thread id from the payload on success', async () => {
    mockOk()
    const result = await sendReply('at-1', 'thread-1', 'raw')
    expect(result).toEqual({ messageId: 'msg-1', threadId: 'thread-1' })
  })

  it('throws MailboxAuthError on a 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 401 }))
    await expect(sendReply('bad', 'thread-1', 'raw')).rejects.toBeInstanceOf(MailboxAuthError)
  })

  it('throws MailboxAuthError on a 403', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 403 }))
    await expect(sendReply('at-1', 'thread-1', 'raw')).rejects.toBeInstanceOf(MailboxAuthError)
  })

  it('throws a generic Error carrying the status on other non-OK responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal error', { status: 500, statusText: 'Internal Server Error' }),
    )
    await expect(sendReply('at-1', 'thread-1', 'raw')).rejects.toThrow(/500/)
  })

  it('throws when a 200 response payload has no id', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ threadId: 'thread-1' }), { status: 200 }),
    )
    await expect(sendReply('at-1', 'thread-1', 'raw')).rejects.toThrow(/message id/)
  })
})
```

Delete the old `'is base64url — no +, / or = that would break the Gmail API'` test. It asserted a property of a transport that no longer exists.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk npm run test:unit -- packages/mailbox/src/send.test.ts`
Expected: FAIL — the request still targets the non-upload URL with a JSON body.

- [ ] **Step 3: Implement**

In `packages/mailbox/src/send.ts`, replace the `GMAIL_SEND_URL` constant and `sendReply`:

```ts
const GMAIL_UPLOAD_SEND_URL =
  'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=multipart'

/**
 * Send via the Gmail API's UPLOAD endpoint.
 *
 * The plain `messages/send` endpoint takes the message base64url-encoded in
 * a JSON field, which caps the whole request near 5MB — less than a single
 * phone photo. `uploadType=multipart` takes a JSON metadata part plus a
 * `message/rfc822` part and allows 35MB.
 *
 * `threadId` files the message into the same conversation on the HOA's side;
 * In-Reply-To/References (already in `mime` from buildMimeMessage) do the
 * same on the resident's side. Both are needed. `null` omits it, which is
 * what a brand-new conversation requires.
 *
 * Deliberately no retry, unchanged from before: this call is not idempotent,
 * and retrying after an ambiguous failure (a timeout where the send may have
 * already succeeded) risks sending a resident the same reply twice. The
 * caller records the failure and a human decides whether to resend.
 */
export async function sendReply(
  accessToken: string,
  threadId: string | null,
  mime: string,
): Promise<{ messageId: string; threadId: string | null }> {
  const boundary = makeBoundary()
  const metadata = JSON.stringify(threadId ? { threadId } : {})

  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: message/rfc822',
    '',
    mime,
    `--${boundary}--`,
  ].join('\r\n')

  const response = await fetch(GMAIL_UPLOAD_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })

  // Same mapping as GmailClient: dead credentials must surface distinctly so
  // the caller can mark the mailbox as needing reconnection rather than
  // treating this as a transient blip.
  if (response.status === 401 || response.status === 403) {
    throw new MailboxAuthError(`Gmail rejected the send: ${response.status}`)
  }
  if (!response.ok) {
    throw new Error(`sendReply: Gmail returned ${response.status} ${response.statusText}`)
  }

  const payload = (await response.json()) as { id?: string; threadId?: string }
  if (!payload.id) {
    throw new Error('sendReply: Gmail response contained no message id')
  }
  return { messageId: payload.id, threadId: payload.threadId ?? threadId }
}
```

Then fix the one call site in `packages/jobs/src/mailbox-send.ts` — change the import on line 2 from `buildRawMessage` to `buildMimeMessage`, and inside `sendToGmail` rename `const raw = buildRawMessage({…})` to `const mime = buildMimeMessage({…})` and pass `mime` to `sendReply`. Nothing else in that file changes in this task.

- [ ] **Step 4: Run the full unit suite and typecheck**

Run: `rtk npm run test:unit && rtk npm run typecheck`
Expected: PASS. `mailbox-send.test.ts` mocks `buildRawMessage` by name — update that mock to `buildMimeMessage: vi.fn(() => 'mime-message')` and the two assertions that reference it.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/mailbox/src/send.ts packages/mailbox/src/send.test.ts packages/jobs/src/mailbox-send.ts packages/jobs/src/mailbox-send.test.ts && rtk git commit -m "$(cat <<'EOF'
feat(mailbox): send via the Gmail upload endpoint for a 35MB ceiling

The JSON {raw} endpoint caps a request near 5MB, smaller than one photo.
uploadType=multipart carries threadId as metadata alongside a message/rfc822
part. threadId is now nullable so a new conversation can be started. The
no-retry rule is unchanged and still deliberate.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Verify against real Gmail before Phase 2**

The `uploadType=multipart` metadata contract is the one thing here that unit tests cannot prove. From a branch deploy with a connected mailbox, send one reply through the UI and confirm in Gmail that it landed **in the existing thread** rather than as a new conversation. If `threadId` is not honored, the fallback is `uploadType=media` (raw `message/rfc822` body, no metadata part) plus a follow-up `messages/modify` — record which was needed in the commit message.

---

## Phase 2 — Schema and recipients on replies

Ships a usable feature on its own: a board member can add To/Cc addresses to an AI-drafted reply.

### Task 4: Migration 0038 — recipients on `inbox_drafts`

**Files:**
- Create: `migrations/0038_inbox_outbound_recipients.sql`

**Interfaces:**
- Produces: `inbox_drafts.kind`, `.to_emails`, `.cc_emails`, `.mailbox_account_id`; `thread_id` becomes nullable. Every later task in Phases 2–5 reads these.

- [ ] **Step 1: Write the migration**

Create `migrations/0038_inbox_outbound_recipients.sql`:

```sql
-- Phase C: inbox_drafts generalizes from "an AI-suggested reply" into an
-- outbound message of any kind. Recipients move from send-time derivation
-- (mailbox-send.ts looked up the last inbound message's from_email) onto
-- the row itself, so what an approver saw is what actually ships — a new
-- inbound message arriving during the 30-second undo window could
-- previously redirect the reply to a different address.
--
-- No bcc_emails column, deliberately. Bcc is invisible in the delivered
-- message and is the exact header buildMimeMessage's injection guard exists
-- to prevent being smuggled in. Every recipient of HOA mail carrying
-- balances or violation history stays on the record.
ALTER TABLE public.inbox_drafts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'reply'
    CHECK (kind IN ('reply', 'forward', 'new')),
  ADD COLUMN IF NOT EXISTS to_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS cc_emails text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS mailbox_account_id uuid
    REFERENCES public.mailbox_accounts(id) ON DELETE CASCADE;

-- A brand-new conversation has no thread yet: it is sent with no Gmail
-- threadId and the ordinary 2-minute sync ingests it into a real thread,
-- the same reasoning already recorded in mailbox-send.ts for sent replies.
-- So thread_id must be nullable, but ONLY for kind='new', and such a row
-- must instead name the mailbox it sends from.
ALTER TABLE public.inbox_drafts
  ALTER COLUMN thread_id DROP NOT NULL;

ALTER TABLE public.inbox_drafts
  DROP CONSTRAINT IF EXISTS inbox_drafts_thread_or_account;

ALTER TABLE public.inbox_drafts
  ADD CONSTRAINT inbox_drafts_thread_or_account CHECK (
    (kind =  'new' AND thread_id IS     NULL AND mailbox_account_id IS NOT NULL) OR
    (kind <> 'new' AND thread_id IS NOT NULL)
  );

-- The compose screen lists a mailbox's own drafts, which have no thread to
-- index by.
CREATE INDEX IF NOT EXISTS inbox_drafts_account_idx
  ON public.inbox_drafts(mailbox_account_id, created_at DESC)
  WHERE thread_id IS NULL;
```

RLS needs no change: the existing `board_access` policy on `inbox_drafts` is `FOR ALL` on `organization_id`, which already covers the new columns.

- [ ] **Step 2: Apply it to the local/branch database**

Follow the existing project convention in `docs/APPLY_v1.1_MIGRATIONS.md`. Verify:

```bash
rtk psql "$DATABASE_URL" -c "\d public.inbox_drafts" | rtk grep -E "kind|to_emails|cc_emails|mailbox_account_id|thread_id"
```
Expected: `thread_id` shows no `not null`; the four new columns are present.

- [ ] **Step 3: Verify the CHECK constraint actually bites**

```bash
rtk psql "$DATABASE_URL" -c "INSERT INTO public.inbox_drafts (organization_id, kind, subject, body_text) VALUES ('00000000-0000-0000-0000-000000000000','new','x','y');"
```
Expected: FAIL — violates `inbox_drafts_thread_or_account` (a `kind='new'` row with no `mailbox_account_id`). If this succeeds, the constraint is wrong; fix before continuing.

- [ ] **Step 4: Commit**

```bash
rtk git add migrations/0038_inbox_outbound_recipients.sql && rtk git commit -m "$(cat <<'EOF'
feat(inbox): recipients and kind on inbox_drafts

Generalizes the AI-reply row into an outbound message of any kind. Moves
recipients from send-time derivation onto the row so the approver's view is
authoritative. No bcc column, by design.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Pure recipient validation

**Files:**
- Create: `apps/hoa/src/lib/inbox/draft/recipients.ts`
- Test: `apps/hoa/src/lib/inbox/draft/recipients.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MAX_RECIPIENTS = 25`
  - `normalizeRecipients(to: string[], cc: string[]): { ok: true; to: string[]; cc: string[] } | { ok: false; error: string }`
  - `isValidEmail(value: string): boolean`

This module is pure on purpose — the root Vitest harness is scoped to modules with no Supabase, no Next server components, and no network, and validation is the part of `approveDraft` most worth testing exhaustively.

- [ ] **Step 1: Write the failing tests**

Create `apps/hoa/src/lib/inbox/draft/recipients.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeRecipients, isValidEmail, MAX_RECIPIENTS } from './recipients'

describe('isValidEmail', () => {
  it.each(['a@b.co', 'first.last+tag@sub.example.com'])('accepts %s', (v) => {
    expect(isValidEmail(v)).toBe(true)
  })

  it.each([
    'no-at-sign',
    'no@tld',
    'spa ce@example.com',
    'two@@example.com',
    'a@example.com, b@example.com',
    'a@example.com\r\nBcc: attacker@evil.com',
    '<a@example.com>',
    '',
  ])('rejects %j', (v) => {
    expect(isValidEmail(v)).toBe(false)
  })
})

describe('normalizeRecipients', () => {
  it('trims and lowercases, preserving order', () => {
    const result = normalizeRecipients(['  Resident@Example.COM '], [])
    expect(result).toEqual({ ok: true, to: ['resident@example.com'], cc: [] })
  })

  it('refuses an empty To — a message with no recipient cannot be sent', () => {
    const result = normalizeRecipients([], ['cc@example.com'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(/at least one recipient/i)
  })

  it('refuses a To that is only whitespace', () => {
    expect(normalizeRecipients(['  '], []).ok).toBe(false)
  })

  it('names the offending address when one is malformed', () => {
    const result = normalizeRecipients(['ok@example.com', 'nope'], [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('nope')
  })

  it('rejects a CR/LF injection attempt in a recipient', () => {
    expect(normalizeRecipients(['a@b.co\r\nBcc: attacker@evil.com'], []).ok).toBe(false)
  })

  it('deduplicates case-insensitively within To', () => {
    const result = normalizeRecipients(['a@b.co', 'A@B.CO'], [])
    expect(result).toEqual({ ok: true, to: ['a@b.co'], cc: [] })
  })

  it('drops a Cc address already present in To — Gmail would deliver twice', () => {
    const result = normalizeRecipients(['a@b.co'], ['A@B.co', 'c@d.co'])
    expect(result).toEqual({ ok: true, to: ['a@b.co'], cc: ['c@d.co'] })
  })

  it(`refuses more than ${MAX_RECIPIENTS} recipients across To and Cc`, () => {
    const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `u${i}@example.com`)
    const result = normalizeRecipients(many, [])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(String(MAX_RECIPIENTS))
  })

  it(`allows exactly ${MAX_RECIPIENTS}`, () => {
    const many = Array.from({ length: MAX_RECIPIENTS }, (_, i) => `u${i}@example.com`)
    expect(normalizeRecipients(many, []).ok).toBe(true)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/recipients.test.ts`
Expected: FAIL — cannot resolve `./recipients`.

- [ ] **Step 3: Implement**

Create `apps/hoa/src/lib/inbox/draft/recipients.ts`:

```ts
/**
 * Pure recipient validation, shared by the server action that queues a send
 * and the client composer that has to disable Approve.
 *
 * Deliberately has NO `'use server'` directive, for the same reason as
 * blanks.ts: a `'use server'` module may export only async functions, and
 * the client component needs these synchronously.
 *
 * The email predicate is intentionally pragmatic rather than RFC 5322
 * complete. It has one hard job: guarantee that whatever reaches
 * buildMimeMessage cannot break out of a header. Anything containing CR,
 * LF, a comma, or an angle bracket is refused here so that the injection
 * guard downstream is a second line of defence rather than the only one.
 */

/** One address per chip; display names are not supported. */
const EMAIL = /^[^\s@,<>;"]+@[^\s@,<>;"]+\.[^\s@,<>;"]{2,}$/

/** Spec: at most 25 recipients across To and Cc. Never a literal. */
export const MAX_RECIPIENTS = 25

export function isValidEmail(value: string): boolean {
  return EMAIL.test(value.trim())
}

export function normalizeRecipients(
  to: string[],
  cc: string[],
):
  | { ok: true; to: string[]; cc: string[] }
  | { ok: false; error: string } {
  const clean = (list: string[]) => list.map((v) => v.trim()).filter((v) => v !== '')

  const rawTo = clean(to)
  const rawCc = clean(cc)

  if (rawTo.length === 0) {
    return { ok: false, error: 'Add at least one recipient before sending.' }
  }

  for (const address of [...rawTo, ...rawCc]) {
    if (!isValidEmail(address)) {
      // Safe to echo: this string came from the user's own input box and is
      // shown back to them inline. It is never written to a log.
      return { ok: false, error: `"${address}" is not a valid email address.` }
    }
  }

  // Case-insensitive dedupe. A Cc that duplicates a To is dropped rather
  // than rejected — the user's intent is unambiguous and Gmail would
  // otherwise deliver the same message twice.
  const seen = new Set<string>()
  const dedupe = (list: string[]) =>
    list
      .map((v) => v.toLowerCase())
      .filter((v) => (seen.has(v) ? false : (seen.add(v), true)))

  const finalTo = dedupe(rawTo)
  const finalCc = dedupe(rawCc)

  if (finalTo.length + finalCc.length > MAX_RECIPIENTS) {
    return {
      ok: false,
      error: `A message can have at most ${MAX_RECIPIENTS} recipients.`,
    }
  }

  return { ok: true, to: finalTo, cc: finalCc }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/recipients.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
rtk git add apps/hoa/src/lib/inbox/draft/recipients.ts apps/hoa/src/lib/inbox/draft/recipients.test.ts && rtk git commit -m "$(cat <<'EOF'
feat(inbox): pure recipient normalization and validation

Kept free of Supabase and 'use server' so the composer can import it
synchronously and the root vitest harness can cover it exhaustively.
Refuses anything that could break out of a header, so the MIME layer's
injection guard is a second line of defence rather than the only one.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `approveDraft` persists recipients; `createDraft` pre-fills them

**Files:**
- Modify: `apps/hoa/src/lib/inbox/queries.ts:900-940` (`ThreadDraft`, `getLatestDraft`)
- Modify: `apps/hoa/src/lib/inbox/draft/actions.ts:33-176` (`createDraft`), `:178-263` (`approveDraft`)
- Test: `apps/hoa/src/lib/inbox/draft/approve.test.ts` *(create)*

**Interfaces:**
- Consumes: `normalizeRecipients`, `MAX_RECIPIENTS` (Task 5); the columns from Task 4.
- Produces:
  - `ThreadDraft` gains `kind: 'reply' | 'forward' | 'new'`, `toEmails: string[]`, `ccEmails: string[]`.
  - `approveDraft(draftId: string, input: { subject: string; body: string; to: string[]; cc: string[] })` — **signature change** from four positional args. `DraftPanel` (Task 8) is the only caller.

- [ ] **Step 1: Write the failing tests**

Create `apps/hoa/src/lib/inbox/draft/approve.test.ts`. Mirror the mocking style of the existing `actions.test.ts` in this directory:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth', () => ({
  requireBoardOrAdmin: vi.fn(async () => ({
    role: 'board' as const,
    org: { id: 'org-1', name: 'Madison Park', hub_type: 'hoa', plan: 'pro', doors_count: 120 },
  })),
}))

const update = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {
        update: vi.fn((values: unknown) => {
          update(values)
          return chain
        }),
        eq: vi.fn(() => chain),
        select: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({
          data: { id: 'draft-1', thread_id: 'thread-1' },
          error: null,
        })),
      }
      return chain
    }),
  })),
}))

vi.mock('@homeowner-portal/jobs', () => ({ inngest: { send: vi.fn() } }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { approveDraft } from './actions'

const valid = {
  subject: 'Re: Fence',
  body: 'Thanks for writing.',
  to: ['resident@example.com'],
  cc: [] as string[],
}

describe('approveDraft — recipient validation', () => {
  beforeEach(() => update.mockClear())

  it('queues the reply and writes both recipient lists in the same update', async () => {
    const result = await approveDraft('draft-1', { ...valid, cc: ['pm@example.com'] })
    expect('ok' in result).toBe(true)
    const values = update.mock.calls[0][0] as Record<string, unknown>
    expect(values.status).toBe('queued')
    expect(values.to_emails).toEqual(['resident@example.com'])
    expect(values.cc_emails).toEqual(['pm@example.com'])
    // The audit stamp must land in the SAME statement as the status change.
    expect(values.approved_by).toBe('user-1')
    expect(values.approved_at).toBeTruthy()
  })

  it('refuses an empty To and writes nothing', async () => {
    const result = await approveDraft('draft-1', { ...valid, to: [] })
    expect('error' in result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a malformed recipient and writes nothing', async () => {
    const result = await approveDraft('draft-1', { ...valid, to: ['nope'] })
    expect('error' in result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('refuses a CR/LF injection attempt in a Cc address', async () => {
    const result = await approveDraft('draft-1', {
      ...valid,
      cc: ['ok@example.com\r\nBcc: attacker@evil.com'],
    })
    expect('error' in result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('still blocks on an unfilled blank in the body', async () => {
    const result = await approveDraft('draft-1', { ...valid, body: 'We will waive [[BLANK: money]].' })
    expect('error' in result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })

  it('still blocks on an unfilled blank in the subject', async () => {
    const result = await approveDraft('draft-1', { ...valid, subject: 'Re: [[BLANK: money]]' })
    expect('error' in result).toBe(true)
    expect(update).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/approve.test.ts`
Expected: FAIL — `approveDraft` still takes positional `(draftId, subject, body)`.

- [ ] **Step 3: Implement**

In `apps/hoa/src/lib/inbox/queries.ts`, extend `ThreadDraft` (line ~900):

```ts
export interface ThreadDraft {
  id: string
  kind: 'reply' | 'forward' | 'new'
  status: 'draft' | 'queued' | 'sending' | 'sent' | 'cancelled' | 'failed'
  subject: string
  bodyText: string
  toEmails: string[]
  ccEmails: string[]
  citations: Array<{ refId: string; quote: string; label: string }>
  blanks: Array<{ kind: string; prompt: string }>
  grounded: boolean
  groundingNote: string | null
  sendAfter: string | null
  error: string | null
}
```

and add `kind, to_emails, cc_emails` to `getLatestDraft`'s `.select(...)` string, mapping them onto the returned object as `kind`, `toEmails: data.to_emails ?? []`, `ccEmails: data.cc_emails ?? []`.

In `apps/hoa/src/lib/inbox/draft/actions.ts`, change the import block to add:

```ts
import { normalizeRecipients } from './recipients'
```

Replace `approveDraft`'s signature and validation prologue:

```ts
export async function approveDraft(
  draftId: string,
  input: { subject: string; body: string; to: string[]; cc: string[] },
): Promise<{ ok: true; sendAfter: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const { subject, body } = input

  // BOTH fields. The subject is as editable as the body and ships in the
  // same email, so a `[[BLANK: money]]` left in a subject line would reach
  // the resident in the most visible place there is.
  if (hasUnfilledBlanks(subject) || hasUnfilledBlanks(body)) {
    return { error: 'Fill in or remove every highlighted blank before sending.' }
  }
  if (!subject.trim() || !body.trim()) {
    return { error: 'A reply needs both a subject and a body.' }
  }

  // Recipients are validated BEFORE the status transition, so a rejected
  // address leaves the draft exactly as it was rather than half-queued.
  const recipients = normalizeRecipients(input.to, input.cc)
  if (!recipients.ok) return { error: recipients.error }
```

and add the two arrays to the existing single UPDATE — in the same statement as `status`, `approved_by` and `approved_at`, per this file's invariant:

```ts
    .update({
      status: 'queued',
      subject,
      body_text: body,
      to_emails: recipients.to,
      cc_emails: recipients.cc,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      send_after: sendAfter,
    })
```

In `createDraft`, pre-fill the recipient the reply will go to at DRAFT time rather than leaving it to the send job. Insert this after the `retrieveForThread` call and before the `.insert(...)`:

```ts
  // Resolved here, not at send time. The job used to look up the last
  // inbound message when it ran, which meant a new message arriving during
  // the 30-second undo window could silently redirect the reply to a
  // different address than the approver saw. A lookup failure is not fatal:
  // the row is saved with an empty To and the composer requires the human to
  // supply one before Approve enables.
  let defaultTo: string[] = []
  const { data: lastInbound, error: lastInboundError } = await supabase
    .from('inbox_messages')
    .select('from_email')
    .eq('organization_id', org.id)
    .eq('thread_id', threadId)
    .eq('direction', 'inbound')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (lastInboundError) {
    console.error(
      `createDraft: last-inbound lookup failed: ${lastInboundError.code} ${lastInboundError.message}`,
    )
  } else if (lastInbound?.from_email) {
    defaultTo = [lastInbound.from_email]
  }
```

and add `kind: 'reply', to_emails: defaultTo, cc_emails: []` to the `.insert({...})` object.

- [ ] **Step 4: Run the tests and typecheck**

Run: `rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/ && rtk npm run typecheck`
Expected: tests PASS. Typecheck FAILS on `DraftPanel.tsx` calling `approveDraft(draft.id, subject, body)` — Task 8 fixes that call site. Do not patch the component here.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/hoa/src/lib/inbox/queries.ts apps/hoa/src/lib/inbox/draft/actions.ts apps/hoa/src/lib/inbox/draft/approve.test.ts && rtk git commit -m "$(cat <<'EOF'
feat(inbox): recipients are chosen at draft time and approved with the reply

createDraft resolves the default To from the last inbound message when the
draft is written; approveDraft validates and persists To/Cc in the same
UPDATE that stamps the approver. Closes a window where a message arriving
during the undo countdown could redirect an already-approved reply.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The send job reads recipients off the row

**Files:**
- Modify: `packages/jobs/src/mailbox-send.ts:61-213`
- Test: `packages/jobs/src/mailbox-send.test.ts`

**Interfaces:**
- Consumes: the columns from Task 4.
- Produces: `sendToGmail` now takes `draft: { subject: string; body_text: string; to_emails: string[]; cc_emails: string[] }` and `last: { rfc822_message_id: string | null; from_email: string | null }`.

Backward compatibility: a draft queued **before** migration 0038 has an empty `to_emails`. Such a row falls back to the last inbound message's `from_email`, exactly as today. This is the only compatibility affordance in the plan and can be deleted once no pre-migration draft remains queued.

- [ ] **Step 1: Write the failing tests**

Add to `packages/jobs/src/mailbox-send.test.ts`, following the existing `buildDb` queue helper:

```ts
it('sends to the recipients on the draft row, not the last inbound sender', async () => {
  const db = buildDb({
    inbox_drafts: [
      { data: { id: 'd1', organization_id: 'org-1', thread_id: 't1', subject: 'S', body_text: 'B',
                send_after: null, status: 'queued', kind: 'reply',
                to_emails: ['vendor@example.com'], cc_emails: ['pm@example.com'],
                mailbox_account_id: null }, error: null },
      { data: { id: 'd1' }, error: null },   // claim
      { data: null, error: null },           // recordSent
    ],
    inbox_threads: [{ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null }],
    mailbox_accounts: [{ data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null }],
    inbox_messages: [{ data: { rfc822_message_id: '<x@y>', from_email: 'resident@example.com' }, error: null }],
  })
  vi.mocked(sendReply).mockResolvedValue({ messageId: 'm1', threadId: 'gt1' })

  await runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')

  const args = vi.mocked(buildMimeMessage).mock.calls[0][0]
  expect(args.to).toEqual(['vendor@example.com'])
  expect(args.cc).toEqual(['pm@example.com'])
  // Threading headers still come from the last inbound message.
  expect(args.inReplyTo).toBe('<x@y>')
})

it('falls back to the last inbound sender for a draft queued before the migration', async () => {
  const db = buildDb({
    inbox_drafts: [
      { data: { id: 'd1', organization_id: 'org-1', thread_id: 't1', subject: 'S', body_text: 'B',
                send_after: null, status: 'queued', kind: 'reply',
                to_emails: [], cc_emails: [], mailbox_account_id: null }, error: null },
      { data: { id: 'd1' }, error: null },
      { data: null, error: null },
    ],
    inbox_threads: [{ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null }],
    mailbox_accounts: [{ data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null }],
    inbox_messages: [{ data: { rfc822_message_id: '<x@y>', from_email: 'resident@example.com' }, error: null }],
  })
  vi.mocked(sendReply).mockResolvedValue({ messageId: 'm1', threadId: 'gt1' })

  await runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')

  expect(vi.mocked(buildMimeMessage).mock.calls[0][0].to).toEqual(['resident@example.com'])
})

it('refuses to send when neither the row nor the thread yields a recipient', async () => {
  const db = buildDb({
    inbox_drafts: [
      { data: { id: 'd1', organization_id: 'org-1', thread_id: 't1', subject: 'S', body_text: 'B',
                send_after: null, status: 'queued', kind: 'reply',
                to_emails: [], cc_emails: [], mailbox_account_id: null }, error: null },
      { data: { id: 'd1' }, error: null },
      { data: null, error: null },           // fail()
    ],
    inbox_threads: [{ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null }],
    mailbox_accounts: [{ data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null }],
    inbox_messages: [{ data: { rfc822_message_id: '<x@y>', from_email: null }, error: null }],
  })

  const result = await runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')

  expect(result).toEqual({ sent: false, reason: 'no_recipient' })
  expect(sendReply).not.toHaveBeenCalled()
})
```

Add a `fakeLogger()` helper if the file does not already have one:

```ts
function fakeLogger(): MailboxSendLogger {
  return { info: vi.fn(), error: vi.fn() }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk npm run test:unit -- packages/jobs/src/mailbox-send.test.ts`
Expected: FAIL — `buildMimeMessage` is called with `to: ['resident@example.com']` regardless of the row.

- [ ] **Step 3: Implement**

In `packages/jobs/src/mailbox-send.ts`, add the new columns to the opening select:

```ts
    .select(
      'id, organization_id, thread_id, subject, body_text, send_after, status, kind, to_emails, cc_emails, mailbox_account_id',
    )
```

Replace the recipient resolution after the last-inbound lookup (currently lines 161-164):

```ts
  // Recipients come from the ROW, resolved when a human approved it.
  //
  // The empty-array fallback covers drafts queued before migration 0038,
  // which have no recipients stored. It reproduces the old behaviour exactly
  // and can be deleted once no such row remains queued.
  const to = draft.to_emails?.length ? draft.to_emails : last?.from_email ? [last.from_email] : []
  if (to.length === 0) {
    await fail(db, draftId, 'No recipient for this reply.')
    return { sent: false, reason: 'no_recipient' }
  }
```

Delete the old `if (!last?.from_email) { … 'No inbound message to reply to.' … }` block — it is subsumed by the check above, which is now about the recipient rather than about the inbound message.

Update the `sendToGmail` call and signature to pass the resolved lists:

```ts
  const sent = await sendToGmail(db, draftId, thread, account, draft, to, {
    rfc822_message_id: last?.rfc822_message_id ?? null,
  })
```

```ts
async function sendToGmail(
  db: Db,
  draftId: string,
  thread: { gmail_thread_id: string; mailbox_account_id: string },
  account: { email_address: string },
  draft: { subject: string; body_text: string; cc_emails: string[] | null },
  to: string[],
  last: { rfc822_message_id: string | null },
): Promise<{ messageId: string }> {
  try {
    const accessToken = await getAccessTokenFor(db, thread.mailbox_account_id)
    const mime = buildMimeMessage({
      from: account.email_address,
      to,
      cc: draft.cc_emails ?? [],
      subject: draft.subject,
      body: draft.body_text,
      inReplyTo: last.rfc822_message_id,
      references: last.rfc822_message_id ? [last.rfc822_message_id] : [],
    })
    return await sendReply(accessToken, thread.gmail_thread_id, mime)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await fail(db, draftId, message)
    if (error instanceof MailboxAuthError) {
      await markAuthFailed(db, thread.mailbox_account_id, message)
    }
    throw error
  }
}
```

The docstring above `sendToGmail`'s call site (lines 166-176) still applies verbatim and must not be edited: the try block is still the whole function body, and no statement follows `sendReply`.

- [ ] **Step 4: Run the full suite**

Run: `rtk npm run test:unit && rtk npm run typecheck`
Expected: PASS. Existing tests in this file need `kind`, `to_emails`, `cc_emails`, and `mailbox_account_id` added to their scripted `inbox_drafts` rows.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/jobs/src/mailbox-send.ts packages/jobs/src/mailbox-send.test.ts && rtk git commit -m "$(cat <<'EOF'
feat(jobs): send to the recipients recorded on the draft row

The last-inbound lookup is demoted to supplying only In-Reply-To and
References. Drafts queued before migration 0038 have no stored recipients
and still fall back to the old behaviour.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Split `DraftPanel` into a state machine plus `Composer`

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/inbox/[id]/draft-ui.ts`
- Create: `apps/hoa/src/app/(dashboard)/inbox/[id]/RecipientFields.tsx`
- Create: `apps/hoa/src/app/(dashboard)/inbox/[id]/Composer.tsx`
- Modify: `apps/hoa/src/app/(dashboard)/inbox/[id]/DraftPanel.tsx`

**Interfaces:**
- Consumes: `ThreadDraft` (Task 6), `approveDraft` (Task 6), `isValidEmail` (Task 5), `hasUnfilledBlanks`/`UNDO_WINDOW_SECONDS` (existing `blanks.ts`).
- Produces:
  - `RecipientFields({ to, cc, onToChange, onCcChange, disabled })`
  - `Composer({ draft, pending, actionError, onApprove })` where `onApprove: (input: { subject: string; body: string; to: string[]; cc: string[] }) => void`

`DraftPanel` is 288 lines carrying six states. Adding recipients here — and an attachment picker in Task 13 — would make it the largest file in the module. The split is part of this task, not a follow-up.

- [ ] **Step 1: Extract the shared draft styling, then build `RecipientFields`**

`AMBER_BOX` is about to be needed by both `DraftPanel` (its `failed` state) and
`Composer` (the ungrounded banner and the blanks callouts). Copying it into the
new file would make three copies in this directory. Extract it first.

Create `apps/hoa/src/app/(dashboard)/inbox/[id]/draft-ui.ts`:

```ts
/**
 * Presentation constants shared by DraftPanel and Composer.
 *
 * No `warning` token exists in the shared Tailwind config
 * (packages/ui/tailwind.config.ts defines only primary/accent/background/
 * surface/border/foreground/muted/destructive as CSS-variable tokens), so the
 * "needs a human decision" tone is this literal amber + dark: pair. The same
 * pair is used in PropertyRail.tsx and MessageThread.tsx; those are left alone
 * here because this task has no other reason to touch them.
 */
export const AMBER_BOX =
  'rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'

/**
 * `blank.kind` is one of the four categories the model is forbidden from
 * writing itself. This only labels the callout — `blank.prompt` is what
 * actually tells the human what to decide, and is rendered verbatim.
 */
export const BLANK_KIND_LABELS: Record<string, string> = {
  money: 'Money',
  enforcement: 'Enforcement outcome',
  legal: 'Legal interpretation',
  other_resident: "Another resident's details",
}
```

Then create `apps/hoa/src/app/(dashboard)/inbox/[id]/RecipientFields.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { isValidEmail } from '@/lib/inbox/draft/recipients'

// Same amber pair used for "needs a human decision" elsewhere in the inbox
// (DraftPanel, PropertyRail, MessageThread) — no `warning` token exists in
// packages/ui/tailwind.config.ts.
const INVALID_CHIP =
  'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'

interface Props {
  to: string[]
  cc: string[]
  onToChange: (next: string[]) => void
  onCcChange: (next: string[]) => void
  disabled?: boolean
}

/**
 * Chip-style recipient editor. There is deliberately no Bcc field: a blind
 * copy is invisible in the delivered message, and HOA mail carries balances
 * and violation history that every recipient should be on the record for.
 */
export function RecipientFields({ to, cc, onToChange, onCcChange, disabled }: Props) {
  // Cc stays hidden until asked for, or until it already has addresses (a
  // draft reopened after Cc was set must not appear to have lost them).
  const [showCc, setShowCc] = useState(cc.length > 0)

  return (
    <div className="space-y-2">
      <ChipField label="To" values={to} onChange={onToChange} disabled={disabled} />
      {showCc ? (
        <ChipField label="Cc" values={cc} onChange={onCcChange} disabled={disabled} />
      ) : (
        <button
          type="button"
          className="text-xs text-muted underline"
          onClick={() => setShowCc(true)}
          disabled={disabled}
        >
          Add Cc
        </button>
      )}
    </div>
  )
}

function ChipField({
  label,
  values,
  onChange,
  disabled,
}: {
  label: string
  values: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const [entry, setEntry] = useState('')

  function commit() {
    const trimmed = entry.trim().replace(/,$/, '')
    if (trimmed === '') return
    onChange([...values, trimmed])
    setEntry('')
  }

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-background p-1">
        {values.map((address, index) => (
          <span
            key={`${address}-${index}`}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
              isValidEmail(address) ? 'border-border text-foreground' : INVALID_CHIP
            }`}
          >
            {address}
            <button
              type="button"
              aria-label={`Remove ${address}`}
              className="text-muted"
              onClick={() => onChange(values.filter((_, i) => i !== index))}
              disabled={disabled}
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={entry}
          disabled={disabled}
          onChange={(event) => setEntry(event.target.value)}
          // Comma and Enter both commit; blur commits too, so an address
          // typed and then left alone is not silently dropped on Approve.
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              commit()
            } else if (event.key === 'Backspace' && entry === '' && values.length > 0) {
              onChange(values.slice(0, -1))
            }
          }}
          onBlur={commit}
          className="min-w-[12rem] flex-1 bg-transparent p-1 text-sm outline-none"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build `Composer`**

Create `apps/hoa/src/app/(dashboard)/inbox/[id]/Composer.tsx`. Move the editable-state JSX out of `DraftPanel` (its current lines 190-263) verbatim, wrapping it with the recipient fields:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { hasUnfilledBlanks } from '@/lib/inbox/draft/blanks'
import type { ThreadDraft } from '@/lib/inbox/queries'
import { RecipientFields } from './RecipientFields'
import { AMBER_BOX, BLANK_KIND_LABELS } from './draft-ui'

export interface ApproveInput {
  subject: string
  body: string
  to: string[]
  cc: string[]
}

interface Props {
  draft: ThreadDraft
  pending: boolean
  actionError: string | null
  onApprove: (input: ApproveInput) => void
}

export function Composer({ draft, pending, actionError, onApprove }: Props) {
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.bodyText)
  const [to, setTo] = useState<string[]>(draft.toEmails)
  const [cc, setCc] = useState<string[]>(draft.ccEmails)

  // A new draft row (a fresh createDraft, or the same thread's draft moving
  // to a different id) must not keep stale edits. Keyed on the fields
  // themselves, not just draft.id, so a server-side edit landing under the
  // same row still reflects in the inputs.
  useEffect(() => {
    setSubject(draft.subject)
    setBody(draft.bodyText)
    setTo(draft.toEmails)
    setCc(draft.ccEmails)
  }, [draft.id, draft.subject, draft.bodyText, draft.toEmails, draft.ccEmails])

  // Computed from the LIVE edits, not the stored arrays — this is what makes
  // filling a blank or adding a recipient enable Approve immediately, and
  // removing it re-disable. approveDraft re-checks all of it server-side;
  // this is the affordance, not the guarantee.
  const blocked = hasUnfilledBlanks(subject) || hasUnfilledBlanks(body) || to.length === 0

  return (
    <section className="mt-4 space-y-3 rounded-md border border-border p-3">
      {draft.grounded === false ? (
        <p className={AMBER_BOX}>
          {draft.groundingNote ??
            'No governing document or property record matched this question — this draft contains no facts.'}
        </p>
      ) : null}

      <RecipientFields to={to} cc={cc} onToChange={setTo} onCcChange={setCc} disabled={pending} />

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          className="w-full rounded-md border border-border bg-background p-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
          Message
        </label>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={10}
          className="w-full rounded-md border border-border bg-background p-2 text-sm"
        />
      </div>

      {draft.blanks.length > 0 ? (
        <ul className="space-y-1">
          {draft.blanks.map((blank, index) => (
            <li key={`${blank.kind}-${index}`} className={AMBER_BOX}>
              <span className="font-semibold">{BLANK_KIND_LABELS[blank.kind] ?? blank.kind}: </span>
              {blank.prompt}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Label + quote together, always — a quote shown without its source is
          what a board member is supposed to check. */}
      {draft.citations.length > 0 ? (
        <ul className="space-y-1 border-t border-border pt-2 text-xs">
          {draft.citations.map((citation) => (
            <li key={citation.refId}>
              <span className="font-semibold text-foreground">{citation.label}</span>
              <span className="text-muted">{` — "${citation.quote}"`}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {actionError ? <Alert variant="error">{actionError}</Alert> : null}

      <div>
        <Button
          type="button"
          size="sm"
          disabled={blocked}
          loading={pending}
          onClick={() => onApprove({ subject, body, to, cc })}
        >
          Approve and send
        </Button>
        {blocked ? (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {to.length === 0
              ? 'Add at least one recipient before sending.'
              : 'Fill in or remove every highlighted blank before sending.'}
          </p>
        ) : null}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Reduce `DraftPanel` to the state machine**

In `DraftPanel.tsx`: delete the `subject`/`body` state, the `useEffect` that syncs them, the `BLANK_KIND_LABELS` map, the local `AMBER_BOX` constant, and the entire editable-state JSX at the bottom. Import `AMBER_BOX` from `./draft-ui` instead — the `failed` state still uses it. Keep all five early-return states and `Countdown` unchanged. Replace `handleApprove` and the final return:

```tsx
  function handleApprove(input: ApproveInput) {
    if (!draft) return
    setActionError(null)
    startTransition(async () => {
      const result = await approveDraft(draft.id, input)
      if ('error' in result) setActionError(result.error)
    })
  }
```

```tsx
  // ── 2 + 3. draft — the shared composer. ──
  return (
    <Composer draft={draft} pending={pending} actionError={actionError} onApprove={handleApprove} />
  )
```

Add to the `queued`/`sending` state, after the subject line, so the undo window shows who this is actually going to:

```tsx
        <p className="text-xs text-muted">
          To: {draft.toEmails.join(', ')}
          {draft.ccEmails.length > 0 ? ` · Cc: ${draft.ccEmails.join(', ')}` : ''}
        </p>
```

- [ ] **Step 4: Typecheck, lint, and check the page renders**

Run: `rtk npm run typecheck && rtk npm run lint`
Expected: PASS. `DraftPanel.tsx` should now be roughly 150 lines.

Then run the app and open a thread with an existing draft: the To chip is pre-filled with the resident's address, Approve is disabled if you remove it, "Add Cc" reveals a second field, and the queued state lists recipients during the countdown.

- [ ] **Step 5: Commit**

```bash
rtk git add "apps/hoa/src/app/(dashboard)/inbox/[id]/" && rtk git commit -m "$(cat <<'EOF'
feat(inbox): editable To/Cc on a reply, and split DraftPanel

DraftPanel keeps only the six-state machine; the editable state moves to a
shared Composer that forward and compose will reuse. Recipients are shown
during the undo countdown, because "who is this going to" is the thing worth
checking in those 30 seconds. No Bcc field, by design.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Phase 2 ships here.** A board member can now add recipients to an AI-drafted reply.

---

## Phase 3 — Attachments

### Task 9: Migration 0039 and the pure size budget

**Files:**
- Create: `migrations/0039_inbox_draft_attachments.sql`
- Create: `apps/hoa/src/lib/inbox/draft/attachments.ts`
- Test: `apps/hoa/src/lib/inbox/draft/attachments.test.ts`

**Interfaces:**
- Produces:
  - Table `inbox_draft_attachments`.
  - `MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024`
  - `remainingBudget(existing: Array<{ sizeBytes: number }>): number`
  - `formatBytes(bytes: number): string`
  - `checkAttachmentFits(existing: Array<{ sizeBytes: number }>, incoming: number): { ok: true } | { ok: false; error: string }`

- [ ] **Step 1: Write the migration**

Create `migrations/0039_inbox_draft_attachments.sql`:

```sql
-- Files on an outgoing message. Bytes are NEVER copied: all three sources
-- (a fresh upload, a file that arrived on this thread, a document from the
-- library) already live in the private `hoa-documents` bucket, so this row
-- stores the path. No duplicated storage and no cleanup job for abandoned
-- drafts. The cost is that a source object deleted between attach and send
-- makes the send fail — loudly, before anything is transmitted, which is the
-- right failure for "the file you meant to send is gone".
CREATE TABLE IF NOT EXISTS public.inbox_draft_attachments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  draft_id        uuid NOT NULL
    REFERENCES public.inbox_drafts(id) ON DELETE CASCADE,
  source          text NOT NULL CHECK (source IN ('upload', 'inbox', 'document')),
  storage_path    text NOT NULL,
  file_name       text NOT NULL,
  content_type    text,
  size_bytes      bigint NOT NULL CHECK (size_bytes >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbox_draft_attachments_draft_idx
  ON public.inbox_draft_attachments(draft_id);

ALTER TABLE public.inbox_draft_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_access ON public.inbox_draft_attachments;
CREATE POLICY board_access ON public.inbox_draft_attachments
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));
```

- [ ] **Step 2: Write the failing tests for the size budget**

Create `apps/hoa/src/lib/inbox/draft/attachments.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  MAX_ATTACHMENT_BYTES,
  remainingBudget,
  formatBytes,
  checkAttachmentFits,
} from './attachments'

describe('remainingBudget', () => {
  it('is the full cap when nothing is attached', () => {
    expect(remainingBudget([])).toBe(MAX_ATTACHMENT_BYTES)
  })

  it('subtracts every attached file', () => {
    expect(remainingBudget([{ sizeBytes: 1000 }, { sizeBytes: 2000 }])).toBe(
      MAX_ATTACHMENT_BYTES - 3000,
    )
  })

  it('never reports a negative budget', () => {
    expect(remainingBudget([{ sizeBytes: MAX_ATTACHMENT_BYTES * 2 }])).toBe(0)
  })
})

describe('checkAttachmentFits', () => {
  it('accepts a file that fits exactly', () => {
    expect(checkAttachmentFits([], MAX_ATTACHMENT_BYTES)).toEqual({ ok: true })
  })

  it('refuses one byte over and names both the limit and the overage', () => {
    const result = checkAttachmentFits([], MAX_ATTACHMENT_BYTES + 1)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('15 MB')
  })

  it('accounts for what is already attached', () => {
    const half = MAX_ATTACHMENT_BYTES / 2
    expect(checkAttachmentFits([{ sizeBytes: half }], half).ok).toBe(true)
    expect(checkAttachmentFits([{ sizeBytes: half }], half + 1).ok).toBe(false)
  })

  it('refuses a zero-byte file — an empty attachment is always a mistake', () => {
    expect(checkAttachmentFits([], 0).ok).toBe(false)
  })
})

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [15 * 1024 * 1024, '15.0 MB'],
  ])('formats %i as %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/attachments.test.ts`
Expected: FAIL — cannot resolve `./attachments`.

- [ ] **Step 4: Implement**

Create `apps/hoa/src/lib/inbox/draft/attachments.ts`:

```ts
/**
 * Pure attachment-size arithmetic, shared by the composer (which must refuse
 * a file before uploading it) and the server action that queues the send
 * (which must refuse it again, because a client check is an affordance and
 * not a guarantee).
 *
 * No `'use server'` directive — see blanks.ts for why.
 */

/**
 * 15MB of raw file bytes. Base64 inflates roughly a third, so a full load
 * becomes about 20MB on the wire: under Gmail's 25MB send ceiling with room
 * for headers and the body, and under what most receiving servers accept.
 * Never write this as a literal.
 */
export const MAX_ATTACHMENT_BYTES = 15 * 1024 * 1024

export function remainingBudget(existing: Array<{ sizeBytes: number }>): number {
  const used = existing.reduce((total, file) => total + file.sizeBytes, 0)
  return Math.max(0, MAX_ATTACHMENT_BYTES - used)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function checkAttachmentFits(
  existing: Array<{ sizeBytes: number }>,
  incoming: number,
): { ok: true } | { ok: false; error: string } {
  if (incoming <= 0) {
    return { ok: false, error: 'That file is empty.' }
  }
  const remaining = remainingBudget(existing)
  if (incoming > remaining) {
    return {
      ok: false,
      error: `A message can carry ${formatBytes(MAX_ATTACHMENT_BYTES)} of attachments. ${formatBytes(remaining)} left.`,
    }
  }
  return { ok: true }
}
```

- [ ] **Step 5: Apply the migration, run the tests, commit**

```bash
rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/attachments.test.ts
```
Expected: PASS. Apply `0037` per `docs/APPLY_v1.1_MIGRATIONS.md`, then:

```bash
rtk git add migrations/0039_inbox_draft_attachments.sql apps/hoa/src/lib/inbox/draft/attachments.ts apps/hoa/src/lib/inbox/draft/attachments.test.ts && rtk git commit -m "$(cat <<'EOF'
feat(inbox): inbox_draft_attachments and the 15MB size budget

Attachments reference a storage path rather than copying bytes — all three
sources already live in the private hoa-documents bucket. The budget helpers
are pure so the composer and the server action share one cap.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Attachment server actions

**Files:**
- Create: `apps/hoa/src/lib/inbox/draft/attachment-actions.ts`
- Modify: `apps/hoa/src/lib/inbox/queries.ts` (add `listDraftAttachments`, `listAttachableDocuments`)

**Interfaces:**
- Consumes: `checkAttachmentFits`, `MAX_ATTACHMENT_BYTES` (Task 9).
- Produces:
  - `createAttachmentUploadUrl(draftId: string, fileName: string, sizeBytes: number): Promise<{ ok: true; path: string; token: string } | { error: string }>`
  - `addDraftAttachment(draftId: string, source: 'upload' | 'inbox' | 'document', ref: string, uploaded?: { fileName: string; contentType: string | null; sizeBytes: number }): Promise<{ ok: true } | { error: string }>`
  - `removeDraftAttachment(attachmentId: string): Promise<{ ok: true } | { error: string }>`
  - `listDraftAttachments(db, orgId, draftId): Promise<DraftAttachment[]>` where `DraftAttachment = { id: string; source: string; fileName: string; contentType: string | null; sizeBytes: number }`
  - `listAttachableDocuments(db, orgId): Promise<Array<{ id: string; name: string; type: string; sizeBytes: number }>>`

A separate file from `actions.ts` on purpose: that file is already 292 lines and owns the draft lifecycle invariants. Attachment CRUD is a different responsibility.

- [ ] **Step 1: Write the failing security tests**

These come first, before the implementation. This task resolves user-supplied
references to storage paths, so its refusal paths are the point of the task,
not a postscript to it.

Create `apps/hoa/src/lib/inbox/draft/attachment-actions.test.ts`. Mock `@/lib/auth` and `@/lib/supabase/server` the same way `approve.test.ts` does (see Task 6 Step 1 for the exact mock blocks), plus `next/cache`. Give the Supabase fake a `storage.from().createSignedUploadUrl()` returning `{ data: { path: 'p', token: 't' }, error: null }` and a `storage.from().remove()` bound to a module-level `const storageRemove = vi.fn()`. Let each `.from(table)` return a chain whose `maybeSingle()` resolves from a per-table script the test sets: module-level `let draftStatus = 'draft'` drives the `inbox_drafts` read, `let attachmentRow` drives the `inbox_draft_attachments` read, and `let inboxAttachmentRow` drives the `inbox_attachments` read. Reset all of them in `beforeEach`.

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createAttachmentUploadUrl, addDraftAttachment, removeDraftAttachment } from './attachment-actions'

const insert = vi.fn()

describe('addDraftAttachment — a forged ref must not reach another org', () => {
  beforeEach(() => insert.mockClear())

  it('refuses an upload path outside this org and draft prefix', async () => {
    const result = await addDraftAttachment('draft-1', 'upload', 'inbox-drafts/other-org/x/y', {
      fileName: 'a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10,
    })
    expect('error' in result).toBe(true)
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses an upload whose path names a different draft in the same org', async () => {
    const result = await addDraftAttachment('draft-1', 'upload', 'inbox-drafts/org-1/draft-2/y', {
      fileName: 'a.pdf',
      contentType: null,
      sizeBytes: 10,
    })
    expect('error' in result).toBe(true)
  })

  it('refuses a cross-org inbox attachment — the org-scoped read returns nothing', async () => {
    inboxAttachmentRow = null
    const result = await addDraftAttachment('draft-1', 'inbox', 'attachment-from-another-org')
    expect('error' in result).toBe(true)
    expect(insert).not.toHaveBeenCalled()
  })

  it('refuses an inbox attachment that never downloaded', async () => {
    inboxAttachmentRow = { storage_path: 'p/1', file_name: 'a.pdf', content_type: null, size_bytes: 10, fetch_status: 'failed' }
    const result = await addDraftAttachment('draft-1', 'inbox', 'att-1')
    expect('error' in result).toBe(true)
  })
})

describe('attachment mutations require an editable draft', () => {
  it.each(['queued', 'sending', 'sent', 'cancelled', 'failed'])(
    'refuses to attach to a %s draft',
    async (status) => {
      draftStatus = status
      const result = await addDraftAttachment('draft-1', 'inbox', 'att-1')
      expect('error' in result).toBe(true)
    },
  )

  it('refuses to mint an upload URL for a queued draft', async () => {
    draftStatus = 'queued'
    const result = await createAttachmentUploadUrl('draft-1', 'a.pdf', 10)
    expect('error' in result).toBe(true)
  })

  it('refuses an upload URL for a file over the cap', async () => {
    draftStatus = 'draft'
    const result = await createAttachmentUploadUrl('draft-1', 'big.pdf', 16 * 1024 * 1024)
    expect('error' in result).toBe(true)
    if ('error' in result) expect(result.error).toContain('15 MB')
  })

  it('does not put the caller-supplied filename in the storage path', async () => {
    draftStatus = 'draft'
    const result = await createAttachmentUploadUrl('draft-1', '../../escape.pdf', 10)
    expect('ok' in result).toBe(true)
    if ('ok' in result) expect(result.path).not.toContain('escape')
  })
})

describe('removeDraftAttachment', () => {
  it('deletes the storage object for an upload', async () => {
    attachmentRow = { id: 'a1', draft_id: 'draft-1', source: 'upload', storage_path: 'p/1' }
    await removeDraftAttachment('a1')
    expect(storageRemove).toHaveBeenCalledWith(['p/1'])
  })

  it.each(['inbox', 'document'])(
    'never deletes the storage object for a %s reference — it is the live file',
    async (source) => {
      attachmentRow = { id: 'a1', draft_id: 'draft-1', source, storage_path: 'governing/ccrs.pdf' }
      await removeDraftAttachment('a1')
      expect(storageRemove).not.toHaveBeenCalled()
    },
  )
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/attachment-actions.test.ts`
Expected: FAIL — cannot resolve `./attachment-actions`.

- [ ] **Step 3: Write the implementation**

Create `apps/hoa/src/lib/inbox/draft/attachment-actions.ts`:

```ts
'use server'

/**
 * Attachment CRUD for an outgoing message.
 *
 * Bytes are never copied. Each row points at an object already in the
 * private `hoa-documents` bucket:
 *   - 'inbox'    → an inbox_attachments row's storage_path
 *   - 'document' → an hoa_documents row's storage_path (the CURRENT file;
 *                  hoa_document_versions holds SUPERSEDED files and must
 *                  never be attached, or a board would mail the old CC&Rs)
 *   - 'upload'   → an object the browser PUT directly under this draft
 *
 * Uploaded bytes never pass through a server action: Next.js caps a server
 * action body at 1MB by default, and pushing 15MB through one is the wrong
 * shape regardless. The browser gets a short-lived signed upload URL and
 * PUTs to storage itself.
 *
 * Never log a file name, an email address, a subject, or a body.
 * PostgrestError `.code`/`.message` only, never `.details`.
 */

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { checkAttachmentFits } from './attachments'

const BUCKET = 'hoa-documents'

/** Loads the draft's current attachments so the budget can be checked. */
async function currentSizes(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  orgId: string,
  draftId: string,
): Promise<Array<{ sizeBytes: number }> | null> {
  const { data, error } = await supabase
    .from('inbox_draft_attachments')
    .select('size_bytes')
    .eq('organization_id', orgId)
    .eq('draft_id', draftId)
  if (error) {
    console.error(`attachments: budget read failed: ${error.code} ${error.message}`)
    return null
  }
  return (data ?? []).map((row) => ({ sizeBytes: Number(row.size_bytes) }))
}

/**
 * Confirms the draft is still editable and belongs to the caller's org.
 * A file must never be attachable to a reply already inside its undo window
 * — the approver reviewed a specific set of files.
 */
async function assertEditableDraft(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  orgId: string,
  draftId: string,
): Promise<{ ok: true; threadId: string | null } | { error: string }> {
  const { data, error } = await supabase
    .from('inbox_drafts')
    .select('id, thread_id, status')
    .eq('id', draftId)
    .eq('organization_id', orgId)
    .maybeSingle()
  if (error) {
    console.error(`attachments: draft read failed: ${error.code} ${error.message}`)
    return { error: 'Could not load this draft.' }
  }
  if (!data) return { error: 'This draft no longer exists.' }
  if (data.status !== 'draft') {
    return { error: 'This message is no longer editable.' }
  }
  return { ok: true, threadId: data.thread_id }
}

export async function createAttachmentUploadUrl(
  draftId: string,
  fileName: string,
  sizeBytes: number,
): Promise<{ ok: true; path: string; token: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const editable = await assertEditableDraft(supabase, org.id, draftId)
  if ('error' in editable) return editable

  const existing = await currentSizes(supabase, org.id, draftId)
  if (!existing) return { error: 'Could not check the attachment size limit.' }

  const fits = checkAttachmentFits(existing, sizeBytes)
  if (!fits.ok) return { error: fits.error }

  // A fresh uuid per attempt. A partial upload that never completes leaves an
  // orphan under this draft's prefix; nothing outside the prefix is ever an
  // upload, so removing the prefix cleans them all up.
  const path = `inbox-drafts/${org.id}/${draftId}/${randomUUID()}`

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    // StorageError, not PostgrestError — no `.code`. `.message` is safe.
    console.error(`attachments: signing upload failed: ${error?.message ?? 'unknown'}`)
    return { error: 'Could not start the upload.' }
  }

  // `fileName` is not used in the path — it is recorded on the row by
  // addDraftAttachment instead, so a hostile name cannot shape a storage key.
  return { ok: true, path: data.path, token: data.token }
}

export async function addDraftAttachment(
  draftId: string,
  source: 'upload' | 'inbox' | 'document',
  ref: string,
  uploaded?: { fileName: string; contentType: string | null; sizeBytes: number },
): Promise<{ ok: true } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const editable = await assertEditableDraft(supabase, org.id, draftId)
  if ('error' in editable) return editable

  let resolved: {
    storagePath: string
    fileName: string
    contentType: string | null
    sizeBytes: number
  }

  if (source === 'upload') {
    if (!uploaded) return { error: 'Missing upload details.' }
    // `ref` is the storage path returned by createAttachmentUploadUrl. It is
    // re-derived rather than trusted: only a path under THIS org and THIS
    // draft may be attached, so a forged ref cannot reach another org's file.
    if (!ref.startsWith(`inbox-drafts/${org.id}/${draftId}/`)) {
      return { error: 'That upload does not belong to this message.' }
    }
    resolved = {
      storagePath: ref,
      fileName: uploaded.fileName,
      contentType: uploaded.contentType,
      sizeBytes: uploaded.sizeBytes,
    }
  } else if (source === 'inbox') {
    const { data, error } = await supabase
      .from('inbox_attachments')
      .select('storage_path, file_name, content_type, size_bytes, fetch_status')
      .eq('id', ref)
      .eq('organization_id', org.id)
      .maybeSingle()
    if (error) {
      console.error(`attachments: inbox lookup failed: ${error.code} ${error.message}`)
      return { error: 'Could not load that file.' }
    }
    if (!data || data.fetch_status !== 'stored' || !data.storage_path) {
      return { error: 'That file is not available to attach.' }
    }
    resolved = {
      storagePath: data.storage_path,
      fileName: data.file_name,
      contentType: data.content_type,
      sizeBytes: Number(data.size_bytes ?? 0),
    }
  } else {
    // hoa_documents scopes by `org_id`, NOT `organization_id` — the inbox
    // tables and the document tables disagree on this column name.
    const { data, error } = await supabase
      .from('hoa_documents')
      .select('storage_path, name, file_size')
      .eq('id', ref)
      .eq('org_id', org.id)
      .maybeSingle()
    if (error) {
      console.error(`attachments: document lookup failed: ${error.code} ${error.message}`)
      return { error: 'Could not load that document.' }
    }
    if (!data) return { error: 'That document is not available to attach.' }
    resolved = {
      storagePath: data.storage_path,
      fileName: data.name,
      // hoa_documents has no content-type column; infer from the extension
      // and let buildMimeMessage fall back to application/octet-stream.
      contentType: inferContentType(data.name),
      sizeBytes: Number(data.file_size ?? 0),
    }
  }

  const existing = await currentSizes(supabase, org.id, draftId)
  if (!existing) return { error: 'Could not check the attachment size limit.' }
  const fits = checkAttachmentFits(existing, resolved.sizeBytes)
  if (!fits.ok) return { error: fits.error }

  const { error: insertError } = await supabase.from('inbox_draft_attachments').insert({
    organization_id: org.id,
    draft_id: draftId,
    source,
    storage_path: resolved.storagePath,
    file_name: resolved.fileName,
    content_type: resolved.contentType,
    size_bytes: resolved.sizeBytes,
  })
  if (insertError) {
    console.error(`attachments: insert failed: ${insertError.code} ${insertError.message}`)
    return { error: 'Could not attach that file.' }
  }

  if (editable.threadId) revalidatePath(`/inbox/${editable.threadId}`)
  return { ok: true }
}

export async function removeDraftAttachment(
  attachmentId: string,
): Promise<{ ok: true } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase
    .from('inbox_draft_attachments')
    .select('id, draft_id, source, storage_path')
    .eq('id', attachmentId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (error) {
    console.error(`attachments: remove lookup failed: ${error.code} ${error.message}`)
    return { error: 'Could not remove that file.' }
  }
  if (!data) return { error: 'That file is already removed.' }

  const editable = await assertEditableDraft(supabase, org.id, data.draft_id)
  if ('error' in editable) return editable

  const { error: deleteError } = await supabase
    .from('inbox_draft_attachments')
    .delete()
    .eq('id', attachmentId)
    .eq('organization_id', org.id)
  if (deleteError) {
    console.error(`attachments: delete failed: ${deleteError.code} ${deleteError.message}`)
    return { error: 'Could not remove that file.' }
  }

  // Only an 'upload' object is owned by this draft. An 'inbox' or 'document'
  // path is the live file elsewhere in the app — deleting it here would
  // destroy a governing document because someone changed their mind about an
  // attachment.
  if (data.source === 'upload') {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([data.storage_path])
    if (storageError) {
      // Not fatal: the row is gone, so the file will not be sent. A stray
      // object is a housekeeping matter, not a correctness one.
      console.error(`attachments: storage cleanup failed: ${storageError.message}`)
    }
  }

  if (editable.threadId) revalidatePath(`/inbox/${editable.threadId}`)
  return { ok: true }
}

const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  txt: 'text/plain',
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

function inferContentType(fileName: string): string | null {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_TYPES[extension] ?? null
}
```

Note: `'use server'` modules may export only async functions. `EXTENSION_TYPES` and `inferContentType` are module-private (not exported), which is allowed — only *exports* are constrained.

- [ ] **Step 4: Add the two read queries**

In `apps/hoa/src/lib/inbox/queries.ts`, append:

```ts
export interface DraftAttachment {
  id: string
  source: string
  fileName: string
  contentType: string | null
  sizeBytes: number
}

/**
 * Files attached to a draft. A soft failure must not read as "no
 * attachments" — that would show an approver a message with no files beside
 * one that is about to send three. Throws, matching the convention for
 * page-defining reads in this module.
 */
export async function listDraftAttachments(
  db: Db,
  orgId: string,
  draftId: string,
): Promise<DraftAttachment[]> {
  const { data, error } = await db
    .from('inbox_draft_attachments')
    .select('id, source, file_name, content_type, size_bytes')
    .eq('organization_id', orgId)
    .eq('draft_id', draftId)
    .order('created_at', { ascending: true })

  if (error) {
    logDbError('listDraftAttachments', 'inbox_draft_attachments', { orgId, draftId }, error)
    throw new Error(`listDraftAttachments: failed to load attachments: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    source: row.source,
    fileName: row.file_name,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
  }))
}

/**
 * The document library, for the attachment picker. Reads hoa_documents (the
 * CURRENT file of each document); hoa_document_versions holds SUPERSEDED
 * files and is deliberately not offered — attaching one would mail an
 * outdated CC&R. Note the `org_id` column name, which differs from every
 * inbox table's `organization_id`.
 */
export async function listAttachableDocuments(
  db: Db,
  orgId: string,
): Promise<Array<{ id: string; name: string; type: string; sizeBytes: number }>> {
  const { data, error } = await db
    .from('hoa_documents')
    .select('id, name, type, file_size')
    .eq('org_id', orgId)
    .order('name', { ascending: true })

  if (error) {
    logDbError('listAttachableDocuments', 'hoa_documents', { orgId }, error)
    throw new Error(`listAttachableDocuments: failed to load documents: ${error.message}`)
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    sizeBytes: Number(row.file_size ?? 0),
  }))
}
```

- [ ] **Step 5: Run the tests to verify they now pass**

Run: `rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/attachment-actions.test.ts`
Expected: PASS. A test still failing here means the implementation is wrong, not the test.

- [ ] **Step 6: Typecheck**

Run: `rtk npm run typecheck && rtk npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/hoa/src/lib/inbox/draft/attachment-actions.ts apps/hoa/src/lib/inbox/draft/attachment-actions.test.ts apps/hoa/src/lib/inbox/queries.ts && rtk git commit -m "$(cat <<'EOF'
feat(inbox): attach files to a draft from upload, thread, or library

Uploads go browser-to-storage over a signed URL, never through a server
action. An 'upload' ref is checked against this org and draft's prefix
rather than trusted. Removing an attachment deletes the storage object only
for uploads — an inbox or library path is the live file elsewhere.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Enforce the size cap at approve, and surface attachments on the draft

**Files:**
- Modify: `apps/hoa/src/lib/inbox/draft/actions.ts` (`approveDraft`)
- Modify: `apps/hoa/src/app/(dashboard)/inbox/[id]/page.tsx:60-86`
- Test: `apps/hoa/src/lib/inbox/draft/approve.test.ts` (extend)

**Interfaces:**
- Consumes: `remainingBudget`, `MAX_ATTACHMENT_BYTES` (Task 9); `listDraftAttachments` (Task 10).
- Produces: `DraftPanel` and `Composer` receive `attachments: DraftAttachment[]` as a new prop (wired in Task 13).

- [ ] **Step 1: Write the failing test**

Append to `apps/hoa/src/lib/inbox/draft/approve.test.ts`. Extend the `from` mock so `inbox_draft_attachments` returns an oversized row:

```ts
it('refuses to queue a message whose attachments exceed the cap', async () => {
  // The mock's `inbox_draft_attachments` read returns one 20MB file.
  attachmentRows = [{ size_bytes: 20 * 1024 * 1024 }]
  const result = await approveDraft('draft-1', valid)
  expect('error' in result).toBe(true)
  if ('error' in result) expect(result.error).toContain('15 MB')
  expect(update).not.toHaveBeenCalled()
})

it('allows attachments that come to exactly the cap', async () => {
  attachmentRows = [{ size_bytes: 15 * 1024 * 1024 }]
  const result = await approveDraft('draft-1', valid)
  expect('ok' in result).toBe(true)
})
```

Add a module-level `let attachmentRows: Array<{ size_bytes: number }> = []`, reset it in `beforeEach`, and make the `from` mock branch on the table name so `inbox_draft_attachments` resolves to `{ data: attachmentRows, error: null }` when awaited directly.

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/approve.test.ts`
Expected: FAIL — the draft is queued despite 20MB of attachments.

- [ ] **Step 3: Implement**

In `approveDraft`, after the recipient check and before the UPDATE:

```ts
  // Re-checked server-side. The composer already refuses an over-budget
  // file, but that is an affordance: a stale tab, a concurrent second
  // window, or a direct action call could all reach here over the cap, and
  // Gmail would reject the whole send after the row was already 'queued'.
  const { data: attachmentRows, error: attachmentError } = await supabase
    .from('inbox_draft_attachments')
    .select('size_bytes')
    .eq('organization_id', org.id)
    .eq('draft_id', draftId)
  if (attachmentError) {
    console.error(
      `approveDraft: attachment size read failed: ${attachmentError.code} ${attachmentError.message}`,
    )
    return { error: 'Could not check the attachment size limit.' }
  }
  // Compared against the total, NOT against `remainingBudget(...) === 0` —
  // the budget is also exactly zero when attachments come to precisely the
  // cap, which is allowed.
  const totalBytes = (attachmentRows ?? []).reduce(
    (sum, row) => sum + Number(row.size_bytes),
    0,
  )
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    // Whole-MB, derived from the constant — the SAME approach
    // `checkAttachmentFits` already uses. `formatBytes` always keeps one
    // decimal ("15.0 MB"), and this message's wording is asserted on.
    const capMb = MAX_ATTACHMENT_BYTES / (1024 * 1024)
    return {
      error: `Attachments exceed the ${capMb} MB limit. Remove a file and try again.`,
    }
  }
```

Import at the top of `actions.ts`:

```ts
import { MAX_ATTACHMENT_BYTES } from './attachments'
```

In `apps/hoa/src/app/(dashboard)/inbox/[id]/page.tsx`, load the attachments alongside the draft. Because `listDraftAttachments` needs the draft id, it runs after the `Promise.all`:

```ts
  // Page-defining, like the draft itself: an approver must never see a
  // message that appears to have no files beside one that will send three.
  const draftAttachments = draft ? await listDraftAttachments(supabase, org.id, draft.id) : []
```

and pass it down: `<DraftPanel threadId={thread.id} draft={draft} attachments={draftAttachments} />`. Add `listDraftAttachments` to the import from `@/lib/inbox/queries`.

- [ ] **Step 4: Run the tests and typecheck**

Run: `rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/ && rtk npm run typecheck`
Expected: tests PASS. Typecheck FAILS on the unknown `attachments` prop — Task 13 adds it. Do not patch the component here.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/hoa/src/lib/inbox/draft/actions.ts apps/hoa/src/lib/inbox/draft/approve.test.ts "apps/hoa/src/app/(dashboard)/inbox/[id]/page.tsx" && rtk git commit -m "$(cat <<'EOF'
feat(inbox): re-check the attachment budget when a message is approved

The composer's check is an affordance; a stale tab or a direct action call
could still exceed the cap, and Gmail would reject the send after the row
was already queued.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: The send job downloads and encodes attachments

**Files:**
- Modify: `packages/jobs/src/mailbox-send.ts`
- Test: `packages/jobs/src/mailbox-send.test.ts`

**Interfaces:**
- Consumes: `OutboundAttachment` (Task 2); `inbox_draft_attachments` (Task 9).
- Produces: `loadAttachments(db, orgId, draftId): Promise<OutboundAttachment[]>` (module-private).

**Placement is load-bearing.** The download runs *before* `sendToGmail` is entered, so a storage failure can call `fail()` safely — nothing has been transmitted. This does not widen the rule that no code reached after `sendReply` returns may mark a draft failed.

- [ ] **Step 1: Write the failing tests**

Add to `packages/jobs/src/mailbox-send.test.ts`. First extend the db fake with storage:

```ts
function buildDb(queues: Record<string, Row[]>, storage?: Record<string, Buffer>) {
  const from = vi.fn((table: string) => {
    const queue = queues[table]
    if (!queue || queue.length === 0) {
      throw new Error(`buildDb: no queued result left for table "${table}"`)
    }
    return makeChain(queue.shift()!)
  })
  const download = vi.fn(async (path: string) => {
    const bytes = storage?.[path]
    if (!bytes) return { data: null, error: { message: 'Object not found' } }
    return { data: { arrayBuffer: async () => bytes }, error: null }
  })
  return { from, storage: { from: vi.fn(() => ({ download })) } } as unknown as Parameters<
    typeof runMailboxSend
  >[0]
}
```

Then the cases:

```ts
const draftRow = {
  id: 'd1', organization_id: 'org-1', thread_id: 't1', subject: 'S', body_text: 'B',
  send_after: null, status: 'queued', kind: 'reply',
  to_emails: ['resident@example.com'], cc_emails: [], mailbox_account_id: null,
}

it('passes downloaded attachment bytes to buildMimeMessage', async () => {
  const db = buildDb(
    {
      inbox_drafts: [
        { data: draftRow, error: null },
        { data: { id: 'd1' }, error: null },
        { data: null, error: null },
      ],
      inbox_threads: [{ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null }],
      mailbox_accounts: [{ data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null }],
      inbox_messages: [{ data: { rfc822_message_id: '<x@y>', from_email: 'resident@example.com' }, error: null }],
      inbox_draft_attachments: [
        { data: [{ storage_path: 'p/1', file_name: 'ccrs.pdf', content_type: 'application/pdf', size_bytes: 4 }], error: null },
      ],
    },
    { 'p/1': Buffer.from('abcd') },
  )
  vi.mocked(sendReply).mockResolvedValue({ messageId: 'm1', threadId: 'gt1' })

  await runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')

  const args = vi.mocked(buildMimeMessage).mock.calls[0][0]
  expect(args.attachments).toHaveLength(1)
  expect(args.attachments[0].fileName).toBe('ccrs.pdf')
  expect(args.attachments[0].bytes.toString()).toBe('abcd')
})

it('fails the draft WITHOUT sending when an attachment cannot be downloaded', async () => {
  const db = buildDb(
    {
      inbox_drafts: [
        { data: draftRow, error: null },
        { data: { id: 'd1' }, error: null },
        { data: null, error: null },   // fail()
      ],
      inbox_threads: [{ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null }],
      mailbox_accounts: [{ data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null }],
      inbox_messages: [{ data: { rfc822_message_id: '<x@y>', from_email: 'resident@example.com' }, error: null }],
      inbox_draft_attachments: [
        { data: [{ storage_path: 'gone', file_name: 'ccrs.pdf', content_type: null, size_bytes: 4 }], error: null },
      ],
    },
    {},
  )

  await expect(runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')).rejects.toThrow()
  expect(sendReply).not.toHaveBeenCalled()
})

it('sends with no attachments array entry when the draft has none', async () => {
  const db = buildDb({
    inbox_drafts: [
      { data: draftRow, error: null },
      { data: { id: 'd1' }, error: null },
      { data: null, error: null },
    ],
    inbox_threads: [{ data: { gmail_thread_id: 'gt1', mailbox_account_id: 'a1' }, error: null }],
    mailbox_accounts: [{ data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null }],
    inbox_messages: [{ data: { rfc822_message_id: '<x@y>', from_email: 'resident@example.com' }, error: null }],
    inbox_draft_attachments: [{ data: [], error: null }],
  })
  vi.mocked(sendReply).mockResolvedValue({ messageId: 'm1', threadId: 'gt1' })

  await runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')

  expect(vi.mocked(buildMimeMessage).mock.calls[0][0].attachments).toEqual([])
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk npm run test:unit -- packages/jobs/src/mailbox-send.test.ts`
Expected: FAIL — `args.attachments` is `undefined`.

- [ ] **Step 3: Implement**

Add to `packages/jobs/src/mailbox-send.ts`:

```ts
const BUCKET = 'hoa-documents'

/**
 * Read every attached file's bytes out of storage.
 *
 * Called BEFORE sendToGmail, deliberately. A missing or unreadable object
 * must fail the draft while nothing has been transmitted — attachments
 * reference live storage paths rather than copies, so a file deleted between
 * attach and send is a real and expected case. Sending the message without
 * the file the approver reviewed would be worse than not sending it.
 *
 * Never log a file name — only the opaque attachment count and draft id.
 */
async function loadAttachments(
  db: Db,
  orgId: string,
  draftId: string,
): Promise<OutboundAttachment[]> {
  const { data, error } = await db
    .from('inbox_draft_attachments')
    .select('storage_path, file_name, content_type, size_bytes')
    .eq('organization_id', orgId)
    .eq('draft_id', draftId)
    .order('created_at', { ascending: true })

  if (error) {
    logDbError('mailboxSendJob', 'inbox_draft_attachments', { draftId }, error)
    throw new Error(`mailboxSendJob: could not load attachments: ${error.message}`)
  }

  const files: OutboundAttachment[] = []
  for (const row of data ?? []) {
    const { data: blob, error: downloadError } = await db.storage
      .from(BUCKET)
      .download(row.storage_path)
    if (downloadError || !blob) {
      throw new Error(
        `mailboxSendJob: attachment could not be read from storage: ${downloadError?.message ?? 'no data'}`,
      )
    }
    files.push({
      fileName: row.file_name,
      contentType: row.content_type,
      bytes: Buffer.from(await blob.arrayBuffer()),
    })
  }
  return files
}
```

Import `type OutboundAttachment` from `@homeowner-portal/mailbox` at the top.

In `runMailboxSend`, after the recipient resolution and before `sendToGmail`:

```ts
  // Before sendToGmail, so a storage failure marks the draft failed while
  // nothing has been sent. Inside sendToGmail this would be unsafe.
  let attachments: OutboundAttachment[]
  try {
    attachments = await loadAttachments(db, draft.organization_id, draftId)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await fail(db, draftId, 'A file attached to this reply is no longer available.')
    throw new Error(`mailboxSendJob: attachment load failed for ${draftId}: ${message}`)
  }
```

Pass `attachments` into `sendToGmail` as a new parameter and forward it to `buildMimeMessage` as `attachments`.

- [ ] **Step 4: Run the full suite**

Run: `rtk npm run test:unit && rtk npm run typecheck`
Expected: PASS. Every pre-existing test in this file needs an `inbox_draft_attachments: [{ data: [], error: null }]` queue entry added.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/jobs/src/mailbox-send.ts packages/jobs/src/mailbox-send.test.ts && rtk git commit -m "$(cat <<'EOF'
feat(jobs): send attached files with an approved message

Bytes are read from storage before sendToGmail is entered, so a file
deleted between attach and send fails the draft while nothing has been
transmitted. Sending without the file the approver reviewed would be worse
than not sending at all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: `AttachmentPicker`

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/inbox/[id]/AttachmentPicker.tsx`
- Modify: `apps/hoa/src/app/(dashboard)/inbox/[id]/Composer.tsx`
- Modify: `apps/hoa/src/app/(dashboard)/inbox/[id]/DraftPanel.tsx`
- Modify: `apps/hoa/src/app/(dashboard)/inbox/[id]/page.tsx`

**Interfaces:**
- Consumes: `createAttachmentUploadUrl`, `addDraftAttachment`, `removeDraftAttachment` (Task 10); `checkAttachmentFits`, `formatBytes`, `remainingBudget` (Task 9); `listAttachableDocuments` (Task 10).
- Produces: `AttachmentPicker({ draftId, attachments, threadFiles, libraryFiles, disabled })`.

- [ ] **Step 1: Build the component**

Create `apps/hoa/src/app/(dashboard)/inbox/[id]/AttachmentPicker.tsx`:

```tsx
'use client'

import { useRef, useState, useTransition } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { Alert, Button } from '@homeowner-portal/ui'
import {
  createAttachmentUploadUrl,
  addDraftAttachment,
  removeDraftAttachment,
} from '@/lib/inbox/draft/attachment-actions'
import { checkAttachmentFits, formatBytes, remainingBudget } from '@/lib/inbox/draft/attachments'
import type { DraftAttachment } from '@/lib/inbox/queries'

const BUCKET = 'hoa-documents'

interface Props {
  draftId: string
  attachments: DraftAttachment[]
  /** Files that arrived on this thread. Empty for a new message. */
  threadFiles: Array<{ id: string; fileName: string; sizeBytes: number }>
  libraryFiles: Array<{ id: string; name: string; type: string; sizeBytes: number }>
  disabled?: boolean
}

export function AttachmentPicker({
  draftId,
  attachments,
  threadFiles,
  libraryFiles,
  disabled,
}: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [open, setOpen] = useState<'thread' | 'library' | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const remaining = remainingBudget(attachments)
  const busy = pending || uploading || disabled

  function attach(source: 'inbox' | 'document', ref: string, sizeBytes: number) {
    const fits = checkAttachmentFits(attachments, sizeBytes)
    if (!fits.ok) {
      setError(fits.error)
      return
    }
    setError(null)
    setOpen(null)
    startTransition(async () => {
      const result = await addDraftAttachment(draftId, source, ref)
      if ('error' in result) setError(result.error)
    })
  }

  async function upload(file: File) {
    const fits = checkAttachmentFits(attachments, file.size)
    if (!fits.ok) {
      setError(fits.error)
      return
    }
    setError(null)
    setUploading(true)
    try {
      // Bytes go browser → storage directly. A server action caps its
      // request body at 1MB, so a 15MB file could never pass through one.
      const signed = await createAttachmentUploadUrl(draftId, file.name, file.size)
      if ('error' in signed) {
        setError(signed.error)
        return
      }
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(signed.path, signed.token, file)
      if (uploadError) {
        setError('The upload did not finish. Try again.')
        return
      }
      const result = await addDraftAttachment(draftId, 'upload', signed.path, {
        fileName: file.name,
        contentType: file.type || null,
        sizeBytes: file.size,
      })
      if ('error' in result) setError(result.error)
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  function remove(attachmentId: string) {
    setError(null)
    startTransition(async () => {
      const result = await removeDraftAttachment(attachmentId)
      if ('error' in result) setError(result.error)
    })
  }

  return (
    <div className="space-y-2 border-t border-border pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          Attachments
        </span>
        <span className="text-xs text-muted">{formatBytes(remaining)} left</span>
      </div>

      {attachments.length > 0 ? (
        <ul className="space-y-1">
          {attachments.map((file) => (
            <li key={file.id} className="flex items-center gap-2 text-xs">
              <span className="text-foreground">📎 {file.fileName}</span>
              <span className="text-muted">{formatBytes(file.sizeBytes)}</span>
              <button
                type="button"
                className="text-muted underline"
                onClick={() => remove(file.id)}
                disabled={busy}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileInput}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={uploading}
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          Upload a file
        </Button>
        {threadFiles.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => setOpen(open === 'thread' ? null : 'thread')}
          >
            From this thread
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setOpen(open === 'library' ? null : 'library')}
        >
          From documents
        </Button>
      </div>

      {open === 'thread' ? (
        <ul className="rounded-md border border-border p-2">
          {threadFiles.map((file) => (
            <li key={file.id}>
              <button
                type="button"
                className="w-full text-left text-xs underline"
                onClick={() => attach('inbox', file.id, file.sizeBytes)}
                disabled={busy}
              >
                📎 {file.fileName} · {formatBytes(file.sizeBytes)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {open === 'library' ? (
        <ul className="max-h-48 overflow-y-auto rounded-md border border-border p-2">
          {libraryFiles.length === 0 ? (
            <li className="text-xs text-muted">No documents uploaded yet.</li>
          ) : (
            libraryFiles.map((file) => (
              <li key={file.id}>
                <button
                  type="button"
                  className="w-full text-left text-xs underline"
                  onClick={() => attach('document', file.id, file.sizeBytes)}
                  disabled={busy}
                >
                  📄 {file.name} · {file.type} · {formatBytes(file.sizeBytes)}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}
    </div>
  )
}
```

- [ ] **Step 2: Wire it through `Composer`, `DraftPanel`, and the page**

`Composer` gains `attachments`, `threadFiles`, `libraryFiles` props and renders `<AttachmentPicker …/>` between the body textarea and the blanks list. `DraftPanel` gains the same three props and forwards them. In `page.tsx`, load the library alongside the other reads and derive the thread's stored files from `thread.messages`:

```ts
  const libraryFiles = await listAttachableDocuments(supabase, org.id).catch((error: unknown) => {
    // Enrichment, not page-defining: an empty picker is a smaller harm than
    // a blank thread page, and every other attachment source still works.
    console.error('ThreadPage: failed to load the document library', {
      message: error instanceof Error ? error.message : 'unknown error',
    })
    return []
  })

  const threadFiles = thread.messages.flatMap((message) =>
    message.attachments
      .filter((file) => file.fetchStatus === 'stored')
      .map((file) => ({ id: file.id, fileName: file.fileName, sizeBytes: file.sizeBytes ?? 0 })),
  )
```

Also add the attachment filenames to `DraftPanel`'s `queued`/`sending` state, beside the recipient line:

```tsx
        {draft.status === 'queued' && attachments.length > 0 ? (
          <p className="text-xs text-muted">
            {attachments.map((file) => file.fileName).join(', ')}
          </p>
        ) : null}
```

- [ ] **Step 3: Typecheck and lint**

Run: `rtk npm run typecheck && rtk npm run lint`
Expected: PASS.

- [ ] **Step 4: Exercise it in the running app**

Open a thread with an existing draft and verify each source end to end: upload a small PDF, attach a file that arrived on the thread, attach a document from the library, remove one, and confirm the "left" figure moves. Then approve and confirm the received email actually carries the files.

Also verify the refusal path: attempt to upload a file larger than 15 MB and confirm the composer refuses it before any network request.

- [ ] **Step 5: Commit**

```bash
rtk git add "apps/hoa/src/app/(dashboard)/inbox/[id]/" && rtk git commit -m "$(cat <<'EOF'
feat(inbox): attachment picker with upload, thread, and library sources

One control, three sources, with a running budget against the 15MB cap.
Uploads stream from the browser to storage over a signed URL. Attached
filenames are listed during the undo countdown alongside the recipients.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Phase 3 ships here.** Replies can now carry documents.

---

## Phase 4 — Forward

### Task 14: Pure forward-quoting helper

**Files:**
- Create: `apps/hoa/src/lib/inbox/draft/forward.ts`
- Test: `apps/hoa/src/lib/inbox/draft/forward.test.ts`

**Interfaces:**
- Consumes: `ThreadMessage` (existing, `queries.ts:506`).
- Produces:
  - `buildForwardSubject(subject: string | null): string`
  - `buildForwardBody(messages: ThreadMessage[]): string`

The quoted block uses the `---------- Forwarded message ----------` marker, which `stripQuotedReply` (`packages/mailbox/src/quote.ts:25`) already recognizes as a cut point. That is not a coincidence to preserve by accident — when the vendor replies and their message syncs back, the stripper must be able to cut this history off.

- [ ] **Step 1: Write the failing tests**

Create `apps/hoa/src/lib/inbox/draft/forward.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildForwardSubject, buildForwardBody } from './forward'
import type { ThreadMessage } from '@/lib/inbox/queries'

function message(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: 'm1',
    direction: 'inbound',
    fromName: 'Jane Doe',
    fromEmail: 'jane@example.com',
    toEmails: ['hoa@example.com'],
    subject: 'Fence repair',
    bodyText: 'The fence is broken.',
    strippedText: 'The fence is broken.',
    sentAt: '2026-07-30T16:14:00.000Z',
    attachments: [],
    ...overrides,
  }
}

describe('buildForwardSubject', () => {
  it('prefixes with Fwd:', () => {
    expect(buildForwardSubject('Fence repair')).toBe('Fwd: Fence repair')
  })

  it('does not double-prefix an already-forwarded subject', () => {
    expect(buildForwardSubject('Fwd: Fence repair')).toBe('Fwd: Fence repair')
    expect(buildForwardSubject('FWD: Fence repair')).toBe('FWD: Fence repair')
  })

  it('handles a missing subject', () => {
    expect(buildForwardSubject(null)).toBe('Fwd: (no subject)')
  })
})

describe('buildForwardBody', () => {
  it('opens with a blank line for the sender to write in', () => {
    expect(buildForwardBody([message()]).startsWith('\n\n')).toBe(true)
  })

  it('uses the marker stripQuotedReply recognises', () => {
    expect(buildForwardBody([message()])).toContain('---------- Forwarded message ----------')
  })

  it('carries the original headers and body', () => {
    const out = buildForwardBody([message()])
    expect(out).toContain('From: Jane Doe <jane@example.com>')
    expect(out).toContain('Subject: Fence repair')
    expect(out).toContain('To: hoa@example.com')
    expect(out).toContain('The fence is broken.')
  })

  it('quotes the FULL body, not the stripped one — a forward carries history', () => {
    const out = buildForwardBody([
      message({ bodyText: 'New\n\nOn Mon, X wrote:\n> old', strippedText: 'New' }),
    ])
    expect(out).toContain('> old')
  })

  it('forwards the most recent message when a thread has several', () => {
    const out = buildForwardBody([
      message({ id: 'm1', bodyText: 'first', sentAt: '2026-07-30T10:00:00.000Z' }),
      message({ id: 'm2', bodyText: 'second', sentAt: '2026-07-31T10:00:00.000Z' }),
    ])
    expect(out).toContain('second')
    expect(out).not.toContain('first')
  })

  it('falls back gracefully when a message has no body or sender', () => {
    const out = buildForwardBody([message({ bodyText: null, strippedText: null, fromEmail: null, fromName: null })])
    expect(out).toContain('(no body)')
    expect(out).toContain('From: Unknown')
  })

  it('returns just the blank opening when there are no messages', () => {
    expect(buildForwardBody([])).toBe('\n\n')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/forward.test.ts`
Expected: FAIL — cannot resolve `./forward`.

- [ ] **Step 3: Implement**

Create `apps/hoa/src/lib/inbox/draft/forward.ts`:

```ts
/**
 * Pure helpers that pre-fill a forward. No `'use server'` — see blanks.ts.
 *
 * The quoted block uses the `---------- Forwarded message ----------`
 * marker deliberately: stripQuotedReply (packages/mailbox/src/quote.ts)
 * lists it as a cut pattern, so when the vendor replies and their message
 * syncs back, the stripper can cut this history off instead of feeding it to
 * the reply drafter as if it were new content.
 */

import type { ThreadMessage } from '@/lib/inbox/queries'
import { formatMessageTimestamp } from '@/lib/format-datetime'

export function buildForwardSubject(subject: string | null): string {
  const base = subject?.trim() || '(no subject)'
  return /^fwd:/i.test(base) ? base : `Fwd: ${base}`
}

export function buildForwardBody(messages: ThreadMessage[]): string {
  // Two newlines first: the cursor lands above the quoted block, which is
  // where a person writes "can you take a look at this?".
  const opening = '\n\n'
  if (messages.length === 0) return opening

  // The most recent message, by sent_at. getThreadDetail already orders
  // ascending, but this must not depend on that — a forward that quoted the
  // wrong message would be silently, confusingly wrong.
  const latest = messages.reduce((newest, candidate) =>
    (candidate.sentAt ?? '') > (newest.sentAt ?? '') ? candidate : newest,
  )

  const sender = latest.fromName
    ? `${latest.fromName}${latest.fromEmail ? ` <${latest.fromEmail}>` : ''}`
    : (latest.fromEmail ?? 'Unknown')

  return [
    opening,
    '---------- Forwarded message ----------',
    `From: ${sender}`,
    `Date: ${formatMessageTimestamp(latest.sentAt)}`,
    `Subject: ${latest.subject ?? '(no subject)'}`,
    `To: ${latest.toEmails.join(', ') || '—'}`,
    '',
    // bodyText, NOT strippedText. A forward exists to carry the history
    // onward; handing a vendor a message with its own quoted context removed
    // would strip exactly the thread they need to understand the request.
    latest.bodyText ?? '(no body)',
  ].join('\n')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/forward.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/hoa/src/lib/inbox/draft/forward.ts apps/hoa/src/lib/inbox/draft/forward.test.ts && rtk git commit -m "$(cat <<'EOF'
feat(inbox): pure forward subject and body quoting

Uses the same "Forwarded message" marker stripQuotedReply already cuts on,
so a vendor's reply syncing back can have this history removed. Quotes the
full body rather than the stripped one — carrying history onward is the
point of a forward.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: `createForwardDraft`

**Files:**
- Modify: `apps/hoa/src/lib/inbox/draft/actions.ts`
- Test: `apps/hoa/src/lib/inbox/draft/forward-action.test.ts` *(create)*

**Interfaces:**
- Consumes: `buildForwardSubject`, `buildForwardBody` (Task 14); `getThreadDetail` (existing).
- Produces: `createForwardDraft(threadId: string): Promise<{ ok: true; draftId: string } | { error: string }>`

No AI call. `citations` and `blanks` stay empty, `grounded` stays false with a null note — those columns describe an AI drafter's output and are simply not meaningful for a human-written forward.

- [ ] **Step 1: Write the failing tests**

Create `apps/hoa/src/lib/inbox/draft/forward-action.test.ts`. Copy the `@/lib/auth`, `@/lib/supabase/server`, `@homeowner-portal/jobs`, and `next/cache` mock blocks verbatim from Task 6 Step 1, then add:

- `vi.mock('@/lib/inbox/queries', …)` returning a `getThreadDetail` that resolves to a thread with `subject: 'Fence repair'` and one message carrying two attachments — one `fetchStatus: 'stored'` named `photo.jpg`, one `fetchStatus: 'failed'`.
- Module-level `const insert = vi.fn()` and `const attachmentInsert = vi.fn()`, with the `from(table)` fake routing `inbox_drafts` inserts to the first and `inbox_draft_attachments` inserts to the second. `inbox_drafts.insert(...).select(...).single()` must resolve `{ data: { id: 'draft-1' }, error: null }`.
- Module-level `let attachmentInsertError: { code: string; message: string } | null = null`, returned by the `inbox_draft_attachments` insert, reset to `null` in `beforeEach` along with both `vi.fn()` mocks.

Then the cases:

```ts
it('inserts a forward draft with no recipients and no AI metadata', async () => {
  const result = await createForwardDraft('thread-1')
  expect('ok' in result).toBe(true)
  const values = insert.mock.calls[0][0] as Record<string, unknown>
  expect(values.kind).toBe('forward')
  expect(values.to_emails).toEqual([])
  expect(values.subject).toBe('Fwd: Fence repair')
  expect(values.body_text).toContain('---------- Forwarded message ----------')
  // A forward is written by a human, so nothing here came from a model.
  expect(values.citations).toEqual([])
  expect(values.blanks).toEqual([])
  expect(values.ai_run_id).toBeUndefined()
})

it('auto-attaches the stored files that arrived on the thread', async () => {
  await createForwardDraft('thread-1')
  const attached = attachmentInsert.mock.calls[0][0] as Array<Record<string, unknown>>
  expect(attached).toHaveLength(1)
  expect(attached[0].source).toBe('inbox')
  expect(attached[0].file_name).toBe('photo.jpg')
})

it('skips files that never downloaded rather than attaching a broken row', async () => {
  // The scripted thread has one 'stored' and one 'failed' attachment.
  await createForwardDraft('thread-1')
  const attached = attachmentInsert.mock.calls[0][0] as unknown[]
  expect(attached).toHaveLength(1)
})

it('still creates the draft when the attachment copy fails', async () => {
  attachmentInsertError = { code: '23505', message: 'duplicate' }
  const result = await createForwardDraft('thread-1')
  // Losing the auto-attach is a convenience; losing the draft is not. The
  // human can re-attach from the picker.
  expect('ok' in result).toBe(true)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/forward-action.test.ts`
Expected: FAIL — `createForwardDraft` is not exported.

- [ ] **Step 3: Implement**

Append to `apps/hoa/src/lib/inbox/draft/actions.ts`:

```ts
/**
 * A forward: the thread's latest message quoted below a blank opening, with
 * its files carried along, addressed to nobody yet.
 *
 * No AI call, deliberately. The reply drafter grounds a reply to a resident
 * in governing documents and property context; "can you quote this?" to a
 * landscaper has nothing to ground and no citations to validate. So
 * `citations`, `blanks`, and the ai_runs metadata stay empty — the human is
 * the author, and `grounded=false` here means "not applicable", which is
 * why the composer only renders the ungrounded banner for kind='reply'.
 */
export async function createForwardDraft(
  threadId: string,
): Promise<{ ok: true; draftId: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const thread = await getThreadDetail(supabase, org.id, threadId)
  if (!thread) return { error: 'That conversation no longer exists.' }

  const {
    data: { user: creator },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('inbox_drafts')
    .insert({
      organization_id: org.id,
      thread_id: threadId,
      kind: 'forward',
      status: 'draft',
      created_by: creator?.id ?? null,
      subject: buildForwardSubject(thread.subject),
      body_text: buildForwardBody(thread.messages),
      // Addressed to nobody: choosing who receives a resident's message is
      // the whole decision a forward asks a board member to make, and
      // pre-filling it would invite sending to the wrong party by reflex.
      to_emails: [],
      cc_emails: [],
    })
    .select('id')
    .single()

  if (error) {
    console.error(`createForwardDraft: insert failed: ${error.code} ${error.message}`)
    return { error: 'Could not start a forward.' }
  }

  // Carry the thread's files along. A forward without the photos of the
  // broken fence is half a forward — but losing them is a convenience
  // failure, not a correctness one, so it never discards the draft. The
  // human can re-attach from the picker.
  const storedFiles = thread.messages.flatMap((message) =>
    message.attachments.filter((file) => file.fetchStatus === 'stored'),
  )
  if (storedFiles.length > 0) {
    const { data: sourceRows, error: sourceError } = await supabase
      .from('inbox_attachments')
      .select('id, storage_path, file_name, content_type, size_bytes')
      .eq('organization_id', org.id)
      .in(
        'id',
        storedFiles.map((file) => file.id),
      )

    if (sourceError) {
      console.error(
        `createForwardDraft: attachment read failed: ${sourceError.code} ${sourceError.message}`,
      )
    } else if (sourceRows && sourceRows.length > 0) {
      const { error: copyError } = await supabase.from('inbox_draft_attachments').insert(
        sourceRows
          .filter((row) => row.storage_path)
          .map((row) => ({
            organization_id: org.id,
            draft_id: data.id,
            source: 'inbox' as const,
            storage_path: row.storage_path,
            file_name: row.file_name,
            content_type: row.content_type,
            size_bytes: Number(row.size_bytes ?? 0),
          })),
      )
      if (copyError) {
        console.error(
          `createForwardDraft: attachment copy failed: ${copyError.code} ${copyError.message}`,
        )
      }
    }
  }

  revalidatePath(`/inbox/${threadId}`)
  return { ok: true, draftId: data.id }
}
```

Add to the imports at the top of `actions.ts`:

```ts
import { getThreadDetail } from '@/lib/inbox/queries'
import { buildForwardSubject, buildForwardBody } from './forward'
```

Note: the auto-attached files can exceed the 15 MB cap if a thread carried a lot. `approveDraft` (Task 11) refuses the send in that case and the picker's Remove button is the fix. That is the intended behavior — silently dropping files the board expected to forward would be worse.

- [ ] **Step 4: Run the tests and typecheck**

Run: `rtk npm run test:unit -- apps/hoa/src/lib/inbox/draft/ && rtk npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add apps/hoa/src/lib/inbox/draft/actions.ts apps/hoa/src/lib/inbox/draft/forward-action.test.ts && rtk git commit -m "$(cat <<'EOF'
feat(inbox): createForwardDraft with quoted original and carried files

Addressed to nobody by design — choosing who receives a resident's message
is the decision a forward exists to ask. A failed attachment copy logs and
keeps the draft; the picker can re-attach.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 16: Forward entry point and the thread-view badge

**Files:**
- Modify: `apps/hoa/src/lib/inbox/queries.ts` (`ThreadMessage`, `getThreadDetail`)
- Modify: `apps/hoa/src/app/(dashboard)/inbox/[id]/MessageThread.tsx`
- Modify: `apps/hoa/src/app/(dashboard)/inbox/[id]/DraftPanel.tsx`
- Modify: `apps/hoa/src/app/(dashboard)/inbox/[id]/Composer.tsx`

**Interfaces:**
- Consumes: `createForwardDraft` (Task 15).
- Produces: `ThreadMessage` gains `forwardedTo: string[] | null`.

No new column. `inbox_drafts.gmail_message_id` is stamped on send, and the sync ingests that same message under the same `gmail_message_id`, so the two join on that key.

- [ ] **Step 1: Join drafts onto messages in `getThreadDetail`**

Add `gmail_message_id` to the message `.select(...)`, then after the messages load:

```ts
  // A sent forward and its synced message share a gmail_message_id, so the
  // draft row is what tells the thread view that an outbound message went to
  // a vendor rather than back to the resident. No column on inbox_messages
  // is needed — and adding one would create a second source of truth for
  // something the draft already records.
  const sentIds = messageRows.map((row) => row.gmail_message_id).filter(Boolean)
  const forwardedTo = new Map<string, string[]>()
  if (sentIds.length > 0) {
    const { data: forwardRows, error: forwardError } = await db
      .from('inbox_drafts')
      .select('gmail_message_id, to_emails')
      .eq('organization_id', orgId)
      .eq('kind', 'forward')
      .in('gmail_message_id', sentIds)
    if (forwardError) {
      // Enrichment only: a missing badge is cosmetic, an unrenderable
      // thread is not. Logged, not thrown, unlike the message read itself.
      logDbError('getThreadDetail forwards', 'inbox_drafts', { orgId, threadId }, forwardError)
    } else {
      for (const row of forwardRows ?? []) {
        if (row.gmail_message_id) forwardedTo.set(row.gmail_message_id, row.to_emails ?? [])
      }
    }
  }
```

Add `forwardedTo: string[] | null` to `ThreadMessage` and map it as `forwardedTo.get(row.gmail_message_id) ?? null`.

- [ ] **Step 2: Render the badge**

In `MessageThread.tsx`, replace the outbound badge block:

```tsx
            {message.direction === 'outbound' ? (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                {message.forwardedTo ? 'Forwarded by HOA' : 'Sent by HOA'}
              </span>
            ) : null}
            {message.forwardedTo && message.forwardedTo.length > 0 ? (
              <span className="text-muted">to {message.forwardedTo.join(', ')}</span>
            ) : null}
```

- [ ] **Step 3: Add the Forward button and adapt the composer**

In `DraftPanel.tsx`, add a `handleForward` mirroring `handleCreate` but calling `createForwardDraft(threadId)`, and render it beside "Draft a reply" in both the no-draft and cancelled states:

```tsx
        <div className="flex gap-2">
          <Button size="sm" loading={pending} onClick={handleCreate}>
            Draft a reply
          </Button>
          <Button size="sm" variant="outline" loading={pending} onClick={handleForward}>
            Forward
          </Button>
        </div>
```

In `Composer.tsx`, make the AI-only affordances conditional on `draft.kind === 'reply'` — a human-written forward has no grounding to report and no citations to check:

```tsx
      {draft.kind === 'reply' && draft.grounded === false ? (
```

and wrap the citations list the same way. The blanks list needs no guard: a forward's `blanks` array is empty, so it already renders nothing.

Change the sent-state heading in `DraftPanel` to match the kind:

```tsx
        <p className="font-semibold text-foreground">
          {draft.kind === 'forward' ? 'Forward sent' : 'Reply sent'}
        </p>
```

- [ ] **Step 4: Typecheck, lint, and exercise it**

Run: `rtk npm run typecheck && rtk npm run lint`
Expected: PASS.

In the app: open a thread with an inbound attachment, press Forward, confirm the quoted original and the carried file appear, add a vendor address, approve, and after the next sync confirm the message shows "Forwarded by HOA to vendor@…".

- [ ] **Step 5: Commit**

```bash
rtk git add apps/hoa/src/lib/inbox/queries.ts "apps/hoa/src/app/(dashboard)/inbox/[id]/" && rtk git commit -m "$(cat <<'EOF'
feat(inbox): forward a thread onward, marked as such in the conversation

The badge joins inbox_drafts to the synced message on gmail_message_id
rather than adding a column, so the draft row stays the single record of
what was sent and to whom. Grounding and citation UI is reply-only.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Phase 4 ships here.**

---

## Phase 5 — Compose a new message

### Task 17: `createComposeDraft` and the thread-less send path

**Files:**
- Modify: `apps/hoa/src/lib/inbox/draft/actions.ts`
- Modify: `packages/jobs/src/mailbox-send.ts:120-184`
- Test: `packages/jobs/src/mailbox-send.test.ts`

**Interfaces:**
- Consumes: the `kind='new'` constraint from Task 4.
- Produces: `createComposeDraft(mailboxAccountId: string): Promise<{ ok: true; draftId: string } | { error: string }>`; `getDraftById(db, orgId, draftId): Promise<ThreadDraft | null>` in `queries.ts` (the compose page has no thread to look up by).

- [ ] **Step 1: Write the failing test**

Add to `packages/jobs/src/mailbox-send.test.ts`:

```ts
it('sends a kind=new draft with no threadId and reads the account off the row', async () => {
  const db = buildDb({
    inbox_drafts: [
      { data: { id: 'd1', organization_id: 'org-1', thread_id: null, subject: 'Annual meeting',
                body_text: 'Hello', send_after: null, status: 'queued', kind: 'new',
                to_emails: ['vendor@example.com'], cc_emails: [], mailbox_account_id: 'a1' },
        error: null },
      { data: { id: 'd1' }, error: null },
      { data: null, error: null },
    ],
    mailbox_accounts: [{ data: { email_address: 'hoa@example.com', disconnected_at: null }, error: null }],
    inbox_draft_attachments: [{ data: [], error: null }],
  })
  vi.mocked(sendReply).mockResolvedValue({ messageId: 'm1', threadId: 'gt-new' })

  const result = await runMailboxSend(db, fakeStep(), fakeLogger(), 'd1')

  expect(result).toEqual({ sent: true, messageId: 'm1' })
  // No inbox_threads or inbox_messages read was scripted — buildDb throws if
  // the job makes one, which is the assertion that it does not.
  expect(vi.mocked(sendReply).mock.calls[0][1]).toBeNull()
  const args = vi.mocked(buildMimeMessage).mock.calls[0][0]
  expect(args.inReplyTo).toBeNull()
  expect(args.references).toEqual([])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `rtk npm run test:unit -- packages/jobs/src/mailbox-send.test.ts`
Expected: FAIL — `buildDb: no queued result left for table "inbox_threads"`, because the job still reads the thread unconditionally.

- [ ] **Step 3: Implement the job change**

In `runMailboxSend`, replace the thread and last-inbound reads with a branch:

```ts
  // A kind='new' draft has no thread to read: it is sent with no Gmail
  // threadId, and the ordinary 2-minute sync ingests the sent message into a
  // real thread through the normal path — the same reasoning recorded at the
  // bottom of this file for sent replies. So there is nothing to look up,
  // and the mailbox comes off the draft row instead.
  let accountId: string
  let gmailThreadId: string | null = null
  let last: { rfc822_message_id: string | null; from_email: string | null } = {
    rfc822_message_id: null,
    from_email: null,
  }

  if (draft.kind === 'new') {
    if (!draft.mailbox_account_id) {
      await fail(db, draftId, 'This message has no mailbox to send from.')
      return { sent: false, reason: 'no_account' }
    }
    accountId = draft.mailbox_account_id
  } else {
    const { data: thread, error: threadError } = await db
      .from('inbox_threads')
      .select('gmail_thread_id, mailbox_account_id')
      .eq('id', draft.thread_id)
      .maybeSingle()

    if (threadError || !thread) {
      await fail(db, draftId, threadError?.message ?? 'thread not found')
      throw new Error(`mailboxSendJob: could not load thread for ${draftId}`)
    }
    accountId = thread.mailbox_account_id
    gmailThreadId = thread.gmail_thread_id

    // Reply to the most recent inbound message so threading is correct.
    const { data: lastRow, error: lastError } = await db
      .from('inbox_messages')
      .select('rfc822_message_id, from_email')
      .eq('thread_id', draft.thread_id)
      .eq('direction', 'inbound')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastError) {
      logDbError('mailboxSendJob', 'inbox_messages', { draftId }, lastError)
      await fail(db, draftId, lastError.message)
      throw new Error(`mailboxSendJob: could not load last inbound message: ${lastError.message}`)
    }
    if (lastRow) last = lastRow
  }
```

The account read then uses `accountId`, and `sendToGmail` takes `{ gmailThreadId, accountId }` in place of the `thread` object, forwarding `gmailThreadId` (possibly `null`) to `sendReply`.

- [ ] **Step 4: Implement `createComposeDraft` and `getDraftById`**

Append to `apps/hoa/src/lib/inbox/draft/actions.ts`:

```ts
/**
 * A message that starts a new conversation.
 *
 * Deliberately does NOT create a placeholder inbox_threads row.
 * `inbox_threads.gmail_thread_id` is NOT NULL under a unique index, so a
 * placeholder would need a fake id plus a merge-on-conflict path when Gmail
 * returns a real thread id that already exists. Instead the message is sent
 * with no threadId and the ordinary sync ingests it into a real thread. The
 * cost is that the conversation takes up to one sync cycle to appear in the
 * inbox list, which the compose screen states plainly.
 */
export async function createComposeDraft(
  mailboxAccountId: string,
): Promise<{ ok: true; draftId: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  // Scoped to the org and to a LIVE connection: a disconnected mailbox would
  // fail at send time, after the human wrote the whole message.
  const { data: account, error: accountError } = await supabase
    .from('mailbox_accounts')
    .select('id, disconnected_at')
    .eq('id', mailboxAccountId)
    .eq('organization_id', org.id)
    .maybeSingle()
  if (accountError) {
    console.error(`createComposeDraft: account read failed: ${accountError.code} ${accountError.message}`)
    return { error: 'Could not load your mailbox.' }
  }
  if (!account || account.disconnected_at) {
    return { error: 'That mailbox is not connected.' }
  }

  const {
    data: { user: creator },
  } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('inbox_drafts')
    .insert({
      organization_id: org.id,
      thread_id: null,
      mailbox_account_id: mailboxAccountId,
      kind: 'new',
      status: 'draft',
      created_by: creator?.id ?? null,
      subject: '',
      body_text: '',
      to_emails: [],
      cc_emails: [],
    })
    .select('id')
    .single()

  if (error) {
    console.error(`createComposeDraft: insert failed: ${error.code} ${error.message}`)
    return { error: 'Could not start a new message.' }
  }

  return { ok: true, draftId: data.id }
}
```

In `queries.ts`, add `getDraftById(db, orgId, draftId)` — identical body to `getLatestDraft` but filtered on `.eq('id', draftId)` instead of thread and ordering. The compose page has no thread to look a draft up by.

Note: `approveDraft` requires a non-empty subject and body, so a compose draft cannot be queued while blank. No extra guard is needed.

- [ ] **Step 5: Run the full suite and commit**

Run: `rtk npm run test:unit && rtk npm run typecheck`
Expected: PASS.

```bash
rtk git add apps/hoa/src/lib/inbox/draft/actions.ts apps/hoa/src/lib/inbox/queries.ts packages/jobs/src/mailbox-send.ts packages/jobs/src/mailbox-send.test.ts && rtk git commit -m "$(cat <<'EOF'
feat(inbox): compose a message that starts a new conversation

No placeholder thread row: the message sends with no Gmail threadId and the
ordinary sync ingests it, the same decision already made for sent replies.
The send job branches on kind rather than assuming a thread exists.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 18: The `/inbox/compose` screen

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/inbox/compose/page.tsx`
- Create: `apps/hoa/src/app/(dashboard)/inbox/compose/ComposeStarter.tsx`
- Modify: `apps/hoa/src/app/(dashboard)/inbox/page.tsx`

**Interfaces:**
- Consumes: `createComposeDraft`, `getDraftById` (Task 17); `Composer`, `DraftPanel` (Tasks 8, 13); `listAttachableDocuments`, `listDraftAttachments` (Task 10).

- [ ] **Step 1: Build the page**

Create `apps/hoa/src/app/(dashboard)/inbox/compose/page.tsx`:

```tsx
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  getDraftById,
  listAttachableDocuments,
  listDraftAttachments,
} from '@/lib/inbox/queries'
import { DraftPanel } from '../[id]/DraftPanel'
import { ComposeStarter } from './ComposeStarter'

export const dynamic = 'force-dynamic'

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>
}) {
  const { draft: draftId } = await searchParams
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: accounts, error } = await supabase
    .from('mailbox_accounts')
    .select('id, email_address')
    .eq('organization_id', org.id)
    .is('disconnected_at', null)
    .order('email_address', { ascending: true })

  if (error) {
    console.error(`ComposePage: mailbox read failed: ${error.code} ${error.message}`)
  }
  if (!accounts || accounts.length === 0) {
    redirect('/settings/mailbox')
  }

  // No draft yet — offer to start one. The draft row must exist before the
  // composer renders, because attachments are keyed on its id.
  if (!draftId) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <Header />
        <ComposeStarter accounts={accounts} />
      </main>
    )
  }

  const draft = await getDraftById(supabase, org.id, draftId)
  if (!draft) redirect('/inbox/compose')

  const [attachments, libraryFiles] = await Promise.all([
    listDraftAttachments(supabase, org.id, draft.id),
    listAttachableDocuments(supabase, org.id).catch(() => []),
  ])

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Header />
      <DraftPanel
        threadId={null}
        draft={draft}
        attachments={attachments}
        threadFiles={[]}
        libraryFiles={libraryFiles}
      />
    </main>
  )
}

function Header() {
  return (
    <header className="mb-3">
      <Link href="/inbox" className="text-xs text-muted underline">
        ← Back to the inbox
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-foreground">New email</h1>
      {/* Stated plainly: the conversation is created by the next sync, not
          by the send, so it will not appear in the list immediately. */}
      <p className="text-xs text-muted">
        Once sent, this conversation appears in your inbox within a couple of minutes.
      </p>
    </header>
  )
}
```

Create `apps/hoa/src/app/(dashboard)/inbox/compose/ComposeStarter.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { createComposeDraft } from '@/lib/inbox/draft/actions'

export function ComposeStarter({
  accounts,
}: {
  accounts: Array<{ id: string; email_address: string }>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [accountId, setAccountId] = useState(accounts[0].id)

  function start() {
    setError(null)
    startTransition(async () => {
      const result = await createComposeDraft(accountId)
      if ('error' in result) {
        setError(result.error)
        return
      }
      router.replace(`/inbox/compose?draft=${result.draftId}`)
    })
  }

  return (
    <section className="space-y-3 rounded-md border border-border p-3">
      {accounts.length > 1 ? (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-muted">
            Send from
          </label>
          <select
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            className="w-full rounded-md border border-border bg-background p-2 text-sm"
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.email_address}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <p className="text-xs text-muted">Sending from {accounts[0].email_address}</p>
      )}

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Button size="sm" loading={pending} onClick={start}>
        Start writing
      </Button>
    </section>
  )
}
```

- [ ] **Step 2: Make `DraftPanel` tolerate a null thread**

Change its `threadId` prop to `string | null`. The only use is `createDraft(threadId)` and `createForwardDraft(threadId)` in the no-draft state — neither is reachable on the compose page, because a compose draft always exists by the time `DraftPanel` renders. Guard them anyway:

```tsx
  function handleCreate() {
    if (!threadId) return
    …
  }
```

and render the no-draft state's buttons only when `threadId` is non-null.

- [ ] **Step 3: Add the entry point**

In `apps/hoa/src/app/(dashboard)/inbox/page.tsx`, add beside the filter chips:

```tsx
        <Link
          href="/inbox/compose"
          className="rounded-md border border-border px-3 py-1 text-xs text-foreground"
        >
          New email
        </Link>
```

- [ ] **Step 4: Typecheck, lint, and exercise it**

Run: `rtk npm run typecheck && rtk npm run lint`
Expected: PASS.

In the app: press "New email", start writing, address it to a test account, attach a library document, approve, and confirm it arrives. Wait one sync cycle and confirm the conversation appears in the inbox list with the sent message in it.

- [ ] **Step 5: Commit**

```bash
rtk git add "apps/hoa/src/app/(dashboard)/inbox/" && rtk git commit -m "$(cat <<'EOF'
feat(inbox): compose a brand-new email from the inbox

Reuses DraftPanel and Composer unchanged — a new message is the same
outbound row with no thread. The screen states that the conversation
appears after the next sync rather than instantly.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

**Phase 5 ships here — the feature is complete.**

---

## Final verification

- [ ] `rtk npm run test:unit` — full suite green.
- [ ] `rtk npm run typecheck && rtk npm run lint` — clean.
- [ ] `rtk npm run build` — all apps build.
- [ ] Real-mail smoke test on a branch deploy, in one sitting:
  1. Reply with a Cc and an uploaded PDF → arrives, threaded, both recipients, file opens.
  2. Forward a thread with an inbound photo to an outside address → arrives with the photo, thread shows "Forwarded by HOA to …" after sync.
  3. Compose a new email with a library document → arrives; conversation appears in the inbox after the next sync.
  4. Press Undo within 30 seconds on each → nothing sends.
- [ ] Confirm no log line in the run contains an email address, subject, body, or filename:
  `rtk grep -nE "console\.(error|info|log)" packages/jobs/src/mailbox-send.ts apps/hoa/src/lib/inbox/draft/*.ts`
  Every match must interpolate only ids, counts, error codes, or error messages.

## Known gaps, recorded deliberately

- **No virus scanning** of uploaded attachments (spec D9). Inbound attachments are not scanned today either.
- **No Bcc** (spec D3).
- **No AI drafting for forwards or new messages** (spec D2). `ai_run_id`, `model`, and `prompt_version` are nullable, so a later phase can add it without a migration.
- **Pre-migration compatibility fallback** in `mailbox-send.ts` (Task 7) can be deleted once no draft queued before migration 0038 remains.
