# HOA Shared Inbox — Design

**Date:** 2026-07-31
**Status:** Approved design, pending implementation plan
**Planning note:** Too large for one plan — see §12. Phase A ships without any AI and is independently valuable.
**Scope:** Ingest the HOA mailbox into HomeownerHub, attach threads to properties, draft replies grounded in property data and the HOA's own reply history, and send from inside the system.

---

## 1. Problem

Resident email arrives in a Gmail mailbox that lives outside HomeownerHub. Nothing connects a message to the property it concerns, nobody can see a resident's dues balance or open ARC request while answering them, and every reply is written from scratch.

The comms module (`0018_communications.sql`) is outbound-first. `communication_replies` exists, but `apps/hoa/src/app/api/webhooks/resend/route.ts` only links a reply when it matches an outbound send — anything else is logged and dropped:

> "If we can't link it back, drop the reply rather than create an orphan."

So resident-initiated email has no path into the system at all.

## 2. Goals

1. Every email in the HOA mailbox appears in HomeownerHub.
2. Threads attach to a property automatically when the system is confident, and land in a triage queue when it isn't.
3. Suggested replies are grounded in that property's real data and cite their sources.
4. Suggested replies sound like this HOA, learned from its own reply history.
5. Replies send from inside the system, correctly threaded, with an audit trail.

## 3. Non-goals (v1)

- Smart Compose inline ghost-text completion — Phase 2, different runtime (see §7.4).
- Auto-send without human approval — every reply is approved by a person.
- Vendor/legal auto-classification of unmatched mail — the triage queue handles it.
- SMS, portal chat, or any non-email channel.
- Consolidating `units` and `hoa_properties` — see §5.1.

## 4. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Gmail API sync**, not Resend inbound or IMAP | Board keeps using Gmail; sent mail lands in the real Sent folder; highest fidelity |
| D2 | **Send via Gmail API, mirror a `communications` row** | Correct threading for the resident, full audit trail in HomeownerHub. Trade-off: no open/click tracking on replies |
| D3 | **Everything lands; unmatched goes to triage** | A real shared inbox. Each manual assignment becomes matcher training data |
| D4 | **Full context, mandatory citations, human always approves** | HOA replies carry legal and financial exposure |
| D5 | **Inbox is its own layer; links to records, never duplicates them** | Email threads don't fit ticket semantics; promotion stays one click away |
| D6 | **Inngest scheduled poll**, structured for a later push upgrade | Uses existing infra; the risk in this project is match and draft quality, not 90 seconds of latency |
| D7 | **Attachment bytes stored**, not metadata-only | Gmail-only storage means disconnecting the mailbox voids the record |
| D8 | **Property resolution layer now, consolidation later** | Ships the feature; contains existing debt behind one interface |
| D9 | **Deterministic matcher, no LLM in the matching path** | Auditable, free, reproducible |
| D10 | **Retrieval-grounded drafts from the HOA's own reply corpus** | Carries voice and institutional policy without hand-written prompts |
| D11 | **Three-pane inbox** with a permanent property rail | The visible property context is the reason to use this over Gmail |

### D6 note — why not Pub/Sub push

`users.watch()` must be re-registered every 7 days or sync silently dies. `syncMailbox(accountId)` is written as a pure function the cron calls today and a push webhook can call unchanged later, so upgrading is additive and the poll survives as a reconciliation net.

## 5. Architecture

### 5.1 Property resolution — existing debt, contained

`units` and `hoa_properties` both model a property. The app is split between them:

| | `hoa_properties` (0000) | `units` (0004) |
|---|---|---|
| Has | address, owner_name, **owner_email**, tenure | association_id, address_line1/2, city, state, unit_number, lot_number |
| Children | `property_residents` (resident emails), `property_events`, leases | — |
| Referenced by | violations, leases, dashboard, resident portal, community-qa tools | `assessments.unit_id`, `tickets.unit_id`, `arc_requests.unit_id`, `communication_threads.unit_id`, `communication_recipients.unit_id`, payment plans |
| Files | 18 | 17 |

The properties **list** page reads `hoa_properties`; the **detail** page reads both. They are bridged by `units.legacy_hoa_property_id`.

**The bridge is not trustworthy.** `migrations/backfill-units-legacy-property-bridge.sql` is hardcoded to one org and matches on exact string equality of address. Any new tenant gets `NULL`; any `"St"` vs `"St."` difference never bridges.

This matters directly: resident emails live in `property_residents` (under `hoa_properties`), while ticket/ARC/comms linking keys on `units`.

**Resolution:**

- `lib/properties.ts` → `lib/properties/` — existing content in `index.ts`, new `resolve.ts` as the only module the inbox may use:
  ```ts
  interface PropertyRef { unitId, legacyPropertyId, associationId, address, unitNumber }
  resolvePropertyByEmail(db, orgId, email) → PropertyMatch[]
  getPropertyRef(db, orgId, unitId)        → PropertyRef | null
  normalizeAddress(raw)                     → string
  ```
- `0028_property_bridge_backfill.sql` replaces the one-org script: normalized matching (case, whitespace, punctuation, and `St`/`Street`, `Ln`/`Lane`, `Ct`/`Court` suffix equivalence), all orgs, idempotent, reporting unbridged rows in both directions. `normalizeAddress` is the same logic in TS and SQL.

Full consolidation into one `properties` table remains the correct end state and is out of scope here — roughly 35 files plus FK repointing on accounting, tickets, ARC, communications, violations, and leases, against live tenant data.

### 5.2 Modules

**`packages/mailbox`** — Gmail transport. No Supabase, no Next.js, no HOA concepts.
- `oauth.ts` — consent URL, code exchange, refresh-token rotation
- `client.ts` — REST wrapper (`history.list`, `messages.list`, `messages.get`, `messages.send`, `threads.get`, `users.settings.sendAs`)
- `sync.ts` — `syncMailbox(account, cursor) → { messages, nextCursor }`
- `parse.ts` — MIME → `{ headers, text, html, attachments }`, plus quoted-reply stripping

The boundary is deliberate: the ugliest parts of this feature — history semantics, token refresh, MIME — sit behind an interface that fixture-tests exhaustively with no network and no database.

**`packages/jobs`** — three new Inngest functions:
- `mailboxSyncJob` — `*/2 * * * *`, concurrency-keyed per `mailbox_account_id`
- `mailboxBackfillJob` — event-triggered at connect, paginated, resumable
- `mailboxAttachmentFetchJob` — drains `fetch_status='pending'`

**`apps/hoa/src/lib/inbox/`** — `ingest.ts`, `match.ts`, `queries.ts`, `actions.ts`

**`packages/workflows/src/W32-inbox-reply/`** — the drafting agent (`index.ts`, `prompt.ts`, `tools.ts`, `eval.ts`), following the W31 and `community-qa` shape.

**`apps/hoa/src/app/onboarding/setup/`** — the setup checklist hub.

**`apps/hoa/src/app/(dashboard)/inbox/`** and **`settings/mailbox/`** — UI.

### 5.3 Data flow

```
Gmail ──cron 2m──▶ history.list ──▶ messages.get ──▶ parse
                                                       │
                                    ingest (dedupe) ──▶ match ──▶ inbox_threads
                                                                  inbox_messages
                                                                       │
                          manager opens thread, clicks "Suggest reply" │
                                                                       ▼
                                     W32: retrieve exemplars + property tools + docs RAG
                                                                       │
                                          draft + citations + chips    ▼
                                             manager edits ──▶ Send ──▶ gmail.messages.send
                                                                          (In-Reply-To, References, threadId)
                                                                       │
                                                                       ▼
                                                     mirror communications row (audit)
                                                     edited text ──▶ sent_edited exemplar
```

## 6. Data model

All tables use the existing `org_access` RLS pattern (`organization_id = ANY (public.auth_org_ids())`) unless noted.

### `mailbox_accounts`
```
id, organization_id, provider ('gmail'), email_address, google_sub, display_name
scope_mode ('address' | 'label' | 'all'), scope_value
sync_cursor, last_synced_at
sync_status ('ok'|'stalled'|'auth_failed'), sync_error
backfill_status ('pending'|'running'|'done'|'failed'), backfill_progress jsonb
connected_by, connected_at, disconnected_at
UNIQUE (organization_id, email_address) WHERE disconnected_at IS NULL
```

### `mailbox_account_secrets`
```
mailbox_account_id PK, refresh_token_enc, access_token_enc, token_expires_at, key_version
```
**RLS denies all** — service-role only. Tokens are AES-256-GCM under `MAILBOX_TOKEN_KEY`. Kept separate from `mailbox_accounts` so a mistake in an admin query cannot leak a refresh token granting standing access to an HOA's entire mailbox. `key_version` allows rotation without orphaning connections.

### `inbox_threads`
```
id, organization_id, mailbox_account_id, gmail_thread_id   -- UNIQUE per account
subject, participants jsonb
unit_id, resident_id
match_confidence ('high'|'medium'|'low'|'none')
match_reason jsonb          -- {rule:'resident_email', matched_on:'j.rivera@gmail.com'}
match_source ('auto'|'manual')
status ('needs_review'|'open'|'waiting'|'closed'), assigned_to
last_message_at, last_direction
```

### `inbox_messages`
```
id, organization_id, thread_id, mailbox_account_id, gmail_message_id
                                        -- UNIQUE per (mailbox_account_id, gmail_message_id),
                                        -- the dedupe key. Scoped per mailbox, not global —
                                        -- Gmail guarantees message-id uniqueness only within
                                        -- one mailbox, never across accounts.
rfc822_message_id, in_reply_to, references text[]
direction ('inbound'|'outbound')
from_email, from_name, to_emails[], cc_emails[]
subject, body_text, body_html, stripped_text
sent_at, ingested_at
communication_id            -- mirrored audit row, outbound only
```
`stripped_text` is the message with quoted history removed — what the AI reads, so a fifth reply doesn't feed the model four copies of the thread.

### `inbox_attachments`
```
id, organization_id, thread_id, message_id
storage_path                -- {org_id}/inbox/{thread_id}/{message_id}/{filename}
file_name, content_type, size_bytes, sha256
gmail_attachment_id, is_inline
fetch_status ('pending'|'stored'|'failed'|'skipped'), fetch_error
created_at
```
Mirrors `submission_attachments` (0027): private `hoa-documents` bucket, server-side signed URLs. RLS is board/admin only via `auth_is_board_or_admin(organization_id)` — residents have no access to the HOA inbox.

Three rules:
- **Download is a separate job from sync.** A 20 MB attachment must not stall the 2-minute loop, and a failed download must retry without re-walking Gmail history. `gmail_attachment_id` makes that possible.
- **Inline images under 100 KB are skipped.** Every corporate signature carries a logo as a real MIME attachment; ingesting a year of vendor mail otherwise stores ten thousand copies of a 4 KB GIF and buries the actual invoice. Inline images *above* the threshold are stored — that's usually a photo pasted into the body, which is evidence.
- **Failures are visible.** ≥25 MB or two failed downloads → `fetch_status='failed'`, rendered as "couldn't retrieve — open in Gmail" with a link.

### `inbox_sender_aliases`
```
id, organization_id, email_address, unit_id, resident_id
source ('manual'|'auto_confirmed'), created_by, created_at
UNIQUE (organization_id, email_address)
```
Every manual triage assignment writes a row. The next email from that address matches at high confidence permanently. This is the learning loop for matching — a lookup table, not model training.

### `inbox_thread_links`
```
id, organization_id, thread_id, resource_type, resource_id, created_by
UNIQUE (thread_id, resource_type, resource_id)
INDEX (resource_type, resource_id)   -- reverse lookup: does this ticket/ARC/violation
                                      -- already have a linked thread
```
Links a thread to a ticket / ARC request / violation without either owning the other (D5).

### `inbox_draft_suggestions`
```
id, organization_id, thread_id, in_reply_to_message_id
ai_run_id → ai_runs(id)
status ('suggested'|'accepted'|'edited'|'discarded'), acted_by, acted_at
```
Thin index only. `ai_runs` already carries `output`, `citations`, `confidence`, `model`, `tokens_*`, `latency_ms`, `status='pending_human_approval'`, `human_approved`, `human_approver`, and `human_edited_output` — the entire draft lifecycle. Duplicating the payload would create two places to look when a draft goes wrong.

### `inbox_reply_exemplars`
```
id, organization_id
inbound_message_id, outbound_message_id
inbound_text, outbound_text          -- REDACTED, see §7.2
category, embedding vector(768)
quality ('human_written'|'sent_edited')
created_at
INDEX USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
```
Plus RPC `search_reply_exemplars(org_id, query_embedding, k)`, mirroring `search_governing_chunks`.

`vector(768)` matches `0005b_embedding_dim_swap.sql` and the deployed `BAAI/bge-base-en-v1.5`. Note: the header comment in `packages/ai/src/embeddings.ts` still claims 1024-dim and is stale — fix it in passing, since a dimension mismatch fails at insert.

## 7. Behavior

### 7.1 Matching

Six signals, in order:

| # | Signal | Confidence |
|---|---|---|
| 1 | Thread continuity — `In-Reply-To`/`References` hits `inbox_messages` or `communication_recipients.external_id` | high |
| 2 | Remembered sender — `inbox_sender_aliases` hit | high |
| 3 | Known email — exact match on active `property_residents.email`, `hoa_properties.owner_email`, or linked `profiles.email`, resolving to exactly one property | high |
| 4 | Known email, multiple properties | medium |
| 5 | Address extracted from subject/body, normalized | medium |
| 6 | Sender name matches exactly one owner on file | low |

Routing: **high** → auto-attach, `status='open'`. **medium** → no attachment, pre-filled one-click suggestion, `status='needs_review'`. **low/none** → triage.

**No LLM in this path** (D9). Matching is a keyed lookup where the keys are available, and it must be auditable — `match_reason` has to state *"matched j.rivera@gmail.com to 214 Oak Ln via property_residents"* and mean it. A model here would cost money on every spam email and give different answers on reruns. The only exception is signal 5 as a fallback: if rules 1–4 miss and the message looks resident-authored, one structured-extraction call pulls a candidate address from prose. Regex handles the common case first.

Two limits: `From` is spoofable, so a match decides **filing, never authorization** — nothing in this system grants access from it. All queries are org-scoped.

### 7.2 Draft generation (W32)

`TASK_ROUTING` gains `draft_inbox_reply: 'main'` and `classify_inbox_message: 'fast'`.

**Tools** — read-only, through the user-bound Supabase client so RLS holds even on a hallucinated argument:
```
get_property_context(unitId)      address, owners, residents, tenure, lease
get_dues_status(unitId)           balance, aging, last payment, payment plan
get_open_violations(unitId)
get_arc_requests(unitId)
get_tickets(unitId)
get_thread_history(threadId)
get_prior_communications(unitId)
search_governing_docs(query)      W1 RAG
search_state_law(query)           W30
search_reply_exemplars(query)     the HOA's own past replies
```

**Output:**
```ts
{
  draft_body: string
  quick_replies: string[3]
  citations: [{ claim, source_type, source_id, label, href }]
  category: 'dues'|'arc'|'violation'|'maintenance'|'general'|'vendor'|'legal'
  confidence: number
  escalate: boolean
  escalate_reason?: string
}
```

**Guardrails, in increasing order of reliability:**

1. *The prompt forbids inventing figures.* Necessary, insufficient — a prompt is a request, not a constraint.
2. *Deterministic post-validation.* Every dollar amount and date in `draft_body` must appear verbatim in a tool result. Anything unaccounted for is stripped to a `[confirm]` placeholder and flagged. This is the guardrail that holds, because it doesn't depend on the model cooperating. It is the difference between "usually gets balances right" and "a wrong balance cannot reach a resident in writing."
3. *Escalation flag.* Legal threats, collections disputes, fair-housing or ADA language, hostile tone → `escalate: true`. The draft still generates; the UI banners it. It doesn't block, it makes sure you can't miss it.

**On-demand, not on ingest.** Drafting every inbound email means paying to draft spam, and a balance drafted at 3am is stale at 9. `ai_runs.input_hash` caches, so reopening a thread is free while changed data produces a fresh draft. Auto-prefetch for high-confidence threads stays a config flag.

### 7.3 Voice grounding

**Historical backfill at connect** imports the last 12 months of threads. Without it the corpus is empty and the first hundred replies are generic. Paginated, resumable, progress shown in the setup card ("Importing history… 1,240 of 3,800"), and it produces the real numbers in the connect preview.

**Retrieval at draft time:** embed the inbound `stripped_text`, kNN the top 5 exemplars, inject as few-shot examples. This carries **voice and institutional policy together** — if the board has always said pool keys are $25 at the clubhouse, that comes from the corpus rather than a prompt someone had to remember to write.

Two load-bearing constraints:

- **Exemplars are redacted before storage.** Without this, few-shot examples place one resident's private data in context while drafting to a different resident, and the likely failure is the model emitting Ms. Chen's balance in an email to Mr. Rivera. Exemplars teach structure and voice; every real figure comes from a tool call and is checked by the post-validator.

  Redaction is deterministic, not model-based, and runs in this order:
  1. **Known entities** — every resident name, owner name, and property address in the org (from `property_residents`, `hoa_properties`, `units`) is matched and replaced with `{{name}}` / `{{address}}`. This is the high-recall pass, because the org's own roster is the exact vocabulary at risk.
  2. **Patterns** — currency amounts → `{{amount}}`, dates → `{{date}}`, emails → `{{email}}`, phone numbers → `{{phone}}`, unit/lot numbers → `{{unit}}`.
  3. **Assertion** — the redacted text is re-scanned against the roster and patterns; any hit means redaction failed and the exemplar is **discarded rather than stored**. A missing exemplar costs nothing; a leaked one is unrecoverable.

  Redaction runs on both `inbound_text` and `outbound_text`, and is covered by a unit test (§11).
- **AI drafts sent unedited never become exemplars.** Only `human_written` (real Gmail history) and `sent_edited` (corrections) qualify. Feeding the model its own accepted output drifts the corpus toward whatever tic it had in month one, reinforced monthly. Corrections are the highest-value signal; uncorrected self-output is the lowest.

**Quick-reply chips** return in the same structured response as the draft — no extra call, no extra cost.

**Learning loop:** edit a draft → diff lands in `ai_runs.human_edited_output` → becomes a `sent_edited` exemplar → retrieved for the next similar email. Triage a sender → `inbox_sender_aliases` remembers. Nothing retrains; the corpus improves. Everything is org-scoped — one HOA's replies can never surface in another's drafts.

### 7.4 Smart Compose — Phase 2

Ghost-text inline completion, Tab to accept. Deferred not to cut scope but because it's a different runtime: `fast`-tier streaming on a ~300 ms debounce, cancel-on-keystroke, and a custom editor component — none of which shares code with request/response drafting. Built after v1, it inherits an already-tuned corpus.

## 8. Onboarding & configuration

Org creation stays as it is. It then lands on `/onboarding/setup` — a resumable checklist hub (mailbox, properties, board members), skippable, reappearing as a dashboard nudge until complete. The OAuth round-trip is the deciding factor: a checklist absorbs Google bouncing the user back as a simple re-render, where a linear wizard would need step-state restoration.

`settings/mailbox/` is the permanent management page, sharing the same components.

**Connect flow:**

1. **Not connected** — one "Continue with Google" button. No API keys, hosts, or ports.
2. **Scope selection** — after OAuth, read `users.settings.sendAs` and pre-select a default:
   - *Mail sent to `board@…`* — recommended when a shared address is detected
   - *Only mail labeled `HOA`*
   - *Everything in this inbox* — for a dedicated account

   This exists because HOA "mailboxes" in the wild are a Workspace account, a Google Group fanning out to personal inboxes, **or the president's personal Gmail**. Syncing everything from a personal account pulls medical and financial mail into a shared board tool. Detect-and-recommend makes the safe choice the default rather than relying on user vigilance.

   **Enforcement is in the sync engine, not merely stored.** `syncMailbox` applies the scope before any message is persisted:
   - `scope_mode='address'` → message is kept only if `scope_value` appears in `To`, `Cc`, or `Delivered-To`
   - `scope_mode='label'` → Gmail query is constrained by `labelIds`, so out-of-scope mail is never fetched
   - `scope_mode='all'` → no filter

   Out-of-scope messages are discarded in `packages/mailbox` before reaching `ingest.ts` — they are never written and then filtered.
3. **Connected, self-verifying** — counts for the last 30 days (emails / matched / needs review) plus a sample of actual matches with the property each resolved to. This is how a bad matcher gets caught before it misfiles sixty emails, and it's the moment the tenant believes the product.

## 9. UI

**Three-pane** (`/inbox`): thread list · conversation · property rail. Collapses to two-pane below ~1280px.

The property rail is the reason to work here instead of Gmail — dues balance and aging, open ARC requests, open violations, last communication sent, plus *"Create ticket from this"*, *"Link to ARC #218"*, *"Open property"*. Context that is hidden stops being checked, which is exactly when a wrong AI figure slips through.

The draft renders inside the conversation pane with **inline citation underlines and a footnote row** (`communications · Gate code rotation · Jul 26`, `arc_requests #218`), Send / Edit / Regenerate, and quick-reply chips. Every factual claim is clickable to its source.

Thread list filters: Needs review · Open · Waiting · All, with property attribution and match confidence visible per row.

## 10. Failure modes

| Failure | Detection | Response |
|---|---|---|
| **Sync stops silently** | `last_synced_at` watchdog > 30 min | `sync_status='stalled'`, inbox banner, included in `dailyDigestJob` |
| Credentials revoked | `invalid_grant` | `auth_failed`, **stop retrying**, email org admin with reconnect link |
| `historyId` expired (404) | Gmail 404 | Date-ranged `messages.list` re-sync; unique `(mailbox_account_id, gmail_message_id)` + upsert makes it a no-op for existing rows |
| Overlapping syncs | — | Inngest concurrency key per `mailbox_account_id` |
| Rate limits | 429 | Exponential backoff with jitter via `packages/ai/src/resilience.ts` |
| Send fails | Gmail error | Never optimistically write the outbound row; draft preserved exactly as typed, with retry |
| Broken threading | — | `In-Reply-To`, `References`, `threadId` all set; explicitly tested |
| AI unavailable | — | Reading, triage, and manual reply keep working; suggest button disables with a stated reason |
| Validator strips draft | — | Shown with placeholders and flagged, never hidden and never confidently wrong |
| Wrong match | — | High-confidence-only auto-attach; match reason always visible; one-click reassign writes `inbox_sender_aliases` + `property_events` |
| Key rotation | — | `key_version` beside ciphertext |
| Two managers on a thread | — | Passive "Dana opened this 2 minutes ago". Real locking is over-engineering for a board of five |

The stalled-sync row is the one that matters most: every other failure is survivable, but a board believing email is flowing while residents go unanswered destroys trust in the product.

## 11. Testing

**Add vitest scoped to `packages/mailbox` only** — a contained addition, not a repo-wide testing change. MIME parsing and quote-stripping are pure functions with a long tail of ugly real-world inputs, and testing them through a Postgres round-trip would be slow enough that nobody runs them.

| Layer | What | How |
|---|---|---|
| Unit | MIME parse; quote-strip across Gmail/Outlook/Apple Mail; encodings; inline images | vitest + fixture corpus |
| Unit | Matcher — table-driven over all 6 signals and confidence routing | vitest |
| Unit | **Post-validator** — unsupported figures stripped | vitest |
| Unit | **Exemplar redaction** — no name, address, or amount survives | vitest |
| Integration | `syncMailbox` idempotency (run twice → identical rows); history-404 fallback | `scripts/test-mailbox-sync.ts` |
| Integration | Send: headers correct, `communications` mirror written, failure preserves draft | `scripts/test-inbox-send.ts` |
| Security | Cross-org isolation on every new table; `mailbox_account_secrets` unreachable from a user session | `scripts/test-inbox-rls.ts` |
| Eval | Draft quality: factual accuracy, citation correctness, tone, **zero PII leakage** | `scripts/eval-w32.ts`, pass-rate gated like `eval-w1.ts` |
| E2E | Mocked OAuth → ingest → open thread → suggest → send | Playwright |

Integration scripts follow the `scripts/test-comms.ts` pattern (real Postgres, tagged fixtures, cleanup). The eval follows `eval-w1.ts` with `EVAL_REQUIRE_GATE` so prompt changes can't silently regress quality.

## 12. Build sequence

This is too large for a single implementation plan. It splits at a natural line: **Phase A delivers value with no AI in it at all**, and is worth shipping on its own.

### Phase A — Mail lands, attached to properties

The board reads HOA mail inside HomeownerHub, attached to the right property, with dues/ARC/violation context visible. Replies still happen in Gmail. Independently shippable.

1. **Foundation** — `0028_property_bridge_backfill.sql`, `lib/properties/resolve.ts`, inbox migrations
2. **Transport** — `packages/mailbox` + vitest fixtures (no DB, no UI)
3. **Ingest** — `mailboxSyncJob`, `ingest.ts`, dedupe, idempotency tests
4. **Matching** — six signals, `inbox_sender_aliases`, triage queue
5. **Backfill** — `mailboxBackfillJob`, paginated and resumable
6. **Onboarding** — setup checklist, OAuth, scope selection, connect preview
7. **Inbox UI** — three-pane, thread view, property rail
8. **Attachments** — fetch job, storage, inline-image skip

Ordering constraint: the connect preview in step 6 reports *"62 emails, 48 matched, 14 need review"*, so it needs both the matcher (4) and backfill (5) to exist. Building onboarding earlier means shipping a preview that can't populate.

### Phase B — AI drafting and reply

9. **Exemplars** — extraction, redaction, embeddings, `search_reply_exemplars`
10. **W32 agent** — tools, post-validator, citations, quick replies, eval gate
11. **Send** — Gmail send, threading, `communications` mirror, edit→exemplar loop

Step 10 depends on 4 (property context) and 9 (corpus).

### Phase C

12. **Smart Compose** — §7.4

Each phase gets its own implementation plan.

## 13. Open items for the plan

- Google Cloud project + OAuth consent screen verification. Requesting `gmail.readonly` + `gmail.send` on a multi-tenant app means Google's restricted-scope review, which has a lead time and a security-assessment cost. **This should start early — it can gate launch independently of the code.**
- Backfill window (12 months assumed) and per-tenant storage ceiling.
- Attachment retention policy — deferred in v1, but email attachments are the fastest-growing table in a system like this.
