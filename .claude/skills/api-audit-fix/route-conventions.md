# Route conventions

The standard every route handler is brought into line with, and that every fix
is verified against. `PROBLEMS.md › Route conventions (this repo)` may adjust a
detail to match the repo's reference implementation; where it does, it wins.

## 1. Error envelope
- Every non-2xx response has exactly this body:
  `{ "error": { "code": "<UPPER_SNAKE>", "message": "<human text>", "details"?: <any> } }`
- No other error shapes: no bare strings, no `{ message }`, no `{ error: "text" }`, no stack traces or internal messages leaked to clients.
- Codes map to statuses consistently: `VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `CONFLICT` 409, `INTERNAL` 500.
- Errors go through the repo's shared helper/middleware when one exists; a handler never hand-builds a divergent shape.
- Async handlers can't drop a rejection: thrown errors reach the error path (try/catch, an async wrapper, or a framework that awaits handlers).

## 2. Validation
- Validate params, query and body BEFORE any side effect (store write, external call).
- One validation mechanism across the routes (the repo's schema lib, or one shared helper) — not ad-hoc checks in some files and schemas in others.
- Failures return 400 `VALIDATION_ERROR` with `details` naming each bad field.
- Ids and numbers are parsed and checked (integers, ranges); unknown or extra fields are handled the same way everywhere.

## 3. Pagination (list endpoints)
- Same query params everywhere: `limit` and `cursor` (or `limit`/`offset` if that's the repo's reference — one style only).
- Same default and cap everywhere (default 20, max 100 unless the repo says otherwise); out-of-range values → 400, not silent clamping in one file and errors in another.
- Same response shape everywhere: `{ "data": [...], "page": { "limit", "nextCursor" | "offset", "total"? } }`.
- Stable ordering, so pages don't skip or repeat items.

## 4. Responses and shared state
- Success bodies use one shape (`{ data: ... }` if that is the convention); statuses are right (201 on create with the resource, 204 with no body on delete).
- Handlers don't mutate objects returned by the store or keep module-level mutable state; they go through the store's API.

## Verifying a fix
A fix passes only if all are true:
1. Every problem assigned to the file is resolved — check each one against the code, not the summary.
2. The file now meets sections 1–4 (or the repo's adjusted conventions).
3. No behavior regressions: routes, verbs and success payloads unchanged except where a problem required the change.
4. Only that file changed (plus a test file for it, when the fixer added one).
5. It type-checks / parses, and tests that cover the file pass.
