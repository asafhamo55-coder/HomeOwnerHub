# User guide: help centre, contextual help and "Ask the guide"

_Spec date: 2026-10-17. Backlog: BL-070. Owner delegated the approach. This document is the decision and the build plan._

Scope: the HOA app only (`apps/hoa`): board admins, board members, managers and residents. Platform admin, pm, eviction and marketing are out of scope.

---

## 0. Decision in one paragraph

We will build the guide in our own stack and add no new paid vendor. The guide is a set of **short, task-shaped markdown articles in the repo**. Screenshots come from **`ui:shots` on seed data**, and **CI fails** when an article points at a screenshot, route or button label that no longer exists. Five surfaces read that one source:

1. a **`/help` centre with instant search**, plus `/resident/help`;
2. a **"?" help drawer** that opens the articles for the page you are on;
3. **"Ask the guide"**, an AI that answers only from guide sections. Every answer cites an article and deep-links only to routes that article declares. Otherwise it refuses and shows search results;
4. **links from the setup checklist, empty states and ⌘K**;
5. **"What's new"**, fed by `docs/releases`.

Tours are not the onboarding mechanism. The only tour is one optional "Show me where" highlight, started by the user. Phases 1 and 2 need **no migration**. Only phase 3, which persists analytics and feedback, needs one.

---

## 1. What the research says (2025–2026), and what we take from it

| Finding | Evidence | What we do |
|---|---|---|
| Users skip tours, especially long or auto-started ones. | Chameleon 2025 benchmarks: 3-step tours complete ~72%, 7-step ~16%. Auto-started tours complete at a ~23% median against ~69% when the user starts them. The H1-2026 median completion is 29% (Produktly). About 70% of users skip linear tours. | No auto tours. Tasks are a **checklist**, which already exists (BL-008), in any order. The only "tour" is an opt-in highlight of one control. |
| Help at the moment of need beats upfront tutorials. Empty states are in-context guidance by definition. | Chameleon and Userpilot empty-state guides. Contextual-help literature: a right-hand drawer, one predictable "?" control, close leaves no residue. | A "?" drawer keyed by route. Every empty state gets a "How this works" secondary link (`EmptyState.secondaryAction` already exists). |
| AI help agents work when grounded and citing, and fail by "over-responding". | Intercom Fin: about 66–67% resolution, cited answers, escalates when unsure. RAG research (Trust-Score, knowledge-gap canaries) counts answering when it should refuse as a hallucination. Practitioners: "make fabrication impossible", not "ask nicely". | Answers are built from **numbered sections**. The server **drops any citation or link the sources don't contain**. A low retrieval score means a refusal **before** the LLM is called. Refusal canaries live in the eval set. |
| Vendors charge per answer. | Intercom Fin is $0.99 per resolution plus seats. Mintlify and GitBook AI are priced per site or plan and aimed at developer docs. | Our corpus is about 50 articles and Groq `gpt-oss-20b` is cheap. Building is clearly worth it, and the RAG patterns already exist (W1, the community-qa agent). |
| Docs-as-code plus generated screenshots is now standard, and stale screenshots are the main failure. | shot-scraper and DocuRun: treat a screenshot as a build artifact with a source route, known state, viewport, wait condition and an owner. | Guide screenshots are a **declared shot list** in `ui:shots`, saved with a manifest (route, source hash, sha). CI checks that every shot exists and flags stale ones. Phase 2 regenerates them in CI. |
| Docs are machine-readable now. | Mintlify and GitBook ship `llms.txt` and markdown per page. AI readership of GitBook docs went from under 10% to over 40% in 2025. | The compiled guide is plain JSON and markdown. Copilot (phase 2) and any future agent read the same source. |
| Changelogs work as short human entries that link to docs. | Linear: weekly, 2–3 sentences per entry, labels, every entry links to the docs. Notion: big items get screenshots. | "What's new" shows only user-facing entries. Each entry is 1–3 sentences and links its guide article. |
| Older, non-technical users want exact steps, not concepts. They are put off by jargon and by manuals that don't match the screen. Mixed media helps. | HCI studies of older adults (Leung et al., CHI; HKUST senior-friendly instruction guidelines). | Numbered steps (7 or fewer). Exact on-screen labels, checked by CI. One screenshot per step group, with the control highlighted. Plain words: "dues", not "assessments receivable". Video comes later and is optional. |

Pitfalls we design against:

- **Stale screenshots:** the manifest and source hash, plus regeneration in CI.
- **Docs drifting from the UI:** CI checks `[[Button label]]` references and `routes:` against the code.
- **Hallucinated answers:** a retrieval threshold, server-side citation and link validation, and canaries.
- **Invented features:** the guide may describe only what the code contains. The label check enforces part of this, and review enforces the rest.
- **Two AI boxes that confuse people:** "Ask the guide" covers how to use the app. "Ask the Docs" covers what our CC&Rs say. Each one routes to the other (section 6.3).

Sources:

- [Chameleon benchmark 2025](https://chameleon.io/benchmark-report)
- [Chameleon, "Product tours still work"](https://www.chameleon.io/blog/product-tours-still-work)
- [Produktly 2026 benchmarks](https://produktly.com/research/saas-onboarding-benchmarks-2026)
- [Chameleon, empty states](https://www.chameleon.io/blog/how-to-use-empty-states-for-better-onboarding)
- [Fin pricing (Gleap)](https://www.gleap.io/blog/intercom-fin-ai-pricing-2026)
- [Fin guide (Macha)](https://www.getmacha.com/blog/intercom-fin-ai-agent-complete-guide)
- [Trust-Score / learning to refuse](https://arxiv.org/pdf/2409.11242)
- [Knowledge-gap canaries](https://arxiv.org/pdf/2608.26385)
- [shot-scraper](https://simonwillison.net/2022/Mar/10/shot-scraper/)
- [Automating doc screenshots (CloudBees)](https://www.cloudbees.com/blog/automating-screenshots-in-documentation)
- [GitBook vs Mintlify](https://www.gitbook.com/blog/gitbook-vs-mintlify)
- [Linear, "Startups write changelogs"](https://linear.app/blog/startups-write-changelogs)
- [Older adults learning mobile devices (CHI)](https://www.cs.ubc.ca/wiki/core/pub/Imager/InteractionDesignReadingGroupPresenterQueue/chi2011LeungEtAlv20100920.pdf)
- [Senior-friendly product instructions](https://researchportal.hkust.edu.hk/en/publications/guidelines-for-creating-senior-friendly-product-instructions/)
- Competitor help centres (PayHOA, Vantaca, Buildium) rely on human onboarding calls and static knowledge bases. Vantaca runs a TalentLMS course catalogue. None found offers a grounded in-app AI guide, so this is a real differentiator for self-managed boards that have no onboarding rep.

---

## 2. Users and roles

| Audience | App role | Where they work | Main need |
|---|---|---|---|
| Board admin (often the treasurer or president, a volunteer) | `admin` | board dashboard | Set up the HOA. Run dues, books and members. |
| Board member | `board` | board dashboard | Vote on approvals, violations and ARC. Read reports. Attend meetings. |
| Manager (small management company) | `admin` across several HOAs (org switcher) | board dashboard | Switch HOAs and work quickly. Wants a reference more than a tutorial. |
| Resident or owner | `resident` | `/resident` portal, mostly on a phone | Pay dues, submit ARC, report issues, read announcements. |

Every article declares its `roles`. Search, the drawer and Ask filter by the viewer's role. Board articles are not secret: the corpus contains no tenant data. The filter exists for relevance, so residents never see "how to generate dues".

---

## 3. Information architecture

```
/help                         Help centre home (board app)
  Start here                  role paths: "I'm setting up the HOA" · "I'm on the board" · "I manage several HOAs"
  Topics
    Getting started & setup   (setup checklist, mailbox, properties, residents, inviting the board)
    Dues & payments           (generate dues, record payment, reminders, payment plans, online payments)
    Violations                (report, letter approval, cure period, close)
    ARC requests              (review, decide, tell residents how to apply)
    Meetings                  (schedule, agenda/packet, minutes from transcript, action items)
    Accounting                (open the books, invoices/bills, bank reconciliation, budget, reports)
    Communications            (announcements, email/SMS, inbox replies)
    Properties & people       (properties, owners/residents, members & roles)
    Documents & AI            (governing documents, Ask the Docs, Approvals queue, Copilot)
    Vendors & RFPs
    Settings & account
  What's new                  /help/whats-new
/help/[slug]                  Article
/resident/help                Resident help home (portal kit, mobile-first)
/resident/help/[slug]         Resident article
```

Each topic page lists its tasks, phrased as the user would ask them ("Record a payment by check"), never as feature names.

**Role paths are curated lists, not tracked courses.** "I'm setting up the HOA" is an ordered list of about 8 articles that mirrors the setup checklist. We store no progress. Completion is the existing derived checklist (§7).

---

## 4. Article format

Location: `apps/hoa/content/guide/<topic>/<slug>.md`. Articles sit next to the app that ships them, so Vercel builds and file tracing need nothing special. Releases stay at the repo root (`docs/releases`) and are read by the compile step (§5.1).

```markdown
---
id: dues-record-payment          # stable; citations and analytics use it. Never reuse.
title: Record a payment by check or cash
summary: Post a payment an owner made outside the portal so their balance is right.  # ≤160 chars, shown in search + drawer
topic: dues
roles: [admin, board]            # admin | board | resident
routes: ["/dues", "/properties/[id]"]   # app routes this article is about (Next route templates). Drives the "?" drawer AND is the deep-link allowlist for Ask.
primary_route: /dues             # the "Take me there" button
keywords: [check, cheque, cash, paid, payment, assessment, ledger]   # synonyms users type
shots:
  - name: guide-dues-record-payment          # must exist in GUIDE_SHOTS (§5.2)
    alt: The Dues page with the Record payment button highlighted
related: [dues-generate-monthly, dues-send-reminders]
reviewed: 2026-10-17             # last human/agent verification against the live UI
---

Short intro: one or two sentences on **when** you'd do this.

## Before you start
- Only board admins and board members can record payments.

## Steps
1. Open **Dues** from the sidebar.
2. Find the property and select [[Record payment]].
3. ...

![[guide-dues-record-payment]]

## What happens next
The payment posts to the ledger ...

## If something goes wrong
- "Couldn't save the payment" — ...
```

Rules. Phase 1 lints them in `guide:check`.

- **One task per article.** H2s come from a fixed set: `Before you start`, `Steps`, `What happens next`, `If something goes wrong`, `Good to know`. Search and Ask chunk the article by H2.
- **Steps:** a numbered list of at most 7 items. Each step names the on-screen control exactly as it appears.
- **`[[Label]]`** marks an on-screen control. It renders as a button-like chip, and CI checks that the exact string appears in some `apps/hoa/src/**/*.tsx` or `*.ts` file. A drifted label fails CI.
- **`![[shot-name]]`** embeds a guide screenshot, rendered with the narrow (375) or wide (1440) version chosen by `<picture>`. Plain `![](...)` images are banned, because they can't be checked.
- **`[Link text](/route)`** internal links must match a real route template. A link to another article is `[text](guide:dues-generate-monthly)`, and the article must exist.
- **Plain language:** Grade 6–8 reading level, sentence case, and "you" voice. Defined words: dues (not "assessments" unless the screen says so), "board", "home/property".
- **No invented features.** If the UI can't do something, the article doesn't say it can. "Can I…?" questions that the answer is "no" to go in `Good to know`, so Ask can say no truthfully.
- **No real data.** Screenshots come from seed data only (`example.test` identities). The prose uses no real names or addresses.

---

## 5. Pipeline: compile, screenshots, CI

### 5.1 Compile (`pnpm guide:build`, `scripts/guide-build.ts`)

1. Read `apps/hoa/content/guide/**/*.md`. Parse the frontmatter with a zod schema.
2. Parse markdown with `marked`'s lexer. This is a small MIT dev dependency, used at **build time only**. Convert the tokens into a block AST: `heading | paragraph | list | step | shot | callout | uiLabel | link`. The app renders the AST with design-system components (`Card`, `Alert`, `Kpi`-free prose styles), so there is no `dangerouslySetInnerHTML` and no runtime markdown library.
3. Chunk by H2 into **sections**: `{ articleId, sectionId, heading, text, roles, routes }`.
4. Write `apps/hoa/src/generated/guide.ts`, which exports:
   - `GUIDE_ARTICLES`
   - `GUIDE_SECTIONS`
   - `GUIDE_ROUTE_INDEX`: route template → article ids
   - `GUIDE_SEARCH_INDEX`: pre-built term → postings with BM25 stats, plus the keyword and synonym table. This is our own ~100-line BM25 with no dependency.
   - `WHATS_NEW` (§6.5)
5. **The generated file is committed**, like a lockfile. CI runs `guide:build` and fails if `git diff --exit-code` shows a difference. That keeps typecheck, Vercel and tests deterministic, with no fs reads at runtime.

Size budget: about 50 articles come to roughly 300 KB of JSON. Article pages are server components. The search index (titles, summaries and keywords only, about 30 KB) goes to the client for instant search. Full-text search runs through a server action.

### 5.2 Screenshots (`pnpm ui:shots --guide`)

- **The shot list lives in `scripts/guide-shots.ts`.** It exports `GUIDE_SHOTS: Shot[]`, which `scripts/ui-shots.ts` imports. Each entry reuses the existing `Shot` fields (`path`, `auth`, `resident`, `org`, `click`, `viewport`, `widths`) and adds:
  - `highlight?: string`, a selector that gets a 3px brand outline and a dimmed backdrop, injected with CSS before capture. This shows older users exactly where to click.
  - `clip?: string`, a selector whose bounding box is captured instead of the whole page. Crops keep images small and readable on phones.
  - `mask?: string[]`, selectors that Playwright masks (timestamps, relative dates).
- **Determinism:**
  - Light theme only. Images get a 1px border so they sit well in dark mode.
  - Widths `[375, 1440]`.
  - `page.clock.setFixedTime('2026-10-01T15:00:00')` to fix the time.
  - The existing deterministic seed.
  - Fonts load before capture.
- **Output:** `apps/hoa/public/guide/shots/<name>--<width>.webp`, converted with `sharp`, which Next already brings in, at quality 80 and a 900px max for desktop crops. Alongside the images goes `manifest.json`:

  ```json
  { "guide-dues-record-payment": { "widths": [375,1440], "route": "/dues", "sha": "<git sha>", "sourceHash": "<sha1 of the route's page dir + imported components list>", "capturedAt": "2026-10-17" } }
  ```

  `sourceHash` hashes the files under the route's `app/(dashboard)/<segment>/` directory. That is a cheap proxy for "this screen changed".
- **Seed:** guide shots reuse `scripts/ui-shots-seed.ts`. Any data an article needs, such as one unpaid charge or one pending ARC, is added there, with no PII.
- Guide images are committed. The `.ui-shots/` folder stays gitignored for design review.

### 5.3 CI check (`pnpm guide:check`, wired into `.github/workflows/ci.yml` after typecheck)

**Fails on:**

- Frontmatter that doesn't match the schema, or a duplicate `id`.
- `shots[].name` or `![[name]]` that is missing from `GUIDE_SHOTS`, or a webp missing for either width.
- A `routes` or `primary_route` entry, or an internal link, that doesn't resolve to an existing `page.tsx` route template under `apps/hoa/src/app`. Route groups like `(dashboard)` are stripped.
- A `[[Label]]` string that isn't found in `apps/hoa/src`.
- A `guide:` link to an unknown article.
- A Steps list with more than 7 items. A missing `summary`.
- A stale `generated/guide.ts`.
- A `GUIDE_EXPECTED_ROUTES` entry with no article. This is a small allowlist of core routes, such as `/dues`, `/violations`, `/arc`, `/meetings`, `/accounting` and `/resident/dues`, that must have at least one article. It turns "coverage" into a ratchet.

**Warns (phase 1), fails (phase 2):** a shot whose current `sourceHash` differs from the manifest, meaning the screen changed after the picture was taken. An article whose `reviewed` date is more than 120 days old.

Unit tests (vitest) cover the compiler, BM25, the route matcher and the Ask validator (§6.3).

---

## 6. In-app surfaces

All surfaces use the design-system v2 components (`docs/specs/2026-10-15-design-system-v2.md`). They must pass `pnpm ui:overflow` at 375 and 1440.

### 6.1 Help centre: `/help`, `/help/[slug]`, `/resident/help`, `/resident/help/[slug]`

- **Home:**
  - a large search field (autofocus on desktop only);
  - the "Start here" role-path cards;
  - a topic grid (`Card variant="interactive"`);
  - the three latest What's new entries;
  - the "Ask the guide" box (§6.3).
- **Search:** instant client-side over titles, summaries and keywords. Enter runs a full-text search over sections on the server. Results show the title, summary and a matched-section snippet.

  When nothing matches, the page says so plainly. It offers "Ask the guide", and for board users "Ask the Docs" for rules questions. It never shows an empty list for a failure (`LoadFailed` vs `EmptyState`).
- **Article page:**
  - `Page width="narrow"`, breadcrumbs `Help › Dues › Record a payment`;
  - a primary action **"Take me there"** → `primary_route`. When the route has `[id]` segments, it links to the list page instead;
  - steps rendered as large numbered items (16px+ text, 44px touch targets);
  - the screenshots;
  - related articles;
  - "Was this helpful? Yes / No" (§8).
- **Resident pages** use the portal's `screen.tsx` kit and tab bar. They are mobile-first and show only `roles: [resident]` articles.
- **Nav:** "Help" goes in the sidebar's Account section (`nav.ts`, so ⌘K gets it too) and in the resident account menu.

### 6.2 "?" contextual help drawer

- **Trigger:** a `?` icon button (`aria-label="Help for this page"`, Tooltip) in `AppShellHeader`'s right-hand cluster. It follows the `bar-lg:` labelled/icon-only rule, so it stays visible with Copilot open. The resident top bar gets the same button. Keyboard: `Shift+/` opens it when focus is not in a field.
- **Mapping:** the current pathname is matched against `GUIDE_ROUTE_INDEX` by most specific template. `/violations/abc` matches `/violations/[id]` before `/violations`. If nothing matches, the drawer shows the role's "Start here" list.
- **Content:** `Sheet side="right"` on desktop and a full-height sheet on phones, with no layout shift. It holds:
  1. "On this page": up to 5 matching articles, each expandable inline to its Steps, so the user can read without leaving the page;
  2. an "Ask about this page" input, which is "Ask the guide" with `context.route` set so retrieval is boosted towards this route's articles;
  3. "Open the Help centre".

  Closing the drawer returns focus to the trigger and leaves the page untouched.
- **Opt-in "Show me where" (the only tour-like element):** an article step may declare `highlight: "<selector>"` in the AST. In the drawer, on the matching route, a "Show me" link scrolls to the element and pulses an outline for 3 seconds. It is user-started, one step, and dismissible. If the selector is missing, the link is hidden. guide:check reports the missing selector as a warning, because selectors live in code.

### 6.3 "Ask the guide" (grounded AI)

**Route:** `POST /api/help/ask`. It follows the RC-1..RC-13 route conventions (`apps/hoa/src/lib/api/`): authenticated, zod body `{ question: string ≤500, route?: string }`, a typed error envelope, and logs with no PII. Model: `DEFAULT_FAST_MODEL` (`openai/gpt-oss-20b` on Groq) via `resolveModel`. A decommissioned-model guard already exists in `packages/ai/src/model.ts`.

Pipeline:

1. **Classify cheaply** with a keyword heuristic. A pure rules question ("can I paint my door red", "what does the CC&R say") is not answered from the guide. The response is `{ kind: 'rules_question' }`, and the UI offers **Ask the Docs** prefilled. Its routes are `/ai/ask` for the board and `/resident/ask` for residents. "Ask the Docs" gets the mirror link: "How do I use this?" → Ask the guide.
2. **Retrieve:** BM25 over `GUIDE_SECTIONS`, filtered to the viewer's role, with a boost for sections whose article `routes` match `route`. Keep the top 6 sections.
3. **Gate:** if the top score is under `MIN_SCORE` (tuned on the eval set), return `{ kind: 'not_covered', suggestions: top 3 articles }` **without calling the LLM**.
4. **Generate:** the sources are numbered `[S1]…[S6]`, each with its article title and section text. The system prompt requires:
   - answer only from the sources;
   - keep it short, with numbered steps when it's a how-to;
   - every sentence cites `[S#]`;
   - return JSON `{ answer, citations: ["S2"], route: "S2" | null, covered: boolean }`.

   Use JSON mode / `response_format`.
5. **Validate on the server.** This is what makes fabrication impossible rather than discouraged:
   - Remove citation ids that weren't provided. If none remain, the answer becomes `not_covered`.
   - Remove `[S#]` markers that don't match a kept citation.
   - The deep link is **never free text**. The model picks a source, and the server maps it to that article's `primary_route`. Any URL or path in `answer` is stripped.
   - `[[Label]]` chips are kept only if the label exists in a cited article.
   - If `covered: false`, return `not_covered` plus suggestions.
6. **Respond:** `{ kind: 'answer', answer, citations: [{ articleId, title, sectionHeading, href: '/help/<slug>#<section>' }], takeMeThere?: { label, href } }`.
7. **Degrade gracefully:** if Groq errors or times out (8 seconds), return `{ kind: 'unavailable', suggestions }`. The UI shows the matching articles, so search alone still answers the question.

UI:

- the answer text;
- citation chips below, which open the article at its section;
- a "Take me there" button;
- Helpful yes/no (§8);
- the footer line "Answers come only from the HomeownerHub guide. For your community's rules, use Ask the Docs."

**The refusal copy is honest:** "The guide doesn't cover that yet. Here are the closest articles. If HomeownerHub can't do this, tell us" opens the existing feedback/contact path if one exists, and otherwise a mailto to support, shown as text.

**Privacy:** the question text is sent to Groq and **never logged or stored** in phases 1 and 2. Residents may type addresses or names, so `findContactPII` (`packages/ai/src/pii.ts`) runs first. Contact details are replaced with placeholders before the LLM call, as in the community-qa agent.

**Eval** (`apps/hoa/content/guide/_eval/questions.yaml`, not published) holds about 40 questions:

- each "how do I" question has an expected `articleId`;
- about 10 **refusal canaries** describe features we don't have, for example "How do I set up automatic late fees by text message?" or "Can residents book the clubhouse?" (check the code before choosing them);
- 5 rules questions must route to Ask the Docs.

The routing and validation are unit-tested with a mocked LLM, as the community-qa tests do. `pnpm guide:eval` runs the live set against Groq and reports retrieval hit@3, refusal precision and citation validity. It runs manually or before each guide release, not in CI, because it needs keys.

### 6.4 First-run checklist, empty states, ⌘K

- **Setup checklist (BL-008):** each `STEP_COPY` entry in `apps/hoa/src/lib/dashboard/setup-checklist.ts` gains `guide: '<articleId>'`. `SetupChecklistCard` and `/onboarding/setup` render a small "How?" link next to the CTA. It opens the drawer on that article, so the user doesn't leave the dashboard. Completion stays derived, with no new storage.
- **Role-based first run (no migration):** board members (`role === 'board'`) don't run setup. On the dashboard, until dismissed through the existing `DismissSetupButton` pattern (cookie or localStorage), they see a 4-link "Your first week on the board" card: Approvals, Violations, ARC, Meetings. Each link goes to its article. Residents see a one-line "New here? 3 things you can do" card on `/resident` linking to pay dues, ARC and requests. Neither card tracks progress.
- **Empty states:** every core list page's `EmptyState` gets `secondaryAction={{ label: 'How this works', href: '/help/<slug>' }}`. Phase 1 covers dues, violations, ARC, meetings, communications, accounting, approvals, governing docs and resident dues. guide:check verifies the slugs, because they are `guide:` references in code via the `guideHref('<id>')` helper, which throws at build if the id is unknown.
- **⌘K:** `CommandPalette` gets a "Help" group. Each article title becomes a command with its keywords, filtered by role, and "Ask the guide: <query>" is the fallback row when nothing matches.

### 6.5 What's new: `/help/whats-new` (and `/resident/help/whats-new`)

- **Source:** `docs/releases/*.md`, written per deploy by the release-notes pipeline (see `docs/session-handoff.md`). Those files are engineer- and owner-facing, so the feed **only** takes entries marked user-facing. The contract is a frontmatter block that the release-notes writer adds:

  ```yaml
  whats_new:
    - title: Edit a scanned bill before you approve it
      body: Fix the vendor, amount or due date the AI read from a bill, right in Approvals.
      roles: [admin, board]
      article: approvals-scanned-bills     # optional guide link
      label: improvement                   # new | improvement | fix
  ```

  A release with no `whats_new` contributes nothing. That is the default, and it keeps refactors and migrations out of the feed. `guide:build` collects the entries into `WHATS_NEW`, sorted by date and validated: the article exists, the body is 280 characters or fewer, and there are no URLs except guide links.
- **If `docs/releases/` is absent** (the pipeline hasn't landed on this branch yet), `WHATS_NEW` is empty and the page shows "Nothing new yet". It does not fail.
- **UI:** a list in Linear style (label pill, title, 1–3 sentences, "Learn how" link to the article), grouped by month. An unread dot on the Help nav item compares the newest entry id with `localStorage['hoa.whatsNew.seen']`, wrapped in try/catch. This needs no migration.

### 6.6 Copilot (phase 2)

Add a `search_guide` tool to the community-qa agent (`apps/hoa/src/lib/community-qa/tools.ts`) that returns guide sections as `DocsCitation`-style citations of type `guide`. Copilot can then answer "how do I…" with guide citations next to its records and docs answers. The same validation rule applies: citations must come from tool output.

---

## 7. Mobile and accessibility

- Every surface works at 375. The drawer becomes a full-height sheet, article steps use 16px text, and "Take me there" is a 44px `Button size="lg"`.
- Screenshots use `<picture>`: 375 on phones, 1440 crop on desktop. Every image has alt text from the frontmatter. Images never carry information the text lacks.
- The Ask answer area is an `aria-live="polite"` region. Citation chips are real links.
- Respect `prefers-reduced-motion` for the "Show me" pulse.

---

## 8. Analytics hooks (no PII)

**Events:**

| Event | Fields |
|---|---|
| `help.drawer_open` | `routeTemplate`, `role`, `matchedCount` |
| `help.search` | `role`, `resultCount`, `queryLengthBucket` (not the query) |
| `help.article_view` | `articleId`, `role`, `source` = `center \| drawer \| ask \| checklist \| empty_state \| palette \| whats_new` |
| `help.take_me_there` | `articleId` |
| `help.ask` | `role`, `routeTemplate`, `kind` = `answer \| not_covered \| rules_question \| unavailable \| error`, `citationCount`, `topScoreBucket`, `latencyBucket` |
| `help.feedback` | `articleId` or `askKind`, `helpful: boolean` |
| `help.show_me` | `articleId`, `found: boolean` |

**Never recorded:**

- question or search text;
- concrete paths with ids (always the route template);
- user ids or emails;
- org names.

The org id is allowed only in phase 3, and only for counts.

- **Phases 1–2 (no migration):** a `trackHelp(event, fields)` helper writes one structured JSON log line from a tiny `POST /api/help/event` route (RC conventions, zod enum of event names, fields allowlisted). That makes the events queryable in Vercel logs. The client fires the request with `navigator.sendBeacon`, fire-and-forget.
- **Phase 3 (migration):** a `help_events` table (`event`, `article_id`, `role`, `kind`, `route_template`, `org_id`, `created_at`). There is no user id and no text. RLS allows insert for the authenticated user's own org and select for platform admin only, with 180-day retention via cron. The `/admin/analytics` page gets a "Guide" tile: top articles, not-covered rate, "not helpful" rate per article, and drawer opens on routes with no article (the content-gap list).

**Content-gap loop:** not-covered Asks, grouped by `routeTemplate`, plus "not helpful" votes per article. These feed `docs/backlog.md` in the product loop, so new articles are written where users are actually stuck. That replaces reading users' questions.

---

## 9. Phased build plan

### Phase 1: shippable in 1–2 agent-days, **no migration**

**Day 1 (pipeline and reading):**

1. `content/guide/` and the frontmatter schema. `scripts/guide-build.ts` with the AST compiler, sections and BM25, plus `generated/guide.ts` (committed). Add `marked` as a devDependency.
2. `scripts/guide-shots.ts` and the `--guide` mode in `ui-shots.ts` (`highlight`, `clip`, `mask`, fixed clock, webp and the manifest).
3. `pnpm guide:check`, with its unit tests, wired into CI.
4. The 12 articles in §10 and their shots.
5. `/help`, `/help/[slug]`, `/resident/help`, `/resident/help/[slug]`, and search: instant client search plus server full-text. Add Help to `nav.ts` and the resident menu.
6. The "?" drawer in the board and resident top bars, using route mapping.

**Day 2 (AI, linking and freshness):**

7. `POST /api/help/ask`: classify, retrieve, gate, generate, validate. The Ask UI goes in `/help` and the drawer. Unit tests with a mocked LLM. Commit the eval YAML and the `guide:eval` script.
8. Checklist "How?" links, the board-member and resident first-week cards, and the `EmptyState` help links on the 9 core pages. Add ⌘K Help commands.
9. `/help/whats-new`: the `whats_new` frontmatter contract, the compile step and the localStorage unread dot. Update `docs/releases/README.md`, or create it if the pipeline has landed, with the `whats_new` contract.
10. The `trackHelp` log-line route.
11. Gates: `pnpm typecheck`, `pnpm test:unit`, `pnpm guide:check`, `pnpm ui:overflow`, and `ui:shots` review of the help pages at 375/1440 in light and dark.

### Phase 2: hardening and coverage, **no migration**

- About 25 more articles, so every route in `GUIDE_EXPECTED_ROUTES` (all core board routes and all resident routes) has one.
- A **CI screenshot refresh:** `.github/workflows/guide-shots.yml` runs on a weekly schedule and on pushes that touch `apps/hoa/src/app/**`. It starts local Supabase (as integration CI already does), runs `ui:shots --guide`, and diffs against the committed images with `pixelmatch` at a 1% threshold. When anything changed, it opens a PR titled "Refresh guide screenshots" that lists each changed shot and the articles using it. A reviewer checks the steps still match. Stale `sourceHash` becomes a CI failure.
- "Show me where" highlights.
- The Copilot `search_guide` tool.
- A public `/guide/sign-in-help` page, reachable from the login screen. It is unauthenticated, static and has no tenant data.
- Tune `MIN_SCORE` on the eval set. Optional build-time embeddings for hybrid retrieval: `text-embedding-3-small` through the existing `packages/ai/embeddings.ts`, vectors written into `generated/guide.ts` at build. **Still no DB, no migration.** Do this only if eval hit@3 is under 90% with BM25.

### Phase 3: persisted analytics and feedback, **needs a migration**

- Migration: the `help_events` table with RLS and a retention cron (§8). Following project rules, the SQL is handed to Asaf to apply before the dependent code ships.
- The "Guide" tile on `/admin/analytics`. Persisted Helpful yes/no.
- Optional, owner decision first: a redacted unanswered-question queue (`help_questions`, PII-scrubbed with `pii.ts`, 90-day retention, platform-admin only). Off by default.

### Phase 4: rich media, only if phase 3 data shows the need, **no migration**

- 10–20 second silent walkthrough loops for the 5 most-viewed articles. They come from Playwright `recordVideo` on the same seed and scripted flow as the shots, saved as webm/mp4 with captions in the article text and regenerated by the same CI job. Never the only carrier of the information.
- Optional user-started multi-step walkthroughs of 4 steps or fewer for the setup checklist. Only if analytics show checklist steps stall.

---

## 10. The first 12 articles (phase 1)

Labels in `[[…]]` below come from the current code, and guide:check re-verifies them. Before writing each one, the writer **opens the route on seed data** (`ui:shots`) and corrects any outline step the UI doesn't support. The outline never wins over the code.

| # | id | Roles | Routes |
|---|---|---|---|
| 1 | `start-board-admin` | admin | `/`, `/onboarding/setup` |
| 2 | `setup-properties-residents` | admin, board | `/properties`, `/properties/new`, `/properties/[id]` |
| 3 | `members-invite-board` | admin | `/settings/members` |
| 4 | `dues-generate-monthly` | admin, board | `/dues`, `/dues/new` |
| 5 | `dues-record-payment` | admin, board | `/dues`, `/properties/[id]` |
| 6 | `violations-report-and-letter` | admin, board | `/violations`, `/violations/new`, `/violations/[id]`, `/violations/approval-queue` |
| 7 | `arc-review-application` | admin, board | `/arc`, `/arc/[id]` |
| 8 | `meetings-schedule-and-minutes` | admin, board | `/meetings`, `/meetings/new`, `/meetings/schedule`, `/meetings/[id]`, `/meetings/[id]/packet` |
| 9 | `approvals-queue` | admin, board | `/approvals` |
| 10 | `communications-send-announcement` | admin, board | `/communications`, `/communications/new` |
| 11 | `documents-governing-and-ask` | admin, board | `/documents/governing`, `/ai/ask` |
| 12 | `resident-portal-basics` | resident | `/resident`, `/resident/dues`, `/resident/dues/pay`, `/resident/arc`, `/resident/arc/new`, `/resident/tickets/new`, `/resident/report-violation` |


**1. Start here: setting up your HOA** (`start-board-admin`)

- What HomeownerHub does for a self-managed board, in three sentences.
- The setup checklist on your dashboard, with each step and why it matters:
  - mailbox
  - properties
  - residents
  - governing documents
  - dues
  - invite the board
- Do the steps in any order. The checklist ticks itself off as the data appears.
- "Couldn't check" on a step means we couldn't read it. Reload; it isn't a failure on your side.
- Next articles: links to 2–5 and 11.
- Shot: the dashboard setup card, with the card highlighted.

**2. Add your properties and residents** (`setup-properties-residents`)

- Before you start: you need the list of addresses. The owner name and email are optional.
- Steps:
  1. [[Add a property]]
  2. Fill in the address. Save.
  3. Open the property and add owners or residents.
- Many homes at once: bulk import is a platform-admin tool (`/admin/import-units`), so the article says "ask support to import your spreadsheet".
- What happens next: dues and mail match a person.
- Shots: the properties list and the add-property form.

**3. Invite the rest of the board** (`members-invite-board`)

- The roles explained in plain words, from the `InviteMemberForm` copy:
  - **Admin:** full control.
  - **Board:** manage vendors, violations and the rest.
  - **Resident:** portal only.
- Steps: Settings → Members → [[Invite a member]] → email and role → [[Send invites]]. Each item in that path is checked as a label.
- Changing a role or removing someone.
- Good to know: managers with several HOAs use the org switcher.
- Shot: the members page with the invite form.

**4. Bill this month's dues** (`dues-generate-monthly`)

- What a dues charge is, and that it posts to the ledger as money owed.
- Before you start: an association must exist. Explain the "Set up your association" form that appears if none exists (BL-046).
- Steps: generate this month's dues for every property, or add a one-off charge.
- What happens next: balances appear per home, and reminders are covered in `settings/reminders`.
- If something goes wrong: "Add properties first".
- Shots: dues with no charges (the empty state) and with charges.

**5. Record a payment by check or cash** (`dues-record-payment`)

- When to use this: the owner paid outside the portal.
- Steps: [[Record payment]], then amount, date and method.
- What happens next: the balance updates and the payment posts to the ledger.
- Good to know: online payments are configured in Settings → Payments. Describe only the options the page offers, for example Zelle, and confirm on the page.
- Shot: the Record payment dialog.

**6. Report a violation and approve the letter** (`violations-report-and-letter`)

- The lifecycle in one line: report → notice → cure period → close.
- Steps:
  1. [[New violation]]
  2. Property, description and photo.
  3. Covenant Brain suggests the CC&R section and drafts the letter.
  4. Review it in the approval queue.
  5. [[Approve letter]]
- Good to know:
  - the state-law rule panel (what it checks);
  - nothing is sent until the board approves.
- Shots: the new-violation form with the rule panel, and the approval queue.

**7. Review an ARC application** (`arc-review-application`)

- Where applications come from: residents submit them from their portal.
- Steps: open ARC review → open an application → read the details and attachments → record the decision.
- What happens next: the resident is notified. Check how against `communications`.
- Empty state: [[Tell residents how to apply]].
- Shots: the ARC list and the detail.

**8. Schedule a meeting and file the minutes** (`meetings-schedule-and-minutes`)

- Steps: [[Schedule a meeting]] → date and agenda.
- The board packet: what's in it, and printing it.
- Minutes: paste a transcript and AI drafts the minutes for approval. Or [[Record past minutes]].
- Action items, and where they appear.
- Shots: the meetings list and the packet.

**9. The Approvals queue: nothing happens until you approve** (`approvals-queue`)

- What lands here:
  - deposit matches
  - scanned bills
  - violation letters
  - vendors
- Steps per type: review, then [[Approve & post]] / [[Approve & enter]], or decline.
- Edit a scanned bill's details before approving (BL-059).
- Good to know: the AI never posts or sends on its own.
- Shots: the approvals list, and the bill edit dialog with a highlight.

**10. Send an announcement to residents** (`communications-send-announcement`)

- Steps: [[New email]] or a new communication → topic → audience → message → [[Send now]].
- Delivery history: who received it.
- Good to know: SMS length limits, and replies arriving in Inbox. Confirm both against the composer before writing.
- Shots: the communications list and the composer.

**11. Upload your governing documents and ask questions about them** (`documents-governing-and-ask`)

- Why: Ask the Docs and Covenant Brain cite *your* CC&Rs.
- Steps: Documents → Governing → [[Upload governing documents]] → wait for processing.
- Using Ask the Docs: every answer cites a section, and it says so when the documents don't cover the question.
- The difference between Ask the Docs (your rules) and Ask the guide (how to use the app).
- Shots: the governing documents page and an Ask the Docs answer with a citation.

**12. Your resident portal: pay dues, ask for approval, report a problem** (`resident-portal-basics`)

- Written for phones, in the shortest words.
- **Pay dues:** [[Pay dues]] → choose a method → [[Pay now]]. Or view the statement or ledger.
- **ARC request** (painting, a fence or other changes): start a new application, add photos, [[Submit]], and track its status.
- **Report a problem or a violation:** new request or ticket, report a violation.
- **Announcements and documents:** where to find them.
- **Ask the Docs** for rules questions.
- Shots: resident home, pay and new ARC, at 375 only plus 1440.

---

## 11. Acceptance (from BL-070, made testable)

- A new board member reaches the "how do I…" article for each core task in 2 clicks or fewer from any page (? → article), or with one Ask. A scripted check confirms every `GUIDE_EXPECTED_ROUTES` entry has a drawer match.
- Every Ask answer of `kind: 'answer'` has 1 or more citations that resolve to real articles. The validator unit tests prove that an uncited or invented link can't reach the client.
- On the eval set: hit@3 ≥ 90%, refusal canaries refused ≥ 90%, rules questions routed to Ask the Docs ≥ 80%. All tuned before the phase-1 ship note.
- CI fails when a referenced screenshot, route, `[[label]]` or article id disappears. A deliberate break of each one proves it, recorded in the PR.
- The help pages pass `ui:overflow` at 375 and 1440, and look right in `ui:shots` in light and dark.
- No question text, search text, path id, name or email appears in any log line. A test asserts the `trackHelp` field allowlist.

## 12. Open questions (none block phase 1)

- Is there an existing support or feedback channel for "tell us" on refusals? If not, phase 1 shows the support email as text.
- Should the public `/guide` pages (phase 2) be indexable for SEO and marketing? Default: `noindex` until the owner decides.
