import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs'

// Shared Sentry configuration for every app in the workspace.
//
// Two rules drive everything here:
//
//   1. INERT WITHOUT A DSN. No DSN means `enabled: false` — the SDK
//      initialises, captures nothing, sends nothing. A fresh checkout, a
//      preview without the env var, and CI all behave exactly as before
//      Sentry existed.
//
//   2. NO RESIDENT PII LEAVES THE APP. This product holds residents'
//      names, addresses, emails, phone numbers, ledgers and documents.
//      `sendDefaultPii: false` stops the SDK attaching IPs and cookies on
//      its own, and `scrubEvent` below removes what it would otherwise
//      still send: request headers, cookies, bodies and query strings,
//      URL query strings in breadcrumbs, and console breadcrumbs (the
//      apps' console.error calls interpolate row data). What is kept is
//      what debugging needs: the stack, the route path, the release.

export type SentryRuntime = 'server' | 'edge' | 'client'

const QUERY = /\?.*$/

function stripQuery(url: unknown): unknown {
  return typeof url === 'string' ? url.replace(QUERY, '') : url
}

function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  // console.* breadcrumbs carry whatever the app logged — row data,
  // addresses, email subjects. Drop them outright.
  if (crumb.category === 'console') return null
  if (!crumb.data) return crumb
  const data: Record<string, unknown> = {}
  // fetch/xhr/navigation crumbs: keep method, status and the URL path;
  // drop everything else (request/response bodies, query strings).
  for (const key of ['method', 'status_code', 'url', 'from', 'to']) {
    if (key in crumb.data) data[key] = stripQuery(crumb.data[key])
  }
  return { ...crumb, data }
}

// Error messages are not safe either: a Postgres unique violation reads
// `Key (email)=(jane@example.com) already exists`. Redact the two shapes
// most likely to identify a resident — emails and phone-length digit runs.
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
// NANP shape (3-3-4, optional country code / parens). Deliberately not a
// generic digit run: ISO dates and timestamps must survive intact.
const PHONE = /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g

export function redactText(text: string): string {
  return text.replace(EMAIL, '[email]').replace(PHONE, '[number]')
}

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const out: ErrorEvent = { ...event }

  if (typeof out.message === 'string') out.message = redactText(out.message)
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map(v =>
        typeof v.value === 'string' ? { ...v, value: redactText(v.value) } : v,
      ),
    }
  }

  if (out.request) {
    out.request = {
      method: out.request.method,
      url: stripQuery(out.request.url) as string | undefined,
    }
  }

  // Keep only an opaque id, never email/username/IP.
  if (out.user) {
    out.user = out.user.id !== undefined ? { id: out.user.id } : undefined
  }

  if (out.breadcrumbs) {
    out.breadcrumbs = out.breadcrumbs
      .map(scrubBreadcrumb)
      .filter((c): c is Breadcrumb => c !== null)
  }

  return out
}

function readDsn(runtime: SentryRuntime): string | undefined {
  // The browser bundle only sees NEXT_PUBLIC_*; the server prefers its own
  // var but falls back to the public one so a single DSN is enough.
  const dsn =
    runtime === 'client'
      ? process.env.NEXT_PUBLIC_SENTRY_DSN
      : process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
  return dsn && dsn.trim() !== '' ? dsn : undefined
}

export function sentryInitOptions(app: string, runtime: SentryRuntime) {
  const dsn = readDsn(runtime)
  const release =
    runtime === 'client'
      ? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA
      : process.env.VERCEL_GIT_COMMIT_SHA
  const environment =
    (runtime === 'client' ? process.env.NEXT_PUBLIC_VERCEL_ENV : process.env.VERCEL_ENV) ??
    process.env.NODE_ENV

  return {
    dsn,
    enabled: dsn !== undefined,
    environment,
    // Left undefined when the env var is absent so the release value the
    // Next.js SDK injects at build time is used instead.
    ...(release ? { release } : {}),
    initialScope: { tags: { app } },
    sendDefaultPii: false,
    // Errors only. Tracing would ship every route + timing for little gain
    // at this size, and is one more place for identifiers to leak.
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  }
}
