# BL-102 Communications: simple and self-service

Research plan, 2026-10-19. Read-only audit of the outbound communications module in `apps/hoa`, a competitor benchmark, and a ranked build plan. It is a companion to `docs/research/2026-10-inbox-plan.md` (BL-101, inbound inbox). That file was not yet on disk when this was written, so section 6 proposes the shared shape and leaves the inbox details to it.

Owner request: *"review all the communication module and make it very simple and self service."*

Principle: **one obvious path, smart defaults, AI help.** The board types what it wants to say. The app proposes everything else. The board reviews a phone preview and sends.

Rules kept throughout this plan:
- Residents get nothing new unless the board sends it. AI only drafts; every send is still a board click.
- The outbound guard (BL-004, `packages/observability/src/outbound-guard.ts`) stays the one choke point. Every new path calls the existing guarded `sendEmailBatch` and `sendSms`.
- Examples are synthetic (Elm St, Maple Ct, "Lakeside HOA"). No PII.

---

## 1. Audit: what a volunteer meets today

### 1.1 Map of the module

| Area | Where | Notes |
|---|---|---|
| Composer | `app/(dashboard)/communications/new/NewCommunicationWizard.tsx` (972 lines) + `AudienceStep.tsx`, `QuestionStep.tsx`, `SectionToggles.tsx`, `SpanishVersion.tsx` | Three steps: Topic and audience, Message, Review and send |
| Send pipeline | `lib/communications/send.ts` (`sendCommunication`, `getResendPreflight`, `resendFailedRecipients`) | Resolves the audience, writes `communications` and `communication_recipients`, sends email in batches of 100 (Resend), sends SMS one at a time (Vonage), and writes portal rows |
| Audiences | `lib/communications/audience.ts` | `everyone`, `owners_only`, `tenants_only`, `late_on_dues`, `open_violations`, `specific_units`, `specific_residents`, `board`, `manual_emails`, `precomputed` |
| Merge fields | `templates.ts`, `merge-bag.ts`, `community-templates/merge-bag.ts` | Strict render: a missing `{{field}}` fails that recipient |
| Spanish | `bilingual.ts`, `SpanishVersion.tsx`, `/api/ai/translate-communication` (W31 translate) | English first, then an "Español" section, for everyone |
| SMS | `sms-body.ts`, `lib/sms.ts` | One text of at most 279 characters. A longer text is cut and ends with a portal link |
| Official notice | `official-notice.ts`, `official-notice-actions.ts` | CA §4040 e-consent only, behind `M1_APPLIED` |
| Templates | `communication_templates` table, `community-templates/registry.ts` + 19 topic files | See 1.3 |
| Results | `communications/[id]/page.tsx`, `CommunicationActions.tsx` | KPIs, recipient table, Failed / Opened / Not opened chips, "Resend to N failed" |
| Tracking | `app/api/webhooks/resend/route.ts` | Email delivered, opened, clicked, bounced, replied. Nothing for SMS |
| Preferences | `resident_communication_preferences` (0018) | `email_opt_in`, `sms_opt_in` (default false), `language`, `quiet_hours`. Only `lib/resident-notify` reads it |
| Unused AI | `packages/workflows/src/W31-comm-composer/index.ts` | Drafts subject and body from topic, audience, intent and tone. **Not wired into the app** |
| Guides | `content/guide/communications/communications-send-announcement.md`, `communications-segments-sms.md` | |

### 1.2 Findings, most serious first

**Correctness and trust problems.** These are "it says it did it, but it didn't" bugs.

1. **Scheduled messages never send.**
   - `sendCommunication` writes `status='scheduled'` with queued recipient rows, and its comment says "the cron picks it up at `scheduled_for`".
   - No cron or Inngest job reads scheduled communications. `vercel.json` has only `recurring-events`, and nothing in `packages/jobs/src` touches them. The index `communications_scheduled_idx` is there, waiting for a dispatcher that was never built.
   - The wizard shows a **Send at** field and a **Schedule** button, and the guide tells boards to use them. A scheduled water-shutoff notice would quietly never go out.
   - A dispatcher alone would still fail on templates with questions. The answers (`extraFields`) are never saved, so a later render would hit the strict check and fail every recipient. `CommunicationActions.tsx` already works around the same gap for resends by asking the board to retype values.

2. **SMS can report "sent" when nothing was sent.**
   - `lib/sms.ts` returns `{ ok: true, messageSid: null }` when `VONAGE_API_KEY` or `VONAGE_API_SECRET` is missing but `VONAGE_FROM_NUMBER` is set.
   - `docs/research/2026-10-competitors.md` and `docs/parking-lot.md` say SMS has no production keys (it is parked).
   - The wizard offers SMS anyway, with no "texting isn't set up" state.

3. **Broadcasts ignore resident preferences.**
   - `resolveAudience` and `deliverableChannels` text anyone with a phone on file. They never read `resident_communication_preferences.sms_opt_in` or `email_opt_in`.
   - BL-082 resident notices do honour them (`lib/resident-notify/run.ts`), so the app has two policies.
   - Residents have no UI to set preferences, so in practice nobody has a row.
   - TCPA consent for broadcast texts is a real exposure once SMS keys are live. TownSq sends emergency SMS **only to residents who opted in** (see section 2).

4. **New HOAs see no templates.**
   - Dues, meeting, welcome, violation, ARC and announcement templates were seeded for one org only. `seed-communication-templates-originals.sql` hard-codes the Madison Park org id.
   - The global templates (0044) are all `category='community'`.
   - The wizard filters templates by **Topic**, and the default topic is *Announcement*. A new HOA therefore sees "No Announcement templates yet", and the same for Dues, Meeting and Emergency. The 19 community templates appear only under the *Community* or *Custom* topic.

5. **"Not opened" is misleading.**
   - The view matches `queued`, `sent` and `delivered` rows per channel row, not per home. SMS and portal rows can never become "opened", so every texted home appears as "not opened".
   - A home on email and SMS appears twice.
   - Apple Mail Privacy Protection pre-fetches images, which inflates opens. The page should say "opened (approximate)".

6. **The official notice is invisible.**
   - `M1_APPLIED=false`, so the "This is an official notice" box never renders.
   - Even when it does, it covers CA only.
   - Nothing connects the notice to the Meetings record or to the FL 14-day / 48-hour rules that already exist in `lib/fl-compliance/rules.ts` (`NOTICE_RULES`, `noticeRuleFor`).

7. **Unwired W31 has a latent bug.** `W31-comm-composer/prompt.ts` tells the model to use `{{ unit_address }}`. That field is not in `buildRecipientBag`, so any draft that used it would fail every recipient under the strict render. Fix this before reuse.

**Jargon and expert-only UI.** A first-time board member hits these:

| Where | What they see | Problem |
|---|---|---|
| Body field | Monospace textarea, hint "HTML. {{ variables }} render per recipient.", placeholder `<p>Hi {{ recipient_name }}, ...</p>` | Volunteers don't write HTML. This is the biggest single blocker |
| Subject | "{{ variables }} render per recipient." | Jargon |
| Topic | Required first choice from 10 categories (ARC, Financial, Custom…) | An internal filing field shown as the first decision |
| Template | Hidden behind Topic; empty for new orgs | Dead end (finding 4) |
| Sections | "Unchecking a section … discarding any manual edits. A section marked *needs an answer* is left out until…" | Too much to read; silently loses edits |
| Details | "Your answers fill in this template's merge fields." | Jargon |
| Channels | Email / SMS / Portal checkboxes; picking a template overwrites them | Surprise. The guide has to warn about it |
| Spanish | A second HTML textarea plus a mandatory "I've read" tick, cleared on any English edit | Correct, but heavy |
| Resend dialog | "values typed into the send wizard … are not stored on the message itself. Retype them" | Exposes an implementation gap to the user |
| Results | "Delivered %" counts portal rows as delivered | Inflated |

**Settings that should be defaults.**
- Channels should follow urgency.
- Audience should default to "All homes", but say so in words.
- Send time should be "now", with a "Later" link.
- Spanish should default on for HOAs that have used it before (a per-association default in `associations.compliance_settings` jsonb, which needs no migration).
- Topic should be inferred, never asked.

**What a first-timer can't do without help:**
- write formatted text (finding: HTML body);
- message one street;
- know that a members' meeting needs 14 days' notice in FL;
- know whether a text actually went out;
- follow up with non-openers.

### 1.3 The five jobs, step by step (today)

Counting rules:
- **Steps** are the user actions on the happy path: clicks, selections and text entries.
- **Fields** are the inputs visible on the way.
- **Decisions** are choices the user must understand to get it right.

The example is a new HOA (no seeded templates).

**Job 1: Announcement to all owners.**
1. Communications.
2. New message.
3. Topic (leave "Announcement"? a decision).
4. Audience: Owners only.
5. Continue.
6. Template dropdown is empty (dead end).
7. Type the subject.
8. Type the body *as HTML*.
9. Continue.
10. Check channels (Email + Portal by default).
11. Send now.

Total: 11 steps, 8 fields (Topic, Audience, Template, Subject, Body, Spanish, Channels, Send at), 6 decisions.

**Job 2: Urgent water shutoff by SMS and email.**
- Same as Job 1, plus: Topic = Emergency, and tick SMS under Channels.
- No live character count. There is only a static "Up to 279 characters" hint, and the board never sees the actual text.
- No count of how many homes have a mobile number.
- SMS may silently not send (finding 2).

Total: 12 steps, 8 fields, 7 decisions, plus 2 invisible risks.

**Job 3: Official meeting notice.**
1. Communications.
2. New message.
3. Topic = Meeting.
4. Audience = Owners only.
5. Continue.
6. Template "Meeting notice" (only for the one seeded org).
7. Answer 4–6 questions (date, time, place, agenda…).
8. Check the sections.
9. Edit the HTML.
10. Continue.
11. Channels.
12. Official-notice box (CA only, hidden today).
13. Read the paper list.
14. Send.

Nothing checks the lead time against the meeting date. Nothing links to the Meetings record. The board must know the statute itself.

Total: about 14 steps, 12 or more fields, 9 decisions, plus legal knowledge.

**Job 4: Send to one street (Elm St, 12 homes).**
- Not possible as one message.
- Workarounds:
  - *Specific property*, one home per message: about 11 steps × 12 homes, and 12 separate records.
  - *Custom contacts*: type 12 emails by hand, and lose the portal and merge names.
- Effectively 130 or more steps.

**Job 5: See who didn't open, and follow up.**
1. Communications.
2. Find the row.
3. Open it.
4. "Not opened" chip.
5. Read a list mixed with SMS and portal rows.

There is no follow-up action. "Resend" only retries *failed* emails. To chase non-openers the board must start a new message and pick each home again.

Total: 5 steps to look, and the follow-up is a dead end.

---

## 2. Benchmark

| Product | How a board sends a message | What to borrow |
|---|---|---|
| **PayHOA** | Mass email, text and **automated phone call** to the community or tagged groups. Scheduling. Per-owner communication log. Delivery, open and click tracking. Mailroom for USPS letters ($1.05–1.25 a piece). "Free and unlimited" broadcasts. ([payhoa.com/features/communications](https://payhoa.com/features/communications/)) | **Tags** for segments. Per-home communication log. Free messaging as a selling point |
| **TownSq** | "News & Events" → new announcement → **"Emergency Broadcast" toggle**. The toggle switches to SMS-safe format and a character limit, and texts only residents who **opted in**. Everyone else still gets email and push. ([townsq.io emergency SMS](https://townsq.io/new-releases-and-updates/send-emergency-announcements-via-sms-with-townsq)) | **One urgency toggle drives channel and format.** Opt-in-only SMS, with email and push as the fallback |
| **AppFolio (HOA)** | Bulk text and email to an association, owners, board or vendors, stored as a system of record. Voice broadcast through SimpleVoIP (up to 1,000 calls). Postal mail. ([appfolio.com/hoa communication](https://www.appfolio.com/hoa/community-association-communication)) | One system of record for every message, inbound and outbound |
| **Buildium** | Announcements to a whole association by text, email and Resident Center, from mobile too. Can target owners and/or tenants. Ships sample email copy. ([buildium.com HOA communications](https://www.buildium.com/features/homeowner-and-board-communications/)) | Post from a phone. Starter copy included |
| **Vantaca** | Broadcast email from templates, reviewed before sending. Sends **by each homeowner's preference (paper or electronic), which the homeowner controls**. Workflow automation. ([vantaca.com communication tools](https://www.vantaca.com/vantaca-communication-tools)) | Preference-driven channel per resident (Phase B) |
| **HOA Express** | Three steps: (1) draft with photos, files and links, plus **"Send preview to myself"**; (2) pick recipients by group, account type or **paid / not paid**; (3) reply settings and send time (up to a year ahead, repeatable). Text alerts for short urgent notes. ([help.hoa-express.com](https://help.hoa-express.com/en/articles/3750432-sending-blast-emails)) | Plain-language audience list including "haven't paid". Send-a-preview-to-me |
| **Mailchimp** | Visual editor, mobile and desktop preview, AI content assist. **"Resend to non-openers"** with a new subject line, one click from the report. ([mailchimp.com help](https://mailchimp.com/help/resend-non-openers-mobile-app/)) | **Resend to non-openers** from the results page. Phone preview |
| **Flodesk-style** | No code at all. Pick a good-looking layout, type into it, and the brand is applied automatically | No HTML anywhere. The brand comes from settings |
| **Nextdoor-style posting** | One text box ("What's on your mind?"). Category, audience and urgency are light chips under the box | The **single box** as the entry point |

What the market converges on:
- one compose surface;
- plain-language groups (including paid / not paid);
- an urgency switch that adds texting;
- a preview;
- a report with a follow-up action.

Nobody in the HOA set drafts the audience, channel and timing for the board. That is where AI can make this app the simplest one.

---

## 3. Target design

### 3.1 The one path

```
[ What do you want to tell residents?                         ]
[ e.g. "Water off on Elm St Thursday 9am–1pm for a main repair" ]
                                              [ Draft it ]   or pick a template ▸

→ Draft card (all editable inline, plain text, no HTML):
   To:      Homes on Elm St (12)            [change]
   How:     Urgent → Text + email + portal  [change]   "12 texts · 160/279 characters"
   When:    Now                             [later]
   Spanish: Included (AI draft — check names, dates and times) [remove]
   Subject: Water shut-off on Elm St, Thu 9am–1pm
   Message: …

→ Phone preview: [Email] [Text] [Portal] [Español]  — exactly what one sample home gets
→ [ Send to 12 homes ]
→ Results: "Reached 12 of 12 homes. 7 opened the email. 5 haven't." [Text the 5] [Email them again]
```

Everything else moves under one **More options** disclosure: board-only, custom contacts, sections, merge-field details, and the official-notice override.

### 3.2 Target steps for the five jobs

| Job | Today: steps / fields / decisions | Target: steps / fields / decisions | Target path |
|---|---|---|---|
| 1. Announcement to all owners | 11 / 8 / 6 (dead-end template) | **5 / 1 / 1** | New message → type a sentence → Draft it → glance at the preview → Send |
| 2. Urgent water shutoff, SMS + email | 12 / 8 / 7 (+ silent SMS risk, no text preview) | **5 / 1 / 1** | Same as 1. AI marks it urgent, so text + email are on, with the character count and number of texts shown |
| 3. Official meeting notice | ~14 / 12+ / 9 (+ statute knowledge) | **4 / 0 / 1** | Meetings → meeting → "Send notice" → pre-filled from the meeting, lead-time check against the state rule, paper list if needed → Send |
| 4. One street | not possible (~130+) | **6 / 2 / 2** | Type "…owners on Elm St" (AI picks the street) or To → "A street" → Elm St → Draft → Send |
| 5. Who didn't open, then follow up | 5 to look, follow-up is a dead end | **3 / 0 / 1** | Results page leads with "5 haven't opened" → [Text them] or [Email again] → confirm |

---

## 4. Plan items

Each item gives the value, the effort (in agent-days, including tests), whether it needs a migration, the risk and the files touched. All paths are under `apps/hoa/src/` unless shown.

### A1. Scheduled messages actually send (and stop lying until they do)

- **Value.** Fixes a trust-breaking bug: the board believes a notice is going out and it isn't. This comes before any new UI.
- **What.**
  - **Same day:** hide **Send at** and **Schedule** behind a flag until the dispatcher ships. The guide line about Send at changes with it.
  - **Inngest job `communications-scheduled-dispatch`, every 5 minutes.**
    - Select `communications` where `status='scheduled' AND scheduled_for <= now()`.
    - Claim each row with an atomic `UPDATE … SET status='sending' WHERE status='scheduled'`, so it is sent at most once.
    - Deliver its `queued` recipient rows through a `deliverQueued(commId)` function extracted from `sendCommunication` steps 5–6. It uses the same guarded senders, plus `fetchOrgSandbox`.
  - **Answers without a migration.** At schedule time, substitute the template-question answers into the stored subject and body with a *partial* render. The partial render replaces only keys in the answer bag and leaves ambient fields like `{{recipient_name}}` intact. The later strict render then has everything it needs. Phase B (B1) replaces this with stored `merge_values`.
  - **Cancel.** "Cancel scheduled message" sets `status='cancelled'`. That status is already allowed by the CHECK constraint.
- **Effort.** 0.25 d for the stopgap, 2 d for the full fix.
- **Migration.** None. Status values and the index already exist.
- **Risk.** Medium.
  - Double-send if the claim is not atomic. Test the claim race.
  - Recipients were resolved at schedule time, so a home sold in between still gets the message. Show "Recipients were set when you scheduled this" on the detail page.
- **Files.**
  - `lib/communications/send.ts` (extract `deliverQueued`)
  - new `lib/communications/partial-render.ts` (+ test)
  - `packages/jobs/src/communications-scheduled.ts` (+ test)
  - `packages/jobs/src/index.ts`
  - the Inngest serve route that registers jobs
  - `communications/[id]/CommunicationActions.tsx` (Cancel)
  - `NewCommunicationWizard.tsx` (flag)
  - `content/guide/communications/communications-send-announcement.md`

### A2. "What do you want to tell residents?": one box, AI drafts everything

- **Value.** The core of BL-102. A volunteer writes one sentence. The app proposes the subject, body, audience, urgency and channels, time, template match and Spanish. The board reviews and sends. This takes Jobs 1, 2 and 4 to about 5 steps.
- **What.**
  - **New route `POST /api/ai/compose-communication`.**
    - Board-only, behind `requireAiQuota`, using the RC-1..RC-13 conventions.
    - It wraps a refactored W31 composer: the model call is injected via `runMain`, like `translate.ts`, not its own OpenAI client. This avoids the team-level `AI_MODEL` drift.
    - The prompt drops `{{ unit_address }}` (finding 7) and allows only fields `buildRecipientBag` supplies.
  - **Output, validated by Zod:**
    - `subject`, `bodyHtml` (restricted tags);
    - `urgency: 'routine'|'urgent'`, `category` (from the existing CHECK list);
    - `audience` as a **closed enum** that maps to existing `AudienceKind`s, plus an optional `street` name, which A5 validates against real streets;
    - `sendAt` suggestion (null = now), `templateSlug` match, `needsSpanish: boolean`;
    - `missingFacts[]` (for example "what time does the water come back?"). These are shown as prompts, never invented.
  - **The AI never sends and never picks recipients by id.** It suggests an audience *kind*. The server resolves it with `resolveAudience`, and the count is shown before Send.
  - **Spanish.** If the association's default is on (`associations.compliance_settings.comms.spanish_default`, a jsonb key with no migration), the app chains the existing translate call. The board still sees and keeps the existing "read the Spanish" confirmation. It becomes one tick on the preview, not a second form.
  - **The wizard's three steps collapse into one page:** the box, then the draft card, then the preview and Send. The existing state machine (audience defs, validation, `sendCommunication` input) is reused unchanged underneath.
- **Effort.** 3 d.
- **Migration.** None.
- **Risk.** Medium.
  - The AI could invent facts. Mitigations: the existing W31 "never invent" rule, `missingFacts` prompts, a hard rule that an amount or date not in the board's sentence is flagged, and the board always reviewing.
  - The AI could pick a wrong audience. The count and plain-language label sit right next to Send.
  - AI outage: the box falls back to "Write it yourself", which is the plain editor from A3.
- **Files.**
  - new `app/api/ai/compose-communication/route.ts` (+ test)
  - `packages/workflows/src/W31-comm-composer/{index,prompt}.ts` (+ new test)
  - `communications/new/NewCommunicationWizard.tsx` (split into `ComposeBox.tsx` and `DraftCard.tsx`)
  - `communications/new/page.tsx`
  - `lib/communications/audience.ts` (map the enum)

### A3. Plain editor; no HTML, no `{{ }}`

- **Value.** Removes the single biggest expert-only barrier.
- **What.**
  - Replace both monospace HTML textareas (English and Spanish) with a small rich-text editor: bold, list, link, paragraph. It serializes to the same restricted tag set W31 emits.
  - Merge fields become chips ("Resident's name", "HOA name"), inserted from a menu and stored as `{{recipient_name}}`.
  - Raw HTML stays available under More options → "Edit as HTML" for the rare power user.
  - Existing HTML templates load into the editor. Anything outside the allowed tags keeps that template in HTML mode, with a note.
- **Effort.** 2 d.
- **Migration.** None.
- **Risk.**
  - Low–medium: editor round-trip losses on rich community templates (tables, the lease-cap meter). Keep those templates in a read-only "designed layout" preview with editable question fields, rather than editing their HTML.
  - Bundle size: pick a lightweight editor or a minimal `contenteditable`.
- **Files.**
  - new `components/ui/PlainEditor.tsx`
  - `NewCommunicationWizard.tsx`
  - `new/SpanishVersion.tsx`
  - `lib/communications/display.ts` (shared sanitizer)

### A4. Built-in templates for every HOA, tied to state rules

- **Value.** A new HOA gets useful starters on day one, and the meeting notice knows the law.
- **What.**
  - **Code-registry starters**, like `community-templates/registry.ts`, available to every org with no DB rows:
    - dues reminder;
    - meeting notice (members / board / special);
    - water shut-off;
    - pool closing;
    - holiday schedule;
    - welcome;
    - severe weather (this one already exists as a community template).
  - Each starter declares a default `urgency`, `audience` and channels, so it fills the draft card like A2 does.
  - **Remove the Topic step.** Templates appear as a searchable chip row under the box, never filtered by category. The category is derived from the template.
  - **Meeting notice + state rules.**
    - When opened from Meetings ("Send notice"), it is pre-filled from the meeting row: date, time, place, agenda and type.
    - It calls `noticeRuleFor(meeting_type)` from `lib/fl-compliance/rules.ts`, and shows "Florida: members' meeting notice must go out at least 14 days before. This meeting is in 9 days." as a warning before Send.
    - For CA, the existing §4040 paper list shows once `M1_APPLIED` flips.
    - GA and TX: show "No state lead-time rule on file. Check your bylaws."
    - Never block a send; warn and record.
- **Effort.** 2.5 d.
- **Migration.** None. Starters can send with `templateId` unset. Org-saved templates keep using the existing `communication_templates` table ("Save as template" writes a row with `organization_id`, no migration).
- **Risk.**
  - Low–medium: statute wording. Reuse the `NOTICE_RULES` text that has already been reviewed, and link to the State Law page.
  - Duplicate entries for Madison Park, where seeded org templates coexist with the code starters. Dedupe by name in the list.
- **Files.**
  - new `lib/communications/starters/*.ts` + `index.ts` (+ tests)
  - `communications/new/page.tsx`
  - `NewCommunicationWizard.tsx`
  - `app/(dashboard)/meetings/[id]/…` (add a "Send notice" link with `?meeting=<id>`)
  - `lib/fl-compliance/rules.ts` (read only)
  - `lib/state-law.ts` (read state)

### A5. Audiences in plain language, including streets

- **Value.** "Owners on Elm St" and "Homes behind on dues" become first-class. Job 4 goes from impossible to 6 steps.
- **What.**
  - **Relabel:**

    | Today | New label |
    |---|---|
    | Everyone | All homes |
    | Owners only | All owners |
    | Tenants only | Renters |
    | Late on dues | Homes behind on dues |
    | Units with open violations | Homes with an open violation |
    | Specific property | One home |
    | Custom contacts | Someone outside the HOA |

  - **New "A street…" option.**
    - A server action lists distinct street names, parsed from `units.address_line1` (strip the leading house number and unit). It shows counts, for example "Elm St (12)" and "Maple Ct (8)".
    - The chosen street resolves to the existing `specific_units` kind with the matching unit ids.
    - The audience summary reads "Homes on Elm St (12)".
  - **Combinable owners-only filter:** "Owners on Elm St" is `specific_units` + owner role. Add an `ownersOnly` flag to `specific_units` resolution in `audience.ts`. This is a code-only option, and the jsonb `audience_definition` already stores arbitrary keys.
  - **Move to More options:** Board and "Someone outside the HOA".
- **Effort.** 2 d.
- **Migration.** None.
- **Risk.**
  - Low–medium: messy addresses ("123 N Elm Street" versus "Elm St"). Normalize suffixes and case, show the homes list before Send, and let the board untick homes.
  - Counts must agree with the send. Extend `audience-counts.test.ts`.
- **Files.**
  - `lib/communications/audience.ts`
  - new `lib/communications/streets.ts` (+ test)
  - `lib/communications/actions.ts`
  - `new/AudienceStep.tsx`
  - `lib/communications/audience.test.ts`

### A6. Channels picked from urgency; honest SMS

- **Value.** One question ("Is this urgent?"), answered by AI or a template, replaces three checkboxes. Texting stops lying.
- **What.**
  - **Routine** → email + portal. **Urgent** → text + email + portal (the TownSq model).
  - The board can still change it under "How".
  - Live **text counter** using `composeSmsBody` / `composeBilingualSms`: "160 of 279 characters · 12 homes have a mobile number · 0 texts cut short".
  - Cost line: "12 texts". Show a price only once SMS has a contracted rate. The owner's rule (memory) is SMS at most 279 characters, email unlimited, split on send. That is already implemented.
  - **`smsConfigured()` server check:**
    - If the Vonage env is incomplete, the Text option shows "Texting isn't set up for your HOA yet" and is disabled.
    - Fix `lib/sms.ts` to return `ok:false` when the keys are missing in production. Keep the dev no-op only when `VERCEL_ENV !== 'production'`.
  - **Stop template picks from overwriting channels** silently.
- **Effort.** 1.5 d.
- **Migration.** None. Urgency maps to `category='emergency'` for now, which the CHECK constraint already allows.
- **Risk.**
  - Medium: TCPA. Broadcast texts go to phones on file without recorded consent (finding 3). Until B3 ships, show "Texts go to residents with a mobile number on file" plainly, and keep SMS off by default for routine messages. The owner should confirm the consent policy before SMS keys go live. This is flagged in section 7.
  - The `lib/sms.ts` change could surface new "failed" rows in previews. Intended.
- **Files.**
  - `lib/sms.ts` (+ test)
  - `lib/communications/sms-body.ts`
  - `NewCommunicationWizard.tsx` / `DraftCard.tsx`
  - new `lib/communications/channel-defaults.ts` (+ test)

### A7. Phone preview of exactly what a resident gets

- **Value.** The board sees the real email, text and portal card before sending, which catches merge blanks and cut texts.
- **What.**
  - A server action `previewForSample(input)`:
    - resolves the audience;
    - takes the first recipient (or a synthetic "Sample Resident" when there is none);
    - renders through the **same** `buildEmailPayloads`, `composeSmsBody` / `composeBilingualSms` and `buildRecipientBag` used by the send.
  - It returns the HTML, the SMS text and the portal card. The preview cannot drift from the send.
  - Shown in a phone frame with tabs: Email / Text / Portal / Español.
  - A strict-render failure appears as "This message has a blank: *Due date*", not a per-recipient failure after the send.
  - **"Send a test to me"** (HOA Express pattern) emails the board member only, through the guard.
- **Effort.** 2 d.
- **Migration.** None.
- **Risk.**
  - Low. Preview names are a real resident's name shown to a board member who can already see the roster. The preview is never logged (no PII in logs).
  - "Send a test" must go only to the signed-in user's own address.
- **Files.**
  - new `lib/communications/preview-actions.ts` (+ test)
  - `lib/communications/email-payloads.ts` (read)
  - new `communications/new/PhonePreview.tsx`

### A8. Simple results page + "resend to those who didn't open"

- **Value.** It answers "did people get it?" in one sentence and makes the follow-up one click (the Mailchimp pattern). Job 5 drops to 3 steps.
- **What.**
  - **Headline per home, not per row:** "Reached 46 of 50 homes. 31 opened the email (approximate). 4 homes have no contact on file."
  - **Group recipient rows by `unit_id`**, with one line per home showing channel icons.
  - **"Not opened" counts email rows only.** SMS rows show "Texted" and portal rows show "In portal".
  - **Actions:**
    - **[Email again to the N who haven't opened]** opens the composer pre-filled. The subject is prefixed "Reminder:", and the audience is `specific_units` = the non-opening homes. It creates a **new** communication with `related_resource = {type:'follow_up', id:<original>}` (an existing jsonb column, no migration), so it is auditable, and the board still presses Send.
    - **[Text them]** does the same with the urgent channels.
  - The KPI "Delivered" stops counting portal rows as delivered.
  - Remove the "values are missing, retype them" dialog wording. Say "We need these details again to resend: Due date". B1 removes the need entirely.
- **Effort.** 2.5 d.
- **Migration.** None.
- **Risk.**
  - Low–medium: Apple MPP makes "not opened" an undercount, so label it approximate.
  - A follow-up must never send automatically. It always lands in the composer for review.
- **Files.**
  - `communications/[id]/page.tsx`
  - `communications/[id]/CommunicationActions.tsx`
  - `lib/communications/queries.ts` (per-home rollup)
  - `communications/new/page.tsx` (`?followUp=<id>&who=unopened`)
  - `lib/communications/send.ts` (accept `relatedResource`, already in the schema)

### A9. Hide advanced options; tidy the leftovers

- **Value.** A shorter page, so nothing on it needs a guide.
- **What.**
  - One **More options** disclosure holds:
    - Board-only audience;
    - outside contacts;
    - template sections;
    - "Edit as HTML";
    - the official-notice override (CA);
    - Portal on/off.
  - Delete the Topic select (A4).
  - Default send time is "Now", with "Later" as a link (only after A1).
  - Autosave a draft using the existing `status='draft'`, so a closed tab doesn't lose work.
- **Effort.** 1 d (after A2–A5).
- **Migration.** None. `draft` is an allowed status.
- **Risk.** Low. Drafts appear in the list under the existing Draft chip. Make sure drafts are excluded from resident-visible queries; `resident-announcements.ts` keys on `sent_at`, so they already are.
- **Files.**
  - `NewCommunicationWizard.tsx`
  - `communications/page.tsx`
  - `lib/communications/actions.ts` (saveDraft)

### A10. Guides rewritten for the new path

- **Value.** Help matches the screen. The guides drop "Topic", "HTML" and the channel-overwrite warning.
- **Effort.** 0.5 d.
- **Migration.** None.
- **Risk.** Low. Regenerate `generated/guide.ts`.
- **Files.**
  - `content/guide/communications/communications-send-announcement.md`
  - `content/guide/communications/communications-segments-sms.md`
  - new `communications-urgent-notice.md` and `communications-follow-up.md`

### A11. One "Messages" area with the inbox (BL-101)

- **Value.** Residents' email (Inbox) and the board's announcements (Communications) sit as two unrelated sidebar items today. The guide even says email replies "do not go to the Inbox". One place makes "talk to residents" a single mental model.
- **What (code-only):**
  - Sidebar: replace **Inbox** and **Communications** with one **Messages** item.
  - Messages has tabs: **Inbox** (`/inbox`), **Sent to residents** (`/communications`), **Scheduled and drafts**.
  - One **New message** button asks "To one resident" (→ `/inbox/compose`, sent from the HOA mailbox) or "To many homes" (→ the one-box composer).
  - The existing routes stay, so there is no URL breakage.
  - Replies to broadcasts (`communication_replies`) appear as a filter in the Inbox tab, in the read-only Phase A version. Merging the storage belongs to BL-101 and Phase B.
  - Shared UI vocabulary with BL-101:
    - "Draft it" (AI), "Review", "Send";
    - the same AI-draft pill;
    - the same "Nothing sends until you press Send" line;
    - the same home side panel (dues, violations, ARC) when a broadcast reply is opened.
- **Effort.** 1.5 d. Coordinate with the BL-101 build so both don't edit `nav.ts` and `InboxChrome.tsx` at once.
- **Migration.** None.
- **Risk.**
  - Low–medium: the nav change affects muscle memory. Keep the old labels as search keywords in `nav.ts`.
  - The inbox is admin-connected and board-readable. Keep the mailbox-admin gating unchanged.
- **Files.**
  - `components/layout/nav.ts`
  - new `app/(dashboard)/messages/layout.tsx` (tabs only), or a shared tab bar in `communications/page.tsx` and `inbox/InboxChrome.tsx`
  - `inbox/page.tsx`
  - guide `related:` links

---

## 5. Phase B (needs migrations)

All of these are additive and nullable or defaulted, so code ships before the apply behind a flag, following the M1 pattern. Per standing practice, the SQL is handed to the owner to apply, and dependent code ships after confirmation.

### B1. Store the template answers on the message

- **Value.** Resends and scheduled sends render exactly like the original. This removes the A1 partial-render stopgap and the "retype values" dialog for good.
- **Migration.**
  ```sql
  ALTER TABLE public.communications
    ADD COLUMN IF NOT EXISTS merge_values jsonb NOT NULL DEFAULT '{}'::jsonb;
  ```
- **Effort.** 1 d.
- **Risk.** Low. Answers are board-typed event facts (dates, places), not resident PII. Keep the PII rule: never write per-recipient `extraMergeFields` (dues tables) into this column.
- **Files.**
  - `lib/communications/send.ts`
  - `getResendPreflight`
  - `merge-recovery.ts` (delete most of it)
  - the A1 job

### B2. First-class urgency, official notice and follow-up link

- **Value.** Reporting and filters can say "urgent notices this year". The official-notice decision is auditable. Follow-up chains are queryable, rather than living in `related_resource` jsonb.
- **Migration.**
  ```sql
  ALTER TABLE public.communications
    ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'routine'
      CHECK (urgency IN ('routine', 'urgent')),
    ADD COLUMN IF NOT EXISTS official_notice boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS follow_up_of uuid
      REFERENCES public.communications(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS meeting_id uuid
      REFERENCES public.hoa_meeting_minutes(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS communications_follow_up_idx
    ON public.communications(follow_up_of) WHERE follow_up_of IS NOT NULL;
  ```
  Confirm the meetings table name at build time. The FL rules read `hoa_meeting_minutes.meeting_type`.
- **Effort.** 1 d.
- **Risk.** Low.
- **Files.**
  - `send.ts`
  - `queries.ts`
  - `[id]/page.tsx`
  - `communications/page.tsx` (filter)
  - `packages/db/src/database.types.ts`, by hand-add only (see the CLAUDE.md §3 warning about `gen:types`)

### B3. Resident preferences, SMS consent and language

- **Value.**
  - Texts go only to residents who said yes, with proof (TCPA). This is the TownSq model.
  - Residents pick email or text and English or Spanish in the portal.
  - Spanish-preferring homes get Spanish only instead of both languages, which removes the "Residents can't pick one language yet" caveat in the guide.
  - Vantaca-style "by the homeowner's preference".
- **Migration.** The table and the `sms_opt_in` and `language` columns exist (0018). Add consent proof and resident self-service RLS:
  ```sql
  ALTER TABLE public.resident_communication_preferences
    ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz,
    ADD COLUMN IF NOT EXISTS sms_consent_source text
      CHECK (sms_consent_source IN ('resident_portal', 'board_recorded', 'sms_keyword')),
    ADD COLUMN IF NOT EXISTS sms_opted_out_at timestamptz;
  -- plus a policy letting a resident SELECT/UPDATE the row where user_id = auth.uid()
  ```
- **Behaviour.**
  - Broadcast SMS is limited to `sms_opt_in = true`.
  - Email is skipped only when `email_opt_in = false`, and never for an official notice; the official notice follows its own consent rules.
  - The draft card says "8 of 12 homes get a text. The rest get email."
  - A STOP reply (Vonage inbound webhook) sets `sms_opt_in=false` and `sms_opted_out_at`.
- **Effort.** 3 d: portal settings page, resolver change, inbound STOP webhook, tests.
- **Risk.** Medium.
  - The SMS reach drops sharply at first, because the default is false. That is correct behaviour, but tell the board before the switch.
  - Legal review is needed on whether "emergency purpose" texts may go without opt-in. Default to opt-in only until then.
- **Files.**
  - `lib/communications/audience.ts`
  - `official-notice.ts` (`deliverableChannels`)
  - new `app/resident/account/notifications/*`
  - new `app/api/webhooks/vonage/route.ts`
  - `lib/resident-notify/store.ts` (share the reader)

### B4. Saved groups (tags)

- **Value.** "Pool committee", "Building C", "Lakefront lots", without retyping (the PayHOA and HOA Express pattern). Streets (A5) cover most cases without this.
- **Migration.**
  ```sql
  CREATE TABLE public.audience_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    association_id uuid NOT NULL REFERENCES public.associations(id) ON DELETE CASCADE,
    name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (association_id, name)
  );
  CREATE TABLE public.audience_group_units (
    group_id uuid NOT NULL REFERENCES public.audience_groups(id) ON DELETE CASCADE,
    unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    PRIMARY KEY (group_id, unit_id)
  );
  -- RLS org_access on both, matching 0018
  ```
- **Effort.** 2 d.
- **Risk.** Low.
- **Files.**
  - `audience.ts` (new `group` kind)
  - `AudienceStep.tsx`
  - the properties list ("Add to group")

### B5. SMS delivery receipts

- **Value.** "Texted" becomes "Text delivered" or "Text failed", so the results page is honest for urgent notices.
- **Migration.** None for the status itself (`delivered` and `failed` exist). It needs the Vonage DLR webhook, and it rides on the same webhook route as B3.
- **Effort.** 1 d, after B3.
- **Risk.** Low.
- **Files.**
  - `app/api/webhooks/vonage/route.ts`
  - `[id]/page.tsx`

Out of scope here, but noted from the benchmark: robocall/voice (PayHOA, AppFolio) and USPS mailroom letters (PayHOA, HOA Express). Both are paid outbound channels. They would sit behind the outbound guard and are a separate backlog item.

---

## 6. Consistency with the inbox (BL-101)

See `docs/research/2026-10-inbox-plan.md` for the inbound side. This plan commits to:

- **One area, "Messages"** (A11): Inbox, Sent to residents, and Scheduled and drafts. One New message button forks by "one resident" or "many homes".
- **One AI pattern:**
  - a box or "Draft it" button;
  - a draft the board edits;
  - highlighted blanks the AI was not allowed to fill (the inbox already does this for money and rule decisions; A2's `missingFacts` uses the same visual);
  - **Approve / Send** as the only way anything leaves.
- **One home context panel.** Opening a broadcast reply (`communication_replies`) shows the same home panel the inbox shows: dues, violations and ARC.
- **One vocabulary.** "Homes", not "units". "Text", not "SMS". "Portal", spelled the same everywhere.
- **Storage stays separate in Phase A.** Gmail threads stay under `packages/mailbox`, and broadcasts stay in `communications`. Whether broadcast replies should *move* into inbox threads is a BL-101 Phase B decision. The guide's current line "Replies … do not go to the Inbox" changes only when that happens.

---

## 7. Ranking

### Phase A (no migration, this week, about 18.75 agent-days in total, parallelisable to about 5 calendar days)

| Rank | Item | Effort | Why this order |
|---|---|---|---|
| 1 | **A1** Scheduled sends work (stopgap same day) | 0.25 + 2 d | Live trust bug: a board can schedule a notice that never goes out |
| 2 | **A2** One-box AI composer | 3 d | The heart of "very simple and self service" |
| 3 | **A3** Plain editor, no HTML or `{{ }}` | 2 d | Biggest single barrier today; A2 depends on a plain draft |
| 4 | **A4** Built-in templates + state-rule meeting notice | 2.5 d | New HOAs have zero templates today; meeting-notice law |
| 5 | **A8** Results page + resend to non-openers | 2.5 d | Closes Job 5's dead end |
| 6 | A5 Plain-language audiences + streets | 2 d | Job 4 goes from impossible to 6 steps |
| 7 | A7 Phone preview | 2 d | Catches blanks and cut texts before Send |
| 8 | A6 Urgency picks channels; honest SMS | 1.5 d | Fixes the silent-"sent" SMS. Owner decides the SMS consent policy first |
| 9 | A11 Unified Messages area | 1.5 d | Coordinate with the BL-101 build |
| 10 | A9 Hide advanced, autosave drafts | 1 d | After A2–A5 |
| 11 | A10 Guides | 0.5 d | Last, matching the shipped UI |

Suggested parallel lanes:
- (a) A1;
- (b) A3 → A2 → A9;
- (c) A4 + A5;
- (d) A7 + A6;
- (e) A8;
- (f) A11, with the BL-101 team.

### Phase B (migrations, in apply order)

1. **B1** `communications.merge_values jsonb`: 1 d.
2. **B2** `communications.urgency`, `official_notice`, `follow_up_of`, `meeting_id`: 1 d.
3. **B3** `resident_communication_preferences.sms_consent_at`, `sms_consent_source`, `sms_opted_out_at` + resident RLS policy: 3 d.
4. **B4** `audience_groups` + `audience_group_units`: 2 d.
5. **B5** SMS delivery receipts (no migration; after B3's webhook): 1 d.

### Open questions for the owner

1. **SMS in production.** Are Vonage keys and US A2P/10DLC registration in place? Until they are, A6 hides texting. Confirm in Vercel production env; don't pull env locally.
2. **SMS consent.** May broadcast texts go to every phone on file until B3 ships, or only to opted-in residents? This plan defaults to "routine messages never text by default" and recommends opt-in-only once B3 lands.
3. **Spanish default.** On for every HOA, or only after a board first uses it? The plan's default is the latter, stored in `compliance_settings`.
