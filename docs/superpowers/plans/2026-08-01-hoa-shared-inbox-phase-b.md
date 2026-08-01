# HOA Shared Inbox Phase B — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A board member opens a resident's email, clicks **Draft a reply**, gets a cited draft in their HOA's own voice grounded in that property's record and the community's documents, edits it, approves it, and sends it from inside HomeownerHub with a 30-second undo.

**Architecture:** Four build steps over Phase A. First a Phase A defect fix (sync never captured the HOA's own sent mail, so threads are one-sided and there is no reply corpus). Then an embedding corpus over past replies. Then **W32 Reply Drafter**, a new workflow on the existing `defineWorkflow` framework that calls W1 and W30 for document and statute grounding rather than reimplementing retrieval. Finally the `inbox_drafts` lifecycle with a queued Gmail send.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase Postgres with RLS and pgvector, Inngest, `packages/mailbox` (zero deps), `packages/ai` (`defineWorkflow`, `embedTexts`, `toPgVector`), `packages/workflows` (W1, W30), vitest, tsx integration scripts against the live database.

**Spec:** `docs/superpowers/specs/2026-08-01-hoa-shared-inbox-phase-b-design.md`

## Global Constraints

- **Never log an email address, subject, or body.** Resident PII. Log `PostgrestError.message` and `.code`; **never `.details`**.
- **Supabase soft-fails.** A failed read returns `{ data: null, error }` **without throwing**. Every read checks `error`. An unchecked read is indistinguishable from "no rows". This was the single most recurring defect in Phase A — it needed the same fix in eight separate modules.
- **`packages/jobs` uses `createAdminClient()` and bypasses RLS entirely.** Explicit `.eq('organization_id', …)` is load-bearing there, not decoration.
- **`packages/mailbox` has `"dependencies": {}`.** Keep it that way. Node builtins only.
- **Never write a real client id, secret, or key into any file**, including `.env.example`.
- Org `a4906f16-baf3-4232-a2bd-a78ea432ad86` is **Madison Park, a live tenant**. Integration scripts must never touch a row they did not create. No unqualified DELETE or UPDATE.
- **PostgREST `on_conflict` accepts only a literal column list.** Expression indexes throw `42P10`. Use a `GENERATED ALWAYS AS (…) STORED` column instead.
- Migrations start at **0034**. Both new tables get `board_access` RLS (`FOR ALL` with a matching `WITH CHECK`).
- Embedding dimension is **768**, matching `EXPECTED_DIM` in `packages/ai/src/embeddings.ts`. The schema also contains `vector(1024)` columns from an earlier model swap — do not copy those.
- `UNDO_WINDOW_SECONDS = 30` exactly, as a single named constant.
- Mailbox management is **admin-only** (`requireAdmin`); the inbox is **board-or-admin** (`requireBoardOrAdmin`). Drafting and sending are board-or-admin.
- These four categories are **never written into a draft body**, only left as blanks: money commitments, enforcement outcomes, legal interpretation, other residents' information.
- Run commands with the `rtk` prefix per `CLAUDE.md`. Verify staged files with `/usr/bin/git`, and stage explicitly by path — never `git add -A`.

---

## File Structure

**Step 1 — Phase A amendment (sent mail)**

| File | Responsibility |
|---|---|
| `packages/mailbox/src/scope.ts` | Modify: `buildScopeQuery` emits `from:`; `isInScope` matches sender |
| `packages/mailbox/src/scope.test.ts` | Modify: sender cases |
| `packages/jobs/src/mailbox-backfill.ts` | Modify: re-backfill trigger for existing accounts |
| `apps/hoa/src/app/(dashboard)/inbox/[id]/MessageThread.tsx` | Already styles outbound; verify only |

**Step 2 — Reply corpus**

| File | Responsibility |
|---|---|
| `migrations/0034_inbox_reply_embeddings.sql` | Table, index, RLS |
| `packages/jobs/src/mailbox-reply-embeddings.ts` | Backfill + incremental embedding job |
| `apps/hoa/src/lib/inbox/draft/past-replies.ts` | `findSimilarReplies()` retrieval |

**Step 3 — Retrieval + W32**

| File | Responsibility |
|---|---|
| `apps/hoa/src/lib/inbox/draft/retrieve.ts` | `retrieveForThread()` — assembles all four sources |
| `packages/workflows/src/W32-reply-drafter/index.ts` | Schemas + `defineWorkflow` |
| `packages/workflows/src/W32-reply-drafter/prompt.ts` | System prompt, guardrail rules |
| `packages/workflows/src/W32-reply-drafter/tools.ts` | Citation validation |
| `packages/workflows/src/index.ts` | Modify: export W32 |
| `apps/hoa/src/app/(dashboard)/inbox/[id]/DraftPanel.tsx` | Draft UI, citations, blanks |

**Step 4 — Approval + send**

| File | Responsibility |
|---|---|
| `migrations/0035_inbox_drafts.sql` | Table, RLS |
| `apps/hoa/src/lib/inbox/draft/actions.ts` | `createDraft`, `approveDraft`, `cancelDraft` |
| `packages/mailbox/src/send.ts` | `sendReply()` — Gmail API, RFC 2822, threading |
| `packages/jobs/src/mailbox-send.ts` | Queued send with undo window |

---

## Step 1 — Phase A amendment: capture sent mail

### Task 1: Widen sync scope to include the HOA's own sent mail

**Why this is first:** verified in production — a real mailbox synced 153 inbound messages and **zero** outbound. Every thread in the product today shows one side of the conversation, and there is no reply corpus for Phase B to learn from.

**Files:**
- Modify: `packages/mailbox/src/scope.ts`
- Test: `packages/mailbox/src/scope.test.ts`

**Interfaces:**
- Consumes: nothing new
- Produces: `buildScopeQuery(scopeMode, scopeValue, afterDate?)` returning a query that matches sent mail; `isInScope(message, scopeMode, scopeValue)` returning true for messages the HOA sent

- [ ] **Step 1: Write the failing tests**

Add to `packages/mailbox/src/scope.test.ts`:

```ts
describe('buildScopeQuery — sent mail (Phase B D1)', () => {
  it('matches mail the HOA sent, not only mail it received', () => {
    const q = buildScopeQuery('address', 'hoa@example.com')
    expect(q).toContain('from:hoa@example.com')
    expect(q).toContain('to:hoa@example.com')
  })

  it('still rejects a malformed scope value rather than widening the fetch', () => {
    expect(() => buildScopeQuery('address', 'not an email')).toThrow()
  })
})

describe('isInScope — sent mail', () => {
  const base = {
    toEmails: ['resident@example.com'],
    ccEmails: [],
    deliveredTo: [],
    fromEmail: 'hoa@example.com',
  }

  it('accepts a message the HOA sent', () => {
    expect(isInScope(base as never, 'address', 'hoa@example.com')).toBe(true)
  })

  it('accepts a message the HOA received', () => {
    const inbound = { ...base, toEmails: ['hoa@example.com'], fromEmail: 'r@example.com' }
    expect(isInScope(inbound as never, 'address', 'hoa@example.com')).toBe(true)
  })

  it('still rejects an unrelated message', () => {
    const other = { ...base, fromEmail: 'spam@example.com' }
    expect(isInScope(other as never, 'address', 'hoa@example.com')).toBe(false)
  })

  it('fails closed when scopeValue is missing', () => {
    expect(isInScope(base as never, 'address', null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `rtk npx vitest run packages/mailbox/src/scope.test.ts`
Expected: FAIL — the two sent-mail cases fail because `from:` is absent and `isInScope` ignores the sender.

- [ ] **Step 3: Widen `buildScopeQuery`**

In `packages/mailbox/src/scope.ts`, replace the address-mode clause:

```ts
  if (scopeMode === 'address') {
    if (scopeValue) {
      if (!ADDRESS_RE.test(scopeValue)) {
        throw new Error(
          `buildScopeQuery: scopeValue "${scopeValue}" is not a valid single email address`,
        )
      }
      // `from:` added in Phase B (D1). Without it the HOA's own replies are
      // excluded by construction: a real mailbox synced 153 inbound messages
      // and zero outbound. That left every thread showing one side of the
      // conversation and gave the reply corpus nothing to learn from.
      clauses.push(
        `(to:${scopeValue} OR cc:${scopeValue} OR deliveredto:${scopeValue} OR from:${scopeValue})`,
      )
    }
  } else if (scopeMode === 'label') {
```

- [ ] **Step 4: Widen `isInScope`**

Replace the haystack construction:

```ts
  const needle = trimmed.toLowerCase()
  // Sender included per Phase B D1 — see buildScopeQuery. `fromEmail` may be
  // null on a malformed envelope, so it is filtered rather than coerced:
  // String(null) would produce "null" and could match a scopeValue of "null".
  const haystack = [
    ...message.toEmails,
    ...message.ccEmails,
    ...message.deliveredTo,
    ...(message.fromEmail ? [message.fromEmail] : []),
  ].map((e) => e.toLowerCase())

  return haystack.includes(needle)
```

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `rtk npx vitest run packages/mailbox/src/scope.test.ts`
Expected: PASS, including the pre-existing scope tests.

- [ ] **Step 6: Run the whole suite — this changes what every sync fetches**

Run: `rtk npx vitest run`
Expected: all files pass. If a sync test asserted an exact query string it will fail; update the expectation, do not weaken the assertion to a substring match.

- [ ] **Step 7: Commit**

```bash
rtk git add packages/mailbox/src/scope.ts packages/mailbox/src/scope.test.ts
rtk git commit -m "fix(mailbox): sync the HOA's own sent mail, not only received"
```

---

### Task 2: Re-backfill existing accounts so historical sent mail arrives

**Files:**
- Modify: `packages/jobs/src/mailbox-backfill.ts`
- Test: `scripts/test-reply-backfill.ts` (create)

**Interfaces:**
- Consumes: `buildScopeQuery` from Task 1
- Produces: nothing new; existing `mailbox/backfill.requested` event now also pulls sent mail

- [ ] **Step 1: Confirm no code change is needed in the job body**

Read `packages/jobs/src/mailbox-backfill.ts`. It calls `buildScopeQuery` to build its Gmail query, so Task 1 already widened what it fetches. Verify this by reading the call site; if the job builds its own query string inline instead, change it to call `buildScopeQuery` rather than duplicating the clause.

- [ ] **Step 2: Reset backfill state for existing accounts**

Create `migrations/0034a_reset_backfill_for_sent_mail.sql`:

```sql
-- Phase B D1: sync scope widened to include the HOA's own sent mail, so
-- every previously-completed backfill is now incomplete — it fetched only
-- received mail. Reset live accounts to 'pending' so the next connect or a
-- manual re-emit re-imports with the wider query.
--
-- Ingest is idempotent (unique on (mailbox_account_id, gmail_message_id)),
-- so re-running over already-synced inbound mail inserts nothing new.
--
-- Scoped to live accounts only: a disconnected account has no credentials
-- (Phase A hard-deletes the secrets row on disconnect) and could never run.
UPDATE public.mailbox_accounts
SET backfill_status = 'pending',
    backfill_progress = '{}'::jsonb
WHERE disconnected_at IS NULL
  AND backfill_status = 'done';
```

- [ ] **Step 3: Apply the migration**

Run it against the database using the same method Phase A used for migrations 0028–0033.
Expected: `UPDATE <n>` where n is the number of live, fully-backfilled accounts.

- [ ] **Step 4: Verify the widened query fetches sent mail**

Create `scripts/test-reply-backfill.ts`:

```ts
import './_load-env'
import { createClient } from '@supabase/supabase-js'
import { buildScopeQuery } from '../packages/mailbox/src/scope'

async function main() {
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let pass = 0
  let fail = 0
  const check = (label: string, ok: boolean, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
    ok ? pass++ : fail++
  }

  const q = buildScopeQuery('address', 'someone@example.com')
  check('A1 query includes from:', q.includes('from:someone@example.com'), q)
  check('A2 query still includes to:', q.includes('to:someone@example.com'))

  const accounts = await db
    .from('mailbox_accounts')
    .select('id, backfill_status')
    .is('disconnected_at', null)
  if (accounts.error) throw new Error(`${accounts.error.code} ${accounts.error.message}`)
  check(
    'A3 no live account left at backfill_status=done',
    (accounts.data ?? []).every((a) => a.backfill_status !== 'done'),
    `${accounts.data?.length ?? 0} live account(s)`,
  )

  const msgs = await db.from('inbox_messages').select('direction')
  if (msgs.error) throw new Error(`${msgs.error.code} ${msgs.error.message}`)
  const outbound = (msgs.data ?? []).filter((m) => m.direction === 'outbound').length
  console.log(`\noutbound messages currently stored: ${outbound}`)
  console.log('(0 is expected until a re-backfill actually runs)')

  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'}  ${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
```

- [ ] **Step 5: Run it**

Run: `rtk npx tsx scripts/test-reply-backfill.ts`
Expected: `ALL PASS  3 passed, 0 failed`

- [ ] **Step 6: Commit**

```bash
rtk git add migrations/0034a_reset_backfill_for_sent_mail.sql scripts/test-reply-backfill.ts packages/jobs/src/mailbox-backfill.ts
rtk git commit -m "feat(jobs): re-backfill live mailboxes now that sent mail is in scope"
```

---

### Task 3: Show both sides of the conversation in the thread view

**Files:**
- Modify: `apps/hoa/src/app/(dashboard)/inbox/[id]/MessageThread.tsx`
- Modify: `apps/hoa/src/lib/inbox/queries.ts` (`getThreadDetail`)

**Interfaces:**
- Consumes: `ThreadMessage` (existing, already has `direction`)
- Produces: no signature change

- [ ] **Step 1: Verify what the query already returns**

Read `getThreadDetail` in `apps/hoa/src/lib/inbox/queries.ts`. Confirm it selects `direction` and does **not** filter on it. If it filters to inbound only, remove that filter — outbound messages must appear.

- [ ] **Step 2: Add an explicit sender label for outbound messages**

In `MessageThread.tsx`, the outbound branch already applies `border-primary/40 bg-primary/5`. Add an unambiguous label so a manager can tell at a glance which messages are theirs:

```tsx
          <header className="mb-2 flex flex-wrap items-baseline gap-2 text-xs text-muted">
            <span className="font-semibold text-foreground">
              {message.fromName ?? message.fromEmail ?? 'Unknown'}
            </span>
            {message.direction === 'outbound' ? (
              // Phase B: threads are two-sided now that sent mail syncs.
              // Colour alone is not enough — a manager scanning a long
              // thread needs to know instantly which messages the HOA sent,
              // because the whole point is not replying twice.
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                Sent by HOA
              </span>
            ) : null}
            <span>→ {message.toEmails.join(', ') || '—'}</span>
            <span className="ml-auto">
              {message.sentAt ? new Date(message.sentAt).toLocaleString() : ''}
            </span>
          </header>
```

- [ ] **Step 3: Typecheck**

Run: `rtk pnpm typecheck`
Expected: `TypeScript: No errors found`

- [ ] **Step 4: Commit**

```bash
rtk git add "apps/hoa/src/app/(dashboard)/inbox/[id]/MessageThread.tsx" apps/hoa/src/lib/inbox/queries.ts
rtk git commit -m "feat(hoa): label outbound messages now that threads are two-sided"
```

---

## Step 2 — The reply corpus

### Task 4: `inbox_reply_embeddings` table

**Files:**
- Create: `migrations/0034_inbox_reply_embeddings.sql`

**Interfaces:**
- Produces: table `public.inbox_reply_embeddings`, unique on `message_id`

- [ ] **Step 1: Write the migration**

```sql
-- Phase B: embeddings over the HOA's own past replies, so drafts can be
-- grounded in how this association actually writes rather than in a generic
-- voice. One row per outbound message with a usable body.
--
-- vector(768) matches EXPECTED_DIM in packages/ai/src/embeddings.ts. The
-- schema also contains vector(1024) columns from an earlier model swap —
-- those are dead and must not be copied.
CREATE TABLE IF NOT EXISTS public.inbox_reply_embeddings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  message_id      uuid NOT NULL REFERENCES public.inbox_messages(id) ON DELETE CASCADE,
  embedding       vector(768) NOT NULL,
  -- Guards against re-paying for an embedding when a re-sync returns text
  -- that has not changed. Embedding calls cost money per token.
  text_sha256     text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- One embedding per message. Plain column, not an expression: PostgREST's
-- on_conflict accepts only a literal column list and throws 42P10 on an
-- expression index (learned twice in Phase A).
CREATE UNIQUE INDEX IF NOT EXISTS inbox_reply_embeddings_message_uniq
  ON public.inbox_reply_embeddings(message_id);

CREATE INDEX IF NOT EXISTS inbox_reply_embeddings_org_idx
  ON public.inbox_reply_embeddings(organization_id);

-- Vector index. ivfflat needs a populated table to build good lists, so it
-- is created here with a conservative list count and can be rebuilt later.
CREATE INDEX IF NOT EXISTS inbox_reply_embeddings_vec_idx
  ON public.inbox_reply_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

ALTER TABLE public.inbox_reply_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_access ON public.inbox_reply_embeddings;
CREATE POLICY board_access ON public.inbox_reply_embeddings
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));
```

- [ ] **Step 2: Apply it**

Apply against the database using the same method as Phase A's migrations.
Expected: `CREATE TABLE`, three `CREATE INDEX`, `ALTER TABLE`, `CREATE POLICY`.

- [ ] **Step 3: Verify the table and its RLS exist**

Run a read as the anon client and confirm it returns zero rows without error, and that a service-role read also returns zero rows. Both are expected on an empty table; the point is the table exists and the policy parses.

- [ ] **Step 4: Commit**

```bash
rtk git add migrations/0034_inbox_reply_embeddings.sql
rtk git commit -m "feat(db): inbox_reply_embeddings for grounding drafts in past replies"
```

---

### Task 5: Embedding job for past replies

**Files:**
- Create: `packages/jobs/src/mailbox-reply-embeddings.ts`
- Modify: `packages/jobs/src/index.ts`
- Modify: `apps/hoa/src/app/api/inngest/route.ts`

**Interfaces:**
- Consumes: `embedTexts`, `toPgVector` from `@homeowner-portal/ai`; `logDbError` from `./db-error`
- Produces: `mailboxReplyEmbeddingsJob` (Inngest function, cron `*/10 * * * *`)

- [ ] **Step 1: Write the job**

```ts
import { createHash } from 'node:crypto'
import { createAdminClient } from '@homeowner-portal/db'
import { embedTexts, toPgVector } from '@homeowner-portal/ai'
import { inngest } from './client'
import { logDbError } from './db-error'

/**
 * Embed the HOA's own past replies so W32 can ground a draft in how this
 * association actually writes.
 *
 * Only outbound messages with a usable body are embedded. `MIN_BODY_CHARS`
 * exists because a two-word reply ("Thanks!") teaches nothing about voice
 * and would crowd out substantive examples in a top-k retrieval.
 *
 * Batched, because embedding calls are paid per token and the first run
 * after a 12-month backfill could face thousands of messages.
 */
const BATCH_SIZE = 40
const MIN_BODY_CHARS = 40

function bodyFor(message: { stripped_text: string | null; body_text: string | null }): string {
  return (message.stripped_text ?? message.body_text ?? '').trim()
}

export const mailboxReplyEmbeddingsJob = inngest.createFunction(
  { id: 'mailbox-reply-embeddings', name: 'Mailbox Reply Embeddings' },
  { cron: '*/10 * * * *' },
  async ({ logger }) => {
    const db = createAdminClient()

    // Outbound messages that have no embedding row yet. The NOT EXISTS is
    // expressed as a left-join filter because PostgREST has no NOT EXISTS.
    const { data: candidates, error: candidatesError } = await db
      .from('inbox_messages')
      .select('id, organization_id, stripped_text, body_text, inbox_reply_embeddings(message_id)')
      .eq('direction', 'outbound')
      .is('inbox_reply_embeddings', null)
      .limit(BATCH_SIZE)

    if (candidatesError) {
      // A soft failure here is indistinguishable from "nothing to embed".
      // Throw so the run fails visibly rather than reporting { embedded: 0 }
      // forever while the corpus silently stays empty.
      logDbError('mailboxReplyEmbeddingsJob', 'inbox_messages', {}, candidatesError)
      throw new Error(
        `mailboxReplyEmbeddingsJob: failed to load candidates: ${candidatesError.message}`,
      )
    }

    const usable = (candidates ?? []).filter((m) => bodyFor(m).length >= MIN_BODY_CHARS)
    if (usable.length === 0) return { embedded: 0, skipped: (candidates ?? []).length }

    const texts = usable.map(bodyFor)

    let vectors: number[][]
    try {
      vectors = await embedTexts(texts)
    } catch (error) {
      // Embedding is an external paid API. Let the error fail the run so
      // Inngest retries — silently returning 0 would leave the corpus empty
      // and every draft generically voiced, with nothing to explain why.
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`[mailbox-reply-embeddings] embedding call failed: ${message}`)
      throw error
    }

    let embedded = 0
    for (const [i, message] of usable.entries()) {
      const vector = vectors[i]
      if (!vector) continue

      const { error: upsertError } = await db.from('inbox_reply_embeddings').upsert(
        {
          organization_id: message.organization_id,
          message_id: message.id,
          embedding: toPgVector(vector),
          text_sha256: createHash('sha256').update(texts[i]!).digest('hex'),
        },
        { onConflict: 'message_id' },
      )

      if (upsertError) {
        // Record and continue: one bad row must not cost the whole batch its
        // (already paid for) embeddings. The next run retries this message.
        logDbError(
          'mailboxReplyEmbeddingsJob',
          'inbox_reply_embeddings',
          { messageId: message.id },
          upsertError,
        )
        continue
      }
      embedded++
    }

    logger.info(`[mailbox-reply-embeddings] embedded ${embedded}/${usable.length}`)
    return { embedded, skipped: (candidates ?? []).length - usable.length }
  },
)
```

- [ ] **Step 2: Export it**

In `packages/jobs/src/index.ts`, add:

```ts
export { mailboxReplyEmbeddingsJob } from './mailbox-reply-embeddings'
```

In `apps/hoa/src/app/api/inngest/route.ts`, add `mailboxReplyEmbeddingsJob` to both the import list and the `functions: [...]` array.

- [ ] **Step 3: Typecheck**

Run: `rtk pnpm typecheck`
Expected: `TypeScript: No errors found`

- [ ] **Step 4: Verify the function registers**

Start the Inngest dev server against a running app and confirm **Mailbox Reply Embeddings** appears in the Functions list with cron `*/10 * * * *`.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/jobs/src/mailbox-reply-embeddings.ts packages/jobs/src/index.ts apps/hoa/src/app/api/inngest/route.ts
rtk git commit -m "feat(jobs): embed the HOA's past replies for draft grounding"
```

---

### Task 6: Similar-reply retrieval

**Files:**
- Create: `apps/hoa/src/lib/inbox/draft/past-replies.ts`
- Create: `migrations/0034b_search_reply_embeddings.sql`
- Test: `apps/hoa/src/lib/inbox/draft/past-replies.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface SimilarReply {
    messageId: string
    threadId: string
    body: string
    subject: string | null
    sentAt: string | null
    similarity: number
  }
  async function findSimilarReplies(
    db: SupabaseClient<Database>,
    orgId: string,
    queryText: string,
    excludeThreadId: string,
    limit?: number,
  ): Promise<{ replies: SimilarReply[]; degraded: string[] }>
  ```

- [ ] **Step 1: Write the search RPC**

`migrations/0034b_search_reply_embeddings.sql`:

```sql
-- Vector search over the HOA's past replies. A SQL function rather than a
-- PostgREST filter because pgvector's <=> operator is not expressible
-- through PostgREST's query grammar.
--
-- SECURITY INVOKER (the default) so the caller's RLS still applies: a board
-- member of org A must never retrieve org B's replies as a "similar" example.
-- p_org_id is additionally passed and filtered, because the jobs layer calls
-- with the service-role client where RLS does not apply.
CREATE OR REPLACE FUNCTION public.search_reply_embeddings(
  p_org_id            uuid,
  p_query_embedding   vector(768),
  p_exclude_thread_id uuid,
  p_limit             int DEFAULT 5
)
RETURNS TABLE (
  message_id uuid,
  thread_id  uuid,
  body       text,
  subject    text,
  sent_at    timestamptz,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.id,
    m.thread_id,
    COALESCE(m.stripped_text, m.body_text),
    t.subject,
    m.sent_at,
    1 - (e.embedding <=> p_query_embedding) AS similarity
  FROM public.inbox_reply_embeddings e
  JOIN public.inbox_messages m ON m.id = e.message_id
  JOIN public.inbox_threads  t ON t.id = m.thread_id
  WHERE e.organization_id = p_org_id
    AND m.thread_id IS DISTINCT FROM p_exclude_thread_id
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT LEAST(GREATEST(p_limit, 1), 20);
$$;
```

- [ ] **Step 2: Apply the migration**

Expected: `CREATE FUNCTION`.

- [ ] **Step 3: Write the failing test**

`apps/hoa/src/lib/inbox/draft/past-replies.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { findSimilarReplies } from './past-replies'

vi.mock('@homeowner-portal/ai', () => ({
  embedTexts: vi.fn(async () => [[0.1, 0.2, 0.3]]),
  toPgVector: (v: number[]) => `[${v.join(',')}]`,
}))

function dbReturning(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => result) } as never
}

describe('findSimilarReplies', () => {
  it('returns replies on success', async () => {
    const db = dbReturning({
      data: [
        {
          message_id: 'm1',
          thread_id: 't9',
          body: 'We received your request.',
          subject: 'Fence',
          sent_at: '2026-01-01T00:00:00Z',
          similarity: 0.82,
        },
      ],
      error: null,
    })
    const result = await findSimilarReplies(db, 'org-1', 'fence question', 't1')
    expect(result.replies).toHaveLength(1)
    expect(result.replies[0]!.messageId).toBe('m1')
    expect(result.degraded).toEqual([])
  })

  it('degrades rather than throwing when the search fails', async () => {
    const db = dbReturning({ data: null, error: { code: '08006', message: 'connection reset' } })
    const result = await findSimilarReplies(db, 'org-1', 'anything', 't1')
    expect(result.replies).toEqual([])
    expect(result.degraded).toContain('past_replies')
  })

  it('degrades rather than throwing when embedding fails', async () => {
    const { embedTexts } = await import('@homeowner-portal/ai')
    vi.mocked(embedTexts).mockRejectedValueOnce(new Error('HF down'))
    const db = dbReturning({ data: [], error: null })
    const result = await findSimilarReplies(db, 'org-1', 'anything', 't1')
    expect(result.replies).toEqual([])
    expect(result.degraded).toContain('past_replies')
  })
})
```

- [ ] **Step 4: Run and confirm failure**

Run: `rtk npx vitest run apps/hoa/src/lib/inbox/draft/past-replies.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { embedTexts, toPgVector } from '@homeowner-portal/ai'

export interface SimilarReply {
  messageId: string
  threadId: string
  body: string
  subject: string | null
  sentAt: string | null
  similarity: number
}

const DEFAULT_LIMIT = 5

/**
 * Retrieve the HOA's most similar past replies, as voice and precedent
 * examples for W32.
 *
 * Degrades rather than throws. Past replies improve a draft's voice but are
 * not required for correctness — governing documents and property data still
 * ground it. Returning `degraded: ['past_replies']` lets the caller tell the
 * reviewer the draft was written without precedent, which is honest, instead
 * of failing the whole draft over an optional source.
 */
export async function findSimilarReplies(
  db: SupabaseClient<Database>,
  orgId: string,
  queryText: string,
  excludeThreadId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<{ replies: SimilarReply[]; degraded: string[] }> {
  let embedding: number[] | undefined
  try {
    const [vector] = await embedTexts([queryText])
    embedding = vector
  } catch (error) {
    console.error(
      `findSimilarReplies: embedding failed: ${error instanceof Error ? error.message : String(error)}`,
    )
    return { replies: [], degraded: ['past_replies'] }
  }

  if (!embedding) return { replies: [], degraded: ['past_replies'] }

  const { data, error } = await db.rpc('search_reply_embeddings', {
    p_org_id: orgId,
    p_query_embedding: toPgVector(embedding),
    p_exclude_thread_id: excludeThreadId,
    p_limit: limit,
  })

  if (error) {
    // Never log .details — it can echo row contents, i.e. resident PII.
    console.error(
      `findSimilarReplies: search_reply_embeddings failed: ${error.code} ${error.message}`,
    )
    return { replies: [], degraded: ['past_replies'] }
  }

  const rows = (data ?? []) as Array<{
    message_id: string
    thread_id: string
    body: string | null
    subject: string | null
    sent_at: string | null
    similarity: number
  }>

  return {
    replies: rows
      .filter((r) => (r.body ?? '').trim().length > 0)
      .map((r) => ({
        messageId: r.message_id,
        threadId: r.thread_id,
        body: r.body!,
        subject: r.subject,
        sentAt: r.sent_at,
        similarity: r.similarity,
      })),
    degraded: [],
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `rtk npx vitest run apps/hoa/src/lib/inbox/draft/past-replies.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/hoa/src/lib/inbox/draft/past-replies.ts apps/hoa/src/lib/inbox/draft/past-replies.test.ts migrations/0034b_search_reply_embeddings.sql
rtk git commit -m "feat(hoa): retrieve similar past replies for draft grounding"
```

---

## Step 3 — Retrieval and the W32 Reply Drafter

### Task 7: `retrieveForThread` — assemble all four grounding sources

**Files:**
- Create: `apps/hoa/src/lib/inbox/draft/retrieve.ts`
- Test: `apps/hoa/src/lib/inbox/draft/retrieve.test.ts`

**Interfaces:**
- Consumes: `findSimilarReplies` (Task 6); `getPropertyContext`, `getThreadDetail` from `@/lib/inbox/queries`; `queryGoverningDocs` from `@homeowner-portal/workflows`; `askStateLaw` from `@homeowner-portal/workflows`
- Produces:
  ```ts
  interface RetrievedFragment {
    refId: string
    sourceType: 'document' | 'statute' | 'property' | 'past_reply'
    label: string
    text: string
  }
  interface ThreadRetrieval {
    threadSubject: string | null
    messages: Array<{ direction: 'inbound' | 'outbound'; from: string; sentAt: string | null; text: string }>
    latestInbound: string | null
    fragments: RetrievedFragment[]
    degraded: string[]
    hasProperty: boolean
  }
  async function retrieveForThread(db, orgId, threadId): Promise<ThreadRetrieval>
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest'
import { collectFragments, type SourceResults } from './retrieve'

describe('collectFragments', () => {
  const base: SourceResults = {
    docs: { citations: [{ chunkId: 'c1', label: 'CC&Rs §4.2', text: 'Fences may not exceed six feet.' }] },
    statutes: { citations: [] },
    property: null,
    pastReplies: [],
    degraded: [],
  }

  it('gives every fragment a refId that is unique across sources', () => {
    const withOverlap: SourceResults = {
      ...base,
      statutes: { citations: [{ chunkId: 'c1', label: 'O.C.G.A. §44-3-76', text: 'Statutory text.' }] },
    }
    const { fragments } = collectFragments(withOverlap)
    const ids = fragments.map((f) => f.refId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('carries degraded sources through rather than hiding them', () => {
    const { degraded } = collectFragments({ ...base, degraded: ['dues', 'past_replies'] })
    expect(degraded).toEqual(['dues', 'past_replies'])
  })

  it('produces no fragments when every source is empty', () => {
    const { fragments } = collectFragments({
      docs: { citations: [] },
      statutes: { citations: [] },
      property: null,
      pastReplies: [],
      degraded: [],
    })
    expect(fragments).toEqual([])
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `rtk npx vitest run apps/hoa/src/lib/inbox/draft/retrieve.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { queryGoverningDocs, askStateLaw } from '@homeowner-portal/workflows'
import { getThreadDetail, getPropertyContext } from '@/lib/inbox/queries'
import { findSimilarReplies } from './past-replies'

export interface RetrievedFragment {
  refId: string
  sourceType: 'document' | 'statute' | 'property' | 'past_reply'
  label: string
  text: string
}

export interface SourceResults {
  docs: { citations: Array<{ chunkId: string; label: string; text: string }> }
  statutes: { citations: Array<{ chunkId: string; label: string; text: string }> }
  property: { summary: string } | null
  pastReplies: Array<{ messageId: string; subject: string | null; body: string }>
  degraded: string[]
}

export interface ThreadRetrieval {
  threadSubject: string | null
  messages: Array<{
    direction: 'inbound' | 'outbound'
    from: string
    sentAt: string | null
    text: string
  }>
  latestInbound: string | null
  fragments: RetrievedFragment[]
  degraded: string[]
  hasProperty: boolean
}

/**
 * Flatten every source into one citable list.
 *
 * refIds are prefixed by source type because W1 and W30 both return chunk
 * ids from their own corpora and those id spaces can collide. A collision
 * would let a draft cite "c1" and have the validator match the wrong text —
 * a citation that looks verified but points somewhere else, which is worse
 * than no citation at all.
 *
 * Exported separately from retrieveForThread so it can be tested without a
 * database or four network calls.
 */
export function collectFragments(sources: SourceResults): {
  fragments: RetrievedFragment[]
  degraded: string[]
} {
  const fragments: RetrievedFragment[] = []

  for (const c of sources.docs.citations) {
    fragments.push({
      refId: `doc:${c.chunkId}`,
      sourceType: 'document',
      label: c.label,
      text: c.text,
    })
  }
  for (const c of sources.statutes.citations) {
    fragments.push({
      refId: `law:${c.chunkId}`,
      sourceType: 'statute',
      label: c.label,
      text: c.text,
    })
  }
  if (sources.property) {
    fragments.push({
      refId: 'prop:context',
      sourceType: 'property',
      label: 'Property record',
      text: sources.property.summary,
    })
  }
  for (const r of sources.pastReplies) {
    fragments.push({
      refId: `reply:${r.messageId}`,
      sourceType: 'past_reply',
      label: r.subject ? `Past reply — ${r.subject}` : 'Past reply',
      text: r.body,
    })
  }

  return { fragments, degraded: sources.degraded }
}

/**
 * Assemble everything W32 needs for one thread.
 *
 * Every source degrades independently. A draft written without past replies
 * is still useful; a draft written while the dues query silently returned
 * nothing is dangerous, because "no balance shown" reads as "nothing owed".
 * That is why `degraded` is propagated rather than swallowed — Phase A
 * designed this exact trap out of the property rail, and prose has the same
 * failure mode.
 */
export async function retrieveForThread(
  db: SupabaseClient<Database>,
  orgId: string,
  threadId: string,
): Promise<ThreadRetrieval> {
  const thread = await getThreadDetail(db, orgId, threadId)
  if (!thread) {
    throw new Error(`retrieveForThread: thread ${threadId} not found in org ${orgId}`)
  }

  const messages = thread.messages.map((m) => ({
    direction: m.direction,
    from: m.fromName ?? m.fromEmail ?? 'Unknown',
    sentAt: m.sentAt,
    text: m.strippedText ?? m.bodyText ?? '',
  }))

  const latestInbound =
    [...messages].reverse().find((m) => m.direction === 'inbound' && m.text.trim())?.text ?? null

  // Nothing to search on. Return early rather than embedding an empty
  // string and retrieving arbitrary nearest neighbours.
  if (!latestInbound) {
    return {
      threadSubject: thread.subject,
      messages,
      latestInbound: null,
      fragments: [],
      degraded: ['no_inbound_text'],
      hasProperty: Boolean(thread.unitId),
    }
  }

  const degraded: string[] = []

  const [docsResult, statutesResult, propertyResult, repliesResult] = await Promise.allSettled([
    queryGoverningDocs(latestInbound, { organizationId: orgId }),
    askStateLaw(latestInbound, { organizationId: orgId }),
    thread.unitId ? getPropertyContext(db, orgId, thread.unitId) : Promise.resolve(null),
    findSimilarReplies(db, orgId, latestInbound, threadId),
  ])

  const docs = { citations: [] as SourceResults['docs']['citations'] }
  if (docsResult.status === 'fulfilled') {
    docs.citations = (docsResult.value.citations ?? []).map((c: { chunkId: string; label?: string; text?: string }) => ({
      chunkId: c.chunkId,
      label: c.label ?? 'Governing document',
      text: c.text ?? '',
    }))
  } else {
    console.error(`retrieveForThread: governing docs failed: ${String(docsResult.reason)}`)
    degraded.push('governing_documents')
  }

  const statutes = { citations: [] as SourceResults['statutes']['citations'] }
  if (statutesResult.status === 'fulfilled') {
    statutes.citations = (statutesResult.value.citations ?? []).map((c: { chunkId: string; label?: string; text?: string }) => ({
      chunkId: c.chunkId,
      label: c.label ?? 'State law',
      text: c.text ?? '',
    }))
  } else {
    console.error(`retrieveForThread: state law failed: ${String(statutesResult.reason)}`)
    degraded.push('state_law')
  }

  let property: SourceResults['property'] = null
  if (propertyResult.status === 'fulfilled' && propertyResult.value) {
    const ctx = propertyResult.value
    // getPropertyContext reports its own partial failures. Those names go
    // straight through: the reviewer must be told which facts are missing.
    degraded.push(...(ctx.degraded ?? []))
    property = { summary: summarisePropertyContext(ctx) }
  } else if (propertyResult.status === 'rejected') {
    console.error(`retrieveForThread: property context failed: ${String(propertyResult.reason)}`)
    degraded.push('property_context')
  }

  let pastReplies: SourceResults['pastReplies'] = []
  if (repliesResult.status === 'fulfilled') {
    pastReplies = repliesResult.value.replies.map((r) => ({
      messageId: r.messageId,
      subject: r.subject,
      body: r.body,
    }))
    degraded.push(...repliesResult.value.degraded)
  } else {
    console.error(`retrieveForThread: past replies failed: ${String(repliesResult.reason)}`)
    degraded.push('past_replies')
  }

  const collected = collectFragments({ docs, statutes, property, pastReplies, degraded })

  return {
    threadSubject: thread.subject,
    messages,
    latestInbound,
    fragments: collected.fragments,
    degraded: collected.degraded,
    hasProperty: Boolean(thread.unitId),
  }
}

/**
 * Render the property record as text the model can quote from. Only fields
 * that actually loaded are included — an absent field must be absent, not
 * rendered as zero, or the draft will tell a resident they owe nothing.
 */
function summarisePropertyContext(ctx: {
  address?: string | null
  balanceCents?: number | null
  openViolations?: number | null
  openArcRequests?: number | null
  openTickets?: number | null
  degraded?: string[]
}): string {
  const missing = new Set(ctx.degraded ?? [])
  const lines: string[] = []
  if (ctx.address) lines.push(`Address: ${ctx.address}`)
  if (!missing.has('dues') && typeof ctx.balanceCents === 'number') {
    lines.push(`Outstanding balance: $${(ctx.balanceCents / 100).toFixed(2)}`)
  }
  if (!missing.has('violations') && typeof ctx.openViolations === 'number') {
    lines.push(`Open violations: ${ctx.openViolations}`)
  }
  if (!missing.has('arc') && typeof ctx.openArcRequests === 'number') {
    lines.push(`Open ARC requests: ${ctx.openArcRequests}`)
  }
  if (!missing.has('tickets') && typeof ctx.openTickets === 'number') {
    lines.push(`Open tickets: ${ctx.openTickets}`)
  }
  return lines.join('\n')
}
```

> **Implementer note:** the exact shapes returned by `queryGoverningDocs`, `askStateLaw`, and `getPropertyContext` must be read from source before writing this file. The mappings above assume `citations: Array<{ chunkId, label, text }>` and a `degraded: string[]` on the property context. If a real shape differs, adapt the mapping — do **not** cast it away with `as`.

- [ ] **Step 4: Run the tests**

Run: `rtk npx vitest run apps/hoa/src/lib/inbox/draft/retrieve.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Typecheck**

Run: `rtk pnpm typecheck`
Expected: `TypeScript: No errors found`

- [ ] **Step 6: Commit**

```bash
rtk git add apps/hoa/src/lib/inbox/draft/retrieve.ts apps/hoa/src/lib/inbox/draft/retrieve.test.ts
rtk git commit -m "feat(hoa): assemble grounding sources for reply drafting"
```

---

### Task 8: W32 citation validation

**Files:**
- Create: `packages/workflows/src/W32-reply-drafter/tools.ts`
- Test: `packages/workflows/src/W32-reply-drafter/tools.test.ts`

**Interfaces:**
- Produces:
  ```ts
  class InvalidCitationError extends Error { readonly invalidRefIds: string[] }
  function validateCitations(
    citations: Array<{ refId: string }>,
    retrievedRefIds: string[],
  ): void   // throws InvalidCitationError
  ```

- [ ] **Step 1: Write the failing test**

This is the most important test in Phase B. If it passes against a wrong implementation, the citation guarantee is theatre.

```ts
import { describe, it, expect } from 'vitest'
import { validateCitations, InvalidCitationError } from './tools'

describe('validateCitations', () => {
  const retrieved = ['doc:c1', 'law:s7', 'prop:context']

  it('accepts citations that were actually retrieved', () => {
    expect(() => validateCitations([{ refId: 'doc:c1' }, { refId: 'law:s7' }], retrieved)).not.toThrow()
  })

  it('REJECTS a refId that was never retrieved — the model invented it', () => {
    expect(() => validateCitations([{ refId: 'doc:c99' }], retrieved)).toThrow(InvalidCitationError)
  })

  it('rejects the whole draft when any one citation is invented', () => {
    expect(() =>
      validateCitations([{ refId: 'doc:c1' }, { refId: 'doc:c99' }], retrieved),
    ).toThrow(InvalidCitationError)
  })

  it('names every invalid refId so the failure is diagnosable', () => {
    try {
      validateCitations([{ refId: 'a' }, { refId: 'b' }], retrieved)
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidCitationError)
      expect((error as InvalidCitationError).invalidRefIds.sort()).toEqual(['a', 'b'])
    }
  })

  it('accepts an empty citation list — an acknowledgement-only draft cites nothing', () => {
    expect(() => validateCitations([], retrieved)).not.toThrow()
  })

  it('rejects any citation when nothing was retrieved', () => {
    expect(() => validateCitations([{ refId: 'doc:c1' }], [])).toThrow(InvalidCitationError)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `rtk npx vitest run packages/workflows/src/W32-reply-drafter/tools.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Thrown when a draft cites a source that was never retrieved.
 *
 * This is the strongest guarantee in Phase B and the reason it is a hard
 * throw rather than a warning: a fabricated citation is worse than no
 * citation, because it is specifically designed to survive review. A board
 * member who sees "CC&Rs §4.2" beside a sentence will believe the sentence.
 */
export class InvalidCitationError extends Error {
  constructor(public readonly invalidRefIds: string[]) {
    super(
      `Draft cited ${invalidRefIds.length} source(s) that were not retrieved: ${invalidRefIds.join(', ')}`,
    )
    this.name = 'InvalidCitationError'
  }
}

/**
 * Every cited refId must appear in what retrieval actually returned.
 *
 * An empty citation list is valid — an acknowledgement-only draft (spec D5)
 * asserts no facts and therefore cites nothing.
 */
export function validateCitations(
  citations: Array<{ refId: string }>,
  retrievedRefIds: string[],
): void {
  const known = new Set(retrievedRefIds)
  const invalid = citations.map((c) => c.refId).filter((refId) => !known.has(refId))
  if (invalid.length > 0) throw new InvalidCitationError(invalid)
}
```

- [ ] **Step 4: Run the tests**

Run: `rtk npx vitest run packages/workflows/src/W32-reply-drafter/tools.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
rtk git add packages/workflows/src/W32-reply-drafter/tools.ts packages/workflows/src/W32-reply-drafter/tools.test.ts
rtk git commit -m "feat(workflows): reject drafts that cite sources never retrieved"
```

---

### Task 9: W32 Reply Drafter workflow

**Files:**
- Create: `packages/workflows/src/W32-reply-drafter/prompt.ts`
- Create: `packages/workflows/src/W32-reply-drafter/index.ts`
- Create: `packages/workflows/src/W32-reply-drafter/README.md`
- Modify: `packages/workflows/src/index.ts`

**Interfaces:**
- Consumes: `defineWorkflow` from `@homeowner-portal/ai`; `validateCitations` (Task 8)
- Produces: `replyDrafter` workflow; `draftReply(input, ctx)` convenience wrapper; types `ReplyDrafterInput`, `ReplyDrafterOutput`

- [ ] **Step 1: Read W31 first**

Read `packages/workflows/src/W31-comm-composer/index.ts` and `prompt.ts` in full. W32 must match that file's structure, naming, and error handling. Do not invent a different shape.

- [ ] **Step 2: Write the prompt**

`prompt.ts`:

```ts
/**
 * W32 system prompt.
 *
 * The four prohibitions are spec D3. They exist because a human approves
 * every send, but confident drafted text gets approved with less scrutiny
 * than a blank page — so the dangerous content must never be drafted at all.
 */
export const REPLY_DRAFTER_SYSTEM = `You draft replies to residents on behalf of a homeowners association.

You are given: the conversation so far, numbered source fragments, and the
association's own past replies as examples of house voice.

RULES

1. Every factual claim must cite a fragment by its exact refId. If you cannot
   cite it, do not write it.
2. Never invent a refId. Only refIds present in the SOURCES section exist.
3. NEVER write any of the following. Emit a blank instead:
   - money: waiving or reducing a fee, payment plans, refunds, credits
   - enforcement: dismissing a violation, approving or denying an ARC
     request, granting an extension
   - legal: what a statute or the CC&Rs "require", who is liable, what
     happens if the resident does not comply. You MAY quote a document
     verbatim with a citation. You MAY NOT say what it means.
   - other_resident: naming or describing any other household
4. Match the voice of the past replies: their greeting, sign-off, sentence
   length and formality. Do not imitate their facts.
5. If no fragment is relevant to what the resident asked, write only a brief
   acknowledgement confirming receipt and committing to follow up, set
   grounded=false, and cite nothing.

OUTPUT
Return JSON only:
{
  "subject": string,
  "body": string,
  "citations": [{"refId": string, "quote": string, "label": string}],
  "blanks": [{"kind": "money"|"enforcement"|"legal"|"other_resident", "prompt": string}],
  "grounded": boolean,
  "groundingNote": string | null
}

Where a blank belongs in the body, write [[BLANK: <kind>]] on its own line.`

export function buildReplyDrafterUserPrompt(input: {
  threadSubject: string | null
  messages: Array<{ direction: string; from: string; text: string }>
  fragments: Array<{ refId: string; label: string; text: string }>
  degraded: string[]
}): string {
  const conversation = input.messages
    .map((m) => `[${m.direction === 'outbound' ? 'HOA' : 'RESIDENT'}] ${m.from}:\n${m.text}`)
    .join('\n\n---\n\n')

  const sources =
    input.fragments.length === 0
      ? '(none — no relevant source was found)'
      : input.fragments
          .map((f) => `refId: ${f.refId}\nlabel: ${f.label}\n${f.text}`)
          .join('\n\n---\n\n')

  // Naming what failed to load matters: without it the model treats an
  // absent balance as a zero balance and tells a resident they owe nothing.
  const missing =
    input.degraded.length > 0
      ? `\n\nUNAVAILABLE (do not assume a value for these; do not mention them):\n${input.degraded.join(', ')}`
      : ''

  return `SUBJECT: ${input.threadSubject ?? '(none)'}\n\nCONVERSATION:\n${conversation}\n\nSOURCES:\n${sources}${missing}`
}
```

- [ ] **Step 3: Write the workflow**

`index.ts`:

```ts
import { z } from 'zod'
import { defineWorkflow, runMain } from '@homeowner-portal/ai'
import { REPLY_DRAFTER_SYSTEM, buildReplyDrafterUserPrompt } from './prompt'
import { validateCitations, InvalidCitationError } from './tools'

export const ReplyDrafterInputSchema = z.object({
  threadSubject: z.string().nullable(),
  messages: z.array(
    z.object({
      direction: z.enum(['inbound', 'outbound']),
      from: z.string(),
      text: z.string(),
    }),
  ),
  fragments: z.array(
    z.object({
      refId: z.string(),
      sourceType: z.enum(['document', 'statute', 'property', 'past_reply']),
      label: z.string(),
      text: z.string(),
    }),
  ),
  degraded: z.array(z.string()),
})

export const ReplyDrafterOutputSchema = z.object({
  subject: z.string(),
  body: z.string(),
  citations: z.array(z.object({ refId: z.string(), quote: z.string(), label: z.string() })),
  blanks: z.array(
    z.object({
      kind: z.enum(['money', 'enforcement', 'legal', 'other_resident']),
      prompt: z.string(),
    }),
  ),
  grounded: z.boolean(),
  groundingNote: z.string().nullable(),
})

export type ReplyDrafterInput = z.infer<typeof ReplyDrafterInputSchema>
export type ReplyDrafterOutput = z.infer<typeof ReplyDrafterOutputSchema>

export const replyDrafter = defineWorkflow({
  id: 'W32',
  name: 'Reply Drafter',
  version: '1.0.0',
  promptVersion: '1.0.0',
  model: 'main',
  // Declared, not merely enforced in the UI. A draft is a proposal; only a
  // board member can send it.
  humanApprovalRequired: true,
  inputSchema: ReplyDrafterInputSchema,
  outputSchema: ReplyDrafterOutputSchema,

  async run(input, api) {
    const raw = await runMain({
      system: REPLY_DRAFTER_SYSTEM,
      user: buildReplyDrafterUserPrompt(input),
      json: true,
    })

    let parsed: unknown
    try {
      parsed = JSON.parse(raw.text)
    } catch {
      throw new Error('W32: model did not return JSON')
    }

    const output = ReplyDrafterOutputSchema.parse(parsed)

    // Hard gate. A fabricated citation fails the whole draft — see tools.ts.
    validateCitations(output.citations, input.fragments.map((f) => f.refId))

    api.addCitations(output.citations.map((c) => c.refId))
    api.setConfidence(output.grounded ? 0.8 : 0.2)
    if (raw.tokensIn != null && raw.tokensOut != null) {
      api.setTokens(raw.tokensIn, raw.tokensOut)
    }
    api.requireHumanApproval()

    return output
  },
})

/** Convenience wrapper matching queryGoverningDocs / askStateLaw. */
export async function draftReply(
  input: ReplyDrafterInput,
  ctx: { organizationId: string },
): Promise<ReplyDrafterOutput & { runId: string }> {
  const result = await replyDrafter.execute(input, { organizationId: ctx.organizationId })
  return { ...result.output, runId: result.runId }
}

export { InvalidCitationError }
```

> **Implementer note:** `runMain`'s exact signature and return shape must be read from `packages/ai/src/agents/main.ts` before writing this. The call above assumes `{ system, user, json }` in and `{ text, tokensIn, tokensOut }` out. Adapt to the real signature; do not cast.

- [ ] **Step 4: Export from the package**

In `packages/workflows/src/index.ts`, append:

```ts
// Phase B — Module 9 continued: shared-inbox reply drafting
export { replyDrafter, draftReply, InvalidCitationError } from './W32-reply-drafter'
export type { ReplyDrafterInput, ReplyDrafterOutput } from './W32-reply-drafter'
```

- [ ] **Step 5: Write the README**

`README.md`, matching W1's README structure: purpose, inputs, outputs, the four prohibitions and why they exist, and a note that citation validation is a hard failure.

- [ ] **Step 6: Typecheck and test**

Run: `rtk pnpm typecheck && rtk npx vitest run`
Expected: `TypeScript: No errors found`, all tests pass.

- [ ] **Step 7: Commit**

```bash
rtk git add packages/workflows/src/W32-reply-drafter packages/workflows/src/index.ts
rtk git commit -m "feat(workflows): W32 Reply Drafter — cited, guard-railed reply generation"
```

---

## Step 4 — Draft lifecycle and queued send

### Task 10: `inbox_drafts` table

**Files:**
- Create: `migrations/0035_inbox_drafts.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase B: one row per suggested reply, carrying its whole life from
-- generation through approval to send. The send queue lives in this table
-- (status + send_after) rather than a separate one, so a single row answers
-- "what were we told, and who approved it" when a resident asks later.
CREATE TABLE IF NOT EXISTS public.inbox_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  thread_id       uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,

  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','queued','sending','sent','cancelled','failed')),

  subject         text NOT NULL,
  body_text       text NOT NULL,
  citations       jsonb NOT NULL DEFAULT '[]'::jsonb,
  blanks          jsonb NOT NULL DEFAULT '[]'::jsonb,
  grounded        boolean NOT NULL DEFAULT false,
  grounding_note  text,

  ai_run_id       uuid,
  model           text,
  prompt_version  text,

  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  approved_by     uuid,
  approved_at     timestamptz,
  send_after      timestamptz,
  sent_at         timestamptz,
  gmail_message_id text,
  error           text
);

CREATE INDEX IF NOT EXISTS inbox_drafts_thread_idx
  ON public.inbox_drafts(thread_id, created_at DESC);

-- The send job's claim query: queued rows whose undo window has elapsed.
CREATE INDEX IF NOT EXISTS inbox_drafts_queued_idx
  ON public.inbox_drafts(status, send_after)
  WHERE status = 'queued';

ALTER TABLE public.inbox_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_access ON public.inbox_drafts;
CREATE POLICY board_access ON public.inbox_drafts
  FOR ALL
  USING       (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id))
  WITH CHECK  (organization_id = ANY (public.auth_org_ids())
               AND public.auth_is_board_or_admin(organization_id));
```

- [ ] **Step 2: Apply and verify**

Apply against the database. Confirm `CREATE TABLE`, two `CREATE INDEX`, `ALTER TABLE`, `CREATE POLICY`.

- [ ] **Step 3: Commit**

```bash
rtk git add migrations/0035_inbox_drafts.sql
rtk git commit -m "feat(db): inbox_drafts — draft lifecycle and send queue in one row"
```

---

### Task 11: Draft server actions

**Files:**
- Create: `apps/hoa/src/lib/inbox/draft/blanks.ts`
- Create: `apps/hoa/src/lib/inbox/draft/actions.ts`
- Test: `apps/hoa/src/lib/inbox/draft/blanks.test.ts`

**Why two files:** a `'use server'` module may export **only async functions**. Next.js errors at build time on a synchronous export or a plain constant. `hasUnfilledBlanks` and `UNDO_WINDOW_SECONDS` therefore live in `blanks.ts`, which has no `'use server'` directive — and that is also what lets the client component import `hasUnfilledBlanks` to disable the Approve button.

**Interfaces:**
- Consumes: `retrieveForThread` (Task 7), `draftReply` (Task 9)
- Produces from `blanks.ts`:
  ```ts
  export const UNDO_WINDOW_SECONDS = 30
  export function hasUnfilledBlanks(body: string): boolean
  ```
- Produces from `actions.ts`:
  ```ts
  async function createDraft(threadId: string): Promise<{ ok: true; draftId: string } | { error: string }>
  async function approveDraft(draftId: string, subject: string, body: string): Promise<{ ok: true; sendAfter: string } | { error: string }>
  async function cancelDraft(draftId: string): Promise<{ ok: true } | { error: string }>
  ```

- [ ] **Step 1: Write the failing test for the approval gate**

```ts
import { describe, it, expect } from 'vitest'
import { hasUnfilledBlanks, UNDO_WINDOW_SECONDS } from './blanks'

describe('hasUnfilledBlanks', () => {
  it('blocks approval while a blank marker remains in the body', () => {
    expect(hasUnfilledBlanks('We will review this.\n[[BLANK: money]]\nRegards,')).toBe(true)
  })

  it('allows approval once the marker is replaced', () => {
    expect(hasUnfilledBlanks('We will review this.\nNo fee will be charged.\nRegards,')).toBe(false)
  })

  it('detects a marker of any kind', () => {
    for (const kind of ['money', 'enforcement', 'legal', 'other_resident']) {
      expect(hasUnfilledBlanks(`x [[BLANK: ${kind}]] y`)).toBe(true)
    }
  })

  it('tolerates spacing variation rather than letting a marker through', () => {
    expect(hasUnfilledBlanks('x [[BLANK:money]] y')).toBe(true)
    expect(hasUnfilledBlanks('x [[ BLANK : money ]] y')).toBe(true)
  })
})

describe('UNDO_WINDOW_SECONDS', () => {
  it('is exactly 30', () => {
    expect(UNDO_WINDOW_SECONDS).toBe(30)
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `rtk npx vitest run apps/hoa/src/lib/inbox/draft/blanks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `blanks.ts`**

No `'use server'` directive — this module is imported by both the server actions and the client component.

```ts
/** Spec D6. One constant, referenced everywhere; never a literal. */
export const UNDO_WINDOW_SECONDS = 30

/**
 * True while any guardrail blank is still unfilled.
 *
 * Deliberately tolerant of spacing: the model writes these markers, and a
 * stricter regex that missed `[[ BLANK : money ]]` would let a draft through
 * with a placeholder where a fee decision belongs. Erring toward blocking is
 * the safe direction — the worst case is a human deleting a line.
 */
export function hasUnfilledBlanks(body: string): boolean {
  return /\[\[\s*BLANK\s*:\s*[a-z_]+\s*\]\]/i.test(body)
}
```

- [ ] **Step 4: Run the tests**

Run: `rtk npx vitest run apps/hoa/src/lib/inbox/draft/blanks.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Write `actions.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { inngest } from '@homeowner-portal/jobs'
import { draftReply } from '@homeowner-portal/workflows'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { retrieveForThread } from './retrieve'
import { UNDO_WINDOW_SECONDS, hasUnfilledBlanks } from './blanks'

export async function createDraft(
  threadId: string,
): Promise<{ ok: true; draftId: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  let retrieval
  try {
    retrieval = await retrieveForThread(supabase, org.id, threadId)
  } catch (error) {
    console.error(
      `createDraft: retrieval failed for thread ${threadId}: ${error instanceof Error ? error.message : String(error)}`,
    )
    return { error: 'Could not gather context for this thread. Nothing was drafted.' }
  }

  let generated
  try {
    generated = await draftReply(
      {
        threadSubject: retrieval.threadSubject,
        messages: retrieval.messages,
        fragments: retrieval.fragments,
        degraded: retrieval.degraded,
      },
      { organizationId: org.id },
    )
  } catch (error) {
    // A rejected draft is not persisted. Showing a partial draft that failed
    // citation validation would put invented references in front of a
    // reviewer, which is the exact failure the validator exists to prevent.
    const message = error instanceof Error ? error.message : String(error)
    console.error(`createDraft: generation failed for thread ${threadId}: ${message}`)
    return {
      error: message.startsWith('Draft cited')
        ? 'The draft cited sources that could not be verified, so it was discarded. Try again.'
        : 'Could not draft a reply right now.',
    }
  }

  const { data, error } = await supabase
    .from('inbox_drafts')
    .insert({
      organization_id: org.id,
      thread_id: threadId,
      status: 'draft',
      subject: generated.subject,
      body_text: generated.body,
      citations: generated.citations,
      blanks: generated.blanks,
      grounded: generated.grounded,
      grounding_note: generated.groundingNote,
      ai_run_id: generated.runId,
    })
    .select('id')
    .single()

  if (error) {
    console.error(`createDraft: insert failed: ${error.code} ${error.message}`)
    return { error: 'Could not save the draft.' }
  }

  revalidatePath(`/inbox/${threadId}`)
  return { ok: true, draftId: data.id }
}

export async function approveDraft(
  draftId: string,
  subject: string,
  body: string,
): Promise<{ ok: true; sendAfter: string } | { error: string }> {
  const { org } = await requireBoardOrAdmin()

  if (hasUnfilledBlanks(body)) {
    return { error: 'Fill in or remove every highlighted blank before sending.' }
  }
  if (!subject.trim() || !body.trim()) {
    return { error: 'A reply needs both a subject and a body.' }
  }

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const sendAfter = new Date(Date.now() + UNDO_WINDOW_SECONDS * 1000).toISOString()

  // Conditional: only a row still in 'draft' can be approved. Guards against
  // a double submit queueing the same reply twice.
  const { data, error } = await supabase
    .from('inbox_drafts')
    .update({
      status: 'queued',
      subject,
      body_text: body,
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
      send_after: sendAfter,
    })
    .eq('id', draftId)
    .eq('organization_id', org.id)
    .eq('status', 'draft')
    .select('id, thread_id')
    .maybeSingle()

  if (error) {
    console.error(`approveDraft: update failed: ${error.code} ${error.message}`)
    return { error: 'Could not queue the reply.' }
  }
  if (!data) {
    return { error: 'This draft is no longer awaiting approval.' }
  }

  try {
    await inngest.send({ name: 'mailbox/reply.queued', data: { draftId } })
  } catch (sendError) {
    // The row is already 'queued' but nothing will ever pick it up. Roll it
    // back to 'draft' so the reply is visibly un-sent rather than sitting in
    // a queue with no consumer — the failure mode Phase A hit when a lost
    // backfill event left an account 'pending' forever.
    console.error(
      `approveDraft: could not enqueue send for ${draftId}: ${sendError instanceof Error ? sendError.message : String(sendError)}`,
    )
    await supabase
      .from('inbox_drafts')
      .update({ status: 'draft', send_after: null, approved_at: null })
      .eq('id', draftId)
      .eq('organization_id', org.id)
      .eq('status', 'queued')
    return { error: 'Could not schedule the send. The draft is still here — try again.' }
  }

  revalidatePath(`/inbox/${data.thread_id}`)
  return { ok: true, sendAfter }
}

export async function cancelDraft(draftId: string): Promise<{ ok: true } | { error: string }> {
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  // Only a queued row can be cancelled. If the send job has already claimed
  // it ('sending'), this matches nothing and the user is told the truth
  // rather than shown a cancellation that did not happen.
  const { data, error } = await supabase
    .from('inbox_drafts')
    .update({ status: 'cancelled' })
    .eq('id', draftId)
    .eq('organization_id', org.id)
    .eq('status', 'queued')
    .select('id, thread_id')
    .maybeSingle()

  if (error) {
    console.error(`cancelDraft: update failed: ${error.code} ${error.message}`)
    return { error: 'Could not cancel the reply.' }
  }
  if (!data) {
    return { error: 'Too late — this reply has already been sent.' }
  }

  revalidatePath(`/inbox/${data.thread_id}`)
  return { ok: true }
}
```

- [ ] **Step 6: Typecheck — this is where a `'use server'` mistake surfaces**

Run: `rtk pnpm typecheck`
Expected: `TypeScript: No errors found`

If Next reports that a server module may only export async functions, something synchronous is still exported from `actions.ts`. Move it to `blanks.ts` rather than wrapping it in a pointless `async`.

- [ ] **Step 7: Commit**

```bash
rtk git add apps/hoa/src/lib/inbox/draft/actions.ts apps/hoa/src/lib/inbox/draft/blanks.ts apps/hoa/src/lib/inbox/draft/blanks.test.ts
rtk git commit -m "feat(hoa): draft create/approve/cancel with a 30s undo window"
```

---

### Task 12: Gmail send in `packages/mailbox`

**Files:**
- Create: `packages/mailbox/src/send.ts`
- Test: `packages/mailbox/src/send.test.ts`
- Modify: `packages/mailbox/src/index.ts`

**Interfaces:**
- Produces:
  ```ts
  function buildRawMessage(opts: {
    from: string; to: string[]; subject: string; body: string
    inReplyTo: string | null; references: string[]
  }): string   // base64url RFC 2822
  async function sendReply(accessToken: string, threadId: string, raw: string): Promise<{ messageId: string; threadId: string }>
  ```

**Constraint:** `packages/mailbox` has `"dependencies": {}`. Node builtins only — no MIME library.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { buildRawMessage } from './send'

function decode(raw: string): string {
  return Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

describe('buildRawMessage', () => {
  const base = {
    from: 'hoa@example.com',
    to: ['resident@example.com'],
    subject: 'Re: Fence',
    body: 'Thanks for writing.',
    inReplyTo: '<abc@mail.gmail.com>',
    references: ['<abc@mail.gmail.com>'],
  }

  it('threads the reply with In-Reply-To and References', () => {
    const decoded = decode(buildRawMessage(base))
    expect(decoded).toContain('In-Reply-To: <abc@mail.gmail.com>')
    expect(decoded).toContain('References: <abc@mail.gmail.com>')
  })

  it('omits threading headers on a first message rather than emitting empty ones', () => {
    const decoded = decode(buildRawMessage({ ...base, inReplyTo: null, references: [] }))
    expect(decoded).not.toContain('In-Reply-To:')
    expect(decoded).not.toContain('References:')
  })

  it('encodes a non-ASCII subject so it is not mangled', () => {
    const decoded = decode(buildRawMessage({ ...base, subject: 'Re: Grünanlage' }))
    expect(decoded).toContain('=?UTF-8?B?')
    expect(decoded).not.toContain('Subject: Re: Grünanlage')
  })

  it('is base64url — no +, / or = that would break the Gmail API', () => {
    const raw = buildRawMessage(base)
    expect(raw).not.toMatch(/[+/=]/)
  })

  it('rejects a header-injection attempt in the subject', () => {
    expect(() =>
      buildRawMessage({ ...base, subject: 'Hi\r\nBcc: attacker@evil.com' }),
    ).toThrow()
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `rtk npx vitest run packages/mailbox/src/send.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { MailboxAuthError } from './types'

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

/**
 * Encode a header value as RFC 2047 when it contains non-ASCII, so a subject
 * like "Grünanlage" is not mangled or silently dropped by a relay.
 */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

/**
 * Reject CR/LF in any header value.
 *
 * Without this, a crafted subject could inject `Bcc:` and silently copy an
 * outbound reply — containing a resident's balance or violation history — to
 * an arbitrary address. Subject text originates from a model and is then
 * editable by a human, so it is untrusted twice over.
 */
function assertNoHeaderInjection(field: string, value: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`buildRawMessage: ${field} must not contain CR or LF`)
  }
}

export function buildRawMessage(opts: {
  from: string
  to: string[]
  subject: string
  body: string
  inReplyTo: string | null
  references: string[]
}): string {
  assertNoHeaderInjection('subject', opts.subject)
  assertNoHeaderInjection('from', opts.from)
  for (const to of opts.to) assertNoHeaderInjection('to', to)
  if (opts.inReplyTo) assertNoHeaderInjection('inReplyTo', opts.inReplyTo)
  for (const ref of opts.references) assertNoHeaderInjection('references', ref)

  const headers = [
    `From: ${opts.from}`,
    `To: ${opts.to.join(', ')}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
  ]

  // Omitted entirely when absent — an empty `In-Reply-To:` header is invalid
  // and some relays reject the whole message.
  if (opts.inReplyTo) headers.push(`In-Reply-To: ${opts.inReplyTo}`)
  if (opts.references.length > 0) headers.push(`References: ${opts.references.join(' ')}`)

  const message = `${headers.join('\r\n')}\r\n\r\n${opts.body}`

  return Buffer.from(message, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Send via the Gmail API. `threadId` makes Gmail file the reply in the same
 * conversation on the HOA's side; In-Reply-To/References do the same on the
 * resident's side. Both are needed.
 *
 * Deliberately no retry: this call is not idempotent, and a retry after an
 * ambiguous failure risks sending a resident the same reply twice. The
 * caller records the failure and a human decides.
 */
export async function sendReply(
  accessToken: string,
  threadId: string,
  raw: string,
): Promise<{ messageId: string; threadId: string }> {
  const response = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw, threadId }),
  })

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

- [ ] **Step 4: Export**

In `packages/mailbox/src/index.ts`, add:

```ts
export { buildRawMessage, sendReply } from './send'
```

- [ ] **Step 5: Run the tests and confirm zero dependencies**

Run: `rtk npx vitest run packages/mailbox/src/send.test.ts`
Expected: PASS — 5 tests.

Run: `cat packages/mailbox/package.json`
Expected: `"dependencies": {}` unchanged.

- [ ] **Step 6: Commit**

```bash
rtk git add packages/mailbox/src/send.ts packages/mailbox/src/send.test.ts packages/mailbox/src/index.ts
rtk git commit -m "feat(mailbox): send threaded replies via the Gmail API"
```

---

### Task 13: Queued send job with the undo window

**Files:**
- Create: `packages/jobs/src/mailbox-send.ts`
- Modify: `packages/jobs/src/index.ts`, `apps/hoa/src/app/api/inngest/route.ts`

**Interfaces:**
- Consumes: `getAccessTokenFor` from `./mailbox-tokens`; `buildRawMessage`, `sendReply` from `@homeowner-portal/mailbox`
- Produces: `mailboxSendJob`, triggered by `mailbox/reply.queued`

- [ ] **Step 1: Write the job**

```ts
import { createAdminClient } from '@homeowner-portal/db'
import { buildRawMessage, sendReply, MailboxAuthError } from '@homeowner-portal/mailbox'
import { inngest } from './client'
import { getAccessTokenFor, markAuthFailed } from './mailbox-tokens'
import { logDbError } from './db-error'

/**
 * Send an approved reply once its undo window has elapsed.
 *
 * The claim is a CONDITIONAL update, not a read-then-decide. If a board
 * member pressed Undo while this function slept, the update matches zero
 * rows and the job stops. Reading the status and then updating would leave a
 * window in which a cancelled reply is still sent — and unlike the analogous
 * race the Phase A review found in applyMatch, this one cannot be repaired
 * afterwards, because the resident already has the email.
 */
export const mailboxSendJob = inngest.createFunction(
  { id: 'mailbox-send', name: 'Mailbox Send Reply' },
  { event: 'mailbox/reply.queued' },
  async ({ event, step, logger }) => {
    const draftId = event.data?.draftId as string | undefined
    if (!draftId) throw new Error('mailboxSendJob: event carried no draftId')

    const db = createAdminClient()

    const { data: draft, error: draftError } = await db
      .from('inbox_drafts')
      .select('id, organization_id, thread_id, subject, body_text, send_after, status')
      .eq('id', draftId)
      .maybeSingle()

    if (draftError) {
      logDbError('mailboxSendJob', 'inbox_drafts', { draftId }, draftError)
      throw new Error(`mailboxSendJob: failed to load draft: ${draftError.message}`)
    }
    if (!draft) throw new Error(`mailboxSendJob: draft ${draftId} not found`)
    if (draft.status !== 'queued') return { sent: false, reason: draft.status }

    if (draft.send_after) await step.sleepUntil('undo-window', new Date(draft.send_after))

    // Atomic claim. Zero rows means cancelled (or already claimed).
    const claimed = await step.run('claim', async () => {
      const { data, error } = await db
        .from('inbox_drafts')
        .update({ status: 'sending' })
        .eq('id', draftId)
        .eq('status', 'queued')
        .select('id')
        .maybeSingle()

      if (error) {
        logDbError('mailboxSendJob', 'inbox_drafts', { draftId }, error)
        throw new Error(`mailboxSendJob: claim failed: ${error.message}`)
      }
      return Boolean(data)
    })

    if (!claimed) {
      logger.info(`[mailbox-send] ${draftId} was cancelled before its window elapsed`)
      return { sent: false, reason: 'cancelled' }
    }

    const { data: thread, error: threadError } = await db
      .from('inbox_threads')
      .select('gmail_thread_id, mailbox_account_id')
      .eq('id', draft.thread_id)
      .maybeSingle()

    if (threadError || !thread) {
      await fail(db, draftId, threadError?.message ?? 'thread not found')
      throw new Error(`mailboxSendJob: could not load thread for ${draftId}`)
    }

    const { data: account, error: accountError } = await db
      .from('mailbox_accounts')
      .select('email_address, disconnected_at')
      .eq('id', thread.mailbox_account_id)
      .maybeSingle()

    if (accountError || !account) {
      await fail(db, draftId, accountError?.message ?? 'mailbox account not found')
      throw new Error(`mailboxSendJob: could not load account for ${draftId}`)
    }
    if (account.disconnected_at) {
      await fail(db, draftId, 'The mailbox was disconnected before this reply was sent.')
      return { sent: false, reason: 'disconnected' }
    }

    // Reply to the most recent inbound message so threading is correct.
    const { data: last, error: lastError } = await db
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
    if (!last?.from_email) {
      await fail(db, draftId, 'No inbound message to reply to.')
      return { sent: false, reason: 'no_recipient' }
    }

    try {
      const accessToken = await getAccessTokenFor(db, thread.mailbox_account_id)
      const raw = buildRawMessage({
        from: account.email_address,
        to: [last.from_email],
        subject: draft.subject,
        body: draft.body_text,
        inReplyTo: last.rfc822_message_id,
        references: last.rfc822_message_id ? [last.rfc822_message_id] : [],
      })
      const sent = await sendReply(accessToken, thread.gmail_thread_id, raw)

      const { error: sentError } = await db
        .from('inbox_drafts')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          gmail_message_id: sent.messageId,
          error: null,
        })
        .eq('id', draftId)

      if (sentError) {
        // The email IS sent. Never mark it failed here — a human would resend
        // and the resident would get it twice. Log loudly instead.
        logDbError('mailboxSendJob', 'inbox_drafts', { draftId }, sentError)
        logger.error(
          `[mailbox-send] ${draftId} SENT as ${sent.messageId} but the row could not be updated`,
        )
      }

      return { sent: true, messageId: sent.messageId }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await fail(db, draftId, message)
      if (error instanceof MailboxAuthError) {
        await markAuthFailed(db, thread.mailbox_account_id, message)
      }
      throw error
    }
  },
)

async function fail(
  db: ReturnType<typeof createAdminClient>,
  draftId: string,
  message: string,
): Promise<void> {
  const { error } = await db
    .from('inbox_drafts')
    .update({ status: 'failed', error: message })
    .eq('id', draftId)
  if (error) logDbError('mailboxSendJob', 'inbox_drafts', { draftId }, error)
}
```

> **Implementer note:** `inbox_messages` may not have an `rfc822_message_id` column — Phase A stored Gmail ids. Check `migrations/0029_inbox.sql`. If the RFC 2822 `Message-ID` header is not stored, add a migration for it and capture it in `parse.ts`, because threading on the resident's side depends on it.

**Decision — the sent reply is NOT written into `inbox_messages` here.** The spec left this open. Task 1 put the HOA's own sent mail in sync scope, so the next 2-minute sync ingests this reply through the ordinary path, with the ordinary dedupe. Writing it directly as well would mean two code paths creating the same message and a dedupe that has to be exactly right forever, to save at most two minutes of latency. The thread shows the reply on the next sync; the draft row shows `status='sent'` immediately, so the board is never left wondering whether it went.

- [ ] **Step 2: Register the function**

Export `mailboxSendJob` from `packages/jobs/src/index.ts` and add it to the `functions` array in `apps/hoa/src/app/api/inngest/route.ts`.

- [ ] **Step 3: Typecheck**

Run: `rtk pnpm typecheck`
Expected: `TypeScript: No errors found`

- [ ] **Step 4: Commit**

```bash
rtk git add packages/jobs/src/mailbox-send.ts packages/jobs/src/index.ts apps/hoa/src/app/api/inngest/route.ts
rtk git commit -m "feat(jobs): send approved replies after the undo window, cancel-safe"
```

---

### Task 14: Draft panel UI

**Files:**
- Create: `apps/hoa/src/app/(dashboard)/inbox/[id]/DraftPanel.tsx`
- Modify: `apps/hoa/src/app/(dashboard)/inbox/[id]/page.tsx`
- Modify: `apps/hoa/src/lib/inbox/queries.ts` — add `getLatestDraft(db, orgId, threadId)`

- [ ] **Step 1: Add the query**

In `queries.ts`, following the existing pattern including the error check:

```ts
export interface ThreadDraft {
  id: string
  status: 'draft' | 'queued' | 'sending' | 'sent' | 'cancelled' | 'failed'
  subject: string
  bodyText: string
  citations: Array<{ refId: string; quote: string; label: string }>
  blanks: Array<{ kind: string; prompt: string }>
  grounded: boolean
  groundingNote: string | null
  sendAfter: string | null
  error: string | null
}

export async function getLatestDraft(
  db: SupabaseClient<Database>,
  orgId: string,
  threadId: string,
): Promise<ThreadDraft | null> {
  const { data, error } = await db
    .from('inbox_drafts')
    .select('id, status, subject, body_text, citations, blanks, grounded, grounding_note, send_after, error')
    .eq('organization_id', orgId)
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    // Soft failure is indistinguishable from "no draft". Returning null would
    // show a Draft button beside a reply that is already queued to send.
    console.error(`getLatestDraft: ${error.code} ${error.message}`)
    throw new Error(`getLatestDraft failed: ${error.message}`)
  }
  if (!data) return null

  return {
    id: data.id,
    status: data.status as ThreadDraft['status'],
    subject: data.subject,
    bodyText: data.body_text,
    citations: (data.citations ?? []) as ThreadDraft['citations'],
    blanks: (data.blanks ?? []) as ThreadDraft['blanks'],
    grounded: data.grounded,
    groundingNote: data.grounding_note,
    sendAfter: data.send_after,
    error: data.error,
  }
}
```

- [ ] **Step 2: Build the panel**

`DraftPanel.tsx` — a client component. Requirements, all of which must hold:

1. No draft → a **Draft a reply** button calling `createDraft`.
2. `status === 'draft'` → editable subject and body, the citation list beneath (label plus quote, each tied to its `refId`), and blanks rendered as prominent amber callouts naming what the human must decide.
3. **Approve is `disabled` whenever `hasUnfilledBlanks(body)` is true.** This is the deterministic gate from the spec — it must be a real `disabled` attribute, not a validation message shown after clicking. It is computed from the **live edited body**, not from the stored `blanks` array, so filling a blank enables the button immediately and deleting the text back re-disables it:

```tsx
import { hasUnfilledBlanks } from '@/lib/inbox/draft/blanks'

const blocked = hasUnfilledBlanks(body)

<button
  type="button"
  disabled={blocked || pending}
  onClick={() => startTransition(() => approveDraft(draft.id, subject, body))}
  className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-fg disabled:opacity-50"
>
  Approve and send
</button>
{blocked ? (
  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
    Fill in or remove every highlighted blank before sending.
  </p>
) : null}
```

`approveDraft` re-checks the same condition server-side. The button is the affordance; the server action is the guarantee.
4. `grounded === false` → an amber banner carrying `groundingNote` verbatim: *no governing document or property record matched this question — this draft contains no facts.*
5. `status === 'queued'` → a countdown to `sendAfter` and an **Undo** button calling `cancelDraft`.
6. `status === 'sent'` → confirmation, no controls.
7. `status === 'failed'` → the `error` text and a **Try again** control that creates a fresh draft. Never an automatic retry.

Reuse the existing amber pair (`text-amber-700 dark:text-amber-400`) used elsewhere in the inbox — there is no `text-warning` token in the shared Tailwind config.

- [ ] **Step 3: Mount it**

In `inbox/[id]/page.tsx`, fetch `getLatestDraft` alongside the existing thread and property queries and render `<DraftPanel />` beneath `MessageThread`.

- [ ] **Step 4: Typecheck and build**

Run: `rtk pnpm typecheck`
Expected: `TypeScript: No errors found`

- [ ] **Step 5: Commit**

```bash
rtk git add "apps/hoa/src/app/(dashboard)/inbox/[id]/DraftPanel.tsx" "apps/hoa/src/app/(dashboard)/inbox/[id]/page.tsx" apps/hoa/src/lib/inbox/queries.ts
rtk git commit -m "feat(hoa): draft panel with citations, blanks gate and undo"
```

---

### Task 15: Integration test — RLS, cancel race, no double-send

**Files:**
- Create: `scripts/test-inbox-drafts.ts`

- [ ] **Step 1: Write the script**

Follow `scripts/test-inbox-rls.ts` exactly: create an isolated org, run checks, clean up everything created, never touch a pre-existing row. Checks required:

- **B1–B4 RLS.** A real authenticated board member of org A can read org A's drafts and reply embeddings, and cannot read org B's. Both directions, both tables. An anon client can read neither.
- **C1 Cancel race.** Insert a draft at `status='queued'`, run the cancel update, then run the send job's claim update. The claim must match **zero** rows.
- **C2 Claim-then-cancel.** Reverse order: claim first, then attempt cancel. Cancel must match zero rows, so the user is told the truth rather than shown a cancellation that did not occur.
- **C3 Approve is single-shot.** Two concurrent `status='draft' → 'queued'` updates: exactly one matches a row.
- **C4 Citation validation.** Call `validateCitations` with an unretrieved refId and assert it throws `InvalidCitationError`.
- **C5 Blanks gate.** `hasUnfilledBlanks` is true for each of the four blank kinds and for the spaced variant.

Print `PASS`/`FAIL` per check and exit non-zero on any failure, matching the Phase A scripts.

- [ ] **Step 2: Run it**

Run: `rtk npx tsx scripts/test-inbox-drafts.ts`
Expected: `ALL PASS` with every check listed, and a cleanup summary confirming nothing was left behind.

- [ ] **Step 3: Full verification sweep**

```bash
rtk npx vitest run
rtk pnpm typecheck
rtk pnpm build
```
Expected: all tests pass, `TypeScript: No errors found`, 4/4 apps build.

Stop any running `next dev` server first — a dev server writes the same `.next` directory the production build reads, and the build fails with a misleading `Cannot find module for page` error.

- [ ] **Step 4: Commit**

```bash
rtk git add scripts/test-inbox-drafts.ts
rtk git commit -m "test: RLS, cancel race and send-once guarantees for reply drafts"
```

---

## Verification checklist

Before the branch is considered done:

- [ ] `rtk npx vitest run` — all files pass
- [ ] `rtk pnpm typecheck` — 11/11 packages
- [ ] `rtk pnpm build` — 4/4 apps (no dev server running)
- [ ] `rtk npx tsx scripts/test-reply-backfill.ts` — ALL PASS
- [ ] `rtk npx tsx scripts/test-inbox-drafts.ts` — ALL PASS
- [ ] `rtk npx tsx scripts/test-inbox-rls.ts` — still ALL PASS (Phase A regression)
- [ ] Inngest dev server lists **Mailbox Reply Embeddings** and **Mailbox Send Reply**
- [ ] Manual: a real thread produces a cited draft, blanks block Approve, Undo cancels, and an approved reply arrives in Gmail threaded under the original

## Out of scope

Auto-send without approval; bulk drafting; multi-language replies; per-author voice; attachments on outbound replies.

