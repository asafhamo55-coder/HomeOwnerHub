// Request parsing (RC-3 parse → validate, RC-8 size limits). Each helper
// throws an ApiRouteError, which withRoute turns into the envelope:
//   400 invalid_json       — body is not JSON
//   400 validation_failed  — schema miss; `issues: [{path, message}]`, never raw Zod JSON
//   413 payload_too_large  — over maxBytes (checked on Content-Length AND on the bytes read)

import type { z } from 'zod'
import { ApiRouteError, type FieldIssue } from './errors'
import { MAX_FORM_BYTES, MAX_JSON_BYTES } from './limits'

export function zodIssues(error: z.ZodError): FieldIssue[] {
  return error.issues.slice(0, 50).map((i) => ({ path: i.path.join('.'), message: i.message }))
}

function validated<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value)
  if (!parsed.success) {
    throw new ApiRouteError('validation_failed', undefined, { issues: zodIssues(parsed.error) })
  }
  return parsed.data
}

function checkDeclaredLength(request: Request, maxBytes: number): void {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiRouteError('payload_too_large', undefined, { maxBytes })
  }
}

/** Read the body as text, stopping as soon as it passes maxBytes. */
async function readCapped(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      throw new ApiRouteError('payload_too_large', undefined, { maxBytes })
    }
    chunks.push(value)
  }
  const all = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    all.set(c, off)
    off += c.byteLength
  }
  return new TextDecoder().decode(all)
}

export async function parseJson<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  opts: { maxBytes?: number } = {},
): Promise<z.output<S>> {
  const maxBytes = opts.maxBytes ?? MAX_JSON_BYTES
  checkDeclaredLength(request, maxBytes)
  const text = await readCapped(request, maxBytes)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    throw new ApiRouteError('invalid_json')
  }
  return validated(schema, body)
}

/** multipart/form-data or urlencoded. A malformed body is a 400, not a thrown 500 (R-20). */
export async function parseForm(request: Request, opts: { maxBytes?: number } = {}): Promise<FormData> {
  const maxBytes = opts.maxBytes ?? MAX_FORM_BYTES
  checkDeclaredLength(request, maxBytes)
  try {
    return await request.formData()
  } catch {
    throw new ApiRouteError('validation_failed', 'The upload could not be read. Try again.')
  }
}

/** Validate URL search params (all values are strings; use z.coerce for numbers). */
export function parseQuery<S extends z.ZodTypeAny>(url: URL, schema: S): z.output<S> {
  return validated(schema, Object.fromEntries(url.searchParams.entries()))
}

/** Validate any already-extracted value (e.g. form fields) the same way. */
export function parseValue<S extends z.ZodTypeAny>(schema: S, value: unknown): z.output<S> {
  return validated(schema, value)
}
