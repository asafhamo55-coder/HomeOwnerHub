# Sub-project F: the law-to-bylaw pipeline

**Date:** 2026-10-15
**Status:** Design. Decisions taken by the author, reasoning recorded inline. Phase 0 built 2026-10-15 (decision log §10).
**Builds on:** W30 State Law Brain and its approved ingestion design
(`docs/superpowers/specs/2026-08-18-state-law-ingestion-design.md`).
**Hands off to:** sub-project D (approval layer), designed in parallel. F
assumes only the contract in §6.

---

## 1. What exists today, with evidence

| Fact | Evidence |
|---|---|
| Statutes: one row per section, unique on `(state, code_citation)`, with `superseded_at`, public-read RLS, 768-d chunk embeddings | `migrations/0010_state_statutes.sql:16-28`, `:40-49`, `:73-80` |
| The updates feed was meant to be human-written only ("does NOT auto-generate … hallucinated legal claims") | `migrations/0011_state_law_updates.sql:9-11` |
| **The approved ingestion design is not implemented.** No `sources/` adapters exist (`W30-state-law-brain/` holds only `index.ts`, `prompt.ts`, `tools.ts`). The refresh job is still the "emit an audit row" version. Migration number `0051` went to `property_list_waiting_list`, and no migration adds `content_hash` | `packages/jobs/src/state-law-refresh.ts:4-27`, `:59-72`; `ls migrations/0051_*` |
| FL data in the repo is a 10-line starter fixture ("STARTER DATA — not comprehensive"). GA has 27 hand-written **paraphrased** sections | `data/statutes/fl.jsonl:1-2`; ingestion spec `:9-11` |
| Official verbatim sources exist for FL (flsenate.gov HTML) and CA (leginfo bulk zip), but not for TX or GA | ingestion spec `:22-27` |
| W30 answers with citations only to chunks it actually retrieved, and carries a fixed disclaimer | `packages/workflows/src/W30-state-law-brain/index.ts:50-51`, `:127-140` |
| Governing documents: `governing_documents` (types include `bylaws`, `declaration`, `amendment`), `parsed_text`, `superseded_at`. Chunks carry a `section` label and a 768-d embedding | `migrations/0004_v1_schema_phase2a.sql:133-152`, `:162-173`; `0005b_embedding_dim_swap.sql` |
| Statute chunks and governing-doc chunks therefore share one embedding space (both `vector(768)`, same model per ADR-003) | `0010_state_statutes.sql:38-46`; `0005b` |
| The chunker promotes `Article`/`Section`/`Rule` labels into `section` | `packages/workflows/src/W1-governing-docs-brain/chunker.ts:22-26` |
| Upload never sets `superseded_at`, so an amended base document and its amendment are **both** active | `apps/hoa/src/app/api/governing-docs/upload/route.ts` (no write to `superseded_at`); retrieval filters on it at `migrations/0021_search_rpc_loosen.sql:97` |
| Original files live in the `governing-docs` bucket, org-scoped since 0056; production holds 2 objects | `migrations/0056_governing_docs_org_scope.sql:3-5` |
| An association knows its law: `state` and `governing_law_state` | `0004_v1_schema_phase2a.sql:41`, `:46` |
| `defineWorkflow` already supports human-approval routing (`pending_human_approval`) and citation capture into `ai_runs` | `packages/ai/src/workflow.ts:85`, `:194-199`; `0004:189-217` |
| A tested quote-fidelity validator exists: every cited ref must have been retrieved, **and** its quote must occur in that ref's text. Both are hard throws | `packages/workflows/src/W32-reply-drafter/tools.ts:9-37`, `:66` |
| Cross-tenant features need attorney review, and cross-HOA comparison is permanently parked | `docs/parking-lot.md:66-68`, `:108-110` |

## 2. Decisions

1. **Phase 0 is the unbuilt ingestion design, not new work.** F needs
   `content_hash` to know *which* statute changed and verbatim text so it can
   quote the law. Neither exists yet. The 2026-08-18 design is approved as is;
   its migration gets renumbered to the next free number.
2. **Drafting needs verbatim law.** Conflict *detection* may run on GA's
   paraphrased text, labelled "based on a summary — verify against O.C.G.A.".
   Amendment *drafting* is refused for any statute whose source isn't official
   verbatim text (`source_name` from the ingestion design). Drafting against a
   paraphrase would quote words the legislature never wrote.
3. **The three questions are separated, each with its own output and gate:**
   *mapping* (which provisions touch which statutes) → *finding* (what is the
   relationship) → *draft* (proposed amendment language). Only drafts go to
   board approval. Findings are informational, like W30 answers.
4. **Retrieval narrows; the LLM judges; code verifies.** No LLM output is trusted
   for a citation or a quote. Each one passes the W32-style validator, or the
   whole run fails.
5. **One association at a time.** Every run is scoped to one
   `organization_id`/`association_id`, and `ai_runs.organization_id` is
   `NOT NULL` (`0004:191`). A statute change fans out as N independent
   per-association runs. Bylaws are never compared across HOAs, which stays
   clear of the line in `parking-lot.md:108-110`.
6. **Never adopted, never sent.** F has no code path that marks a governing
   document amended, supersedes one, or notifies residents. Adoption is a legal
   act by the membership. The farthest F reaches is a board-visible draft in
   D's queue.

## 3. Ingestion of statute changes

This reuses the ingestion design unchanged (adapters, weekly refresh, hash
diff, bill tracker). F adds one thing: when the refresh job writes a
`state_law.statute_updated` row (ingestion spec §3), it also emits Inngest event
`law/statute.changed {state, statute_id, old_hash, new_hash}`. A new citation
emits the same event with `old_hash: null`. A supersede emits
`law/statute.removed`. The bill tracker's draft updates (`status='draft'`) do
**not** trigger F: an enacted bill isn't law in the text until the official
source changes, and F only reasons over text it can quote.

## 4. Mapping statutes to governing documents

**Inputs:** the active chunks (`superseded_at IS NULL`) of the association's
`bylaws`, `declaration`, `rules`, `policy` and `amendment` documents, plus the
non-superseded `state_statutes` for `coalesce(governing_law_state, state)`.

**Candidate generation**, deterministic and cheap:

- **Topic bucket.** Each governing-doc chunk is tagged with the statute
  category vocabulary (governance, meetings, records, dues, enforcement, as
  established in ingestion spec `:99-103`). Tagging is one fast-model call
  per chunk, cached on `sha256(chunk.text)`, so it runs once per chunk text,
  not once per scan. (Unlike statute categories, these tags feed no content
  hash, so the instability concern in ingestion spec `:99-101` does not apply.)
- **Similarity.** Within a topic bucket, take the top-k (k=5) statute chunks
  per doc chunk by cosine over the shared 768-d space, plus FTS on the section
  title. FTS is the fallback when embeddings are absent, matching W30's
  behaviour (`tools.ts:33-43`).
- Pairs above a similarity floor become **candidate pairs**. Scale is about 300
  doc chunks × k=5, so roughly 1,500 pairs per association before judging. The
  judge is therefore batched per doc chunk (one call sees that chunk and its k
  statutes), giving about 300 calls per full scan.

## 5. Findings: conflicts and required amendments

One **judge** call per doc chunk returns, for each paired statute, a relation:

| Relation | Meaning | Default surfacing |
|---|---|---|
| `conflict` | The provision as written contradicts the statute | Shown, eligible for drafting |
| `missing_required` | The statute requires the documents to contain or adopt something they don't | Shown, eligible for drafting |
| `stricter_ok` | Stricter than the statute, where the statute permits that | Hidden by default |
| `consistent` / `unrelated` | Nothing to act on | Not stored |
| `needs_attorney` | The model can't determine the relation (preemption, ambiguity) | Shown, not draftable |

Each non-trivial relation must carry a verbatim `doc_quote` and a
`statute_quote`, each tied to a retrieved chunk id. Both go through
`validateCitations` (W32 `tools.ts:66`). A failure throws and the finding is
not written. A `conflict` is **not** taken to mean "must amend": in many cases
the statute already controls over a conflicting provision. So every finding
says "statute likely controls; amendment recommended for clarity" or "amendment
needed to act", and carries the W30 disclaimer verbatim.

**Storage**, in one new migration applied by the owner like all migrations
(`docs/NEXT.md:28-30`):

- `bylaw_statute_findings`: `organization_id`, `association_id`,
  `statute_id`, `statute_content_hash`, `document_id`, `chunk_ids uuid[]`,
  `doc_text_hash`, `relation`, `doc_quote`, `statute_quote`, `explanation`,
  `ai_run_id`, `status` (`open` | `dismissed` | `superseded`), `dismissed_by`.
- **Staleness is a key, not a timer.** A finding is current only while
  `statute_content_hash` and `doc_text_hash` both match live values. Either
  changing marks it `superseded` and queues a re-judge of that pair. This is
  the same `fetched_at`-vs-`last_checked_at` lesson as ingestion spec
  `:134-140`, applied from the start.
- RLS: board/admin of the org only, following `0036_ai_runs_board_only.sql`.
  Residents never see draft legal analysis.

**Amendment awareness (known limit).** Because a base document and its
amendments are both active (§1), a "conflict" in the base text may already be
cured. Phase 1 shows a banner on any association with `amendment`-type
documents and includes the amendment chunks in the judge's context. It does not
compute effective text. Building effective text is phase 4.

## 6. Draft amendment language, and the hand-off to D

A separate workflow, **`W35-bylaw-amendment-drafter`**, built on
`defineWorkflow` with `humanApprovalRequired: true` so every run lands as
`pending_human_approval` (`workflow.ts:194-199`). Input: one or more open
findings of relation `conflict`/`missing_required` against a verbatim-source
statute (decision 2). Output:

- `amendment_text`: replacement or insertion language, in the document's own
  Article/Section numbering (taken from chunk `section`)
- `redline`: old provision → new provision
- `rationale`: plain English, with every claim tied to a citation
- `citations[]`: `{refId, quote}` for both the statute and the bylaw. These are
  validated, and there is no draft without them
- `adoption_note`: a fixed template saying that adoption follows the procedure
  in the association's own documents and requires attorney review. F does not
  infer the vote threshold

Persisted as `bylaw_amendment_drafts` (`finding_ids[]`, `ai_run_id`, payload,
`status`).

**Contract F requires from D:** F calls `requestApproval({ orgId, kind:
'bylaw_amendment_draft', subjectId, approverRoles: ['board','admin'],
summary })`. D owns every transition after that (approve, edit, reject,
notify). "Approved" in D means **"accepted as a draft to take to counsel and the
membership"**, never "adopted". F reacts only to `rejected` (record feedback
into `ai_feedback`, `0004:227-236`) and `edited` (store the human version as
`human_edited_output` for evaluation). Until D ships, drafts sit in a
board-only list with a "Draft — not adopted" banner and no other action.

## 7. Evaluation

Following the W1 eval-harness shape (`W1-governing-docs-brain/eval.ts:1-15`,
`pnpm eval:w1`), there is a new `pnpm eval:f`:

- **Gold set, about 60 labelled pairs.** Start from the Creek Valley GA bylaws
  fixture (`scripts/fixtures/creek-valley-bylaws.md`, 258 lines) and a new
  synthetic FL bylaws fixture. Inject known defects: each relation class appears
  at least 8 times, including near-misses (stricter-but-allowed) built to tempt
  a false `conflict`. Labels are written by the owner, and by counsel before
  phase 2 exits.
- **Metrics and gates:**
  - Citation and quote fidelity: **100%**. This is mechanical. Any failure is a
    bug, and the validator makes it impossible to ship one silently.
  - `conflict` + `missing_required` **recall ≥ 0.90**, because a missed
    conflict is the costly error.
  - **Precision ≥ 0.70**, because false positives cost board and attorney time.
  - `stricter_ok` mislabelled as `conflict` ≤ 10%.
  - Drafts: rubric review (cites correctly, changes only the conflicting text,
    keeps the document's numbering) on the first 10 real drafts. A ≥ 70% "usable
    with edits" rating from an attorney gates phase 3.
- **What runs where:** the deterministic parts (candidate generation, staleness
  keys, validator wiring, RLS on both tables) are unit and integration tests in
  CI. The LLM eval runs on demand and is required before any prompt-version
  bump. Its results are stored per `prompt_version`, as `ai_runs` already
  records (`0004:193-194`).

## 8. Phased plan

| Phase | Scope | Exit criterion |
|---|---|---|
| **0: ingestion** | Implement ingestion-design phase 1 (FL adapter, `content_hash`/`source_name`/`last_checked_at` migration, real refresh job) and emit `law/statute.changed` | `pnpm ingest:state-law FL --from-source` loads Ch. 720 verbatim; a forced hash change emits the event |
| **1: read-only review** | Mapping + judge + `bylaw_statute_findings` + board-only findings page, with a **manual** "Run compliance review" button per association. GA (labelled paraphrase) and FL. No drafting, no automatic triggers | Gold-set gates met (fidelity 100%, recall ≥ 0.90, precision ≥ 0.70) |
| **2: drafting** | W35 drafter, `bylaw_amendment_drafts`, D hand-off (or the banner-only fallback). Verbatim-source statutes only | Attorney rubric ≥ 70% on 10 drafts |
| **3: change-driven** | `law/statute.changed` triggers per-association re-judging of affected pairs only. The board sees "law changed — N provisions affected" through D's board notification. Bill-tracker drafts appear as context, never as triggers | One real FL refresh cycle produces correct superseded/new findings |
| **4: breadth** | CA bulk adapter, effective-text computation over amendments, TX after its source spike | Separate plan |

## 9. Risks

- **Legal-advice exposure.** This is mitigated by the disclaimer on every
  surface, "statute likely controls" framing, attorney review before adoption,
  and no resident visibility. Counsel should review the finding and draft copy
  before phase 1 ships to a real association.
- **Thin real data.** Production holds 2 governing-doc objects (`0056:5`), so
  the gold set is mostly synthetic. Treat phase 1 metrics as a floor, not a
  promise.
- **Scale and cost.** About 300 judge calls per full scan. Full scans are
  manual or on document upload. Statute changes re-judge only the affected
  pairs. A per-org daily cap on judge calls lives in config.

## 10. Decision log: phase 0 build (2026-10-15, branch `claude/law-ingestion`)

Phase 0 is built. The entries below record each choice the build made
where the ingestion design was silent, wrong, or overtaken by events.

| # | Decision | Why |
|---|---|---|
| P0-1 | **FL only.** The registry (`W30-state-law-brain/sources/index.ts`, `SOURCE_STATES = ['FL']`) holds a Florida adapter. It has no GA, CA or TX entries, not even stubs. | §8 scopes phase 0 to FL. CA is phase 4. GA has no official fetchable text and stays on the curated JSONL path through `scripts/ingest-state-statutes.ts`. A state with no adapter is never refreshed, so it can never be read as "every section repealed". |
| P0-2 | **Edition year = current year, falling back to last year.** That is at most two requests per run. | Probed 2026-10-15: `…/2026/Chapter720/All` returns 200; `…/2027/…` returns a **302** to `/Laws/Statutes`. The getter never follows redirects, so "not published yet" can't turn into a 200 page with no statutes in it. |
| P0-3 | **Politeness.** `flsenate.gov/robots.txt` allows `/Laws/` and sets `Crawl-delay: 10`. The getter waits ≥10 s between requests to the same host and sends an identifying User-Agent. A run normally makes one request: the whole chapter comes back as one page. | The site's own published rules. Official statutes are public record, so verbatim copying is permitted (ingestion design, decision 1). |
| P0-4 | **Chapter 720 has 36 sections, not 72.** | The design counted `class="SectionNumber"` occurrences, and every number appears twice, once in the index and once in the body. The parser reads only `div.Section` bodies. History and Note blocks are excluded because they are annotations, not law. |
| P0-5 | **The hash covers the normalised body only.** Normalising means NFC, whitespace runs collapsed, one line per subsection, and blank-line separators. Wording and punctuation are never touched. The stored body *is* the normalised text, so `hash(stored body) == content_hash`. | Rendering noise (em spaces, NBSP, CRLF) must not fire `law/statute.changed`, but any change to the wording must. A change to the title, category, URL or edition only refreshes metadata silently. |
| P0-6 | **Change log table instead of the design's `platform_admin_audit` row.** 0062 adds `state_statute_changes(statute_id, kind, old_hash, new_hash, source_name, detected_at, event_sent_at)`. | `platform_admin_audit.actor_user_id` is `NOT NULL` (0019:83), so a system job can't write to it. That is also why the old refresh cron's `state_law.refresh_requested` inserts (hidden behind `as never`) **never landed**. A dedicated table also gives phase 3 the hash history it needs. |
| P0-7 | **The change log is an outbox.** The refresh job writes the statute row, then the change row, then the chunks. Its final step emits every row with `event_sent_at IS NULL` and then stamps them. The event `id` is `statute-change-<change id>`, so Inngest deduplicates a re-send. | Once a new hash is stored, a later run will never re-detect that change. Logging the change durably, right after the row write, means a run that dies before `sendEvent` still emits on the next run. The CLI (`--from-source`) writes the same change rows, and the next job run announces them. |
| P0-8 | **Event shapes.** `law/statute.changed {state, statute_id, code_citation, change_kind, old_hash, new_hash}`, where `old_hash` is null for `added` and also for `reinstated` (a citation superseded earlier that reappears at the source). `law/statute.removed {state, statute_id, code_citation, old_hash}`. | §3 plus `code_citation` (for logs) and `change_kind`. A reinstated section is new law to every consumer, since its old findings were superseded along with it. |
| P0-9 | **Safety rails against false repeal.** (a) The adapter throws if a page parses to fewer than 30 sections. (b) The planner refuses to supersede more than max(5, 25%) of the live covered rows in one pass. (c) Only citations the adapter `covers()` (`^Fla. Stat. § 720.\d+$`) can be superseded, so a Ch. 718 row is never retired by the Ch. 720 adapter. | A parser break or a maintenance page must fail the run, not repeal Florida law in the database. |
| P0-10 | **The listener is a phase-0 reach report.** `lawStatuteChangedJob` (`law-statute-changed`) consumes both events and only counts the associations governed by that state (`coalesce(governing_law_state, state)`). | The wiring contract requires every sent event to have a registered consumer. Phase 3 replaces the body with the per-association re-judge fan-out. There is no LLM call and no drafting (phase 0 constraint). |
| P0-11 | **On-demand refresh.** `POST /api/admin/refresh-state-law {state:'FL'}` now sends `law/refresh.requested`, which triggers the same job (`concurrency: 1`). The cron moved from monthly to weekly (Mon 03:00 ET). GET staleness now keys off `last_checked_at`. | Ingestion design §5. The old POST told the admin to run a Playwright scraper against a URL that returns 403. |
| P0-12 | **RLS.** `state_statutes` and `state_statute_chunks` keep 0010's `public_read` policy, which still includes `anon`: 0010 granted it on purpose for a public legal Q&A, and the law is public domain. The new change log is readable by `authenticated` only. Writes on all three tables are service-role only because no INSERT/UPDATE/DELETE policy exists. Table grants stay at the Supabase defaults. | The brief asked for "readable by authenticated, writes service-role only". Narrowing an existing read grant is a behaviour change outside phase 0. An earlier draft also REVOKEd write grants, but this schema's rule is that RLS is the lock and grants match production. `local-db-reset.ts` re-grants ALL after replay, so a REVOKE would have been untestable locally. The integration test proves that an admin JWT cannot insert or update any of the three tables. |
| P0-13 | **Every chunk carries the citation and title** (`Fla. Stat. § 720.303 — <title>`). Before, only the first chunk of each statute did. | Retrieval mitigation from ingestion design §6. Production retrieval is FTS-only until `HUGGINGFACE_API_TOKEN` is set in the job environment. |
| P0-14 | **Deferred.** The removals in ingestion design §7 (`scrape-state-law.ts`, `state-law-sources.ts`, the stealth devDependencies) are deferred, along with the bill tracker and draft gate (design phase 2, needs `OPENSTATES_API_KEY`). | These are independent of change detection, and removing dependencies would change the lockfile for no phase-0 benefit. The admin route no longer points anyone at the scraper. |
| P0-15 | **`data/statutes/fl.jsonl` is now the verbatim 2026 text.** It was written by `pnpm ingest:state-law FL --from-source` and replaces the 4-row starter excerpt. | The design's review artifact. It also makes the legacy (no-flag) path load real law instead of "SAMPLE EXCERPT" text. The legacy path now clears `content_hash`/`source_name` on write, so curated text is never mistaken for official text. |

**Exit criterion, as verified on the local stack:**

- `pnpm ingest:state-law FL --from-source` loaded 36 sections verbatim from `flsenate.gov … Ch. 720 (2026)`, and `search_state_statute_chunks('FL', 'official records inspection')` returns § 720.303.
- `tests/integration/flows/state-law-refresh.test.ts` changes the text of § 720.305 and asserts exactly one `law/statute.changed` event carrying the old and new hashes. It also covers removal, reinstatement, outbox recovery, chunk repair, the false-repeal guard and RLS, all against the recorded source page with no network.

## 11. Decision log: CA and TX adapters, "not loaded" guard (2026-10-20)

`/legal/ask` offers GA, FL, CA and TX, but only GA had statute text in the
database. This round adds official-source adapters for CA and TX and makes
every state-law answer surface refuse plainly while a state has no text.

| # | Decision | Why |
|---|---|---|
| P4-1 | **CA reads the Legislative Counsel's bulk zip by HTTP range, never the web pages.** `downloads.leginfo.legislature.ca.gov/pubinfo_<session year>.zip` (~1.2 GB, ZIP64, 205k entries). One run reads the 64 KB tail, the ~20 MB central directory, `LAW_SECTION_TBL.dat` + `LAW_TOC_TBL.dat` in one multipart request, then the Part 5 `.lob` bodies 50 ranges per request: about 8 requests, ~27 MB, **~26 s measured live on 2026-10-20** (234 sections). | `leginfo.legislature.ca.gov` still answers scripts with a Cloudflare 403 (rechecked 2026-10-20). The downloads host publishes no robots.txt (404) and supports `multipart/byteranges`. The fetch is one Inngest step and must fit the 60 s function limit, so the CA getter spaces requests by 1 s, not FL's 10 s crawl delay. |
| P4-2 | **CA scope = Civ. Code §§ 4000–6150, Division 4, Part 5, `active_flg = 'Y'`.** Title = the article heading from `LAW_TOC_TBL` (chapter heading when there is no article), e.g. "Board Meeting". `effective_date` = the row's effective date. Body = the `.lob` CAML, one line per `<p>`; the history column is never part of the body. Category = a static (chapter, article) map. Citation `Cal. Civ. Code § 5855`, link `leginfo…codes_displaySection.xhtml?lawCode=CIV&sectionNum=5855.` | California's code sections have no catchlines; the article heading is the official, deterministic label. Every rule in `CA_RULE_BASIS` was already verified against this same text (BL-054). |
| P4-3 | **CA safety rails.** Fewer than 200 sections → `SourceUnavailableError`. Every range response must carry the tail's ETag and size, else the run fails ("archive changed during the run"). A server that ignores Range (200) is refused before its body is read. Ranges are sent ascending and merged. Session-year fallback: this session's zip, then the previous one. | The archive is rebuilt weekly; offsets from one build are garbage in the next. A 200 would be a 1.2 GB download. Apache returns the whole file when ranges overlap or reverse too often. |
| P4-4 | **TX reads the Texas Legislative Council's file server.** `statutes.capitol.texas.gov` is an Angular app (every path, including the old `/Docs/PR/htm/PR.209.htm`, returns the JS shell). The app loads chapters from `https://tcss.legis.texas.gov/resources/PR/htm/PR.<ch>.htm`, plain server-rendered HTML (robots.txt 404). Two requests per run, 10 s apart. | Found from the app bundle's `FileServerPath`. This resolves the design's "Texas has no known source" (phase 4 spike). |
| P4-5 | **TX scope = Prop. Code ch. 209 (42 sections) and ch. 202 (19).** Both chapters or nothing (minimums 35 and 15). History ("Added by Acts…", "Amended by:" and its list) ends a section's body; "Text of subsection as amended by…" notes are kept, because they are the only thing telling two coexisting versions of a subsection apart (§ 209.0058). Catchlines are sentence-cased. Link: the official page's own anchor, `statutes.capitol.texas.gov/Docs/PR/htm/PR.209.htm#209.006`. | Ch. 202 holds the solar, flag, roofing and religious-display rules the TX sample questions on `/legal/ask` ask about. A missing chapter would read as the repeal of every section in it. |
| P4-6 | **User-Agent** is now `HomeownerHub-StateLawIngest/1.1 (weekly HOA statute refresh from official state sources; a few requests per run)` for all three states. | Identifies the caller without inventing a contact URL. |
| P4-7 | **"Not loaded" guard, three layers.** (1) W30 (`runStateLawBrain`): when retrieval is empty it counts live statutes; zero → the fixed `stateNotLoadedMessage(state)` with `stateLoaded: false`, no model call. A failed count throws; it is never reported as either answer. (2) `/legal/ask` shows "<State> state law isn't loaded yet" instead of the question box when the state has no live statutes (`lib/state-law-gate.ts`). (3) The resident assistant gets a `state_law` tool (W30, budget 1 per message) and a prompt rule never to answer state law from memory; when the tool reports `state_not_loaded`, `askResident` replaces the model's text with the fixed message and adds "Ask the board". | The prompt alone cannot stop a model answering from memory; the agent-level override can. The count only runs when retrieval is empty, so a loaded state pays nothing. |
| P4-8 | **No migration.** `state_statutes.state` and `state_statute_changes.state` already allow CA and TX (0010, 0062); 0062 is applied. | — |

Not changed: the board Copilot (`lib/community-qa`) has no state-law tool
and no "never from memory" rule for state law; the W32 inbox reply drafter
was out of scope for this round.

### Turning CA, TX (and FL) on in production

No migration. After this branch is deployed to production:

1. Sign in to the production app as the platform admin.
2. Open the browser's developer console on any app page and run, one line
   at a time:

   ```js
   fetch('/api/admin/refresh-state-law',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:'FL'})}).then(r=>r.json()).then(console.log)
   fetch('/api/admin/refresh-state-law',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:'CA'})}).then(r=>r.json()).then(console.log)
   fetch('/api/admin/refresh-state-law',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:'TX'})}).then(r=>r.json()).then(console.log)
   ```

   Each should print `{state: 'FL', queued: 'law/refresh.requested'}` (HTTP
   202). The job runs one state at a time (`concurrency: 1`). A POST with no
   body returns 400 `invalid_json`, which is why OA-9's old one-liner did
   nothing.
3. A few minutes later, check the counts:

   ```js
   for (const s of ['FL','CA','TX']) fetch('/api/admin/refresh-state-law?state='+s+'&limit=1').then(r=>r.json()).then(j=>console.log(s, j.total))
   ```

   Expected: FL 36, CA 234, TX 61 (the 2026-10-20 counts). In the Inngest
   dashboard, "State Law Weekly Refresh" shows each run as completed; a
   failed run names the state and the reason.
4. Optional, for better retrieval: set `HUGGINGFACE_API_TOKEN` in Vercel
   production; without it chunks are stored without embeddings and W30 uses
   full-text search only.

The weekly cron (Mondays 03:00 ET) does the same for all three states once
the Inngest app is synced, so step 2 only makes it happen now.
