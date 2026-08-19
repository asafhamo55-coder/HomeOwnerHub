# State Law Brain — automated ingestion & change detection

**Date:** 2026-08-18
**Module:** W30 (State Law Brain), Module 8
**Status:** Approved design, not yet implemented

## Problem

The State Law Brain covers one state. Georgia holds 27 hand-curated,
paraphrased sections; Florida, California and Texas are empty. Nothing
tells us when the Georgia text stops matching the law.

The Phase B scraper (`scripts/scrape-state-law.ts`) was built against
Justia and abandoned when Cloudflare blocked every approach tried,
including Browserless with stealth. The conclusion recorded at the time
was that automated fetching needs paid residential proxies.

That conclusion was true about Justia and false about the law itself.

## Source survey (probed 2026-08-18)

| State | Full text fetchable | Evidence |
|-------|--------------------|----------|
| FL | Yes, plain HTTP | `flsenate.gov/Laws/Statutes/2024/Chapter720/All` returns semantic HTML: 72 x `class="SectionNumber"`, 72 x `class="Catchline"`, plus `Subsection` / `Paragraph` / `SubParagraph`. |
| CA | Yes, bulk only | `leginfo` HTML is JSF-rendered and returns a nav frame. `downloads.leginfo.legislature.ca.gov` serves annual `pubinfo_YYYY.zip` database dumps containing the code section tables. |
| TX | No | `statutes.capitol.texas.gov` is client-rendered. `PR.209.htm`, `PR.209.pdf` and `Download.aspx` all return an identical 250,874-byte shell with zero occurrences of "Sec. 209.". |
| GA | No | Official O.C.G.A. is LexisNexis-hosted (JS frameset). Mirrors probed: findlaw 403, casetext 410, elaws 503, onecle 404, Justia 403. |

Byte count is not evidence of content. Each source above was verified by
grepping for statute text, not by response size.

Consequence: Florida is free today, California is free with a zip
parser, Texas needs investigation, Georgia never gets automated text.
The states are not interchangeable and the design must not pretend they
are.

## Decisions

1. **Verbatim text, not paraphrase.** Official state sources are public
   domain, so the ToS constraint that forced paraphrasing no longer
   applies. Exact citations, no summarisation drift.
2. **Per-state adapters behind one contract.** State differences cost
   one file each instead of contaminating the pipeline.
3. **Two change signals.** Content hashing drives statute text; a bill
   tracker drives the updates feed. Hashing cannot see Georgia; the bill
   tracker can.
4. **Split approval gate.** Verbatim text from an official source
   auto-publishes — it is a mechanical copy of public record. Anything
   LLM-generated lands as a draft for human approval.

### Rejected alternatives

- **Bulk-download every state.** Parsing entire legal codes to extract
  ~30 relevant sections per state, with a bespoke schema per dump
  format. Borrowed for CA only, where it is the sole working path.
- **LLM extraction instead of parsers.** Nondeterministic on 400KB
  inputs and fatal to change detection: the hash of LLM output changes
  when the law did not, so the diff job would fire every week.

## Architecture

### 1. Adapter contract

New directory `packages/workflows/src/W30-state-law-brain/sources/`. It
lives in a package rather than `scripts/` because both the CLI ingester
and the Inngest job import it.

```ts
export interface StatuteRecord {
  code_citation: string      // 'Fla. Stat. § 720.303'
  title: string              // from Catchline
  category: string | null    // from a static citation→category map
  body: string               // verbatim
  source_url: string
  effective_date: string | null
}

export interface StateLawAdapter {
  state: 'GA' | 'FL' | 'CA' | 'TX'
  sourceName: string         // 'flsenate.gov Ch.720 (2024)'
  offline: boolean           // true for GA — reads curated JSONL, no network
  fetchSections(): Promise<StatuteRecord[]>
}
```

Files:

- `types.ts` — the above.
- `florida.ts` — HTML parser over the confirmed class structure.
- `california.ts` — downloads and parses `pubinfo_YYYY.zip`.
- `georgia.ts` — `offline: true`, reads today's curated `data/statutes/ga.jsonl`
  so Georgia flows through the same pipeline and receives the same hash
  and audit treatment. Absorbs the URL catalog from
  `scripts/state-law-sources.ts` as provenance.
- `texas.ts` — throws `NotImplementedError` carrying the reason. The
  registry skips it; nothing else breaks.
- `index.ts` — `adapterFor(state)` registry.

**Category assignment is a static citation→category map per adapter, not
an LLM call.** An LLM-assigned category would make `content_hash`
unstable and the diff job would fire on unchanged law. Vocabulary
matches the one `scripts/state-law-sources.ts` established
(governance, meetings, records, dues, enforcement).

Each adapter carries an allowlist of citations so ingestion covers HOA
law rather than an entire state code: FL Chapter 720 wholesale (all 72
sections), a Davis-Stirling subset for CA.

Adapters return `StatuteRecord[]` in memory. That type is deliberately
identical to the line shape `data/statutes/<state>.jsonl` already uses, so
`chunkPlainText`, the supersede logic and the embedding path in
`scripts/ingest-state-statutes.ts` are reused unchanged.

Two consumers, one contract:

- **The refresh job** (§3) calls `fetchSections()` and works from the
  returned array. No file is written.
- **The CLI** `scripts/ingest-state-statutes.ts` gains a `--from-source`
  flag: with it, the script calls the adapter and ingests the result,
  additionally writing `data/statutes/<state>.jsonl` as a reviewable diff
  artifact. Without it, behaviour is unchanged — read the checked-in
  JSONL. This matters because Florida has no checked-in JSONL, so
  `pnpm ingest:state-law FL` alone would fail; the phase 1 verification
  step is `pnpm ingest:state-law FL --from-source`.

### 2. Migration 0051

`state_statutes` gains:

- `content_hash text` — SHA-256 of the normalised body.
- `source_name text` — which adapter and source produced the row.
- `last_checked_at timestamptz`.

Splitting `last_checked_at` from `fetched_at` fixes a live bug. Both
`apps/hoa/src/app/api/admin/refresh-state-law/route.ts` and
`packages/jobs/src/state-law-refresh.ts` treat `fetched_at` older than 30
days as stale, so a section verified yesterday and found unchanged still
reports stale forever. After this change `fetched_at` means "when the
text last changed", `last_checked_at` means "when we last looked", and
staleness keys off `last_checked_at`.

`state_law_updates` gains:

- `status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published'))`
- `source text` — `'manual'` or `'bill_tracker'`
- `source_ref text` — the bill identifier, for deduplication

The `public_read` RLS policy changes from `USING (archived_at IS NULL)`
to `USING (archived_at IS NULL AND status = 'published')`. This makes the
draft gate a database guarantee rather than a UI convention: an
LLM-drafted summary is invisible to boards until approved. The
`DEFAULT 'published'` keeps every existing row visible.

Migration is idempotent, following the house pattern.

### 3. Refresh job

`packages/jobs/src/state-law-refresh.ts` is rewritten from "emit an audit
row a human might notice" into a real weekly job, one Inngest `step.run`
per state:

- fetch → normalise → SHA-256 per section
- **hash unchanged** → update `last_checked_at` only
- **hash changed, or new citation** → upsert verbatim body, re-chunk,
  re-embed, set `fetched_at = now()`, write a `state_law.statute_updated`
  audit row carrying citation plus old and new hash. Bodies are not
  written to audit payloads.
- **present in DB, absent from source** → set `superseded_at`

No browser is required, so this runs on Vercel. The constraint documented
in that file's header — Playwright's 150MB Chromium against Vercel's
250MB unzipped limit, forcing an out-of-band manual scrape — no longer
applies and its comment block should be removed rather than left to
mislead.

Known risk: Florida is 72 sections of fetch, chunk and embed in one
invocation. Per-state steps provide the retry boundary. If embedding
pushes a step past its limit, batch within the state — to be determined
from the first real Florida run rather than pre-engineered.

### 4. Bill tracker

New `packages/jobs/src/state-law-bills.ts`, weekly.

Source: OpenStates v3 (`v3.openstates.org`). Confirmed to return 403
without a key, so this requires a free `OPENSTATES_API_KEY` — an
external signup, and a prerequisite for this phase.

Per state: query HOA / condominium / property owners association
keywords, keep bills carrying an enactment action within the window,
run each through `packages/ai` to produce headline, summary,
action_items, category and effective_date, then insert with
`status='draft'`, `source='bill_tracker'`, `source_ref=<bill id>`.
Deduplicate on `source_ref`.

This is the only currency signal available for Georgia. It does not fix
Georgia's hand-curated text, but it reports when that curation has gone
stale, which is the exposure today.

### 5. UI and endpoint changes

`/legal/updates` gains a Drafts section above the live list, with
Publish and Discard actions following the existing `ArchiveButton`
pattern.

`/api/admin/refresh-state-law`:

- POST currently writes an audit row nothing consumes and returns
  `next_step: "Run pnpm scrape:state-law ... from a host with Playwright
  installed"` — an instruction pointing at a scraper aimed at a URL that
  returns 403. It becomes an `inngest.send()` triggering the real job.
- GET gains `content_hash`, `last_checked_at` and `source_name`, and
  drops the `refresh_command` field.

### 6. Retrieval mitigations

Verbatim statutory prose matches plain-English questions worse than the
curated summaries Georgia uses today, and retrieval currently runs
FTS-only because `HUGGINGFACE_API_TOKEN` is unset. Adding 72 sections of
raw Florida legalese to an FTS-only index could lower answer quality
even as coverage triples. Two mitigations, both in scope:

- Prefix each chunk's indexed `content` with `${code_citation} — ${title}`
  before embedding and indexing, improving lexical hit rate.
- Set `HUGGINGFACE_API_TOKEN` in the job environment so the embedding
  path `ingest-state-statutes.ts` already implements stops being skipped.
  When absent it must log loudly, per the existing W30 pattern.

### 7. Removals

- `scripts/scrape-state-law.ts` — targets a 403 source via a mechanism no
  longer needed.
- `scripts/state-law-sources.ts` — GA catalog moves into `georgia.ts`.
- `playwright-extra` and `puppeteer-extra-plugin-stealth` devDependencies.
- The `scrape:state-law` script in `package.json`.

## Testing

Unit, no network:

- Each adapter parses a checked-in HTML or zip fixture into the expected
  records. Fixtures under `scripts/fixtures/`.
- Hash-diff branches: unchanged touches `last_checked_at` only; changed
  upserts and writes an audit row; missing sets `superseded_at`.
- Bill filter excludes non-enacted bills and deduplicates on `source_ref`.
- RLS: a `status='draft'` update is invisible to an authenticated
  non-admin, following the pattern in `scripts/test-inbox-rls.ts`.

Manual verification: `pnpm ingest:state-law FL --from-source`, then
confirm `/legal/ask` answers a Florida question citing Chapter 720.

Gate before merge: `pnpm typecheck` and `pnpm test:unit`. CI runs
neither (see CLAUDE.md §5).

## Phasing

1. Adapter contract, Florida adapter, migration 0051, rewritten refresh
   job, retrieval mitigations. Florida goes live — the largest visible win.
2. Bill tracker, draft gate, updates UI. Georgia gains currency.
   Requires `OPENSTATES_API_KEY`.
3. California bulk adapter.
4. Texas spike: find a source that is not client-rendered, or accept a
   browser for that state alone.

## Open items

- `OPENSTATES_API_KEY` requires a free signup before phase 2.
- `HUGGINGFACE_API_TOKEN` must be present in the job environment for the
  embedding mitigation to take effect.
- Texas has no known working source. Phase 4 is a spike, not an
  implementation task.
