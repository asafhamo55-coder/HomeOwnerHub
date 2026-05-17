# HomeownerHub Design Strategy: Complete UX/UI System

**Date:** May 6, 2026  
**Author:** VP of Design & UX  
**Audience:** Product, Engineering, Marketing teams  
**Status:** Foundation document — informs all design work through v1 launch and beyond  

---

## Executive Summary

HomeownerHub's design strategy is built on a single principle: **clarity through constraint**. We serve three different personas (Linda the HOA volunteer, the micro-landlord, the stressed eviction-facing landlord) with fundamentally different emotional states and technical confidence levels. Rather than build three separate design systems, we build one unifying system with three visual dialects.

The design system must:
- Work on mobile first (Linda approves violation notices at 10pm on her phone)
- Use plain English, never jargon (no "workflow," no "module," no "attestation")
- Make AI participation obvious and trustworthy (label every AI output)
- Protect the emotional experience (eviction users are scared; we project competence, not coldness)
- Separate "demo-only" from "production-ready" at the UI level (Bar A/B/C honesty)

---

## 1. Design System: Color, Typography, Component Library

### Master Brand Identity: HomeownerHub

**Visual Principle:** Warm, authoritative, simple. Like a trusted property manager who actually answers their phone.

#### Color Palette

**Primary:**
- **Brand Blue** `#2563EB` — Decision-making, calls-to-action, trust anchor
- **Brand Orange** `#F97316` — Accent for AI participation, progress, warmth
- **Neutral Dark** `#1F2937` — Text, headers, structure
- **Neutral Light** `#F9FAFB` — Backgrounds, breathing room

**Semantic:**
- **Success Green** `#10B981` — Compliance met, task complete, positive state
- **Alert Yellow** `#FBBF24` — Upcoming deadline, needs attention
- **Critical Red** `#EF4444` — Overdue, violation, error (rare; we prevent this state)
- **Quiet Gray** `#6B7280` — Disabled, secondary, context

**Sub-Brand Dialects:**
- **HOA Hub:** Primary blue + green (governance/compliance)
- **PM Hub:** Primary blue + orange (warmth for landlords)
- **Eviction Hub:** Primary blue + muted red (serious, grounded) — darker palette, no playfulness

#### Typography

**Font Stack:** Inter (Google Fonts) for all weights. Fallback: system sans-serif.

- **Display (h1):** 32px / 40px line-height, weight 600, letter-spacing -0.5px
- **Heading (h2):** 24px / 32px, weight 600
- **Subheading (h3):** 18px / 28px, weight 500
- **Body (p):** 16px / 24px, weight 400 — **never smaller than 16px on mobile**
- **Small (labels, captions):** 14px / 20px, weight 500
- **Tiny (timestamps, attribution):** 12px / 16px, weight 400, opacity 70%

**Contrast Minimum:** All text AA-compliant (4.5:1). Eviction Hub upgraded to AAA (7:1) to compensate for stress-induced vision tunnel.

#### Component Library (Core 12)

Built once, used across all three products via feature flags:

1. **Button** — Primary, secondary, ghost, destructive variants. Icon support. 44px min-height (thumb-friendly).
2. **Card** — Container for atomic info. Always has clear title + optional secondary action. Subtle shadow.
3. **Alert** — Info, success, warning, error. Icon + text + optional action. Dismissible with grace period.
4. **Form Input** — Text, email, date, select, checkbox, radio. Inline error. Label always visible (never placeholder-only).
5. **Breadcrumb** — Linear navigation. Always shows "Home" first. Max 3 levels for mobile.
6. **Modal / Sheet** — Full-screen on mobile, modal on desktop. Header + body + footer actions. Dismiss button always visible.
7. **Dropdown / Menu** — Keyboard-accessible. Opens below on desktop, slides up on mobile.
8. **Toggle** — For on/off settings. Label to the left. Disabled state obvious.
9. **Tooltip** — Info icon triggers. Long-press on mobile (not hover). Max 60 characters.
10. **Progress Indicator** — Step count (3-5 steps max). Horizontal on desktop, collapsed on mobile.
11. **Table** — Sticky headers. Stacked on mobile (card per row). Sortable by default.
12. **Avatar** — Initials, optional photo. Size: 32px (inline), 48px (medium), 96px (large). Fallback color based on first letter.

**Component Rule:** Every component must render correctly at 375px viewport width (iPhone SE). Test every component on a real phone weekly.

---

## 2. HOA Hub UX Flows: Three Critical Moments

### Flow A: Onboarding (First 15 Minutes)

**Goal:** By minute 15, Linda has uploaded her HOA documents, the system has extracted structure, and she sees her first "aha" moment (her covenants searchable in natural language).

**Emotional Arc:** "Is this safe?" → "Will this work for us?" → "I can't wait to show the board"

#### Screen 1: Welcome Gate (0:00–0:30)

*Displayed to: anyone at `/app` without an organization*

```
Hero image: aerial photo of a suburban neighborhood, warm-lit
Headline: "Welcome to HomeownerHub"
Subheading: "AI for board members who have real jobs"
CTA button: "Start Free" (blue)
Alternative: "Already have an account?" link → login
```

**Interaction:** Click "Start Free" → email input → magic link sent → inbox → click link → brought back to app.

**Why this works:** Magic links remove password friction for a 58-year-old. Linda doesn't need to remember another password.

---

#### Screen 2: Organization Setup (0:30–3:00)

*Displayed after magic link click. URL: `/app/setup/organization`*

```
Progress indicator: "Step 1 of 3"

Form (stacked):
  - "What's your HOA called?" (text input, required)
  - "How many homes?" (number input, required)
  - "What state?" (select dropdown, required)
  - "County?" (select, auto-filtered by state, required)
  - (Optional) "What's your email on the board?" (pre-filled from sign-up, can edit)

Button: "Next" (blue, disabled until all required fields filled)
Help text below county: "We use this to find your specific state rules."
```

**Validation:**
- Name must be ≥ 2 characters
- Homes must be 2–10,000
- State required (27 states supported in v1; others show "Coming soon" message)
- County required

**On "Next":** Save to database. Move to step 2. Play subtle micro-animation (checkmark appears next to field, then slides off).

---

#### Screen 3: Document Upload (3:00–9:00)

*URL: `/app/setup/documents`*

```
Progress indicator: "Step 2 of 3"

Headline: "Upload Your HOA Documents"
Subheading: "We'll extract rules, meeting schedules, and contacts. No manual entry."

Upload area (drag-and-drop):
  Instruction text: "Drag files here or click to browse"
  Accepted types: PDF, DOCX, JPG, PNG, TXT
  Max file size: 50 MB each
  
Suggested docs (with checkboxes):
  ☐ CC&R (Covenants, Conditions & Restrictions)
  ☐ Bylaws
  ☐ Budget
  ☐ Past Meeting Minutes (optional)
  ☐ Insurance Policy (optional)
  
Help link: "Where do I find these documents?"
  → Modal explaining each doc type

Button: "Next" (enabled once at least 1 doc uploaded)
Link: "Skip for now" (smaller text, gray) — goes to step 3
```

**AI Work (background):**
- Pillar DIC ingests uploaded docs (pdfplumber + Tesseract for scans)
- Extracts: document type, number of homes/lots, meeting frequency, fiscal year, current rules summary
- Chunks and embeds into vector DB
- Flags confidence score (90%+ = ready, 60-90% = "please review", <60% = "doc unclear, try again")

**On Screen:**
- Show uploading spinner per file
- Once file processes, show card: "✓ CC&R uploaded — extracted 247 rules" or "⚠ Annual Budget unclear, please review"
- Never show raw progress bar; use human language ("Analyzing your documents…")

---

#### Screen 4: First Aha Moment (9:00–15:00)

*URL: `/app/setup/covenant-search`*

```
Progress indicator: "Step 3 of 3"

Headline: "Your Covenants Are Now Searchable"
Subheading: "Try asking a question about your rules"

Search input: "Ask about any rule (e.g., 'Can residents paint their fence?')"

Example queries (clickable):
  - "What's the process for architectural changes?"
  - "What are quiet hours?"
  - "Are satellite dishes allowed?"

Beneath search:
  (If user hasn't searched yet) Placeholder cards showing example answers
  (If user searches) Show answer in natural language with source doc cited
  
Example output:
  "According to Section 4.2 of your CC&R:
  
   Architectural changes must be submitted to the 
   Architectural Review Committee at least 30 days before work begins.
   
   [See in document]  [Ask another question]"

Button: "Finish Setup" (blue)
```

**Why this moment closes:** Linda sees her actual documents answered by the AI, with citations. She feels: "We have a tool that knows our rules." This is the hook that makes her tell the board.

**On "Finish Setup":**
- Redirect to `/app/dashboard`
- Show confetti animation (brief, not annoying)
- Auto-send email to board members: "We're trying new software — take a 2-minute tour" with link to read-only demo

---

### Flow B: Violation Drafter (Moderate Complexity Task)

**Goal:** Linda sees a fence-painting violation on a resident's property. She takes a photo. System guides her to send a formal notice in <5 minutes without legal anxiety.

**Emotional Arc:** "This needs to stop" → "Am I doing this right?" → "Notice sent, problem being addressed"

#### Trigger: Resident Files Photo (Mobile First)

*Linda is on the property, sees violation, opens HOA Hub app*

```
Floating action button (FAB, orange): "+  Report Issue"
→ Modal slides up from bottom

Tabs:
  - "Photo"  [SELECTED]
  - "Write"

(Photo tab)
Headline: "What needs to change?"
Subheading: "Take a photo or upload from camera roll"

Camera button (large): 📷
If already has photo: Thumbnail shown with "Change photo" link

Caption field: "What's the issue?" (textarea, optional)
Example: "Unapproved deck addition on rear of property"

Buttons below:
  - "Next" (blue)
  - "Save as draft" (secondary)
```

**On "Next":**
- If photo + caption provided: Proceed to draft
- If only photo: Show short form asking for caption

---

#### AI Drafts Notice (Violation Drafter Workflow)

*Background: Pillar-DIC + Violation Drafter workflow*

- Takes photo + caption + uploaded covenants
- Queries covenant rules: "What does our CC&R say about decks?"
- Generates notice combining: citation, specific violation, next steps, deadline
- Adds: "Approved by Linda [date]" placeholder for Linda's review

*Screen shown while processing:*

```
Loading screen (friendly):
  Spinner + text: "Checking your covenants…"
  (3-5 seconds)
  ✓ "Found 3 applicable rules"
  ✓ "Drafted notice letter"
  Ready to review
```

---

#### Linda Reviews & Sends (Bar B — Human Gate)

*URL: `/app/violations/[id]/review`*

```
Headline: "Notice Ready for Your Review"

(Violation photo shown: thumbnail, 300px wide, tappable to expand)

Draft notice:
  [Formal letter format, serif font, black text]
  
  [Date] TO: [RESIDENT NAME]
  
  NOTICE OF VIOLATION
  
  Dear [Resident]:
  
  This letter is to inform you that your property at 
  [ADDRESS] is in violation of the Architectural Review 
  requirements in Section 4.2 of our CC&R.
  
  VIOLATION: Deck addition without Architectural Review 
  Committee approval, as seen in photo dated [DATE].
  
  REQUIRED ACTION: Submit architectural plans for the 
  existing deck to the ARC within 14 days, OR remove the 
  structure by [DATE].
  
  [Reference citation]
  
  Sincerely,
  The Board of Directors

---

Label at top of draft: "⚠️ Bar B Review Required
This letter is AI-drafted. You must review before sending."

Buttons below letter:
  [Cancel]  [Edit]  [Send as-is] (blue)
  
Edit allows:
  - Change resident name (form field)
  - Change deadline (date picker, red if <14 days)
  - Full letter body (textarea)
  - Tone: toggle between "Friendly reminder" / "Final notice"

When "Send as-is" or after edit:
  Sending options:
    ☐ Email to resident
    ☐ Certified mail (integration with USPS; order online)
    ☐ Print for hand delivery
  
  Checkbox: "Keep a copy for the file" (pre-checked)
  
  Button: "Send notice" (blue)
```

**On "Send notice":**
- Email crafted by Pillar-CE (multi-lang gate applied)
- Audit log entry: AI draft reviewed by Linda, sent by Linda, timestamp
- Notice appears in resident portal as "Violation issued" + can reply
- Confirmation email to Linda: "Notice sent to [resident]. They can reply here [link]."

---

### Flow C: Meeting Co-Pilot (Complex Live Tool)

**Goal:** During monthly HOA board meeting, the tool captures agenda, transcription, decisions, and generates minutes. Board focuses on conversation; AI captures details.

**Emotional Arc:** "Hope this works" → "Wow, we're not missing anything" → "Minutes are already written"

#### Pre-Meeting Setup (Day Before)

*Linda prepped the meeting yesterday. URL: `/app/meetings/new`*

```
Headline: "Upcoming Board Meeting"

Quick-fill form:
  - Date & time (auto-defaults to next Tuesday 7pm if today is Monday; changeable)
  - Location (text field, optional)
  - Attendees (email list; auto-populated from earlier setup, can add/remove)
  - Agenda items (auto-populated from calendar of pending issues: violations, financials, etc.)
  
Agenda section:
  [ Reorder with drag-and-drop ]
  1. Call to Order (auto-added, read-only, 2 min)
  2. Financials Review (AI suggested, click checkbox to include)
  3. Violation Follow-up: Deck @ 123 Oak (AI extracted from recent violations, 5 min)
  4. Review: Landscape Contract Renewal (manually added by Linda, 10 min)
  5. Resident Q&A (manually added)
  6. Adjournment (auto-added)
  
Button: "Ready for meeting" (blue)
```

---

#### During Meeting (Live Interface)

*Linda clicks "Start recording" at 7pm. App opens full-screen, phone locked to portrait.*

```
THREE-COLUMN LAYOUT:

LEFT (200px, ~25% width):
  Agenda Timeline
  ─────────────────
  1. Call to Order [ACTIVE] (current time)
  2. Financials Review [0:00]
  3. Violation Follow-up [0:08]
  4. Review: Landscape [0:15]
  5. Resident Q&A [0:25]
  6. Adjournment [0:30]
  
  (Clicking any item jumps timestamp in center column)
  
CENTER (500px, ~62% width):
  Transcription (Live)
  ──────────────────
  [Large speech bubbles, speaker name + text]
  
  Linda: "Welcome everyone to the March meeting."
  
  Sarah: "Before we start, I need to mention that I've been 
  carrying the treasurer role for five months straight. I need 
  help next quarter."
  
  Mark: "I can take that on."
  
  [Speaker icon] Record indicator: 7:24 elapsed [●]
  [Transcription processing indicator: 99% confident]
  
  (Linda taps to highlight key decision:)
  [HIGHLIGHTED IN LIGHT ORANGE]
  
RIGHT (175px, ~13% width):
  AI Co-Pilot
  ───────────
  
  📋 Action Items Captured
  ✓ Sarah needs treasurer help
    → Assign to Mark
  ⚠️ Financials Review pending
    → Waiting for you to confirm budget vote
  ⚠️ Violation decision missing
    → "What deadline for resident?"
  
  💡 Suggested:
  "Sarah has handled 5+ decisions today.
   Consider rotating to Mark."
   
  [Save this note]

─────────────────────────────────────────────────

ON MOBILE (single column, swipeable):
  Swipe left/right to switch between Agenda/Transcription/AI
  Full-screen transcription mode (default)
  (Responsive re-layout for 375px)
```

**AI Backend (Pillar-CE + Meeting Co-Pilot workflow):**
- Transcription: live via Whisper API (on-device, privacy-first)
- Re-ranker identifies decision points: votes, assignments, deadlines
- Flags to Linda: "You discussed [topic] but didn't record a decision. Add one?"

---

#### Post-Meeting: Minutes Generated

*Meeting ends, Linda clicks "End recording." Auto-navigate to: `/app/meetings/[id]/minutes`*

```
Headline: "Meeting Summary"

Summary section (human-readable):
  "March board meeting, 7:15–8:42 PM
   Attendees: Linda, Sarah, Mark (3/3 present)
   Key decisions: Sarah steps down as treasurer, Mark takes role.
   Budget for next fiscal year approved."

Generated Minutes (draft):
  [FORMALLY FORMATTED]
  
  MARCH 2026 BOARD MEETING MINUTES
  
  Called to Order: 7:15 PM, [Location]
  
  ATTENDEES: Linda Jackson (Treasurer), Sarah Chen (VP), 
  Mark Williams (Member)
  
  AGENDA ITEMS:
  
  1. Call to Order
     Board called to order at 7:15 PM.
  
  2. Financials Review
     Treasurer reviewed Q1 2026 operating budget.
     Motion: "Approve Q1 budget as presented."
     Vote: 3-0 (Approved)
  
  3. Violation Follow-up: Deck @ 123 Oak Street
     Board discussed notice issued March 2.
     Resident has until April 2 to submit plans.
     Motion: "Approve 30-day extension if resident 
     requests in writing by March 25."
     Vote: 3-0 (Approved)
  
  4. Landscape Contract Renewal
     [Narrative from transcription]
     Decision: Pending additional bid.
  
  5. Resident Q&A
     [Summarized]
  
  6. Action Items
     - Sarah Chen to brief Mark Williams on treasurer 
       handoff by March 30.
     - Mark to submit transition plan by April 15.
     - Secretary to send renewal bid request by March 12.
  
  Meeting Adjourned: 8:42 PM

─────────────────────────────────────────────────

[Above the minutes, 3 buttons:]
[Cancel/Discard]  [Edit]  [Approve & Send] (blue)

Edit mode: click any sentence to edit. Changes tracked.
Approve mode: 
  Checkboxes:
  ☐ Minutes are accurate
  ☐ All decisions recorded
  ☐ Action items assigned clearly
  
  When checked, button becomes active: "Send to Board & File"
```

**On "Send to Board & File":**
- Email sent to all attendees: Minutes attached + link to view in portal
- PDF filed in `/app/documents/meetings/[date]`
- Audit log: "Minutes approved and filed by Linda"

**Why this works:** Every step removes friction. Linda doesn't type a single word of minutes. She focuses on governing; the tool captures details.

---

## 3. PM Hub UX Design: The Landlord's Screen

### Home Screen: "At a Glance"

*URL: `/app/pm/dashboard`*

**Goal:** A 40-year-old micro-landlord with 4 rental units sees "zero-touch" status at a glance. Confidence, not anxiety.

```
Top section (status cards):

┌─────────────────────────────────────────────┐
│  Your Rentals: 4 Properties                │
│  Status: All Current ✓                      │
│  Monthly Revenue: $4,200  (on track)        │
│  Next Payment Due: March 15 ($1,050)        │
└─────────────────────────────────────────────┘

(Large green checkmark icon, warming visual)

─────────────────────────────────────────────

RENT COLLECTION DASHBOARD:

[Four property cards, horizontal scroll on mobile:]

┌──────────────────────┐
│ 215 Oak St #1        │
│ Tenant: Alex J.      │
│ Rent: $1,050         │
│ Status: Paid ✓       │
│ Due: Mar 1 → Paid 02 │
└──────────────────────┘

┌──────────────────────┐
│ 215 Oak St #2        │
│ Tenant: Jordan M.    │
│ Rent: $950           │
│ Status: Paid ✓       │
│ Due: Mar 1 → Paid 02 │
└──────────────────────┘

┌──────────────────────┐
│ 412 Elm Ave          │
│ Tenant: Casey P.     │
│ Rent: $1,100         │
│ Status: Paid ✓       │
│ Due: Mar 1 → Paid 02 │
└──────────────────────┘

┌──────────────────────┐
│ 88 Ridge Rd          │
│ Tenant: Riley T.     │
│ Rent: $1,100         │
│ Status: LATE 🔴      │
│ Due: Mar 1 → OVERDUE │
│ 5 days late          │
└──────────────────────┘

─────────────────────────────────────────────

AI INSIGHTS (Proactive):

[Light background card]

"Rent streak: 3 months perfect from Alex, Jordan, Casey.
Riley's payment is 5 days late. Auto-reminder sent.
Coach tip: Consider a thank-you note to Alex; 
landlords lose tenants to competitors."

[Coach] [View payment history]

─────────────────────────────────────────────

QUICK ACTIONS (at bottom):

[Button] View All Payments
[Button] Send Rent Reminder
[Button] Add Property
[Button] Messages (1 new)
```

**Design Intent:**
- **Status-first:** Green checkmark = peace of mind. Red alert = actionable problem.
- **No drama:** Late rent shown factually ("5 days late"), with auto-action already taken ("reminder sent").
- **Zero friction:** Payment history 2 taps away, not 8 clicks.
- **AI as coach:** Positive reinforcement ("great tenant!") not just warnings.

---

### Rent Collection Deep-Dive: Riley's Late Payment

*Click on Riley's card → `/app/pm/properties/88-ridge-rd/payments`*

```
PROPERTY: 88 Ridge Rd
Tenant: Riley T. (Riley@example.com)

─────────────────────────────────────────────

CURRENT STATUS:
[Red alert bar with icon]
Payment Due: March 1, 2026
Days Late: 5 days
Amount: $1,100
Status: Overdue (Auto-reminder sent Mar 6)

─────────────────────────────────────────────

PAYMENT HISTORY (12 months):
[Timeline chart]

Mar 2026  ●---○ DUE 3/1 | OVERDUE 5d
Feb 2026  ●---● PAID 2/5 (-3 days early)
Jan 2026  ●---● PAID 1/2 (-29 days early)
Dec 2025  ●---● PAID 12/1 (0 days, on-time)
...
[Scroll for more months]

─────────────────────────────────────────────

TENANT PROFILE:
Name: Riley Thompson
Email: riley@example.com
Phone: (404) 555-1234
Lease Start: Jan 2024
Lease End: Dec 2026
Payment Method: ACH (auto)
Avg. Payment Delay: On-time (95% of payments)

─────────────────────────────────────────────

COACH RECOMMENDATION (AI):
"Riley has been a reliable tenant for 14 months.
This is their first late payment. Likely temporary.
Our suggestion: gentle check-in via text/call before
escalating to formal notice.

Common causes of first-time late rent:
- Job loss or hours reduction
- Medical emergency
- Spouse job change
- Pandemic financial strain

If you suspect hardship, the Delinquency Coach can
help draft a payment plan conversation. Would you like
to try that?"

[Try Delinquency Coach]

─────────────────────────────────────────────

ACTIONS:
[Send payment reminder (again)]
[Call Riley] → Dial intent
[Schedule follow-up call]
[View lease]
[Escalate to formal notice]
```

**Why this design works:**
- **Nuance:** System doesn't recommend legal action immediately. First shows context ("great tenant, first late payment").
- **Coaching:** Offers to help with a conversation, not a threat.
- **Mobile-optimized:** Call button is a tap, not an email compose.

---

## 4. Eviction Hub UX: Emotional Design for a Scared Landlord

**Core principle:** The user is stressed, possibly first eviction ever, afraid of legal mistakes. Design must project competence and calm without coldness.

### Landing Screen: Case Intake (Step 1 of 5)

*URL: `/eviction/intake`*

```
Soft background (light blue-gray, calming)
Hero headline: "Eviction Support — Guided, Legal-Reviewed"

Subheading: "We'll walk you through each step.
Everything is reviewed by a Georgia attorney."

─────────────────────────────────────────────

FORM: Basic Tenant Information

[Card layout, one field per card, vertical stacking]

Card 1: Your Situation
  Radio buttons (choose one):
    ○ Tenant hasn't paid rent for [X] days
    ○ Tenant violated lease terms
    ○ Tenant overstayed lease end date
  
  [Help text in smaller gray]
  This tells us which Georgia law applies.

Card 2: Tenant Name
  Text input: "Full name as shown in lease"
  [Pre-fill hint: auto-suggest from recent tenants]

Card 3: Amount Owed (if rent-related)
  Currency input: "$________"
  [Help: "Include unpaid rent + late fees per lease"]

Card 4: Property Address
  Address input (zip-code auto-lookup): 
    Street | City | Zip
  [Help: "This must match your lease"]

Card 5: Lease Start/End Dates
  Date pickers: From [__/__/____] To [__/__/____]
  [Help: "If month-to-month, enter most recent renewal date"]

─────────────────────────────────────────────

LEGAL DISCLAIMER (below form):

⚠️  IMPORTANT
This tool is Bar A (demo/educational only) until 
a Georgia attorney reviews your specific case.

You will receive a legal review within 2 business days.
Do not file any court documents until after that review.

By continuing, you agree to:
☐ Have the tool's draft documents reviewed by a lawyer
☐ Not use these documents for filing without attorney approval
☐ Acknowledge this is not legal advice

[Checkbox required to proceed]

─────────────────────────────────────────────

[Previous] [Next] (blue)
```

**Design Intent:**
- **Clear stakes:** The disclaimer is prominent, not hidden. User knows this isn't final until lawyer signs off.
- **One card per field:** No cognitive overload. Mobile-friendly single-column.
- **Reassurance language:** "We'll walk you through" + "attorney reviewed" appear multiple times.

---

### Step 3: First Notice Draft Review (Legal Gate)

*URL: `/eviction/case/[id]/notices/[notice-id]`*

```
Progress indicator: Step 3 of 5

Headline: "30-Day Pay-or-Quit Notice (Georgia)"

[TEMPLATE PREVIEW]

[Dated letterhead format, serif font for legal appearance]

March 12, 2026

TO: Riley Thompson
[Property Address]

NOTICE OF NON-PAYMENT OF RENT AND DEMAND FOR PAYMENT

Dear Riley Thompson,

This letter is to notify you that as of March 1, 2026,
you are in violation of your lease agreement dated
January 1, 2024, by failing to pay rent due in full.

AMOUNT DUE: $1,100.00
DUE DATE: March 1, 2026
DAYS OVERDUE: 11 days

You are required to pay the above amount in full within
30 days from the date of this notice (by April 11, 2026),
or your lease will be terminated, and eviction proceedings
will be initiated.

Payment should be sent to:
[Landlord address or payment portal link]

This notice is provided in accordance with Georgia Code
Section 34-6-2, which requires notice before eviction.

Respectfully,
[Your Name]
[Your Address]
[Your Signature]

─────────────────────────────────────────────

REVIEW CHECKLIST:
☐ Tenant name is correct
☐ Property address matches lease
☐ Amount owed is accurate
☐ Deadline (30 days from today) is acceptable
☐ Payment instructions are correct

LEGAL NOTE (AI-generated, labeled):
"This draft complies with Georgia Code 34-6-2
(minimum 30-day notice required for non-payment).
Your specific tenancy and lease terms have been
factored in.

Georgia-specific rules applied:
- Notice delivered via certified mail required
- Tenant has 30 days to pay or vacate
- If lease is silent, you may add reasonable late fees"

[Learn more about Georgia eviction law]

─────────────────────────────────────────────

ACTION CHECKPOINTS:
Before you send this notice:

✓ Step 1: Email this draft to: your-lawyer@example.com
  (Optional link to add your attorney's email)

✓ Step 2: Verify tenant address is correct
  (Current: 88 Ridge Rd, [City], GA)

✓ Step 3: Prepare payment instructions
  (Where does Riley send payment?)

─────────────────────────────────────────────

[Back] [Edit notice] [Mark as reviewed, ready to deliver]
```

**Why this design:**
- **Transparency:** AI draft is shown in full, not hidden. User reads exactly what will go to the tenant.
- **Legal confidence:** Cites the specific Georgia Code. User feels grounded in law, not winging it.
- **Guardrails:** Checklist before delivery prevents mistakes.
- **Attorney option:** Email draft to lawyer in one click, not 5 steps.

---

### Step 5: Court Filing (Bar A, Watermarked)

*URL: `/eviction/case/[id]/filing`*

```
[WATERMARK across entire screen: "DEMO ONLY — NOT FOR FILING"]

Progress indicator: Step 5 of 5

Headline: "Court Filing Package (Educational Demo)"

Subheading: "Your attorney will prepare the actual filing.
This shows you what to expect."

─────────────────────────────────────────────

GENERATED DOCUMENTS:

1. Complaint in Replevin
   [Preview PDF]
   [Download for reference]
   
2. Affidavit of Non-Payment
   [Preview PDF]
   [Download for reference]
   
3. Summons
   [Preview PDF]
   [Download for reference]

─────────────────────────────────────────────

FILING INSTRUCTIONS:

⚠️ DO NOT FILE THESE DOCUMENTS YOURSELF.

These are templates. Your Georgia attorney must:
1. Review for accuracy
2. Add proper court clerk info & case #
3. File with the appropriate county clerk
4. Serve copies on the tenant via certified mail or sheriff

Cost: Filing fees vary by county ($150–$400).
Timeline: Expect 4–8 weeks from filing to hearing.

[Schedule call with attorney] (blue button)
[Chat with HomeownerHub support] (secondary)

─────────────────────────────────────────────

NEXT STEPS:

You will receive an email with:
- PDF of all documents (reference only)
- Contact info for a Georgia attorney in your county
- Checklist of what to do before your attorney meeting

Expected timeline:
- This email: today
- Attorney review: within 5 business days
- Attorney filing: 1–2 weeks after review
- Court hearing: 4–8 weeks after filing
```

**Design Intent:**
- **Watermark is not subtle:** "DEMO ONLY" visible on every page, every angle.
- **Emotional support:** Explains the next steps so landlord doesn't feel abandoned.
- **Realistic timeline:** Sets expectations (not "overnight") so landlord doesn't get frustrated.

---

## 5. Mobile-First Interactions: The Three Critical Moments

### HOA Hub Mobile: Approval at 10pm on Phone

**Scenario:** Linda receives push notification at 10:15pm: "Violation notice ready for review." She's in bed with her phone.

#### Mobile Screen 1: Notification & Landing

```
[iOS notification banner appears]
"HomeownerHub: Violation notice ready — Review now?"

Linda taps → App opens → `/app/violations/[id]/mobile`

Full screen, portrait:

─────────────────────────────────────────────

[Back arrow] Violation Notice [More options ⋯]

─────────────────────────────────────────────

Photo of violation (fullscreen scrollable):
[Swipe left to see notice, right to see photo]

Current view: Photo of fence
[Swipe ← to see draft notice]

─────────────────────────────────────────────

After photo review, scroll down:

VIOLATION DETAILS
Property: 123 Oak St, Unit B
Issue: Unpermitted fence (7' height, exceeds 6' limit)
Rule: CC&R Section 3.1
Date noticed: Today, 9:47 PM

NEXT STEPS
Draft notice generated. Ready for your approval.

─────────────────────────────────────────────

ACTION BUTTONS (thumb-friendly, 44px height):

[Large] Approve & Send Notice
[Secondary] Edit Notice
[Secondary] Reject / Try Again
[Text link] View notice text
```

**Why this works:**
- **Photo-first:** Linda can visually confirm violation without reading jargon.
- **Thumb zone:** Blue button in bottom-right, easy to tap while lying in bed.
- **Swipe navigation:** Familiar iOS gesture, no complex menu taps.

---

### PM Hub Mobile: Payment Status

**Scenario:** Landlord gets alert: "Riley's rent is 3 days late." Checks on phone during lunch.

```
Notification: "Riley's rent is 3 days late"

Tap → `/app/pm/properties/88-ridge-rd/payments/mobile`

─────────────────────────────────────────────

[Back] [Payments] [Menu ⋯]

STATUS (large, bold)
🔴 OVERDUE

Amount: $1,100
Days Late: 3
Due Date: March 1

─────────────────────────────────────────────

QUICK ACTIONS (stacked, full-width):

[Blue button] Call Riley [📞 +1-404-555-1234]
[Secondary] Send reminder
[Secondary] Payment plan offer
[Secondary] Formal notice

─────────────────────────────────────────────

CONTEXT (scrollable)
Payment history: On-time 95% of the time
Last 3 months: Paid early, paid early, on-time
AI note: "First late payment. Likely temporary.
Consider a conversation before escalating."

─────────────────────────────────────────────

Payment methods on file:
ACH (last 4: 6789)
[Change payment method]
```

**Why this works:**
- **One action wins:** "Call" button is the #1 CTA. Landlord can talk to tenant immediately.
- **Context first:** Shows Riley's history before landlord overreacts.
- **Desktop parity:** All core actions available on phone, not "check desktop for details."

---

### Eviction Hub Mobile: Case Review on Go

**Scenario:** Landlord gets text: "Your case is ready for attorney review." Clicks link on phone.

```
Link arrives via SMS:
"HomeownerHub: Your case is ready. Review here: [link]"

Opens → `/eviction/case/[id]/mobile`

─────────────────────────────────────────────

[Menu] Case #EV-2026-00145 [More ⋯]

CASE STATUS
🟢 Ready for Attorney Review

Case created: March 12, 2026
Tenant: Riley Thompson
Property: 88 Ridge Rd
Days overdue: 11
Notice type: 30-Day Pay-or-Quit

─────────────────────────────────────────────

DOCUMENTS (stacked, tappable):

[1. Notice of Non-Payment]
   Generated March 12
   Status: Ready for delivery
   [Tap to preview PDF]

[2. Affidavit of Non-Payment]
   Generated March 12
   Status: Draft
   [Tap to preview PDF]

─────────────────────────────────────────────

TIMELINE

[Vertical timeline, mobile-optimized]

✓ Mar 12 — Case created
✓ Mar 12 — Notice drafted & reviewed
→ Mar 13 (tomorrow) — Notice to be delivered
→ Apr 12 (30 days) — Tenant payment deadline
→ Apr 13+ — Court filing (if unpaid)

─────────────────────────────────────────────

NEXT STEP (large card):
[Blue button] Send to Attorney for Review
[Info text] Takes 2–3 business days

Or: [Schedule call with attorney]
```

**Why this works:**
- **Timeline visible:** Landlord sees the full eviction arc, not just "next step."
- **Documents accessible but not overwhelming:** Can view, but main focus is "what's next."
- **Attorney loop clear:** Explicitly says "we'll review and be in touch."

---

## 6. Accessibility: Designing for Linda (58, Non-Tech)

### Font & Size Standards

- **Minimum body text:** 16px on mobile. Accessible zoom available (system setting respected).
- **Line height:** 24px (1.5x) for all body text. Breathing room for older eyes.
- **Color contrast:** 
  - **HOA/PM:** AA standard (4.5:1 minimum)
  - **Eviction:** AAA standard (7:1) — stress-induced vision narrowing
- **Serif fonts:** Consider using serifs for legal documents (eviction) where formality builds trust. Maintain sans-serif for UI (easier on eyes in small sizes).

### Interaction Design for Non-Tech Users

1. **No Jargon:**
   - ❌ "Workflow" → ✅ "Task"
   - ❌ "Module" → ✅ "Board" or "Rental" section
   - ❌ "Attestation" → ✅ "Confirm you've read this"
   - ❌ "Synchronization error" → ✅ "Couldn't save — check internet"

2. **Confirmation Before Destructive Actions:**
   - Deleting a violation draft: "Delete draft notice? You can't undo this."
   - Sending notice: "Send to Riley at riley@example.com? They'll get an email."
   - Marking resolved: "Mark complete? This can't be undone."

3. **Always Show Current State:**
   - Radio button/checkbox state should be visually obvious.
   - Disabled buttons clearly disabled (opacity 50%, grayed text).
   - Loading state should show progress ("Processing… 40% done" not just spinner).

4. **Error Messages in Plain English:**
   - ❌ "Validation failed on field[0].email"
   - ✅ "We couldn't recognize Mark's email address. Is it correct?"
   - Include the problematic value: "We have 'markcitizen@@example.com' — is that right?"

5. **Escape Routes (Always show back/exit):**
   - Modal always has visible X button, not just outside tap.
   - Forms always have "Cancel" alongside "Submit."
   - If user accidentally deletes text, show undo toast for 10 seconds.

### Color & Contrast Specific to Personas

**HOA Hub:** Blue (trust) + Green (progress). Not red (too emotional).

**PM Hub:** Orange (warmth for landlord) + Green (positive). Soften reds; use "attention yellow" instead.

**Eviction Hub:** Darker blue + muted red. No bright colors; project seriousness and calm.

### Help & Tooltip Strategy

- **Hover tooltips** (desktop only): Max 60 characters. Info icon + trigger on click/long-press (mobile).
- **Contextual help link:** Every major section has "What's this?" that opens a definition modal.
- **Video help:** 90-second walkthroughs for complex flows (embedded, auto-subtitled).

---

## 7. AI Transparency Patterns

### How We Label AI-Generated Content

**Pattern 1: AI Confidence Badge**

```
[Notice draft displayed]

At top-right, small badge:
"🤖 AI-Drafted — Reviewed by Board Member"

Or (if awaiting review):
"🤖 AI-Drafted — Awaiting Review"

Or (if lawyer-reviewed):
"✓ AI-Drafted — Lawyer Reviewed"
```

**Pattern 2: Citations for Legal Content**

```
[Violation notice text]

"...according to Section 4.2 of your CC&R:"

[Highlighted in light orange]
"Architectural changes must be submitted 30 days in advance."

Below text:
"[Source: CC&R Section 4.2, lines 142–147]  [See full document]"
```

**Pattern 3: Confidence Scoring (for ambiguous docs)**

```
[During onboarding, after uploading CC&R]

"✓ Covenant Brain: Document Analysis"

Confidence level: ████████░ 85% confident

This means:
- We extracted 247 rules with high confidence
- 12 sections were unclear; please review [show list]
- Overall: ready to use, but spot-check marked sections
```

**Pattern 4: Bar A / B / C Labels in UI**

```
[In product features]

Daily Digest Dashboard
Status: Production (Bar C)
Uses real data, no manual review needed ✓

Violation Drafter
Status: Beta (Bar B)
Requires your approval before sending ⚠️

Tenant Risk Score
Status: Demo Only (Bar A)
Educational only, not for business decisions 🚫
[Learn more about our confidence levels]
```

---

## 8. Onboarding Design: The 15-Minute Zero-Touch Promise

### Philosophy

**Goal:** Linda creates an account, uploads documents, and within 15 minutes understands that the tool *knows her HOA's specific rules* via one working interaction. The moment she sees "Covenant Brain" answer a question about her actual CC&R, she's sold.

**Time Budget:**
- 0:00–1:00 — Welcome + email magic link
- 1:00–3:00 — Organization setup (name, # homes, state, county)
- 3:00–10:00 — Document upload (CC&R, bylaws)
- 10:00–15:00 — First Aha moment (search covenants, see answers with citations)

### The "Aha" Moment Design (Critical)

#### Screen: Covenant Search

```
Progress: "3 of 3"

Headline: "Your Covenants Are Now Searchable"

Subheading: "Try any question about your rules. 
These answers are powered by your actual documents."

[Search input with large placeholder text:]
"Ask about any rule..."

─────────────────────────────────────────────

[Example queries, tappable — chosen from Linda's uploaded docs]

"Can residents paint their houses?"
"What's the process for architectural approval?"
"Are satellite dishes allowed?"
"What are our quiet hours?"

─────────────────────────────────────────────

[If Linda hasn't searched yet, show sample results:]

Example query: "Can residents paint their houses?"

Result:
"According to Section 5.3 of your CC&R:

 'All exterior paint colors must be approved by the 
 Architectural Review Committee. Submit 
 a sample and proof of paint type at least 14 days 
 before painting.'

[See full section] [Ask another question]"

─────────────────────────────────────────────

[Large next button]
"Let's Go to Your Dashboard"
```

**Why this works:**
- **Specificity:** Linda sees *her* covenants answered, not generic examples.
- **Citations:** She trusts it because she knows where the answer came from.
- **One moment:** Once she asks a question and gets a correct answer, she's hooked. She'll tell the board.

---

### Onboarding Completion Email

*Sent immediately after clicking "Let's Go to Dashboard"*

```
Subject: Your HomeownerHub is ready, Linda

Hi Linda,

Welcome! Your Madison Park HOA account is all set.

Here's what's next:

1. INVITE YOUR BOARD (5 min)
   [Invite button]
   Add Sarah, Mark, and other board members. 
   They'll get a welcome email with a quick tour.

2. TRY ONE TASK (10 min)
   [Board Meeting Setup]
   Schedule your next board meeting. We'll help 
   prepare the agenda and auto-generate minutes 
   after the meeting.

3. EXPLORE FEATURES (whenever)
   [View features]
   - Daily board digest (what needs your attention today)
   - Compliance calendar (all your deadlines)
   - Violation drafter (report issues, we draft notices)

Everything you upload is encrypted and owned by you. 
We never share data with third parties.

Need help? 
Reply to this email or visit our docs.

Best,
HomeownerHub
```

---

## Design System Governance

### Component Testing Checklist (Weekly)

Before any component ships:

- [ ] Renders at 375px (iPhone SE)
- [ ] Touch targets ≥44px (thumb-friendly)
- [ ] Text ≥16px mobile, ≥14px desktop
- [ ] Contrast ≥4.5:1 (AA standard) / ≥7:1 (Eviction Hub)
- [ ] Keyboard navigation works (tab, enter, escape)
- [ ] Screen reader announces intent ("Open menu" not "chevron")
- [ ] Tested on real devices (not just Chrome DevTools)
- [ ] Handles error state without breaking layout

### Accessibility Audit Schedule

- **Monthly:** Run Lighthouse a11y audit
- **Quarterly:** Screen reader test with real assistive tech (NVDA, JAWS)
- **Annually:** WCAG 2.1 AA full compliance audit

### Design Debt Tracking

- **Component drift:** If a button ships with two different styles, file design debt ticket.
- **Old patterns:** EOY audit for outdated patterns (e.g., old error handling) and retire them.
- **Mobile regression:** If desktop pattern breaks on mobile, fix or remove.

---

## Summary: The 18-Month Vision

By end of v1 (month 4):
- **Design system** complete, documented, componentized
- **Three products** visually distinct but cohesive
- **Mobile-first** flows tested on real phones
- **AI transparency** consistent across all outputs
- **Accessibility** baseline WCAG 2.1 AA reached

By month 12:
- **Design patterns** proven with real customers (NPS > 8)
- **Mobile engagement** > 60% of active usage
- **Accessibility audit** passed (external firm)
- **AI trust** measured (customer surveys on confidence in AI output)

---

## Appendix: Component Inventory & Variants

[See linked Figma file for interactive prototypes and full component library with Storybook parity — 12 core components, 47 variants, 6 layout templates]

---

**Document version:** 1.0  
**Last updated:** May 6, 2026  
**Next review:** June 6, 2026 (post-month-1 sprint)  
**Approvals required before changes:** Founder (Asaf), Product Lead, Lead Engineer
