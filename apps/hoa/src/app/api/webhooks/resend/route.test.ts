import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))

// ─── In-memory service-role client ───────────────────────────────────
//
// A tiny table store that really evaluates the PostgREST filters the
// route uses (eq / in / is / order / limit), so the tests prove the
// resulting rows — a status that must not move backwards, a retry that
// must not insert twice — not just which filters were sent.
// `failures[`${table}.${op}`]` forces an error result for that operation.

type Row = Record<string, any>
type Op = 'select' | 'update' | 'insert'
type DbError = { code?: string; message?: string }

let tables: Record<string, Row[]> = {}
let failures: Record<string, DbError> = {}
let ops: Array<{ table: string; op: Op }> = []
let nextId = 1

function builder(table: string) {
  let op: Op = 'select'
  let payload: Row | null = null
  const preds: Array<(r: Row) => boolean> = []
  let orderCol: string | null = null
  let limitN = Infinity

  const rows = () => (tables[table] ??= [])
  const run = (): { data: any; error: DbError | null } => {
    ops.push({ table, op })
    const fail = failures[`${table}.${op}`]
    if (fail) return { data: null, error: fail }
    if (op === 'insert') {
      rows().push({ id: `row-${nextId++}`, ...payload })
      return { data: null, error: null }
    }
    let hit = rows().filter((r) => preds.every((p) => p(r)))
    if (op === 'update') {
      for (const r of hit) Object.assign(r, payload)
      return { data: null, error: null }
    }
    if (orderCol) hit = [...hit].sort((a, b) => String(a[orderCol!]).localeCompare(String(b[orderCol!])))
    return { data: hit.slice(0, limitN).map((r) => ({ ...r })), error: null }
  }

  const b = {
    select: () => b,
    update(p: Row) {
      op = 'update'
      payload = p
      return b
    },
    insert(p: Row) {
      op = 'insert'
      payload = p
      return b
    },
    eq(col: string, val: unknown) {
      preds.push((r) => r[col] === val)
      return b
    },
    in(col: string, vals: unknown[]) {
      preds.push((r) => vals.includes(r[col]))
      return b
    },
    is(col: string, val: null) {
      preds.push((r) => (r[col] ?? null) === val)
      return b
    },
    order(col: string) {
      orderCol = col
      return b
    },
    limit(n: number) {
      limitN = n
      return b
    },
    async maybeSingle() {
      const r = run()
      return { data: r.error ? null : (r.data?.[0] ?? null), error: r.error }
    },
    then(resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) {
      return Promise.resolve(run()).then(resolve, reject)
    },
  }
  return b
}

vi.mock('@homeowner-portal/db', () => ({
  createAdminClient: () => ({ from: (t: string) => builder(t) }),
}))

// GET /emails/receiving/{id} — mocked; no network.
const received = vi.hoisted(() => vi.fn())
vi.mock('@/lib/email', () => ({ getReceivedEmail: received }))

import { POST } from './route'

// ─── Signing ─────────────────────────────────────────────────────────

const KEY = Buffer.from('test-signing-key-0123456789')
const SECRET = `whsec_${KEY.toString('base64')}`

function signedRequest(
  body: unknown,
  opts: { secret?: Buffer; ts?: number; id?: string; omitSig?: boolean } = {},
) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body)
  const id = opts.id ?? 'msg_123'
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000))
  const sig = createHmac('sha256', opts.secret ?? KEY).update(`${id}.${ts}.${raw}`).digest('base64')
  const headers: Record<string, string> = { 'svix-id': id, 'svix-timestamp': ts }
  if (!opts.omitSig) headers['svix-signature'] = `v1,${sig}`
  return new Request('http://x/api/webhooks/resend', { method: 'POST', headers, body: raw })
}

async function json(res: Response) {
  return (await res.json()) as Record<string, any>
}

function expectEnvelope(body: Record<string, any>, code: string) {
  expect(body.error).toBeTypeOf('object')
  expect(body.error.code).toBe(code)
  expect(body.error.message).toBeTypeOf('string')
}

let logs: string[] = []

const RESIDENT = 'resident@example.com'
// Recipient row ids are uuids: our Message-ID embeds them.
const R1 = '0f1e2d3c-4b5a-4968-8776-655443322110'
const R2 = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'

function recipient(over: Row = {}): Row {
  return {
    id: R1,
    organization_id: 'org-1',
    communication_id: 'comm-1',
    channel: 'email',
    email: RESIDENT,
    external_id: 'e1',
    delivery_status: 'sent',
    sent_at: null,
    delivered_at: null,
    opened_at: null,
    clicked_at: null,
    failed_at: null,
    replied_at: null,
    ...over,
  }
}

const replies = () => tables.communication_replies ?? []
const rcpt = (id = R1) => tables.communication_recipients!.find((r) => r.id === id)!

beforeEach(() => {
  tables = { communication_recipients: [recipient()], communication_replies: [] }
  failures = {}
  ops = []
  nextId = 1
  logs = []
  process.env.RESEND_WEBHOOK_SECRET = SECRET
  received.mockReset()
  const capture = (...args: unknown[]) => {
    logs.push(JSON.stringify(args))
  }
  vi.spyOn(console, 'error').mockImplementation(capture)
  vi.spyOn(console, 'warn').mockImplementation(capture)
  vi.spyOn(console, 'log').mockImplementation(capture)
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ─── Config + signature ──────────────────────────────────────────────

describe('POST /api/webhooks/resend — auth', () => {
  it('missing secret → 503 not_configured envelope, no DB work', async () => {
    delete process.env.RESEND_WEBHOOK_SECRET
    const res = await POST(signedRequest({ type: 'email.sent', data: { email_id: 'e1' } }))
    expect(res.status).toBe(503)
    expectEnvelope(await json(res), 'not_configured')
    expect(ops).toEqual([])
  })

  it('missing signature headers → 401 unauthenticated envelope', async () => {
    const res = await POST(signedRequest({ type: 'email.sent' }, { omitSig: true }))
    expect(res.status).toBe(401)
    expectEnvelope(await json(res), 'unauthenticated')
    expect(ops).toEqual([])
  })

  it('unsigned caller with an oversized body → 401, not 413 (headers checked before the body is read)', async () => {
    const req = signedRequest({ type: 'email.sent', pad: 'x'.repeat(1024 * 1024 + 10) }, { omitSig: true })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expectEnvelope(await json(res), 'unauthenticated')
    expect(req.bodyUsed).toBe(false)
  })

  it('wrong key → 401 unauthenticated envelope', async () => {
    const res = await POST(
      signedRequest({ type: 'email.sent', data: { email_id: 'e1' } }, { secret: Buffer.from('other') }),
    )
    expect(res.status).toBe(401)
    expectEnvelope(await json(res), 'unauthenticated')
    expect(ops).toEqual([])
  })

  it('stale timestamp (replay) → 401', async () => {
    const res = await POST(
      signedRequest({ type: 'email.sent', data: { email_id: 'e1' } }, { ts: Math.floor(Date.now() / 1000) - 600 }),
    )
    expect(res.status).toBe(401)
    expect(ops).toEqual([])
  })

  it('signature headers present but body over the cap → 413 payload_too_large before the HMAC', async () => {
    const res = await POST(signedRequest({ type: 'email.sent', pad: 'x'.repeat(1024 * 1024 + 10) }))
    expect(res.status).toBe(413)
    expectEnvelope(await json(res), 'payload_too_large')
    expect(ops).toEqual([])
  })
})

// ─── Parse + validate ────────────────────────────────────────────────

describe('POST /api/webhooks/resend — parse', () => {
  it('signed but not JSON → 400 invalid_json envelope', async () => {
    const res = await POST(signedRequest('not json{'))
    expect(res.status).toBe(400)
    expectEnvelope(await json(res), 'invalid_json')
  })

  it('signed but no event type → 400 validation_failed with issues', async () => {
    const res = await POST(signedRequest({ type: 42 }))
    expect(res.status).toBe(400)
    const body = await json(res)
    expectEnvelope(body, 'validation_failed')
    expect(Array.isArray(body.error.issues)).toBe(true)
  })

  it('unknown event type → 200, deliberately ignored, no writes', async () => {
    const res = await POST(signedRequest({ type: 'contact.created', data: { id: 'c1' } }))
    expect(res.status).toBe(200)
    expect(ops).toEqual([])
  })
})

// ─── Delivery events ─────────────────────────────────────────────────

describe('POST /api/webhooks/resend — delivery events', () => {
  it('email.delivered moves sent → delivered and records delivered_at', async () => {
    const res = await POST(
      signedRequest({ type: 'email.delivered', created_at: '2026-10-16T10:00:00.000Z', data: { email_id: 'e1' } }),
    )
    expect(res.status).toBe(200)
    expect(rcpt().delivery_status).toBe('delivered')
    expect(rcpt().delivered_at).toBe('2026-10-16T10:00:00.000Z')
  })

  it('a late email.delivered does not move clicked backwards, but still records delivered_at', async () => {
    Object.assign(rcpt(), { delivery_status: 'clicked', clicked_at: '2026-10-16T09:00:00.000Z' })
    const res = await POST(
      signedRequest({ type: 'email.delivered', created_at: '2026-10-16T08:00:00.000Z', data: { email_id: 'e1' } }),
    )
    expect(res.status).toBe(200)
    expect(rcpt().delivery_status).toBe('clicked')
    expect(rcpt().delivered_at).toBe('2026-10-16T08:00:00.000Z')
  })

  it('a late email.opened does not overwrite replied; a retry keeps the first timestamp', async () => {
    Object.assign(rcpt(), { delivery_status: 'replied', opened_at: '2026-10-16T07:00:00.000Z' })
    await POST(signedRequest({ type: 'email.opened', created_at: '2026-10-16T11:00:00.000Z', data: { email_id: 'e1' } }))
    expect(rcpt().delivery_status).toBe('replied')
    expect(rcpt().opened_at).toBe('2026-10-16T07:00:00.000Z')
  })

  it('email.delivery_delayed changes neither the status nor any timestamp', async () => {
    const before = { ...rcpt() }
    const res = await POST(signedRequest({ type: 'email.delivery_delayed', data: { email_id: 'e1' } }))
    expect(res.status).toBe(200)
    expect(rcpt()).toEqual(before)
    expect(ops.filter((o) => o.op === 'update')).toEqual([])
  })

  it('a delivery event never touches an SMS recipient sharing the external id', async () => {
    tables.communication_recipients!.push(recipient({ id: 'sms-1', channel: 'sms', external_id: 'e1' }))
    await POST(signedRequest({ type: 'email.delivered', data: { email_id: 'e1' } }))
    expect(rcpt('sms-1').delivery_status).toBe('sent')
  })

  it('a DB write failure → 500 internal envelope (so Resend retries), no raw text in body or logs', async () => {
    failures['communication_recipients.update'] = {
      code: '42P01',
      message: 'relation "communication_recipients" secret-detail',
    }
    const res = await POST(signedRequest({ type: 'email.opened', data: { email_id: 'e1' } }))
    expect(res.status).toBe(500)
    const body = await json(res)
    expectEnvelope(body, 'internal')
    expect(JSON.stringify(body)).not.toContain('secret-detail')
    expect(logs.join('\n')).not.toContain('secret-detail')
  })
})

// ─── Inbound replies ─────────────────────────────────────────────────

/** Our Message-ID for recipient row R1, as lib/email.ts stamps it on send. */
const OUR_ID = `<hoh-cr.${R1}@hoa.example>`

const nestedEvent = {
  type: 'email.received',
  data: {
    email_id: 'inbound-1',
    inbound: {
      message_id: '<reply-1@mail.example>',
      from: { email: RESIDENT, name: 'Res Ident' },
      subject: 'Re: Pool hours',
      text: 'Thanks for the update',
      in_reply_to: OUR_ID,
    },
  },
}

/** What Resend actually sends: metadata only (resend 6.x ReceivedEmailEventData). */
const realEvent = {
  type: 'email.received',
  created_at: '2026-10-16T10:00:00.000Z',
  data: {
    email_id: 'inb-real-1',
    created_at: '2026-10-16T10:00:00.000Z',
    from: 'Res Ident <resident@example.com>',
    to: ['board@hoa.example'],
    bcc: [],
    cc: [],
    message_id: '<CAF-reply@mail.gmail.com>',
    subject: 'Re: Pool hours',
    attachments: [],
  },
}

describe('POST /api/webhooks/resend — inbound replies (Resend metadata-only payload)', () => {
  it('reads the threading headers and body from Resend and links via our Message-ID', async () => {
    received.mockResolvedValue({
      ok: true,
      email: {
        headers: { 'in-reply-to': OUR_ID, references: `<older@x.y> ${OUR_ID}` },
        text: 'Real body',
        html: null,
      },
    })
    const res = await POST(signedRequest(realEvent))
    expect(res.status).toBe(200)
    expect(received).toHaveBeenCalledWith('inb-real-1')
    expect(replies()).toHaveLength(1)
    expect(replies()[0]).toMatchObject({
      organization_id: 'org-1',
      communication_id: 'comm-1',
      recipient_id: R1,
      from_email: RESIDENT,
      body: 'Real body',
      external_id: '<CAF-reply@mail.gmail.com>',
    })
    expect(rcpt().delivery_status).toBe('replied')
  })

  it('links from References alone (In-Reply-To names a different message)', async () => {
    received.mockResolvedValue({
      ok: true,
      email: { headers: { 'in-reply-to': '<someone-else@x.y>', references: `${OUR_ID} <someone-else@x.y>` }, text: 'B', html: null },
    })
    await POST(signedRequest(realEvent))
    expect(replies()).toHaveLength(1)
  })

  it('a failed Resend read → 503 upstream_unavailable (Svix retries), nothing stored', async () => {
    received.mockResolvedValue({ ok: false, reason: 'upstream' })
    const res = await POST(signedRequest(realEvent))
    expect(res.status).toBe(503)
    expectEnvelope(await json(res), 'upstream_unavailable')
    expect(replies()).toHaveLength(0)
  })

  it('no RESEND_API_KEY → 503 not_configured, nothing stored', async () => {
    received.mockResolvedValue({ ok: false, reason: 'not_configured' })
    const res = await POST(signedRequest(realEvent))
    expect(res.status).toBe(503)
    expectEnvelope(await json(res), 'not_configured')
  })

  it('an inbound email Resend no longer has → 200, dropped', async () => {
    received.mockResolvedValue({ ok: false, reason: 'not_found' })
    const res = await POST(signedRequest(realEvent))
    expect(res.status).toBe(200)
    expect(replies()).toHaveLength(0)
  })

  it('external_id (Resend’s API id) is NOT a link: a header naming it attaches nothing', async () => {
    received.mockResolvedValue({ ok: true, email: { headers: { 'in-reply-to': '<e1>' }, text: 'x', html: null } })
    await POST(signedRequest(realEvent))
    expect(replies()).toHaveLength(0)
    expect(rcpt().delivery_status).toBe('sent')
  })
})

describe('POST /api/webhooks/resend — inbound replies', () => {
  it('email.received is not swallowed by the delivery branch (headers in the payload: no Resend read)', async () => {
    const res = await POST(signedRequest(nestedEvent))
    expect(res.status).toBe(200)
    expect(received).not.toHaveBeenCalled()
    expect(replies()).toHaveLength(1)
    expect(replies()[0]).toMatchObject({
      organization_id: 'org-1',
      communication_id: 'comm-1',
      recipient_id: R1,
      channel: 'email',
      from_email: RESIDENT,
      external_id: '<reply-1@mail.example>',
    })
    expect(rcpt().delivery_status).toBe('replied')
    expect(rcpt().replied_at).toBeTypeOf('string')
  })

  it('accepts the flat shape (data.from / message_id / in_reply_to, no data.inbound)', async () => {
    const res = await POST(
      signedRequest({
        type: 'email.received',
        data: {
          email_id: 'inbound-2',
          from: 'Res Ident <Resident@Example.com>',
          to: ['board@hoa.example'],
          subject: 'Re: Pool hours',
          text: 'Flat body',
          message_id: '<reply-2@mail.example>',
          in_reply_to: OUR_ID,
        },
      }),
    )
    expect(res.status).toBe(200)
    expect(replies()).toHaveLength(1)
    expect(replies()[0]).toMatchObject({ body: 'Flat body', from_email: RESIDENT, external_id: '<reply-2@mail.example>' })
  })

  it('a retry with the same message id does not insert a second reply', async () => {
    await POST(signedRequest(nestedEvent, { id: 'msg_a' }))
    const res = await POST(signedRequest(nestedEvent, { id: 'msg_a' }))
    expect(res.status).toBe(200)
    expect(replies()).toHaveLength(1)
  })

  it('a retry of a reply with NO message id or email id dedupes on the svix delivery id', async () => {
    const event = { type: 'email.received', data: { from: RESIDENT, text: 'No ids here', in_reply_to: OUR_ID } }
    await POST(signedRequest(event, { id: 'msg_retry' }))
    await POST(signedRequest(event, { id: 'msg_retry' }))
    expect(replies()).toHaveLength(1)
    expect(replies()[0]!.external_id).toBe('svix:msg_retry')
    await POST(signedRequest(event, { id: 'msg_other' }))
    expect(replies()).toHaveLength(2)
  })

  it('a reply with no message id falls back to Resend’s inbound email id for dedupe', async () => {
    const event = { type: 'email.received', data: { email_id: 'inb-9', from: RESIDENT, in_reply_to: OUR_ID } }
    await POST(signedRequest(event, { id: 'msg_1' }))
    await POST(signedRequest(event, { id: 'msg_2' }))
    expect(replies()).toHaveLength(1)
    expect(replies()[0]!.external_id).toBe('inb-9')
  })

  it('an id that merely contains the row uuid is not ours and links nothing', async () => {
    await POST(signedRequest({ type: 'email.received', data: { from: RESIDENT, in_reply_to: `<${R1}@attacker.example>` } }))
    expect(replies()).toHaveLength(0)
    expect(rcpt().delivery_status).toBe('sent')
  })

  it('never links to an SMS recipient, even with our Message-ID shape', async () => {
    tables.communication_recipients = [recipient({ channel: 'sms', external_id: 'SM123' })]
    await POST(signedRequest(nestedEvent))
    expect(replies()).toHaveLength(0)
  })

  it('drops a reply whose sender is not the matched recipient', async () => {
    const res = await POST(
      signedRequest({ type: 'email.received', data: { from: 'someone-else@example.com', in_reply_to: OUR_ID } }),
    )
    expect(res.status).toBe(200)
    expect(replies()).toHaveLength(0)
    expect(rcpt().delivery_status).toBe('sent')
    expect(logs.join('\n')).not.toContain('someone-else@example.com')
  })

  it('picks the named row whose address matches when References names several of ours', async () => {
    tables.communication_recipients = [recipient({ id: R2, email: 'other@example.com', organization_id: 'org-2' }), recipient()]
    await POST(
      signedRequest({
        type: 'email.received',
        data: { from: RESIDENT, message_id: '<m@x>', references: [`<hoh-cr.${R2}@hoa.example>`, OUR_ID] },
      }),
    )
    expect(replies()).toHaveLength(1)
    expect(replies()[0]).toMatchObject({ recipient_id: R1, organization_id: 'org-1' })
  })

  it('does not 400 a genuine reply with a long display name, long subject and >100 References', async () => {
    const references = Array.from({ length: 150 }, (_, i) => `<old-${i}@mail.example>`)
    references.push(OUR_ID)
    const res = await POST(
      signedRequest({
        type: 'email.received',
        data: {
          message_id: '<reply-long@mail.example>',
          from: `${'N'.repeat(2000)} <${RESIDENT}>`,
          subject: 'S'.repeat(30_000),
          text: 'Body',
          references,
        },
      }),
    )
    expect(res.status).toBe(200)
    expect(replies()).toHaveLength(1)
    expect(replies()[0]!.from_email).toBe(RESIDENT)
    expect((replies()[0]!.subject as string).length).toBeLessThanOrEqual(20_000)
  })

  it('a field of an unexpected type reads as absent instead of 400-ing the event', async () => {
    const res = await POST(
      signedRequest({
        type: 'email.received',
        data: { from: RESIDENT, in_reply_to: OUR_ID, subject: { weird: true }, references: 'not-an-array' },
      }),
    )
    expect(res.status).toBe(200)
    expect(replies()).toHaveLength(1)
    expect(replies()[0]!.subject).toBeNull()
  })

  it('a reply insert failure → 500 internal envelope, no raw text', async () => {
    failures['communication_replies.insert'] = { code: '23502', message: 'null value secret-detail' }
    const res = await POST(signedRequest(nestedEvent))
    expect(res.status).toBe(500)
    const body = await json(res)
    expectEnvelope(body, 'internal')
    expect(JSON.stringify(body)).not.toContain('secret-detail')
    expect(logs.join('\n')).not.toContain('secret-detail')
  })

  it('a unique violation on insert (parallel duplicate delivery) is acked as a duplicate', async () => {
    failures['communication_replies.insert'] = { code: '23505', message: 'duplicate key' }
    const res = await POST(signedRequest(nestedEvent))
    expect(res.status).toBe(200)
    expect(rcpt().delivery_status).toBe('replied')
  })

  it('a parent-lookup read failure → 500 (retry), not a silent drop', async () => {
    failures['communication_recipients.select'] = { code: '57014', message: 'timeout' }
    const res = await POST(signedRequest(nestedEvent))
    expect(res.status).toBe(500)
    expectEnvelope(await json(res), 'internal')
  })

  it('an unlinkable reply is acked 200 and never logs the sender email or subject', async () => {
    tables.communication_recipients = []
    const res = await POST(signedRequest(nestedEvent))
    expect(res.status).toBe(200)
    expect(replies()).toHaveLength(0)
    const all = logs.join('\n')
    expect(all).not.toContain(RESIDENT)
    expect(all).not.toContain('Pool hours')
  })
})
