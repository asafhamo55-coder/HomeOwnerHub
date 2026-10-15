# Observability

Error tracking is Sentry (`@sentry/nextjs` 11). It is wired into all four
apps and every Inngest job, and it is **completely inert until a DSN is
set** — no events, no network calls, no source-map upload. A build or
deploy without the env vars below behaves exactly as before.

## What is wired

| Where | What gets reported |
|---|---|
| `apps/*/src/instrumentation.ts` | Server + edge init; `onRequestError` captures errors thrown in server components, route handlers and server actions |
| `apps/*/src/instrumentation-client.ts` | Browser init (no session replay — it would record residents' screens) |
| `apps/*/src/app/global-error.tsx` | Errors in a root layout, which no route `error.tsx` can catch |
| `apps/*/src/app/error.tsx`, hoa's `(dashboard)`, `admin`, `resident` boundaries | Render errors caught by a route boundary |
| `packages/jobs/src/failure-reporting.ts` | Every failed Inngest attempt and step, all 16 functions, via one client middleware. Retried attempt = `warning`, last attempt = `error` |
| `packages/observability/src/report.ts` (`reportError`) | Failures deliberately not thrown: platform-admin audit writes, push-subscription unsubscribe |

Shared options live in `packages/observability/src/index.ts`
(`sentryInitOptions`). Each event is tagged `app` (hoa/pm/eviction/marketing),
plus `release` = `VERCEL_GIT_COMMIT_SHA` and `environment` = `VERCEL_ENV`.
Inngest events also carry `inngest.function`, `inngest.run_id`,
`inngest.attempt`, `inngest.final_attempt` and `inngest.step`.

## What is NOT sent (PII)

`sendDefaultPii: false`, tracing off (`tracesSampleRate: 0`), and every
event goes through `scrubEvent` before it leaves the app:

- request: only method + URL path (no headers, cookies, body, query string)
- user: only an opaque `id`
- breadcrumbs: `console.*` crumbs dropped entirely; fetch/xhr crumbs keep only
  method, status, and URL without the query string
- error messages: emails → `[email]`, US phone numbers → `[number]`
  (Postgres errors embed values, e.g. `Key (email)=(…)`)
- Inngest: the event payload is never attached

`reportError(err, where, context)`: `context` must hold ids and counts
only. It is sent as-is.

## Turning it on

1. **Create the Sentry projects.** Make one org, then four projects of type
   *Next.js*: `hoa`, `pm`, `eviction`, `marketing`. One project per app
   keeps alerts and quotas separate. A single shared project also works,
   since the `app` tag tells events apart.
2. **Copy each project's DSN** (Settings → Client Keys). The DSN is not a
   secret; it ships to the browser.
3. **Create an auth token** with scope `project:releases` + `org:read`
   (Settings → Auth Tokens). This one *is* a secret, and it is only needed
   for readable stack traces (source maps).
4. **Set the env vars in Vercel**, in each app's Vercel project, for
   Production (and Preview if wanted):

   | Variable | Value | Needed for |
   |---|---|---|
   | `NEXT_PUBLIC_SENTRY_DSN` | that app's DSN | browser + server capture (server falls back to it) |
   | `SENTRY_DSN` | same DSN | optional; server-only override |
   | `SENTRY_AUTH_TOKEN` | the token | source-map upload at build |
   | `SENTRY_ORG` | org slug | source-map upload |
   | `SENTRY_PROJECT` | `hoa` / `pm` / `eviction` / `marketing` | source-map upload |

   Inngest jobs run inside the **hoa** deployment (`/api/inngest`), so
   their failures land in the hoa project.
5. **Redeploy** each app. `NEXT_PUBLIC_*` values are baked in at build time.

## Verifying

- `curl -H "Authorization: Bearer $CRON_SECRET" https://<hoa-host>/api/cron/sentry-test`
  returns a 500 and should create an issue *"Sentry test error from hoa
  (<sha>)"* in the hoa project within a minute. The route fails closed: 503
  without `CRON_SECRET`, 401 with a wrong token.
- Open that issue and check: the stack is readable (source maps worked),
  `release` is the deployed SHA, and the request shows no headers or
  cookies.
- Add an alert rule: *level:error* → email. Retried Inngest attempts are
  `warning`, so this fires once per job that actually gave up.

## Not covered (yet)

- The ~200 `console.error` calls still log only to Vercel logs. Uncaught
  errors are captured. Errors that are caught and only logged are not;
  move them to `reportError` as they are touched.
- No uptime monitoring: `/api/health` is polled only by `smoke.yml` in CI.
- No performance tracing (off on purpose; see above).
