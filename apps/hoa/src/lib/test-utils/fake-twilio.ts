import { vi, type Mock } from 'vitest'

/**
 * A fake Twilio Messages endpoint for tests. Replaces global fetch so the
 * REAL sendSms runs end to end with nothing reaching the network.
 *
 * `send` is called once per request with { url, auth, form } (form = the
 * decoded POST fields). What it returns becomes the reply:
 *   - a Response: used as is;
 *   - anything else: JSON-encoded with HTTP 201 (Twilio's "created").
 * A rejected promise is a network failure.
 */
export interface FakeTwilioRequest {
  url: string
  auth: string | null
  form: Record<string, string>
}

export function installFakeTwilio(send: Mock): void {
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const headers = new Headers(init?.headers)
    const form = Object.fromEntries(new URLSearchParams(String(init?.body ?? '')))
    const reply: unknown = await send({ url: String(url), auth: headers.get('authorization'), form } satisfies FakeTwilioRequest)
    return reply instanceof Response ? reply : new Response(JSON.stringify(reply ?? {}), { status: 201 })
  })
}

export function twilioError(status: number, code: number | null, message = 'ignored'): Response {
  return new Response(JSON.stringify(code === null ? { message } : { code, message, status }), { status })
}
