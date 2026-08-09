# Community Email Template Library — Design

**Date:** 2026-08-09
**Status:** Approved, pending implementation plan
**Branch:** `claude/dues-reminder-emails` (successor work)

---

## 1. Problem

HomeownerHub ships 17 seeded communication templates. Every one is transactional or legal: dues
reminders, late notices, violation cure notices, ARC decisions, meeting notices, budget summaries,
emergency alerts.

Boards spend at least as much effort on a different kind of email entirely — the neighbourly nudge
and the community request. Pet waste. Guest parking. Drive slowly near the school. Bins left at the
curb all week. The Halloween party. Collecting graduating students' names so a banner can be ordered
for the entrance before the last day of school.

That genre has **zero coverage today**, no category to live under, and no visual treatment. Boards
write these from a blank page, at night, without legal review — which is exactly where an
association gets itself into trouble.

This design adds a **global, illustrated, question-driven template library** for that genre.

## 2. Goals

1. A curated library of community templates that ships **with the product**, available to every org
   with no seeding step, improvable for all tenants at once.
2. Every template carries a **visual block** that illustrates the issue, and degrades safely when a
   mail client blocks images.
3. A **guided composer**: the board member answers a few typed questions and gets a finished email,
   rather than editing placeholder prose.
4. Legal guardrails baked into the templates, not left to whoever is drafting.

## 3. Non-goals

- Rewriting the existing 17 transactional templates.
- A WYSIWYG template designer. Templates are authored in the repo by us.
- A general charting capability (see §10).
- One-to-one property notices (see §12).

## 4. Research basis

Twelve agents across three rounds produced 88 candidate topics and four technical investigations.
Two findings changed the design; two uncovered live bugs.

### 4.1 The shape taxonomy

Topics do not vary only by subject — they vary by **shape**, and shape determines what machinery the
template needs:

| Shape | Board does | Template needs |
|---|---|---|
| `reminder` | Tells; residents act | The ask, the practical detail |
| `invitation` | Hosts an event | Date, time, place, RSVP |
| `submission_request` | Asks for something back | Deadline, exactly what to send, reply path, **collation** |
| `notice` | Informs of something happening *to* residents | Dates, impact, duration |

`submission_request` was the dominant gap: **28 of 48 topics** in the round-2 research. It is also
the only shape that produces a *list the board then acts on*, and the shared inbox (W34) already has
the AI categorisation to collate replies rather than making a board member scrape forty emails.

### 4.2 The art sourcing reversal

The original plan — recolour an open illustration set — does not survive contact with reality. A
live query of unDraw's catalogue for our ten topics returned **one clean hit**: `dog waste` → 0
results, `noise` → 0 results, parking/speeding/lawn/litter → fuzzy-match noise. No illustration
library on the market draws neighbourhood conduct; they all serve SaaS marketing pages. Material
Symbols (Apache-2.0, 4,268 glyphs) covers 9.5 of 10.

This is a coverage problem, not a style problem, and it violates the requirement that *no art step
ever blocks adding a topic*. Resolution in §8.

### 4.3 Confirmed live bugs

Both verified against source, not taken on the agents' word.

**Bug A — the dues reminder renders full-bleed in classic Outlook.**
`apps/hoa/src/lib/dues-reminders/render.ts:151` centres the email with
`<div style="max-width:600px;margin:0 auto">`. The Word engine honours neither `max-width` nor
`margin:auto`, so the email spans the entire reading pane; `border-radius` and `overflow:hidden`
are dropped too. Already shipping.

**Bug B — the existing template library sends emails with holes in them.**
`apps/hoa/src/lib/communications/send.ts:247` builds a merge bag of exactly four keys —
`owner_name`, `recipient_name`, `association_name`, `unit_id`. `renderTemplate`
(`templates.ts:22-33`) blanks unknown fields silently rather than throwing. Diffing that bag against
every seeded template yields **71 merge fields that resolve to empty string**, including
`amount_due`, `due_date`, `meeting_date`, `cure_deadline`, `fine_amount` and `property_address`.

A board member who selects the seeded dues reminder and sends without hand-editing delivers:

> your dues of &nbsp; are due on .

This reframes the composer: **declared questions are the fix, not a nicety.** The answers become
the merge bag.

## 5. Data model

Extend `communication_templates`. Do not add a parallel global table — a union at query time
complicates every read path for no gain.

### 5.1 Global templates

`organization_id` drops `NOT NULL`. **`NULL` means global.**

The RLS change contains the trap. The current policy (`migrations/0018_communications.sql:233-234`)
is `FOR ALL` with a `USING` clause and **no `WITH CHECK`** — and Postgres reuses `USING` as
`WITH CHECK` when it is absent. Appending `OR organization_id IS NULL` to that single policy would
therefore let any authenticated tenant **INSERT and UPDATE rows in the global library**.

It must become four per-command policies:

| Command | Rule |
|---|---|
| `SELECT` | own-org rows **OR** `organization_id IS NULL` |
| `INSERT` | `WITH CHECK`: `organization_id = <caller org>` (non-null) |
| `UPDATE` | `USING` **and** `WITH CHECK`: non-null own-org |
| `DELETE` | `USING`: non-null own-org |

Global rows are written by migration only, never by application code.

### 5.2 Category

One new value: **`community`**.

It must be added to the CHECK on **both** `communication_templates` (`0018:22-26`) **and**
`communications` (`0018:62-66`), in a single migration. Widening only the first lets template
selection and audience resolution succeed, then fails at the `communications` INSERT
(`send.ts:130-149`) with a raw Postgres constraint error *after* the user has clicked Send.

### 5.3 New columns

| Column | Type | Purpose |
|---|---|---|
| `topic_slug` | `text` | Stable identity across versions, e.g. `pet-waste` |
| `shape` | `text` CHECK | `reminder` \| `invitation` \| `submission_request` \| `notice` |
| `questions` | `jsonb` | Declared typed questions (§9.1) |
| `visual_block` | `jsonb` | Block kind + asset reference (§8) |
| `accent_color` | `text` | Hex, validated for dark-mode survival (§7.3) |
| `source_template_id` | `uuid` | Provenance when an org clones a global to customise |

The existing `variables jsonb` column stays as the derived merge-field list. `questions` is
separate — a question is not a variable, it is what *produces* one.

## 6. Authoring and distribution

Templates are authored as typed source in the repo and applied by an idempotent migration keyed on
`(topic_slug)` where `organization_id IS NULL`.

Global means *shipped as data*. The library is versioned, diffable, reviewable in PR, and an
improvement reaches every org at once instead of requiring a seed run per tenant.

## 7. Email rendering

### 7.1 Shell

`<table width="600">` with `role="presentation"`, not a `max-width` div. This is Bug A's fix, and it
lands **before** any template work so the six phase-1 templates do not inherit it.

### 7.2 Visual block rendering — image-based blocks

Applies to the `illustration`, `map` and `photo` kinds. The `meter` kind is not an image and is
specified in §8.1.

At most one **opaque raster** per email:

- 600×200 CSS px, delivered at 2x (1200×400).
- PNG for artwork, JPEG for photographs.
- Background **baked into the pixels** at accent-8%-over-`#FAFAFA`. Never transparent, never
  `#ffffff`.
- The containing `<td>` painted the same colour via **both** `bgcolor` and inline style, so a
  blocked image still reads as deliberate rather than broken.

Rationale: mail clients invert CSS colours but never image pixels. An opaque image with a baked
background is the only thing guaranteed to render correctly in both light and dark mode.
Transparent PNGs are correct for logos and wrong for banners — the generic advice does not apply.

### 7.3 Dark mode

Gmail iOS and classic Outlook Windows apply **full** forced inversion with no opt-out. Outlook.com,
new Outlook and Gmail Android apply **partial** inversion, which is the dangerous one: it flips
backgrounds it judges light while leaving colours it judges fine, producing dark-on-dark text and
vanished accent headings.

Two mechanical rules, both lint-enforced:

1. Every element that sets `background-color` also sets `color`, inline, together. Never one alone.
2. Every accent has luminance **0.10–0.30**. Light and pastel accents invert to near-white and
   disappear. This constraint will reject some colours a designer wants; it is not negotiable.

### 7.4 Asset hosting

Committed static files at `apps/hoa/public/email/v1/`, served over HTTPS from the production app
domain behind a new **`EMAIL_ASSET_BASE_URL`** env var that **fails loudly** when unset.

- **Not** `NEXT_PUBLIC_APP_URL` (the existing `appUrl()` helper in `apps/hoa/src/lib/email.ts`).
  That bakes `localhost:3000` or a Vercel preview hostname into permanently-delivered mail. It
  renders correctly in local testing and is unfixable once sent.
- **Not** Supabase Storage. Every bucket is private behind expiring signed URLs
  (`0003_storage_policies.sql`), which mail clients cannot use, and Gmail's image proxy caches on
  first fetch.

The path is versioned. A published file is never mutated.

### 7.5 Excluded techniques

No VML — a real maintenance tax across dozens of templates, and nothing here needs a background
image or gradient. **The band is a solid `bgcolor`, not a CSS gradient**, which the Word engine
drops entirely. No CID embedding — it inflates every message, shows a paperclip, and is unreliable
in exactly the webmail clients that already display images fine.

### 7.6 The invariant

> Delete every `<img>` and the email must still be complete and actionable.

Deadlines, affected streets, event dates and reply instructions live in HTML text. Always. The
visual block is decorative reinforcement and never the message. Enforced by lint, because the people
testing will be using Gmail and will never see the failure.

## 8. The visual block system

Four block kinds; `visual_block` names which one a template uses.

**Pictogram panel — the baseline.** A Material Symbols glyph (Apache-2.0) composed with one or two
in-house flat SVG props on an accent-tinted panel, drawn by a single renderer and rasterised to PNG
at build time. Covers 9.5/10 topics, costs nothing in licensing, and makes **a new topic a one-line
config change**. No art step ever blocks a template.

**Commissioned scene — the upgrade.** Warm, on-topic illustration for the highest-traffic topics.
Because `visual_block` is a data field, an upgrade is a data change, not a code change.

**Meter — a deterministic ratio against a policy limit.** Not an image at all: nested `<table>`
cells with `bgcolor` fills. See §8.1.

**Map** — community-specific diagrams. Phase 2.
**Photo** — real images from the app. Phase 2, and gated on the privacy rules in the catalogue.

Accepted cost: two rendering paths rather than one.

### 8.1 Meter vs chart — a distinction that matters

§10 cuts the chart block because the data is thin and statistical aggregates can re-identify a
household. That reasoning does **not** extend to every number in an email, and conflating the two
would have cut something valuable.

| | `chart` (cut) | `meter` (in) |
|---|---|---|
| Shows | A statistical aggregate over time or category | One exact ratio against a published policy limit |
| Truth status | An estimate, sensitive to volume | A fact — the number is always exactly right |
| Re-identification | Real risk in a small association | None: a total against a published cap |
| Minimum volume | Needs suppression below 5 | None |
| Source data | Free-text, AI-populated categories | Board-set policy plus a count of units |

A meter is a fact, not a statistic. It needs no threshold, no suppression and no caveat, which is
precisely why it can ship when the chart cannot.

Rendered as HTML tables with `bgcolor` fills — no image, ~2KB, renders identically in classic
Outlook with images blocked, survives dark mode for free.

### 8.2 Worked example — the lease cap notice

The template that motivated the meter block, and the one that proves it.

Associations cap the share of units that may be leased. Exceeding the cap is not a matter of taste:
FHA and Fannie Mae owner-occupancy requirements mean units in an over-cap association can become
**unmortgageable**, which hits resale value for every owner. That is the substance behind the
"please be aware that…" the board is trying to write.

The data is already modelled and needs no new query layer:

| Value | Source |
|---|---|
| Cap percentage | `associations.lease_cap_pct` (board-set, authoritative) |
| AI-suggested cap | `associations.lease_cap_ai_suggested_pct` + `lease_cap_ai_source` (advisory, read from governing docs) |
| Current leased count and % | `getLeaseStats()` — `apps/hoa/src/lib/leases.ts:74` |
| Remaining capacity | `maxLeasable` — computed in the same helper, `leases.ts:126-127` |
| Waiting list | `lease_waiting_list`, FIFO, partial-unique on `status='waiting'` |

The meter renders current-versus-cap; the body carries the counts and the financing consequence as
text, per §7.6.

Two constraints specific to this template:

- **Never name who is leasing, who is waiting, or list unit numbers.** The email carries totals
  only. `lease_waiting_list.property_id` must never reach the rendered output.
- **State the cap as the governing documents state it**, and cite the section. Boards paraphrase
  caps inconsistently, and a paraphrase in a mass email can be read as a rule change. Where
  `lease_cap_pct` is null the template must refuse to send rather than guess — and it must never
  fall back to `lease_cap_ai_suggested_pct`, which is advisory and unreviewed.

## 9. Composer

### 9.1 Declared questions

Each template ships 3–5 typed questions, answerable in about twenty seconds, favouring closed
options over open prose, and never asking anything the app already knows (community name, sender,
recipient list).

The wizard gains a `QuestionStep`. Answers are merged into subject and body in `handleSubmit`
**before** `sendCommunication` is called.

### 9.2 The merge-bag contract

This is Bug B's fix. Per-template merge bags replace the hardcoded four keys, and the send path
switches from `renderTemplate` to the already-existing `renderTemplateStrict`
(`templates.ts:37-43`), which throws on a missing field.

**Ordering matters:** strict rendering must land *together with* per-template bags. Enabling it
against today's four-key bag would break every existing template at send time.

### 9.3 AI interview — deferred

For topics outside the library, an adaptive interview drafts from scratch and the result becomes a
saveable template. Phase 2. The infrastructure exists (`packages/ai/src/tasks/suggest-fields.ts`
establishes the house pattern: structured JSON, every suggestion carrying a `reasoning` so it never
looks like magic, human accepts or edits).

## 10. The chart block — cut from phase 1

This section concerns **statistical charts only**. The `meter` block (§8.1) is unaffected and ships
in phase 1.

`visual_block` retains `chart` as a valid kind so it can land later without a migration, but no
phase-1 template depends on it.

The data does not support it yet:

- `hoa_violations.violation_type` is **unvalidated free text populated by an AI guess**
  (`violations.ts:14` validates only `z.string().min(2)`; `Wizard.tsx:349` defaults it to a model
  output). Grouping by it charts typo variants as categories. It must be **blocked** in any chart
  recipe.
- Speeding has no data at all. Trees and grass share one bucket. Water intrusion has none.
- **Re-identification is a privacy incident, not a polish issue.** In a 40-home association, a
  category chart in a community-wide email can identify the household. Any future chart needs cell
  suppression below 5.
- No migration seeds `resident_violation_reports` or `tickets`, so real per-org volumes are
  unmeasured. The block may refuse to render for every customer.

When it does land: a whitelist of two vetted recipes, **rendered as nested `<table>` cells with
`bgcolor` fills, never as a generated PNG.** That works in the Word engine, renders identically with
images blocked, costs ~3KB instead of a 50KB fetch, and survives dark mode for free. It also
preserves a property worth protecting — every image we ship is static and recipient-independent, so
no image URL ever carries a per-recipient token, which is the pattern spam filters read as a
tracking pixel.

## 11. Phase 1 scope

**Seven** broadcast templates spanning at least three shapes, so the shape abstraction is proven
rather than assumed. Illustration, map and meter blocks.

The seventh is the lease cap notice (§8.2), added after the six were chosen. It earns the scope
increase: the query layer already exists, it proves the meter block — the only visual that is
immune to image blocking — and it is the highest-stakes template in the library, because the
consequence it explains is units becoming unmortgageable.

Ordered:

1. Fix Bug A — table-based shell.
2. Migration — nullable `organization_id`, four RLS policies, `community` category on both CHECKs,
   five new columns.
3. Pictogram renderer and build-time rasterisation.
4. Meter renderer — nested tables, `bgcolor` fills, no image.
5. Seven templates with copy, questions and merge fields.
6. `QuestionStep` in the wizard; per-template merge bags; strict render.
7. Tests.

Bug B's fix for the **existing** 17 templates is a separate commit — it is a live production issue
independent of this feature.

## 12. Open decisions

**One-to-one property notices.** Roughly seven catalogue topics are `single_property` — an overgrown
yard, an untrimmed tree, water running off one lot onto common ground. These overlap the existing
violation machinery. Whether this library owns them, or they route to violations, is unresolved and
out of phase 1.

**Legally sensitive templates.** The catalogue flags several warranting review by counsel before
shipping: `electronic-notice-consent` (statutory consent rules vary by state and silence must never
be treated as consent), `proxy-and-ballot-return` (form, signature, secrecy and delivery are all
statutory), `age-verification-survey-55plus` (the HOPA exemption is the one lawful age
segmentation and only if executed exactly), and both neighbour-concern templates (defamation and
familial-status exposure).

**Word-engine sunset.** Microsoft ends support for Word-engine Outlook in October 2026. This is not
permission to drop table layout: enterprise installs persist to roughly 2028–29, and Outlook
concentrates exactly where HOA **board members** sit, even though residents mostly do not.

## 13. Testing

| Check | Asserts |
|---|---|
| HTML snapshots | Rendered output per template is stable |
| Image-stripped render | Email remains complete and actionable with every `<img>` removed |
| Accent validation | Every accent within luminance 0.10–0.30 |
| Asset opacity | Every generated PNG fully opaque, no alpha |
| Colour pairing | No element sets `background-color` without `color` |
| Strict render | Throws on any missing merge field |
| Migration | Both CHECK constraints widened; global rows readable, not writable, by a tenant |
| Asset base URL | Build fails when `EMAIL_ASSET_BASE_URL` is unset |
| Meter render | Correct bar proportions at 0%, at the cap, and over the cap |
| Lease cap guard | Refuses to send when `lease_cap_pct` is null; never substitutes the AI-suggested value |
| Lease cap privacy | No unit number, resident name or `property_id` in rendered output |

## Appendix A — Catalogue

_Pending: final merged catalogue from 88 raw candidates._
